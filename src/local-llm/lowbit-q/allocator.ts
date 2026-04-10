/**
 * Bitwidth allocator for lowbit-Q v2.
 *
 * Implements the strategy from IMPLEMENTATION-STRATEGY.md:
 *   - first/last transformer layers → Q4_0 (preserve quality at model boundaries)
 *   - attention Q/K projections → Q4_0 (preserve attention quality)
 *   - attention V/O projections → SVID_1BIT (compress aggressively)
 *   - FFN (gate, up, down) projections → SVID_1BIT (compress aggressively)
 *   - non-weight tensors (embedding, norm) → PASSTHROUGH
 *
 * The allocator does not enforce strict size budget enforcement; the budget
 * is recorded in metadata for informational purposes. Future work can add
 * dynamic rebalancing based on per-tensor size contributions.
 */

import {
  type BitwidthAllocatorConfig,
  type TensorAllocRecord,
  type GGUFTensorInfo,
  LowbitQQuantType,
  GGML_BLOCK_SIZES,
  GGML_TYPE_SIZES,
} from './types';
import { isWeightTensor, computeTensorDataSize } from './ggufParser';
import { classifyTensorFamily, extractLayerIndex } from './tensorFilter';

// ---------------------------------------------------------------------------
// Preset configurations
// ---------------------------------------------------------------------------

/**
 * Default allocator config — balanced mixed-bit strategy.
 * attn Q/K → Q4_0, attn V/O + FFN → SVID_1BIT.
 * Estimated size ratio: ~25–30% of original Q8_0.
 */
export const DEFAULT_ALLOCATOR_CONFIG: BitwidthAllocatorConfig = {
  sizeBudget: 0.27,
  firstLayerQuant: LowbitQQuantType.Q4_0,
  lastLayerQuant: LowbitQQuantType.Q4_0,
  attnQKQuant: LowbitQQuantType.Q4_0,
  attnVOQuant: LowbitQQuantType.SVID_1BIT,
  ffnQuant: LowbitQQuantType.SVID_1BIT,
  applyRotation: false,
};

/**
 * Aggressive allocator config — maximum compression.
 * All attention + FFN → SVID_1BIT except first/last layers.
 * Estimated size ratio: ~20% of original Q8_0.
 */
export const AGGRESSIVE_ALLOCATOR_CONFIG: BitwidthAllocatorConfig = {
  sizeBudget: 0.20,
  firstLayerQuant: LowbitQQuantType.Q4_0,
  lastLayerQuant: LowbitQQuantType.Q4_0,
  attnQKQuant: LowbitQQuantType.SVID_1BIT,
  attnVOQuant: LowbitQQuantType.SVID_1BIT,
  ffnQuant: LowbitQQuantType.SVID_1BIT,
  applyRotation: false,
};

/**
 * Conservative allocator config — quality preservation.
 * All attention → Q4_0, FFN → SVID_1BIT.
 * Estimated size ratio: ~35–40% of original Q8_0.
 */
export const CONSERVATIVE_ALLOCATOR_CONFIG: BitwidthAllocatorConfig = {
  sizeBudget: 0.38,
  firstLayerQuant: LowbitQQuantType.Q4_0,
  lastLayerQuant: LowbitQQuantType.Q4_0,
  attnQKQuant: LowbitQQuantType.Q4_0,
  attnVOQuant: LowbitQQuantType.Q4_0,
  ffnQuant: LowbitQQuantType.SVID_1BIT,
  applyRotation: false,
};

/**
 * Q4_0-only allocator config — baseline with no SVID decomposition.
 * All weight tensors → native Q4_0 (ggml RTN quantization).
 * Purpose: establishes quality baseline to isolate SVID decomposition as the
 * root cause of output collapse. If this preset also collapses, the issue is in
 * the runtime/loader pipeline rather than SVID quality.
 * Estimated size ratio: ~50–55% of original Q8_0.
 */
export const Q4_0_ONLY_ALLOCATOR_CONFIG: BitwidthAllocatorConfig = {
  sizeBudget: 1.0,  // No budget ceiling — disables optimizer; Q4_0-only must not trigger SVID fallback
  firstLayerQuant: LowbitQQuantType.Q4_0,
  lastLayerQuant: LowbitQQuantType.Q4_0,
  attnQKQuant: LowbitQQuantType.Q4_0,
  attnVOQuant: LowbitQQuantType.Q4_0,
  ffnQuant: LowbitQQuantType.Q4_0,
  applyRotation: false,
};

/**
 * Q3_K-ONLY allocator config — native K-quant 3-bit baseline.
 * All weight tensors → Q3_K (ggml native, NMSE ~0.01–0.03, ~40% of Q8_0).
 * Purpose: establish Q3_K as the native quant baseline against SVID mixed-bit.
 * Estimated size ratio: ~40% of original Q8_0.
 */
