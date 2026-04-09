#!/usr/bin/env python3
"""
0002-llama-loader-optional-weights.py

Patches llama.cpp/src/llama-model.cpp to:
  1. Detect "lowbit-q.version" (v2) or legacy "onebit.version" (v1) metadata
  2. Mark 7 projection weight tensors as TENSOR_NOT_REQUIRED for the LLAMA arch
  3. Load lowbit_q_* SVID triplet tensors per layer

This is required for lowbit-Q v2 GGUF files where SVID_1BIT layers do
not have a .weight tensor — they use .lowbit_q_a/.b/.sign instead.
Without this patch, llama.cpp's loader would abort with "tensor not found"
when it encounters a SVID layer that has no standard .weight tensor.

The patch uses the struct-field approach (adding lowbit_q_wq_a etc. fields
to llama_layer and llama_model) rather than dynamic llama_get_model_tensor()
lookup, since that API is not available in the pinned wllama fork.

This script is designed to be applied to a STOCK (unpatched) llama-model.cpp
from wllama v2.3.7's pinned llama.cpp submodule.
"""

import re
import sys
import os

PATCH_SENTINEL_LLAMA_H = "lowbit_q_wq_a"
PATCH_SENTINEL_CPP     = "lowbit-q.version"

# --- Include lowbit-q-metadata.h in llama-model.cpp ---
METADATA_INCLUDE_MARKER = '#include "models/models.h"'
METADATA_INCLUDE_CODE   = '#include "models/models.h"\n#include "lowbit-q-metadata.h"'

# --- Log model info at end of load_tensors() ---
LOAD_TENSORS_RETURN_MARKER = "    if (use_mmap_buffer) {\n        for (auto & mapping : ml.mappings) {\n            pimpl->mappings.emplace_back(std::move(mapping));\n        }\n    }\n\n    return true;\n}"
LOAD_TENSORS_RETURN_CODE   = "    if (use_mmap_buffer) {\n        for (auto & mapping : ml.mappings) {\n            pimpl->mappings.emplace_back(std::move(mapping));\n        }\n    }\n\n    // lowbit-Q: print metadata summary (SVID/Q4_0/passthrough breakdown)\n    if (is_lowbit_q) {\n        lowbit_q_log_model_info(this, hparams.n_layer);\n    }\n\n    return true;\n}"

# -----------------------------------------------------------------------
# llama-model.h changes: add struct fields and is_lowbit_q flag
# -----------------------------------------------------------------------

STRUCT_FIELDS_MARKER = "    struct llama_layer_posnet posnet;"

STRUCT_FIELDS_TO_ADD = """\
    // lowbit-Q (SVID decomposition): a, b, sign per weight tensor
    // Loaded from ".lowbit_q_a/b/sign" suffixes (v2 format).
    // Legacy ".onebit_a/b/sign" suffixes (v1) are tried as fallback.
    struct ggml_tensor * lowbit_q_wq_a    = nullptr;
    struct ggml_tensor * lowbit_q_wq_b    = nullptr;
    struct ggml_tensor * lowbit_q_wq_sign = nullptr;
    struct ggml_tensor * lowbit_q_wk_a    = nullptr;
    struct ggml_tensor * lowbit_q_wk_b    = nullptr;
    struct ggml_tensor * lowbit_q_wk_sign = nullptr;
    struct ggml_tensor * lowbit_q_wv_a    = nullptr;
    struct ggml_tensor * lowbit_q_wv_b    = nullptr;
    struct ggml_tensor * lowbit_q_wv_sign = nullptr;
    struct ggml_tensor * lowbit_q_wo_a    = nullptr;
    struct ggml_tensor * lowbit_q_wo_b    = nullptr;
    struct ggml_tensor * lowbit_q_wo_sign = nullptr;
    struct ggml_tensor * lowbit_q_ffn_gate_a    = nullptr;
    struct ggml_tensor * lowbit_q_ffn_gate_b    = nullptr;
    struct ggml_tensor * lowbit_q_ffn_gate_sign = nullptr;
    struct ggml_tensor * lowbit_q_ffn_down_a    = nullptr;
    struct ggml_tensor * lowbit_q_ffn_down_b    = nullptr;
    struct ggml_tensor * lowbit_q_ffn_down_sign = nullptr;
    struct ggml_tensor * lowbit_q_ffn_up_a    = nullptr;
    struct ggml_tensor * lowbit_q_ffn_up_b    = nullptr;
    struct ggml_tensor * lowbit_q_ffn_up_sign = nullptr;

"""

