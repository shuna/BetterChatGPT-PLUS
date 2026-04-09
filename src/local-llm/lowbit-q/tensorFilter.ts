/**
 * tensorFilter.ts — Tensor selection modes and classification for lowbit-Q conversion.
 *
 * Allows restricting which weight tensors are lowbit-Q-converted,
 * enabling diagnosis of which tensor families cause quality degradation.
 */

import { isWeightTensor } from './ggufParser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LowbitQConvertMode =
  | 'all'
  | 'attention-only'
  | 'ffn-only'
  | 'attn-qkv-only'
  | 'attn-out-only'
  | 'ffn-up-only'
  | 'ffn-down-only';

export interface LowbitQConvertModeInfo {
  id: LowbitQConvertMode;
  label: string;
  description: string;
}

export interface TensorConvertRecord {
  /** Full tensor name, e.g. "blk.0.attn_q.weight" */
  name: string;
  /** Layer index extracted from name, or null */
  layerIndex: number | null;
  /** Family classification: attn-q, ffn-gate, other, etc. */
  family: string;
  /** Whether this tensor was lowbit-Q-converted */
  converted: boolean;
  /** NMSE if converted and quality was computed */
  nmse: number | null;
  /** Original tensor size in bytes */
  originalSizeBytes: number;
  /** Lowbit-Q triplet size in bytes (a + b + sign), null if not converted */
  lowbitQSizeBytes: number | null;
  /** Tensor dimensions */
  dims: number[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const LOWBIT_Q_CONVERT_MODES: LowbitQConvertModeInfo[] = [
  { id: 'all', label: 'All weights', description: 'Convert all weight tensors (default)' },
  { id: 'attention-only', label: 'Attention only', description: 'Q, K, V, O projection weights' },
  { id: 'ffn-only', label: 'FFN only', description: 'gate, down, up projection weights' },
  { id: 'attn-qkv-only', label: 'Attn QKV only', description: 'Q, K, V projections (no output)' },
  { id: 'attn-out-only', label: 'Attn output only', description: 'Attention output projection only' },
  { id: 'ffn-up-only', label: 'FFN up only', description: 'FFN up projection only' },
  { id: 'ffn-down-only', label: 'FFN down only', description: 'FFN down projection only' },
];

/**
 * Maps tensor name substrings to family identifiers.
 * Order matters: first match wins.
 */
const FAMILY_PATTERNS: Array<{ pattern: RegExp; family: string }> = [
  { pattern: /attn_q\b|q_proj\b/, family: 'attn-q' },
  { pattern: /attn_k\b|k_proj\b/, family: 'attn-k' },
  { pattern: /attn_v\b|v_proj\b/, family: 'attn-v' },
  { pattern: /attn_output\b|o_proj\b/, family: 'attn-out' },
  { pattern: /ffn_gate\b|gate_proj\b/, family: 'ffn-gate' },
  { pattern: /ffn_down\b|down_proj\b/, family: 'ffn-down' },
  { pattern: /ffn_up\b|up_proj\b/, family: 'ffn-up' },
];

/** Which families are included per convert mode */
const MODE_FAMILIES: Record<LowbitQConvertMode, string[] | 'all'> = {
  'all': 'all',
  'attention-only': ['attn-q', 'attn-k', 'attn-v', 'attn-out'],
  'ffn-only': ['ffn-gate', 'ffn-down', 'ffn-up'],
  'attn-qkv-only': ['attn-q', 'attn-k', 'attn-v'],
  'attn-out-only': ['attn-out'],
  'ffn-up-only': ['ffn-up'],
  'ffn-down-only': ['ffn-down'],
};

const LAYER_PATTERN = /(?:layers|blk)\.(\d+)\./;

// ---------------------------------------------------------------------------
// Classification functions
// ---------------------------------------------------------------------------

/**
 * Classify a tensor name into a family.
 * Returns e.g. 'attn-q', 'ffn-gate', or 'other'.
 */
export function classifyTensorFamily(name: string): string {
  for (const { pattern, family } of FAMILY_PATTERNS) {
    if (pattern.test(name)) return family;
  }
  return 'other';
}

/**
 * Extract layer index from a tensor name.
 * Supports both `blk.N` and `layers.N` naming conventions.
 */
export function extractLayerIndex(tensorName: string): number | null {
  const match = tensorName.match(LAYER_PATTERN);
  return match ? parseInt(match[1], 10) : null;
}

// ---------------------------------------------------------------------------
// Filter creation
// ---------------------------------------------------------------------------

/**
 * Create a tensor filter predicate for a given conversion mode.
 *
 * The filter first checks `isWeightTensor` (exclude embeddings, norms, etc.),
 * then additionally filters by family if the mode is not 'all'.
 */
export function createTensorFilter(
  mode: LowbitQConvertMode,
): (name: string) => boolean {
  const allowedFamilies = MODE_FAMILIES[mode];

  return (name: string): boolean => {
    // Must be a weight tensor in the first place
    if (!isWeightTensor(name)) return false;

    // 'all' mode: convert everything isWeightTensor allows
    if (allowedFamilies === 'all') return true;

    // Restricted mode: check family
    const family = classifyTensorFamily(name);
    return allowedFamilies.includes(family);
  };
}