export const Q3_K_ONLY_ALLOCATOR_CONFIG: BitwidthAllocatorConfig = {
  sizeBudget: 1.0,  // No budget ceiling — disables optimizer
  firstLayerQuant: LowbitQQuantType.Q3_K,
  lastLayerQuant: LowbitQQuantType.Q3_K,
  attnQKQuant: LowbitQQuantType.Q3_K,
  attnVOQuant: LowbitQQuantType.Q3_K,
  ffnQuant: LowbitQQuantType.Q3_K,
  applyRotation: false,
};

/**
 * Q2_K-ONLY allocator config — native K-quant 2-bit baseline.
 * All weight tensors → Q2_K (ggml native, NMSE ~0.05–0.15, ~31% of Q8_0).
 * Purpose: test if Q2_K can match SVID mixed-bit compression with better quality.
 * Estimated size ratio: ~31% of original Q8_0.
 */
export const Q2_K_ONLY_ALLOCATOR_CONFIG: BitwidthAllocatorConfig = {
  sizeBudget: 1.0,  // No budget ceiling — disables optimizer
  firstLayerQuant: LowbitQQuantType.Q2_K,
  lastLayerQuant: LowbitQQuantType.Q2_K,
  attnQKQuant: LowbitQQuantType.Q2_K,
  attnVOQuant: LowbitQQuantType.Q2_K,
  ffnQuant: LowbitQQuantType.Q2_K,
  applyRotation: false,
};

// ---------------------------------------------------------------------------
// Core allocator
// ---------------------------------------------------------------------------

/**
 * Allocate quantization types for all tensors in a GGUF model.
 *
 * Non-weight tensors (embedding, norm, output) always receive PASSTHROUGH.
 * Weight tensors receive a type based on their family and layer position.
 *
 * If the estimated output ratio exceeds `config.sizeBudget`, the allocator
 * runs a greedy budget optimization pass that progressively increases
 * compression until the budget is met (or is determined to be unachievable).
 * The optimization order is:
 *   1. attnVO: Q4_0 → SVID_1BIT
 *   2. attnQK: Q4_0 → SVID_1BIT
 *   3. firstLayer / lastLayer: Q4_0 → SVID_1BIT  (most aggressive)
 *
 * @param tensors - All tensor infos from the source GGUF header
 * @param totalLayers - Total transformer block count (for first/last detection).
 *   Pass 0 to disable first/last layer override.
 * @param config - Allocator configuration. Defaults to DEFAULT_ALLOCATOR_CONFIG.
 * @returns Per-tensor allocation records (same order as input tensors)
 */
export function allocateBitwidths(
  tensors: GGUFTensorInfo[],
  totalLayers: number,
  config: BitwidthAllocatorConfig = DEFAULT_ALLOCATOR_CONFIG,
): TensorAllocRecord[] {
  if (config.applyRotation) {
    throw new Error(
      'applyRotation is deferred to Phase 3 and is not yet implemented. ' +
      'Set applyRotation: false in BitwidthAllocatorConfig. ' +
      'Rotation requires: (1) Hadamard matrix generation, ' +
      '(2) weight pre-multiplication W_rot = W @ H^T, ' +
      '(3) online activation rotation in the C++ attention kernel.',
    );
  }

  const initial = computeAllocations(tensors, totalLayers, config);
  return optimizeToBudget(initial, tensors, totalLayers, config);
}

/**
 * Run a single-pass allocation with a specific config (no budget optimization).
 * Used internally by the budget optimizer.
 */
function computeAllocations(
  tensors: GGUFTensorInfo[],
  totalLayers: number,
  config: BitwidthAllocatorConfig,
): TensorAllocRecord[] {
  return tensors.map((tensor) => {
    const layerIndex = extractLayerIndex(tensor.name);
    const family = classifyTensorFamily(tensor.name);
    const isWeight = isWeightTensor(tensor.name);

    const quantType = isWeight
      ? resolveQuantType(layerIndex, family, totalLayers, config)
      : LowbitQQuantType.PASSTHROUGH;

    const originalBytes = safeComputeSize(tensor);
    const quantizedBytes = estimateQuantizedSize(tensor, quantType);

    return {
      name: tensor.name,
      quantType,
      family,
      layerIndex,
      rotationApplied: false,
      originalBytes,
      quantizedBytes,
    };
  });
}

/**
 * Budget optimization: if the estimated ratio exceeds sizeBudget, greedily
 * increase compression until the budget is met.
 *
 * The progression is: attnVO → attnQK → first/last layer (each SVID_1BIT).
 * If no combination achieves the budget, the most aggressive allocation is
 * returned. This matches the strategy doc's "経験則ベースの mixed-bit 割当".
 */
