/**
 * lowbit-q-model-builder.h — lowbit-Q model graph construction helpers.
 *
 * Provides the lowbit_q_layer_tensors struct and lowbit_q_lookup() stub
 * used by the patched llama.cpp graph builder.
 *
 * == Dispatch architecture (Phase 2: struct-field approach) ==
 *
 * The actual dispatch decision is NOT made via lowbit_q_lookup() at
 * inference time. Instead, the patch 0002 loader pre-populates dedicated
 * fields in llama_layer (llama-model.h) during model load:
 *
 *   layer.lowbit_q_wq_a    = create_tensor("blk.N.attn_q.lowbit_q_a", ...)
 *   layer.lowbit_q_wq_b    = create_tensor("blk.N.attn_q.lowbit_q_b", ...)
 *   layer.lowbit_q_wq_sign = create_tensor("blk.N.attn_q.lowbit_q_sign", ...)
 *   // ... (wk, wv, wo, ffn_gate, ffn_down, ffn_up)
 *
 * The patch 0003 graph builder (models/llama.cpp) checks those fields:
 *
 *   if (model.layers[il].lowbit_q_wq_a) {
 *       Qcur = lowbit_q_build_mul_mat(ctx0,
 *           model.layers[il].lowbit_q_wq_a,
 *           model.layers[il].lowbit_q_wq_b,
 *           model.layers[il].lowbit_q_wq_sign, cur);
 *   } else {
 *       Qcur = build_lora_mm(model.layers[il].wq, cur);
 *   }
 *
 * == Why not lowbit_q_lookup()? ==
 *
 * The original design had lowbit_q_lookup() call llama_get_model_tensor()
 * at inference time to search for SVID tensors by name. However,
 * llama_get_model_tensor() is not available in the public C API of the
 * wllama v2.3.7 pinned llama.cpp version. The struct-field approach used
 * here mirrors the pattern from FujitsuResearch/OneCompression's onebit
 * implementation and resolves the same symbols at load time instead.
 *
 * lowbit_q_lookup() remains in the API as a stub that always returns
 * {valid=0}. It is not called by the shipped dispatch code.
 */

#ifndef LOWBIT_Q_MODEL_BUILDER_H
#define LOWBIT_Q_MODEL_BUILDER_H

#include "ggml.h"
#include "llama.h"
#include "lowbit-q-mul-mat.h"

#ifdef __cplusplus
#include <string>
extern "C" {
#endif

/**
 * Tensor name patterns for lowbit-Q SVID layers.
 *
 * For a layer like "blk.0.attn_q" the lowbit-Q SVID tensors are:
 *   blk.0.attn_q.lowbit_q_a
 *   blk.0.attn_q.lowbit_q_b
 *   blk.0.attn_q.lowbit_q_sign
 *
 * Q4_0 / PASSTHROUGH layers retain the standard name:
 *   blk.0.attn_q.weight   (GGML type Q4_0 or F16/BF16)
 *
 * The authoritative record of which type was assigned to each layer is
 * the "lowbit-q.tensor_alloc" JSON metadata (see lowbit-q-metadata.h).
 */

/**
 * Per-layer lowbit-Q SVID tensor triplet.
 *
 * NOTE: In the Phase 2 implementation, dispatch decisions are made via
 * the llama_layer struct fields (lowbit_q_wq_a etc.) set at load time,
 * NOT by calling lowbit_q_lookup() at inference time. This struct is
 * kept for API compatibility; lowbit_q_lookup() always returns valid=0.
 */
struct lowbit_q_layer_tensors {
    struct ggml_tensor * a;    /* fp16, (out_features,) — row scales */
    struct ggml_tensor * b;    /* fp16, (in_features,)  — column scales */
    struct ggml_tensor * sign; /* uint8, packed bits MSB-first, (ceil(out*in/8),) */
    int valid;                 /* 1 if all three tensors were found; always 0 in stub */
};

/**
 * Look up lowbit-Q SVID tensors for a given layer projection.
 *
 * STUB IMPLEMENTATION: always returns {valid=0}.
 *
 * The original design called llama_get_model_tensor() here, but that
 * function is not available in the public API of the wllama-pinned
 * llama.cpp. Dispatch instead uses the llama_layer struct fields
 * (lowbit_q_wq_a etc.) populated by the patch 0002 loader.
 *
 * @param model   The loaded llama_model (read-only) — unused in stub
 * @param prefix  Tensor name prefix, e.g. "blk.0.attn_q" — unused in stub
 * @return        {valid=0} always
 */
struct lowbit_q_layer_tensors lowbit_q_lookup(
    const struct llama_model * model,
    const char * prefix);

/**
 * Log all lowbit-Q SVID tensors found in the model to stderr.
 * Delegates to lowbit_q_log_model_info() in lowbit-q-metadata.h.
 * No-op if model has no lowbit-Q metadata.
 *
 * @param model   The loaded llama_model
 * @param n_layer Number of transformer layers to check
 */
void lowbit_q_log_model_tensors(
    const struct llama_model * model,
    int n_layer);

#ifdef __cplusplus
}
#endif

/* C++ convenience overload using std::string prefix */
#ifdef __cplusplus
inline struct lowbit_q_layer_tensors lowbit_q_lookup(
    const struct llama_model * model,
    const std::string & prefix)
{
    return lowbit_q_lookup(model, prefix.c_str());
}
#endif

#endif /* LOWBIT_Q_MODEL_BUILDER_H */