MODEL_FLAG_MARKER = "    llama_model_params params;"

MODEL_FLAG_TO_ADD = """\
    // lowbit-Q flag — set when "lowbit-q.version" or legacy "onebit.version" metadata is present
    bool is_lowbit_q = false;

"""

# -----------------------------------------------------------------------
# llama-model.cpp changes
# -----------------------------------------------------------------------

# --- Detection code (inserted after KV read loop) ---
DETECTION_MARKER = '    // get general kv\n    ml.get_key(LLM_KV_GENERAL_NAME, name, false);'

DETECTION_CODE = """\
    // detect lowbit-Q format (v2: "lowbit-q.version") or legacy onebit (v1: "onebit.version")
    {
        const int lq_key = gguf_find_key(ctx, "lowbit-q.version");
        if (lq_key >= 0) {
            is_lowbit_q = true;
            LLAMA_LOG_INFO("%s: detected lowbit-Q format (version=%u)\\n", __func__, gguf_get_val_u32(ctx, lq_key));
        } else {
            const int ob_key = gguf_find_key(ctx, "onebit.version");
            if (ob_key >= 0) {
                is_lowbit_q = true;
                LLAMA_LOG_INFO("%s: detected legacy onebit format (version=%u), loading as lowbit-Q\\n", __func__, gguf_get_val_u32(ctx, ob_key));
            }
        }
    }

"""

# --- Make 7 standard weight tensors optional (in LLAMA arch loader) ---
# Pattern: lines containing these tensor names with ", 0);" at end
OPTIONAL_TARGETS = [
    'LLM_TENSOR_ATTN_Q,   "weight", i)',
    'LLM_TENSOR_ATTN_K,   "weight", i)',
    'LLM_TENSOR_ATTN_V,   "weight", i)',
    'LLM_TENSOR_ATTN_OUT, "weight", i)',
    'LLM_TENSOR_FFN_GATE, "weight", i)',
    'LLM_TENSOR_FFN_DOWN, "weight", i)',
    'LLM_TENSOR_FFN_UP,   "weight", i)',
]

# --- SVID triplet loading code (inserted after wo creation) ---
ATTN_TRIPLET_MARKER = '                        layer.bo = create_tensor(tn(LLM_TENSOR_ATTN_OUT, "bias", i), {n_embd},     TENSOR_NOT_REQUIRED);'

