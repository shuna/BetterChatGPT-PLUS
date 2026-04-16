/**
 * Device capability estimation for local LLM model recommendations.
 *
 * Uses navigator.deviceMemory and navigator.hardwareConcurrency to
 * classify devices into tiers. Conservative: unknown → low.
 */

export type DeviceTier = 'low' | 'standard' | 'high';

export type ModelFitLabel = 'lightweight' | 'recommended' | 'heavy' | 'very-heavy' | 'extreme' | 'not-recommended';

type MinimalGpuDevice = {
  destroy: () => void;
};

type MinimalGpuAdapter = {
  features: Set<string>;
  requestDevice: (descriptor?: { requiredFeatures?: string[] }) => Promise<MinimalGpuDevice>;
};

/**
 * Estimate the device tier based on available browser APIs.
 *
 * navigator.deviceMemory is quantized by browsers (0.25, 0.5, 1, 2, 4, 8)
 * and may be absent. navigator.hardwareConcurrency is more widely available
 * but can also be absent or clamped.
 */
export function estimateDeviceTier(): DeviceTier {
  const memory = (navigator as any).deviceMemory as number | undefined;
  const cores = navigator.hardwareConcurrency ?? 0;

  if (memory !== undefined) {
    if (memory >= 8 && cores >= 8) return 'high';
    if (memory >= 4 && cores >= 4) return 'standard';
    return 'low';
  }

  // deviceMemory unavailable — fall back to cores only, conservatively
  if (cores >= 8) return 'standard';
  return 'low';
}

/**
 * Check whether WebGPU looks usable enough to try the wllama WebGPU build.
 *
 * This is still a browser capability check, not a guarantee that llama.cpp's
 * WebGPU backend will initialize successfully for every adapter. The runtime
 * keeps a CPU fallback for that case.
 */
export async function detectWebGpuCapability(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & {
      gpu?: {
        requestAdapter: () => Promise<MinimalGpuAdapter | null>;
      };
    }).gpu;
    if (!gpu) return false;

    const adapter = await gpu.requestAdapter();
    if (!adapter) return false;
    if (!adapter.features.has('shader-f16')) return false;

    const device = await adapter.requestDevice({ requiredFeatures: ['shader-f16'] });
    device.destroy();
    return true;
  } catch {
    return false;
  }
}

const TIER_ORDER: Record<DeviceTier, number> = { low: 0, standard: 1, high: 2 };

/**
 * Determine how well a model fits the device.
 * - Same tier or below → recommended
 * - One tier above → heavy
 * - Two tiers above → not-recommended
 */
export function getModelFit(modelTier: DeviceTier, deviceTier: DeviceTier): ModelFitLabel {
  const diff = TIER_ORDER[modelTier] - TIER_ORDER[deviceTier];
  if (diff <= 0) return 'recommended';
  if (diff === 1) return 'heavy';
  return 'not-recommended';
}

/**
 * Format byte count for display.
 * - ≥100MB → integer MB (e.g. "250 MB")
 * - ≥10MB → 1 decimal (e.g. "12.5 MB")
 * - ≥1MB → 2 decimals (e.g. "3.45 MB")
 * - <1MB → KB
 */
/**
 * Check if multiple models can be loaded in parallel.
 * Only allowed on high-tier devices with combined size < 2GB.
 */
export function canParallelLoad(
  modelSizes: number[],
  deviceTier: DeviceTier,
): boolean {
  if (deviceTier !== 'high') return false;
  const totalMB = modelSizes.reduce((a, b) => a + b, 0) / (1024 * 1024);
  return totalMB < 2048;
}

export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 100) return `${Math.round(mb)} MB`;
  if (mb >= 10) return `${mb.toFixed(1)} MB`;
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  const kb = bytes / 1024;
  return `${Math.round(kb)} KB`;
}
