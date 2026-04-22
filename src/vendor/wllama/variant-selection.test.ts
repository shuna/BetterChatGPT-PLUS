/**
 * Pure unit tests for selectVariantFromTable.
 *
 * Uses table injection (not module mocks) to test disabled-entry handling
 * without touching the live VARIANT_TABLE.
 */
import { describe, it, expect } from 'vitest';
import {
  VARIANT_TABLE,
  selectVariantFromTable,
  type CapabilitySet,
  type VariantEntry,
} from './variant-table';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const caps = (overrides: Partial<CapabilitySet> = {}): CapabilitySet => ({
  jspi: false,
  mt: false,
  memory64: false,
  webgpu: false,
  exnref: false,
  ...overrides,
});

/** Return a copy of VARIANT_TABLE with Asyncify entries flipped to disabled. */
function tableWithAsyncifyDisabled(): readonly VariantEntry[] {
  return VARIANT_TABLE.map(v =>
    v.id === 'st-webgpu-asyncify-compat' || v.id === 'mt-webgpu-asyncify-compat'
      ? { ...v, disabled: true }
      : v,
  );
}

// ---------------------------------------------------------------------------
// CPU fallback (smoke, guards against regressions while adding new entries)
// ---------------------------------------------------------------------------
describe('CPU fallback', () => {
  it('selects st-cpu-compat when no capabilities', () => {
    const { chosen } = selectVariantFromTable(VARIANT_TABLE, caps());
    expect(chosen?.id).toBe('st-cpu-compat');
  });

  it('selects mt-cpu-compat when mt is available', () => {
    const { chosen } = selectVariantFromTable(VARIANT_TABLE, caps({ mt: true }));
    expect(chosen?.id).toBe('mt-cpu-compat');
  });
});

// ---------------------------------------------------------------------------
// JSPI WebGPU (active variants, smoke)
// ---------------------------------------------------------------------------
describe('JSPI WebGPU selection (active)', () => {
  it('selects st-webgpu-jspi-compat when jspi+webgpu available', () => {
    const { chosen } = selectVariantFromTable(
      VARIANT_TABLE,
      caps({ jspi: true, webgpu: true, exnref: true }),
    );
    expect(chosen?.id).toBe('st-webgpu-jspi-compat');
  });

  it('selects mt-webgpu-jspi-compat when jspi+mt+webgpu available', () => {
    const { chosen } = selectVariantFromTable(
      VARIANT_TABLE,
      caps({ jspi: true, mt: true, webgpu: true, exnref: true }),
    );
    expect(chosen?.id).toBe('mt-webgpu-jspi-compat');
  });
});

// ---------------------------------------------------------------------------
// Asyncify WebGPU active
// ---------------------------------------------------------------------------
describe('Asyncify WebGPU — active', () => {
  it('selects st-webgpu-asyncify-compat when jspi=false, webgpu=true (exnref not required)', () => {
    const { chosen } = selectVariantFromTable(
      VARIANT_TABLE,
      caps({ webgpu: true }),
    );
    expect(chosen?.id).toBe('st-webgpu-asyncify-compat');
    expect(chosen?.glue).toBe('webgpu-asyncify');
    expect(chosen?.wasm.single).toBe('single-thread-webgpu-asyncify-compat.wasm');
  });

  it('selects mt-webgpu-asyncify-compat when jspi=false, mt=true, webgpu=true (exnref not required)', () => {
    const { chosen } = selectVariantFromTable(
      VARIANT_TABLE,
      caps({ mt: true, webgpu: true }),
    );
    expect(chosen?.id).toBe('mt-webgpu-asyncify-compat');
    expect(chosen?.glue).toBe('webgpu-asyncify');
    expect(chosen?.wasm.multi).toBe('multi-thread-webgpu-asyncify-compat.wasm');
  });

  it('JSPI beats Asyncify when both jspi and webgpu are available (ST)', () => {
    const { chosen } = selectVariantFromTable(
      VARIANT_TABLE,
      caps({ jspi: true, webgpu: true }),
    );
    expect(chosen?.id).toBe('st-webgpu-jspi-compat');
  });

  it('JSPI beats Asyncify when both jspi, mt, and webgpu are available (MT)', () => {
    const { chosen } = selectVariantFromTable(
      VARIANT_TABLE,
      caps({ jspi: true, mt: true, webgpu: true }),
    );
    expect(chosen?.id).toBe('mt-webgpu-jspi-compat');
  });

  it('selects Asyncify variant even when exnref=false (build uses JS-based exceptions)', () => {
    // Asyncify build does not use -fwasm-exceptions so exnref is not required.
    // See vendor/wllama/SpecAndStatus.md for the -sASYNCIFY + -fwasm-exceptions incompatibility note.
    const { chosen } = selectVariantFromTable(
      VARIANT_TABLE,
      caps({ webgpu: true, exnref: false }),
    );
    expect(chosen?.id).toBe('st-webgpu-asyncify-compat');
  });
});

// ---------------------------------------------------------------------------
// forceVariant behaviour
// ---------------------------------------------------------------------------
describe('forceVariant', () => {
  it('accepts an active Asyncify entry (live table)', () => {
    const { chosen } = selectVariantFromTable(
      VARIANT_TABLE,
      caps({ webgpu: true, exnref: true }),
      { forceVariant: 'st-webgpu-asyncify-compat' },
    );
    expect(chosen?.id).toBe('st-webgpu-asyncify-compat');
  });

  it('rejects a disabled Asyncify entry (table injection)', () => {
    const table = tableWithAsyncifyDisabled();
    const { chosen, considered } = selectVariantFromTable(
      table,
      caps({ jspi: true, webgpu: true, exnref: true }),
      { forceVariant: 'st-webgpu-asyncify-compat' },
    );
    expect(chosen).toBeNull();
    expect(considered[0]?.rejected).toContain('disabled');
  });

  it('rejects an unknown variant id', () => {
    const { chosen } = selectVariantFromTable(
      VARIANT_TABLE,
      caps(),
      // @ts-expect-error intentionally invalid id for test
      { forceVariant: 'nonexistent-variant' },
    );
    expect(chosen).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Priority ordering (regression)
// ---------------------------------------------------------------------------
describe('priority ordering', () => {
  it('mt-webgpu-asyncify (95) beats st-webgpu-asyncify (85)', () => {
    const { chosen } = selectVariantFromTable(
      VARIANT_TABLE,
      caps({ mt: true, webgpu: true }),
    );
    expect(chosen?.id).toBe('mt-webgpu-asyncify-compat');
  });

  it('mt-webgpu-jspi (100) beats mt-webgpu-asyncify (95)', () => {
    const { chosen } = selectVariantFromTable(
      VARIANT_TABLE,
      caps({ jspi: true, mt: true, webgpu: true }),
    );
    expect(chosen?.id).toBe('mt-webgpu-jspi-compat');
  });
});
