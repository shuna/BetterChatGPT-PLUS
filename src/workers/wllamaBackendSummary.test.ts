import { describe, expect, it } from 'vitest';

import { buildBackendSummary } from './wllamaBackendSummary';

describe('buildBackendSummary', () => {
  it('classifies WebGPU load with flash attention CPU fallback as flash-attn-only', () => {
    const summary = buildBackendSummary({
      selectedWasm: 'webgpu',
      webgpuSelectionReason: 'selected',
      backendCount: 2,
      sawCpuLayer: false,
      sawGpuLayer: true,
      observedGpuDevices: ['WebGPU'],
      flashAttentionAutoDisabled: true,
      flashAttentionCpuFallback: true,
    });

    expect(summary.effectiveBackend).toBe('webgpu');
    expect(summary.cpuFallback).toBe('flash-attn-only');
    expect(summary.summary).toContain('effective=webgpu');
    expect(summary.summary).toContain('cpuFallback=flash-attn-only');
    expect(summary.summary).toContain('flashAttn=disabled');
  });

  it('classifies full fallback when WebGPU WASM was selected but only CPU layers were observed', () => {
    const summary = buildBackendSummary({
      selectedWasm: 'webgpu',
      webgpuSelectionReason: 'selected',
      backendCount: 1,
      sawCpuLayer: true,
      sawGpuLayer: false,
      observedGpuDevices: [],
      flashAttentionAutoDisabled: false,
      flashAttentionCpuFallback: false,
    });

    expect(summary.effectiveBackend).toBe('cpu');
    expect(summary.cpuFallback).toBe('full');
    expect(summary.summary).toContain('effective=cpu');
    expect(summary.summary).toContain('cpuFallback=full');
  });

  it('classifies normal CPU execution cleanly', () => {
    const summary = buildBackendSummary({
      selectedWasm: 'cpu',
      webgpuSelectionReason: 'disabled-by-runtime-setting',
      backendCount: 1,
      sawCpuLayer: true,
      sawGpuLayer: false,
      observedGpuDevices: [],
      flashAttentionAutoDisabled: false,
      flashAttentionCpuFallback: false,
    });

    expect(summary.effectiveBackend).toBe('cpu');
    expect(summary.cpuFallback).toBe('none');
    expect(summary.summary).toContain('selected=cpu');
  });
});
