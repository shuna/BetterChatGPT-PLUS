#!/usr/bin/env python3
"""
0003-llama-build-lowbit-q-dispatch.py

Patches llama.cpp/src/models/llama.cpp to add lowbit-Q SVID dispatch in
the llm_build_llama constructor.

Strategy: struct-field approach.
  - The loader (llama-model.cpp, patched by 0002) pre-populates
    model.layers[il].lowbit_q_wq_a etc. for SVID layers.
  - The graph builder simply checks these fields and routes to
    lowbit_q_build_mul_mat() when they are non-null.
  - Q4_0 / PASSTHROUGH layers have null struct fields and fall through
    to the standard build_lora_mm() / build_ffn() paths.

This script is designed to be applied to a STOCK (unpatched) models/llama.cpp.
"""

import re
import sys
import os

PATCH_SENTINEL = "lowbit-q-mul-mat.h"

# ---------------------------------------------------------------------------
# Code fragments to inject
# ---------------------------------------------------------------------------

# Replace '#include "models.h"' with our lowbit-q header added after it
OLD_INCLUDE = '#include "models.h"'
NEW_INCLUDE = '#include "models.h"\n#include "lowbit-q-mul-mat.h"'

# Replace: ggml_tensor * Qcur = build_lora_mm(model.layers[il].wq, cur);
OLD_QCUR = '            ggml_tensor * Qcur = build_lora_mm(model.layers[il].wq, cur);'
NEW_QCUR = """\
            // lowbit-Q dispatch: SVID_1BIT layers use custom kernel, others use native build_lora_mm
            ggml_tensor * Qcur;
            if (model.layers[il].lowbit_q_wq_a) {
                Qcur = lowbit_q_build_mul_mat(ctx0,
                    model.layers[il].lowbit_q_wq_a,
                    model.layers[il].lowbit_q_wq_b,
                    model.layers[il].lowbit_q_wq_sign, cur);
            } else {
                Qcur = build_lora_mm(model.layers[il].wq, cur);
            }"""

# Replace: ggml_tensor * Kcur = build_lora_mm(model.layers[il].wk, cur);
OLD_KCUR = '            ggml_tensor * Kcur = build_lora_mm(model.layers[il].wk, cur);'
NEW_KCUR = """\
            ggml_tensor * Kcur;
            if (model.layers[il].lowbit_q_wk_a) {
                Kcur = lowbit_q_build_mul_mat(ctx0,
                    model.layers[il].lowbit_q_wk_a,
                    model.layers[il].lowbit_q_wk_b,
                    model.layers[il].lowbit_q_wk_sign, cur);
            } else {
                Kcur = build_lora_mm(model.layers[il].wk, cur);
            }"""

# Replace: ggml_tensor * Vcur = build_lora_mm(model.layers[il].wv, cur);
OLD_VCUR = '            ggml_tensor * Vcur = build_lora_mm(model.layers[il].wv, cur);'
NEW_VCUR = """\
            ggml_tensor * Vcur;
            if (model.layers[il].lowbit_q_wv_a) {
                Vcur = lowbit_q_build_mul_mat(ctx0,
                    model.layers[il].lowbit_q_wv_a,
                    model.layers[il].lowbit_q_wv_b,
                    model.layers[il].lowbit_q_wv_sign, cur);
            } else {
                Vcur = build_lora_mm(model.layers[il].wv, cur);
            }"""

# Replace: the build_attn call
OLD_ATTN = """\
            cur = build_attn(inp_attn,
                    model.layers[il].wo, model.layers[il].bo,
                    Qcur, Kcur, Vcur, nullptr, nullptr, nullptr, kq_scale, il);"""
NEW_ATTN = """\
            if (model.layers[il].lowbit_q_wo_a) {
                // lowbit-Q: build_attn with wo=nullptr, then apply SVID matmul
                cur = build_attn(inp_attn,
                        nullptr, model.layers[il].bo,
                        Qcur, Kcur, Vcur, nullptr, nullptr, nullptr, kq_scale, il);
                cur = lowbit_q_build_mul_mat(ctx0,
                    model.layers[il].lowbit_q_wo_a,
                    model.layers[il].lowbit_q_wo_b,
                    model.layers[il].lowbit_q_wo_sign, cur);
            } else {
                cur = build_attn(inp_attn,
                        model.layers[il].wo, model.layers[il].bo,
                        Qcur, Kcur, Vcur, nullptr, nullptr, nullptr, kq_scale, il);
            }"""