function optimizeToBudget(
  initial: TensorAllocRecord[],
  tensors: GGUFTensorInfo[],
  totalLayers: number,
  config: BitwidthAllocatorConfig,
): TensorAllocRecord[] {
  const TOLERANCE = 1.05; // 5% over-budget tolerance
  const { ratio } = estimateTotalSize(initial);
  if (ratio <= config.sizeBudget * TOLERANCE) return initial;

  // Define progressively more aggressive fallback configs.
  // Each step increases compression for one more tensor family.
  const steps: BitwidthAllocatorConfig[] = [
    // Step 1: compress attnVO if not already SVID
    {
      ...config,
      attnVOQuant: LowbitQQuantType.SVID_1BIT,
    },
    // Step 2: also compress attnQK
    {
      ...config,
      attnVOQuant: LowbitQQuantType.SVID_1BIT,
      attnQKQuant: LowbitQQuantType.SVID_1BIT,
    },
    // Step 3: also compress first / last layers (maximum compression)
    {
      ...config,
      attnVOQuant: LowbitQQuantType.SVID_1BIT,
      attnQKQuant: LowbitQQuantType.SVID_1BIT,
      firstLayerQuant: LowbitQQuantType.SVID_1BIT,
      lastLayerQuant: LowbitQQuantType.SVID_1BIT,
    },
  ];

  for (const stepConfig of steps) {
    const candidate = computeAllocations(tensors, totalLayers, stepConfig);
    const { ratio: r } = estimateTotalSize(candidate);
    if (r <= config.sizeBudget * TOLERANCE) return candidate;
  }

  // Budget unachievable — return step 3 (most aggressive reachable)
  return computeAllocations(tensors, totalLayers, steps[steps.length - 1]);
}

/**
 * Compute the estimated total output size in bytes for a given allocation plan.
 * Useful for reporting size reduction before running the conversion.
 */
export function estimateTotalSize(allocs: TensorAllocRecord[]): {
  originalBytes: number;
  quantizedBytes: number;
  ratio: number;
} {
  let originalBytes = 0;
  let quantizedBytes = 0;
  for (const r of allocs) {
    originalBytes += r.originalBytes;
    quantizedBytes += r.quantizedBytes;
  }
  const ratio = originalBytes > 0 ? quantizedBytes / originalBytes : 1;
  return { originalBytes, quantizedBytes, ratio };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveQuantType(
  layerIndex: number | null,
  family: string,
  totalLayers: number,
  config: BitwidthAllocatorConfig,
): LowbitQQuantType {
  // Layer-position override: first and last blocks → higher precision
  if (layerIndex !== null && totalLayers > 0) {
    if (layerIndex === 0) return config.firstLayerQuant;
    if (layerIndex === totalLayers - 1) return config.lastLayerQuant;
  }

  switch (family) {
    case 'attn-q':
    case 'attn-k':
      return config.attnQKQuant;
    case 'attn-v':
    case 'attn-out':
      return config.attnVOQuant;
    case 'ffn-gate':
    case 'ffn-up':
    case 'ffn-down':
      return config.ffnQuant;
    default:
      // Unknown family (e.g. MoE router, cross-attn, custom heads):
      // fall back to PASSTHROUGH to avoid silent quality degradation.
      return LowbitQQuantType.PASSTHROUGH;
  }
}

function safeComputeSize(tensor: GGUFTensorInfo): number {
  try {
    return computeTensorDataSize(tensor);
  } catch {
    // Fallback for unknown GGML types: estimate from element count
    const elements = Number(tensor.dims.reduce((acc, d) => acc * d, 1n));
    const blockSize = GGML_BLOCK_SIZES[tensor.type] ?? 1;
    const typeSize = GGML_TYPE_SIZES[tensor.type] ?? 4;
    const nBlocks = Math.ceil(elements / blockSize);
    return nBlocks * typeSize;
  }
}

/**
 * Estimate output byte size for a tensor given a target quantization type.
 */
function estimateQuantizedSize(
  tensor: GGUFTensorInfo,
  quantType: LowbitQQuantType,
): number {
  const elements = Number(tensor.dims.reduce((acc, d) => acc * d, 1n));
  // For 2-D weight matrices: dims[0] = in_features, dims[1] = out_features
  const outFeatures = tensor.nDims >= 2 ? Number(tensor.dims[1]) : 1;
  const inFeatures = Number(tensor.dims[0]);

  switch (quantType) {
    case LowbitQQuantType.SVID_1BIT:
      // a (fp16, out_features) + b (fp16, in_features) + sign (packed bits)
      return outFeatures * 2 + inFeatures * 2 + Math.ceil((outFeatures * inFeatures) / 8);

    case LowbitQQuantType.Q4_0: {
      const nBlocks = Math.ceil(elements / 32);
      return nBlocks * 18; // 2 bytes fp16 scale + 16 bytes packed nibbles
    }

    case LowbitQQuantType.Q8_0: {
      const nBlocks = Math.ceil(elements / 32);
      return nBlocks * 34; // 2 bytes fp16 scale + 32 bytes int8
    }

    case LowbitQQuantType.Q3_K: {
      const nBlocks = Math.ceil(elements / 256);
      return nBlocks * 110; // 32 (hmask) + 64 (qs) + 12 (scales) + 2 (d fp16)
    }

    case LowbitQQuantType.Q2_K: {
      const nBlocks = Math.ceil(elements / 256);
      return nBlocks * 84; // 2+2 (d,dmin) + 16 (scales) + 64 (qs)
    }

    case LowbitQQuantType.PASSTHROUGH:
    default:
      return safeComputeSize(tensor);
  }
}