ATTN_TRIPLET_CODE = """
                        // lowbit-Q triplets (a, b, sign) — only present in lowbit-Q models
                        // Try v2 suffix ".lowbit_q_*" first, fall back to legacy ".onebit_*"
                        if (is_lowbit_q) {
                            // attn_q
                            layer.lowbit_q_wq_a = create_tensor(tn(LLM_TENSOR_ATTN_Q, "lowbit_q_a", i), {n_embd_head_k * n_head}, TENSOR_NOT_REQUIRED);
                            if (!layer.lowbit_q_wq_a) layer.lowbit_q_wq_a = create_tensor(tn(LLM_TENSOR_ATTN_Q, "onebit_a", i), {n_embd_head_k * n_head}, TENSOR_NOT_REQUIRED);
                            layer.lowbit_q_wq_b = create_tensor(tn(LLM_TENSOR_ATTN_Q, "lowbit_q_b", i), {n_embd}, TENSOR_NOT_REQUIRED);
                            if (!layer.lowbit_q_wq_b) layer.lowbit_q_wq_b = create_tensor(tn(LLM_TENSOR_ATTN_Q, "onebit_b", i), {n_embd}, TENSOR_NOT_REQUIRED);
                            layer.lowbit_q_wq_sign = create_tensor(tn(LLM_TENSOR_ATTN_Q, "lowbit_q_sign", i), {(int64_t)((n_embd * n_embd_head_k * n_head + 7) / 8)}, TENSOR_NOT_REQUIRED);
                            if (!layer.lowbit_q_wq_sign) layer.lowbit_q_wq_sign = create_tensor(tn(LLM_TENSOR_ATTN_Q, "onebit_sign", i), {(int64_t)((n_embd * n_embd_head_k * n_head + 7) / 8)}, TENSOR_NOT_REQUIRED);
                            // attn_k
                            layer.lowbit_q_wk_a = create_tensor(tn(LLM_TENSOR_ATTN_K, "lowbit_q_a", i), {n_embd_k_gqa}, TENSOR_NOT_REQUIRED);
                            if (!layer.lowbit_q_wk_a) layer.lowbit_q_wk_a = create_tensor(tn(LLM_TENSOR_ATTN_K, "onebit_a", i), {n_embd_k_gqa}, TENSOR_NOT_REQUIRED);
                            layer.lowbit_q_wk_b = create_tensor(tn(LLM_TENSOR_ATTN_K, "lowbit_q_b", i), {n_embd}, TENSOR_NOT_REQUIRED);
                            if (!layer.lowbit_q_wk_b) layer.lowbit_q_wk_b = create_tensor(tn(LLM_TENSOR_ATTN_K, "onebit_b", i), {n_embd}, TENSOR_NOT_REQUIRED);
                            layer.lowbit_q_wk_sign = create_tensor(tn(LLM_TENSOR_ATTN_K, "lowbit_q_sign", i), {(int64_t)((n_embd * n_embd_k_gqa + 7) / 8)}, TENSOR_NOT_REQUIRED);
                            if (!layer.lowbit_q_wk_sign) layer.lowbit_q_wk_sign = create_tensor(tn(LLM_TENSOR_ATTN_K, "onebit_sign", i), {(int64_t)((n_embd * n_embd_k_gqa + 7) / 8)}, TENSOR_NOT_REQUIRED);
                            // attn_v
                            layer.lowbit_q_wv_a = create_tensor(tn(LLM_TENSOR_ATTN_V, "lowbit_q_a", i), {n_embd_v_gqa}, TENSOR_NOT_REQUIRED);
                            if (!layer.lowbit_q_wv_a) layer.lowbit_q_wv_a = create_tensor(tn(LLM_TENSOR_ATTN_V, "onebit_a", i), {n_embd_v_gqa}, TENSOR_NOT_REQUIRED);
                            layer.lowbit_q_wv_b = create_tensor(tn(LLM_TENSOR_ATTN_V, "lowbit_q_b", i), {n_embd}, TENSOR_NOT_REQUIRED);
                            if (!layer.lowbit_q_wv_b) layer.lowbit_q_wv_b = create_tensor(tn(LLM_TENSOR_ATTN_V, "onebit_b", i), {n_embd}, TENSOR_NOT_REQUIRED);
                            layer.lowbit_q_wv_sign = create_tensor(tn(LLM_TENSOR_ATTN_V, "lowbit_q_sign", i), {(int64_t)((n_embd * n_embd_v_gqa + 7) / 8)}, TENSOR_NOT_REQUIRED);
                            if (!layer.lowbit_q_wv_sign) layer.lowbit_q_wv_sign = create_tensor(tn(LLM_TENSOR_ATTN_V, "onebit_sign", i), {(int64_t)((n_embd * n_embd_v_gqa + 7) / 8)}, TENSOR_NOT_REQUIRED);
                            // attn_output
                            layer.lowbit_q_wo_a = create_tensor(tn(LLM_TENSOR_ATTN_OUT, "lowbit_q_a", i), {n_embd}, TENSOR_NOT_REQUIRED);
                            if (!layer.lowbit_q_wo_a) layer.lowbit_q_wo_a = create_tensor(tn(LLM_TENSOR_ATTN_OUT, "onebit_a", i), {n_embd}, TENSOR_NOT_REQUIRED);
                            layer.lowbit_q_wo_b = create_tensor(tn(LLM_TENSOR_ATTN_OUT, "lowbit_q_b", i), {n_embd_head_k * n_head}, TENSOR_NOT_REQUIRED);
                            if (!layer.lowbit_q_wo_b) layer.lowbit_q_wo_b = create_tensor(tn(LLM_TENSOR_ATTN_OUT, "onebit_b", i), {n_embd_head_k * n_head}, TENSOR_NOT_REQUIRED);
                            layer.lowbit_q_wo_sign = create_tensor(tn(LLM_TENSOR_ATTN_OUT, "lowbit_q_sign", i), {(int64_t)((n_embd_head_k * n_head * n_embd + 7) / 8)}, TENSOR_NOT_REQUIRED);
                            if (!layer.lowbit_q_wo_sign) layer.lowbit_q_wo_sign = create_tensor(tn(LLM_TENSOR_ATTN_OUT, "onebit_sign", i), {(int64_t)((n_embd_head_k * n_head * n_embd + 7) / 8)}, TENSOR_NOT_REQUIRED);
                        }"""

