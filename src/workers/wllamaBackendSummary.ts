export type EffectiveBackend = 'webgpu' | 'cpu' | 'unknown';

export interface BackendSummaryInput {
  selectedWasm: 'webgpu' | 'cpu';
  webgpuSelectionReason: string;
  backendCount: number | null;
  sawCpuLayer: boolean;
  sawGpuLayer: boolean;
  observedGpuDevices: string[];
  flashAttentionAutoDisabled: boolean;
  flashAttentionCpuFallback: boolean;
}

export interface BackendSummary {
  effectiveBackend: EffectiveBackend;
  cpuFallback: 'none' | 'flash-attn-only' | 'partial' | 'full' | 'unknown';
  effectiveDevices: string[];
  summary: string;
}

export function buildBackendSummary(input: BackendSummaryInput): BackendSummary {
  const effectiveDevices = Array.from(new Set(input.observedGpuDevices)).sort();

  if (input.selectedWasm === 'webgpu') {
    if (input.sawGpuLayer) {
      const cpuFallback = input.flashAttentionCpuFallback
        ? 'flash-attn-only'
        : input.sawCpuLayer
          ? 'partial'
          : 'none';
      const details = [
        `selected=webgpu`,
        `effective=webgpu`,
        `devices=${effectiveDevices.length > 0 ? effectiveDevices.join(',') : 'unknown'}`,
        `cpuFallback=${cpuFallback}`,
      ];
      if (input.backendCount !== null) details.push(`backendCount=${input.backendCount}`);
      if (input.flashAttentionAutoDisabled) details.push('flashAttn=disabled');
      return {
        effectiveBackend: 'webgpu',
        cpuFallback,
        effectiveDevices,
        summary: details.join(' '),
      };
    }

    if (input.sawCpuLayer) {
      const details = [
        'selected=webgpu',
        'effective=cpu',
        'cpuFallback=full',
      ];
      if (input.backendCount !== null) details.push(`backendCount=${input.backendCount}`);
      details.push(`reason=${input.webgpuSelectionReason}`);
      return {
        effectiveBackend: 'cpu',
        cpuFallback: 'full',
        effectiveDevices: [],
        summary: details.join(' '),
      };
    }
  }

  if (input.selectedWasm === 'cpu' && input.sawCpuLayer) {
    const details = [
      'selected=cpu',
      'effective=cpu',
      'cpuFallback=none',
    ];
    if (input.backendCount !== null) details.push(`backendCount=${input.backendCount}`);
    return {
      effectiveBackend: 'cpu',
      cpuFallback: 'none',
      effectiveDevices: [],
      summary: details.join(' '),
    };
  }

  return {
    effectiveBackend: 'unknown',
    cpuFallback: 'unknown',
    effectiveDevices,
    summary: `selected=${input.selectedWasm} effective=unknown cpuFallback=unknown reason=${input.webgpuSelectionReason}`,
  };
}
