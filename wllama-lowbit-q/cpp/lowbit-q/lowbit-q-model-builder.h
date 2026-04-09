/**
 * lowbit-q-model-builder.h — lowbit-Q model graph construction.
 *
 * Provides helpers that intercept the llama.cpp model graph builder
 * to substitute ggml_mul_mat with lowbit_q_build_mul_mat for layers
 * that have lowbit-Q tensor triplets (a, b, sign).
 *
 * Integration with wllama's action_load:
 *   After llama_model_load completes, call lowbit_q_detect_format()
 *   to check if the model is lowbit-Q. If so, the model is loaded
 *   normally (llama.cpp ignores unknown tensor names), but inference
 *   requires a patched graph builder.
 *
 * Since llama.cpp does not expose a graph-builder hook, the practical
 * integration strategy is to fork llama.cpp's build_llama() function
 * (in llama-model.cpp) and add lowbit-Q dispatch there. This file
 * provides the helper functions that the forked builder calls.
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
 * Tensor name patterns for lowbit-Q layers.
 *
 * For a layer like "model.layers.0.self_attn.q_proj", the lowbit-Q
 * tensors are named:
 *   model.layers.0.self_attn.q_proj.lowbit_q_a
 *   model.layers.0.self_attn.q_proj.lowbit_q_b
 *   model.layers.0.self_attn.q_proj.lowbit_q_sign
 *
 * Standard layers have:
 *   model.layers.0.self_attn.q_proj.weight
 */

/**
 * Per-layer lowbit-Q tensor triplet.
 * Resolved from the model's tensor storage during graph construction.
 */
struct lowbit_q_layer_tensors {
    struct ggml_tensor * a;    /* fp16, (out_features,) */
    struct ggml_tensor * b;    /* fp16, (in_features,) */
    struct ggml_tensor * sign; /* uint8, (ceil(out*in/8),) */
    int valid;                 /* 1 if all three tensors were found */
};

/**
 * Look up lowbit-Q tensors for a given layer projection.
 *
 * @param ctx     The ggml context containing the model tensors
 * @param prefix  Tensor name prefix, e.g. "model.layers.0.self_attn.q_proj"
 * @return        Struct with the three tensors, or valid=0 if not found
 *
 * Usage in the model builder:
 *
 *   lowbit_q_layer_tensors ob = lowbit_q_lookup(ctx, "model.layers.0.self_attn.q_proj");
 *   if (ob.valid) {
 *       cur = lowbit_q_build_mul_mat(ctx0, ob.a, ob.b, ob.sign, cur);
 *   } else {
 *       cur = ggml_mul_mat(ctx0, model.layers[il].wq, cur);
 *   }
 */
struct lowbit_q_layer_tensors lowbit_q_lookup(
    struct ggml_context * ctx,
    const char * prefix);

#ifdef __cplusplus
}
#endif

/**
 * C++ convenience: lookup using std::string prefix.
 */
#ifdef __cplusplus
inline struct lowbit_q_layer_tensors lowbit_q_lookup(
    struct ggml_context * ctx,
    const std::string & prefix)
{
    return lowbit_q_lookup(ctx, prefix.c_str());
}
#endif

#endif /* LOWBIT_Q_MODEL_BUILDER_H */