# --- FFN triplet loading code (inserted after ffn_up creation) ---
FFN_UP_MARKER = '                            layer.ffn_up   = create_tensor(tn(LLM_TENSOR_FFN_UP,   "weight", i), {n_embd,   n_ff}, ob_flag);'

FFN_TRIPLET_CODE = """
                            // lowbit-Q FFN triplets
                            if (is_lowbit_q) {
                                // ffn_gate
                                layer.lowbit_q_ffn_gate_a = create_tensor(tn(LLM_TENSOR_FFN_GATE, "lowbit_q_a", i), {n_ff}, TENSOR_NOT_REQUIRED);
                                if (!layer.lowbit_q_ffn_gate_a) layer.lowbit_q_ffn_gate_a = create_tensor(tn(LLM_TENSOR_FFN_GATE, "onebit_a", i), {n_ff}, TENSOR_NOT_REQUIRED);
                                layer.lowbit_q_ffn_gate_b = create_tensor(tn(LLM_TENSOR_FFN_GATE, "lowbit_q_b", i), {n_embd}, TENSOR_NOT_REQUIRED);
                                if (!layer.lowbit_q_ffn_gate_b) layer.lowbit_q_ffn_gate_b = create_tensor(tn(LLM_TENSOR_FFN_GATE, "onebit_b", i), {n_embd}, TENSOR_NOT_REQUIRED);
                                layer.lowbit_q_ffn_gate_sign = create_tensor(tn(LLM_TENSOR_FFN_GATE, "lowbit_q_sign", i), {(int64_t)((n_embd * n_ff + 7) / 8)}, TENSOR_NOT_REQUIRED);
                                if (!layer.lowbit_q_ffn_gate_sign) layer.lowbit_q_ffn_gate_sign = create_tensor(tn(LLM_TENSOR_FFN_GATE, "onebit_sign", i), {(int64_t)((n_embd * n_ff + 7) / 8)}, TENSOR_NOT_REQUIRED);
                                // ffn_down
                                layer.lowbit_q_ffn_down_a = create_tensor(tn(LLM_TENSOR_FFN_DOWN, "lowbit_q_a", i), {n_embd}, TENSOR_NOT_REQUIRED);
                                if (!layer.lowbit_q_ffn_down_a) layer.lowbit_q_ffn_down_a = create_tensor(tn(LLM_TENSOR_FFN_DOWN, "onebit_a", i), {n_embd}, TENSOR_NOT_REQUIRED);
                                layer.lowbit_q_ffn_down_b = create_tensor(tn(LLM_TENSOR_FFN_DOWN, "lowbit_q_b", i), {n_ff}, TENSOR_NOT_REQUIRED);
                                if (!layer.lowbit_q_ffn_down_b) layer.lowbit_q_ffn_down_b = create_tensor(tn(LLM_TENSOR_FFN_DOWN, "onebit_b", i), {n_ff}, TENSOR_NOT_REQUIRED);
                                layer.lowbit_q_ffn_down_sign = create_tensor(tn(LLM_TENSOR_FFN_DOWN, "lowbit_q_sign", i), {(int64_t)((n_ff * n_embd + 7) / 8)}, TENSOR_NOT_REQUIRED);
                                if (!layer.lowbit_q_ffn_down_sign) layer.lowbit_q_ffn_down_sign = create_tensor(tn(LLM_TENSOR_FFN_DOWN, "onebit_sign", i), {(int64_t)((n_ff * n_embd + 7) / 8)}, TENSOR_NOT_REQUIRED);
                                // ffn_up
                                layer.lowbit_q_ffn_up_a = create_tensor(tn(LLM_TENSOR_FFN_UP, "lowbit_q_a", i), {n_ff}, TENSOR_NOT_REQUIRED);
                                if (!layer.lowbit_q_ffn_up_a) layer.lowbit_q_ffn_up_a = create_tensor(tn(LLM_TENSOR_FFN_UP, "onebit_a", i), {n_ff}, TENSOR_NOT_REQUIRED);
                                layer.lowbit_q_ffn_up_b = create_tensor(tn(LLM_TENSOR_FFN_UP, "lowbit_q_b", i), {n_embd}, TENSOR_NOT_REQUIRED);
                                if (!layer.lowbit_q_ffn_up_b) layer.lowbit_q_ffn_up_b = create_tensor(tn(LLM_TENSOR_FFN_UP, "onebit_b", i), {n_embd}, TENSOR_NOT_REQUIRED);
                                layer.lowbit_q_ffn_up_sign = create_tensor(tn(LLM_TENSOR_FFN_UP, "lowbit_q_sign", i), {(int64_t)((n_embd * n_ff + 7) / 8)}, TENSOR_NOT_REQUIRED);
                                if (!layer.lowbit_q_ffn_up_sign) layer.lowbit_q_ffn_up_sign = create_tensor(tn(LLM_TENSOR_FFN_UP, "onebit_sign", i), {(int64_t)((n_embd * n_ff + 7) / 8)}, TENSOR_NOT_REQUIRED);
                            }"""

