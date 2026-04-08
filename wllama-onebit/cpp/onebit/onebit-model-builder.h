/**
 * onebit-model-builder.h — Onebit model graph construction.
 *
 * Provides helpers that intercept the llama.cpp model graph builder
 * to substitute ggml_mul_mat with onebit_build_mul_mat for layers
 * that have onebit tensor triplets (a, b, sign).
 *
 * Integration with wllama's action_load:
 *   After llama_model_load completes, call onebit_detect_format()
 *   to check if the model is onebit. If so, the model is loaded
 *   normally (llama.cpp ignores unknown tensor names), but inference
 *   requires a patched graph builder.
 *
 * Since llama.cpp does not expose a graph-builder hook, the practical
 * integration strategy is to fork llama.cpp's build_llama() function
 * (in llama-model.cpp) and add onebit dispatch there. This file
 * provides the helper functions that the forked builder calls.
 */

#ifndef ONEBIT_MODEL_BUILDER_H
#define ONEBIT_MODEL_BUILDER_H

#include "ggml.h"
#include "llama.h"
#include "onebit-mul-mat.h"

#ifdef __cplusplus
#include <string>
extern "C" {
#endif

/**
 * Tensor name patterns for onebit layers.
 *
 * For a layer like "model.layers.0.self_attn.q_proj", the onebit
 * tensors are named:
 *   model.layers.0.self_attn.q_proj.onebit_a
 *   model.layers.0.self_attn.q_proj.onebit_b
 *   model.layers.0.self_attn.q_proj.onebit_sign
 *
 * Standard layers have:
 *   model.layers.0.self_attn.q_proj.weight
 */

/**
 * Per-layer onebit tensor triplet.
 * Resolved from the model's tensor storage during graph construction.
 */
struct onebit_layer_tensors {
    struct ggml_tensor * a;    /* fp16, (out_features,) */
    struct ggml_tensor * b;    /* fp16, (in_features,) */
    struct ggml_tensor * sign; /* uint8, (ceil(out*in/8),) */
    int valid;                 /* 1 if all three tensors were found */
};

/**
 * Look up onebit tensors for a given layer projection.
 *
 * @param ctx     The ggml context containing the model tensors
 * @param prefix  Tensor name prefix, e.g. "model.layers.0.self_attn.q_proj"
 * @return        Struct with the three tensors, or valid=0 if not found
 *
 * Usage in the model builder:
 *
 *   onebit_layer_tensors ob = onebit_lookup(ctx, "model.layers.0.self_attn.q_proj");
 *   if (ob.valid) {
 *       cur = onebit_build_mul_mat(ctx0, ob.a, ob.b, ob.sign, cur);
 *   } else {
 *       cur = ggml_mul_mat(ctx0, model.layers[il].wq, cur);
 *   }
 */
struct onebit_layer_tensors onebit_lookup(
    struct ggml_context * ctx,
    const char * prefix);

#ifdef __cplusplus
}
#endif

/**
 * C++ convenience: lookup using std::string prefix.
 */
#ifdef __cplusplus
inline struct onebit_layer_tensors onebit_lookup(
    struct ggml_context * ctx,
    const std::string & prefix)
{
    return onebit_lookup(ctx, prefix.c_str());
}
#endif

#endif /* ONEBIT_MODEL_BUILDER_H */
