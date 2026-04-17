# Compression Risk Map

Empirical risk classification for custom quantization methods in the lowbit-Q pipeline.
Based on measurements from Phase 3.5 (SVID) and Phase 3.6 (native quant baselines) on
TinyLlama-1.1B-Chat and SmolLM2-1.7B-Instruct.

---

## FORBIDDEN — Do not use in production presets

These combinations produced catastrophic output failure in controlled experiments.
They are blocked by `validateAllocations()` in `allocator.ts`.

| Tensor Family | Method | Evidence | Observed Failure |
|--------------|--------|----------|-----------------|
| `attn_v` | `SVID_1BIT` | Phase 3.5: 40-tensor contamination batch | Full output collapse on all prompts. Outputs consisted of garbled tokens with no coherent structure. |
| `attn_out` | `SVID_1BIT` | Phase 3.5: co-applied with attn_v batch | Same collapse as attn_v — applied in same experiment. |
| Any | `SVID_1BIT` uniform (all layers) | Phase 3: NMSE ~0.37, rank-1 approximation limit | Output collapse on reasoning tasks; quality too low for any practical use. |

**Why attn_v/attn_out are especially sensitive:**
The value projection in multi-head attention (attn_v) and the output projection (attn_out) form
a sequential pair: attn_v reduces each head's context, attn_out recombines heads into residual space.
SVID_1BIT's rank-1 SVD approximation (`W ≈ diag(a) × sign(W) × diag(b)`) cannot represent the
high-rank structure required here. Even 2% degradation per layer compounds catastrophically
across 24+ layers.

---

## CAUTION — May degrade; requires re-verification on 1.7B+ models

These combinations showed degradation on TinyLlama-1.1B but may be acceptable on larger models
(error absorption scales with parameter count). A `caution` warning is emitted by `validateAllocations()`.

| Tensor Family | Method | Evidence | Risk |
|--------------|--------|----------|------|
| All | `Q2_K` uniform | Phase 3.6 TinyLlama: NMSE 0.116 (max 0.228), token collapse on reasoning | Outputs repetitive loops or truncated. SmolLM2-1.7B may absorb; needs verification. |
| All | `Q3_K` uniform | Phase 3.6 TinyLlama: NMSE 0.034, repetitive loop on reasoning prompt | Similar profile to Q2_K but less severe. Q3_K may work on 1.7B+ models. |
| `ffn_down` | `SVID_1BIT` | Phase 3 CONSERVATIVE config: collapse heuristic did not fire but `functionalSuccess=NO` | Down-projection amplifies errors. Low-priority but not zero risk. |

**Token collapse definition (Phase 3.6):**
Output for a prompt repeats the same token or phrase for >80% of the generated length,
OR the output contains <10% of the expected semantic tokens from the reference response.

---

## RE-VERIFY — Promising but unvalidated on target models

These approaches showed acceptable results in limited testing or are theoretically sound
but need confirmation on the primary evaluation targets.

| Tensor Family | Method | Expected Outcome | Priority |
|--------------|--------|-----------------|----------|
| All | `Q4_0` uniform | Phase 3.6 TinyLlama: `functionalSuccess=YES`, NMSE 0.001 | ✓ Confirmed safe baseline |
| All | `Q3_K` uniform | Needs SmolLM2-1.7B re-test | High — if passing, enables 30% size reduction vs Q4_0 |
| All | `Q2_K` uniform | Needs SmolLM2-1.7B re-test | Medium — 50% size reduction potential |
| attn=Q4_0, ffn=Q3_K | Mixed native | Phase 3.6: not yet tested on 1.7B | High — likely safest size-quality tradeoff |
| attn=Q4_0, ffn=Q2_K | Mixed native | — | Medium — step below Q3_K mixed |

---

## SIZE vs QUALITY COMPARISON

From Phase 3.6 and KIVI PoC measurements (Phase 4):

| Method | Bits/elem (effective) | Bytes/elem | NMSE on Gaussian | NMSE on SmolLM2 attn_v (est.) |
|--------|----------------------|------------|-----------------|-------------------------------|
| FP16 | 16 | 2.000 | 0.0000 | 0.0000 |
| Q4_0 | 4.5 (with scale) | 0.5625 | ~0.001 | ~0.001 |
| Q3_K | ~3.4 (super-block) | 0.4297 | ~0.034 | TBD (Phase 4 target) |
| Q2_K | ~2.6 (super-block) | 0.3281 | ~0.116 | TBD (Phase 4 target) |
| KIVI 2-bit (per-token) | 2.0 | ~0.252* | ~0.65** | N/A (KV cache, not weights) |
| SVID_1BIT | ~1.0 (rank-1) | ~0.125*** | ~0.37 | **FORBIDDEN** |

\* For 512×2048 (SmolLM2 attn_v typical shape); scale overhead amortized over cols.
\*\* Pure 2-bit (4 levels) on Gaussian — see `kiviQuantize.test.ts` for measurements.
\*\*\* Theoretical lower bound; actual overhead includes sign-bit packing + FP16 scale vectors.

**Key insight**: KIVI 2-bit has *higher* NMSE than Q2_K despite fewer bits per element,
because Q2_K uses super-block structure (per-group scales within each 256-element block)
while KIVI uses purely per-row asymmetric quantization. Q2_K's quality advantage is
structural, not just bit-count based.

---

## ENFORCEMENT

`validateAllocations()` in `src/local-llm/lowbit-q/allocator.ts` implements the FORBIDDEN
and CAUTION checks programmatically:

```typescript
const warnings = validateAllocations(allocs);
for (const w of warnings) {
  if (w.level === 'forbidden') {
    throw new Error(`Allocation rejected: ${w.message}`);
  } else {
    console.warn(`[lowbit-q] CAUTION: ${w.message}`);
  }
}
```

The convert pipeline should call this before writing any GGUF output.

---

## REFERENCES

- Phase 3.5 SVID test results: `vendor/wllama/lowbit-q/Docs/2026-04-09-SVID-Test-result.md`
- Phase 3.6 native quant baseline: `vendor/wllama/lowbit-q/Docs/2026-04-10-Phase3-NativeQuantBaseline.md`
- Phase 3 full evaluation: `vendor/wllama/lowbit-q/Docs/2026-04-10-Phase3-Evaluation.md`
- KIVI PoC implementation: `src/local-llm/lowbit-q/kiviQuantize.ts`
- KIVI PoC tests (with measured NMSE): `src/local-llm/lowbit-q/kiviQuantize.test.ts`
- Allocator validation: `src/local-llm/lowbit-q/allocator.ts:validateAllocations()`