# -----------------------------------------------------------------------
# Patchers
# -----------------------------------------------------------------------

def patch_llama_model_h(path: str) -> bool:
    """Patch llama-model.h to add lowbit_q_* struct fields."""
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()

    if PATCH_SENTINEL_LLAMA_H in src:
        print(f"    {os.path.basename(path)}: already patched (skipping)")
        return True

    changed = 0

    # Add struct fields before posnet
    if STRUCT_FIELDS_MARKER in src:
        src = src.replace(STRUCT_FIELDS_MARKER,
                          STRUCT_FIELDS_TO_ADD + STRUCT_FIELDS_MARKER, 1)
        changed += 1
    else:
        print(f"    WARNING: struct fields marker not found in {path}")

    # Add is_lowbit_q flag before params
    if MODEL_FLAG_MARKER in src:
        src = src.replace(MODEL_FLAG_MARKER,
                          MODEL_FLAG_TO_ADD + MODEL_FLAG_MARKER, 1)
        changed += 1
    else:
        print(f"    WARNING: model flag marker not found in {path}")

    with open(path, "w", encoding="utf-8") as f:
        f.write(src)

    print(f"    {os.path.basename(path)}: applied {changed}/2 changes")
    return changed == 2


def patch_llama_model_cpp(path: str) -> bool:
    """Patch llama-model.cpp to detect lowbit-Q and load tensors."""
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()

    if PATCH_SENTINEL_CPP in src:
        print(f"    {os.path.basename(path)}: already patched (skipping)")
        return True

    changed = 0

    # 1. Insert detection code before "get general kv"
    if DETECTION_MARKER in src:
        src = src.replace(DETECTION_MARKER, DETECTION_CODE + DETECTION_MARKER, 1)
        changed += 1
    else:
        print(f"    WARNING: detection marker not found")

    # 2. Make 7 projection tensors TENSOR_NOT_REQUIRED
    # Replace the hard-coded ", 0);" with conditional ob_flag first
    # Find the LLAMA arch block and update the create_tensor calls
    ob_flag_marker = 'layer.wq = create_tensor(tn(LLM_TENSOR_ATTN_Q,   "weight", i), {n_embd, n_embd_head_k * n_head}, 0);'
    ob_flag_replacement = 'const int ob_flag = is_lowbit_q ? TENSOR_NOT_REQUIRED : 0;\n\n                    layer.wq = create_tensor(tn(LLM_TENSOR_ATTN_Q,   "weight", i), {n_embd, n_embd_head_k * n_head}, ob_flag);'
    if ob_flag_marker in src:
        src = src.replace(ob_flag_marker, ob_flag_replacement, 1)
        changed += 1
    else:
        print(f"    WARNING: wq ob_flag marker not found")

    # Replace remaining 6 tensors with ob_flag
    pairs = [
        ('layer.wk = create_tensor(tn(LLM_TENSOR_ATTN_K,   "weight", i), {n_embd, n_embd_k_gqa}, 0);',
         'layer.wk = create_tensor(tn(LLM_TENSOR_ATTN_K,   "weight", i), {n_embd, n_embd_k_gqa}, ob_flag);'),
        ('layer.wv = create_tensor(tn(LLM_TENSOR_ATTN_V,   "weight", i), {n_embd, n_embd_v_gqa}, 0);',
         'layer.wv = create_tensor(tn(LLM_TENSOR_ATTN_V,   "weight", i), {n_embd, n_embd_v_gqa}, ob_flag);'),
        ('layer.wo = create_tensor(tn(LLM_TENSOR_ATTN_OUT, "weight", i), {n_embd_head_k * n_head, n_embd}, 0);',
         'layer.wo = create_tensor(tn(LLM_TENSOR_ATTN_OUT, "weight", i), {n_embd_head_k * n_head, n_embd}, ob_flag);'),
        ('layer.ffn_gate = create_tensor(tn(LLM_TENSOR_FFN_GATE, "weight", i), {n_embd,   n_ff}, 0);',
         'layer.ffn_gate = create_tensor(tn(LLM_TENSOR_FFN_GATE, "weight", i), {n_embd,   n_ff}, ob_flag);'),
        ('layer.ffn_down = create_tensor(tn(LLM_TENSOR_FFN_DOWN, "weight", i), {  n_ff, n_embd}, 0);',
         'layer.ffn_down = create_tensor(tn(LLM_TENSOR_FFN_DOWN, "weight", i), {  n_ff, n_embd}, ob_flag);'),
        ('layer.ffn_up   = create_tensor(tn(LLM_TENSOR_FFN_UP,   "weight", i), {n_embd,   n_ff}, 0);',
         'layer.ffn_up   = create_tensor(tn(LLM_TENSOR_FFN_UP,   "weight", i), {n_embd,   n_ff}, ob_flag);'),
    ]
    for old, new in pairs:
        if old in src:
            src = src.replace(old, new, 1)
            changed += 1
        else:
            print(f"    WARNING: ob_flag replacement not found for: {old[:60]}...")

    # 3. Insert attn triplet loading after bo
    if ATTN_TRIPLET_MARKER in src:
        src = src.replace(ATTN_TRIPLET_MARKER,
                          ATTN_TRIPLET_MARKER + ATTN_TRIPLET_CODE, 1)
        changed += 1
    else:
        print(f"    WARNING: attn triplet marker not found")

    # 4. Insert FFN triplet loading after ffn_up
    if FFN_UP_MARKER in src:
        src = src.replace(FFN_UP_MARKER,
                          FFN_UP_MARKER + FFN_TRIPLET_CODE, 1)
        changed += 1
    else:
        print(f"    WARNING: FFN triplet marker not found")

    # 5. Add #include "lowbit-q-metadata.h" after models/models.h
    if METADATA_INCLUDE_MARKER in src and METADATA_INCLUDE_CODE not in src:
        src = src.replace(METADATA_INCLUDE_MARKER, METADATA_INCLUDE_CODE, 1)
        changed += 1
    elif METADATA_INCLUDE_CODE in src:
        changed += 1  # already present
    else:
        print(f"    WARNING: metadata include marker not found")

    # 6. Add lowbit_q_log_model_info() call before end of load_tensors()
    if LOAD_TENSORS_RETURN_MARKER in src:
        src = src.replace(LOAD_TENSORS_RETURN_MARKER, LOAD_TENSORS_RETURN_CODE, 1)
        changed += 1
    else:
        print(f"    WARNING: load_tensors return marker not found (already added?)")
        changed += 1  # best-effort: don't fail if already patched

    with open(path, "w", encoding="utf-8") as f:
        f.write(src)

    expected = 1 + 1 + 6 + 1 + 1 + 1 + 1  # detection + ob_flag + 6 pairs + attn_triplet + ffn_triplet + include + log
    print(f"    {os.path.basename(path)}: applied {changed}/{expected} changes")
    return changed == expected


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        print(f"Usage: {sys.argv[0]} <path/to/llama-model.cpp> [path/to/llama-model.h]")
        print(f"  If .h path is not given, infers from .cpp path by changing extension.")
        sys.exit(1)

    cpp_path = sys.argv[1]
    if len(sys.argv) == 3:
        h_path = sys.argv[2]
    else:
        h_path = cpp_path.replace(".cpp", ".h")

    ok_cpp = ok_h = True

    if os.path.isfile(h_path):
        ok_h = patch_llama_model_h(h_path)
    else:
        print(f"    WARNING: {h_path} not found — skipping .h patch")

    if os.path.isfile(cpp_path):
        ok_cpp = patch_llama_model_cpp(cpp_path)
    else:
        print(f"ERROR: {cpp_path} not found")
        sys.exit(1)

    sys.exit(0 if (ok_cpp and ok_h) else 1)