# Replace: the build_ffn call (non-MoE branch)
OLD_FFN = """\
            cur = build_ffn(cur,
                    model.layers[il].ffn_up,   model.layers[il].ffn_up_b,   NULL,
                    model.layers[il].ffn_gate, model.layers[il].ffn_gate_b, NULL,
                    model.layers[il].ffn_down, model.layers[il].ffn_down_b, NULL,
                    NULL,
                    LLM_FFN_SILU, LLM_FFN_PAR, il);"""
NEW_FFN = """\
            if (model.layers[il].lowbit_q_ffn_gate_a) {
                // lowbit-Q FFN: inline SwiGLU with SVID matmul
                ggml_tensor * gate = lowbit_q_build_mul_mat(ctx0,
                    model.layers[il].lowbit_q_ffn_gate_a,
                    model.layers[il].lowbit_q_ffn_gate_b,
                    model.layers[il].lowbit_q_ffn_gate_sign, cur);
                ggml_tensor * up = lowbit_q_build_mul_mat(ctx0,
                    model.layers[il].lowbit_q_ffn_up_a,
                    model.layers[il].lowbit_q_ffn_up_b,
                    model.layers[il].lowbit_q_ffn_up_sign, cur);
                // SwiGLU: silu(gate) * up
                gate = ggml_silu(ctx0, gate);
                cur = ggml_mul(ctx0, gate, up);
                // down projection
                cur = lowbit_q_build_mul_mat(ctx0,
                    model.layers[il].lowbit_q_ffn_down_a,
                    model.layers[il].lowbit_q_ffn_down_b,
                    model.layers[il].lowbit_q_ffn_down_sign, cur);
            } else {
                cur = build_ffn(cur,
                        model.layers[il].ffn_up,   model.layers[il].ffn_up_b,   NULL,
                        model.layers[il].ffn_gate, model.layers[il].ffn_gate_b, NULL,
                        model.layers[il].ffn_down, model.layers[il].ffn_down_b, NULL,
                        NULL,
                        LLM_FFN_SILU, LLM_FFN_PAR, il);
            }"""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def normalize_ws(s: str) -> str:
    """Collapse whitespace sequences for fuzzy matching."""
    return re.sub(r'\s+', ' ', s).strip()


def find_and_replace(src: str, old: str, new: str, label: str) -> tuple:
    """Replace old fragment in src. Tries exact match first, then ws-normalized."""
    if old in src:
        return src.replace(old, new, 1), True

    # Try whitespace-normalized search
    norm_old = normalize_ws(old)
    lines = src.splitlines(keepends=True)
    window_size = old.count('\n') + 4
    for start in range(len(lines)):
        end = min(start + window_size, len(lines))
        chunk = "".join(lines[start:end])
        norm_chunk = normalize_ws(chunk)
        if norm_old in norm_chunk:
            new_src = src[:sum(len(l) for l in lines[:start])]
            new_src += new
            new_src += src[sum(len(l) for l in lines[:end]):]
            return new_src, True

    print(f"    WARNING: could not find pattern for '{label}'")
    return src, False


# ---------------------------------------------------------------------------
# Main patcher
# ---------------------------------------------------------------------------

def patch_file(path: str) -> bool:
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()

    if PATCH_SENTINEL in src:
        print(f"    {os.path.basename(path)}: already patched (skipping)")
        return True

    changed = 0

    # 1. Add include
    if OLD_INCLUDE in src:
        src = src.replace(OLD_INCLUDE, NEW_INCLUDE, 1)
        changed += 1
    else:
        print(f"    WARNING: include marker not found")

    # 2–6. Dispatch patches
    for old, new, label in [
        (OLD_QCUR, NEW_QCUR, "Qcur dispatch"),
        (OLD_KCUR, NEW_KCUR, "Kcur dispatch"),
        (OLD_VCUR, NEW_VCUR, "Vcur dispatch"),
        (OLD_ATTN, NEW_ATTN, "build_attn wo dispatch"),
        (OLD_FFN,  NEW_FFN,  "build_ffn dispatch"),
    ]:
        src, ok = find_and_replace(src, old, new, label)
        if ok:
            changed += 1

    if changed < 6:
        print(f"    WARNING: only {changed}/6 changes applied to {os.path.basename(path)}")
        print(f"    This may indicate the llama.cpp source layout has changed.")
    else:
        print(f"    {os.path.basename(path)}: all {changed}/6 changes applied")

    with open(path, "w", encoding="utf-8") as f:
        f.write(src)

    return changed == 6


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <path/to/llama.cpp/src/models/llama.cpp>")
        sys.exit(1)

    target = sys.argv[1]
    if not os.path.isfile(target):
        print(f"ERROR: file not found: {target}")
        sys.exit(1)

    ok = patch_file(target)
    sys.exit(0 if ok else 1)
