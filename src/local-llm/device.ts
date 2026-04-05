/**
 * Device capability estimation for local LLM model recommendations.
 *
 * Uses navigator.deviceMemory and navigator.hardwareConcurrency to
 * classify devices into tiers. Conservative: unknown → low.
 */

export type DeviceTier = 'low' | 'standard' | 'high';

export type ModelFitLabel = 'recommended' | 'heavy' | 'not-recommended';

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
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 100) return `${Math.round(mb)} MB`;
  if (mb >= 10) return `${mb.toFixed(1)} MB`;
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  const kb = bytes / 1024;
  return `${Math.round(kb)} KB`;
}
