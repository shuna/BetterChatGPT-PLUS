/**
 * lowbit-q-mul-mat.h — lowbit-Q matrix multiplication for ggml.
 *
 * Part of wllama-lowbit-q. See wllama-lowbit-q/README.md for build instructions.
 * Build integration: added to wllama via patches/0001-cmake-add-lowbit-q-sources.patch
 *
 * Implements the OneBit decomposition matmul:
 *   out[batch][i] = a[i] * sum_j( sign[i,j] * b[j] * x[batch][j] )
 *
 * This is a standalone module that does NOT modify ggml core.
 * Integration uses ggml_custom_4d (existing public API, GGML_OP_CUSTOM),
 * requiring NO changes to ggml.h or ggml op enums.
 *
 * Dependencies: ggml.h (read-only, for type definitions and ggml_map_custom3_inplace)
 * Target: wllama WASM build (Emscripten, -msimd128)
 */

#ifndef LOWBIT_Q_MUL_MAT_H
#define LOWBIT_Q_MUL_MAT_H

#include "ggml.h"
#include "llama.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Strategy A: Custom op callback for ggml_map_custom3().
 *
 * Usage in model builder:
 *   struct ggml_tensor * result = ggml_map_custom3(
 *       ctx, a_tensor, b_tensor, sign_tensor,
 *       lowbit_q_mul_mat_custom_op,
 *       GGML_N_TASKS_MAX,  // auto-thread
 *       x_tensor           // userdata = input activation
 *   );
 *
 * Wait — ggml_map_custom3 doesn't pass userdata to the callback in the
 * standard API. So we use a different decomposition:
 *
 * Decompose into existing ggml ops:
 *   1. x_scaled = x * b              (element-wise along cols)
 *   2. sign_f32 = convert(sign_bits) (custom op: unpack bits to ±1.0)
 *   3. W_signed = diag(a) @ sign_f32 (row-scaled sign matrix)
 *   4. out = W_signed @ x_scaled     (standard matmul)
 *
 * But this materializes the full sign matrix as fp32, which is wasteful.
 * For actual deployment, Strategy B (custom op enum) is better.
 *
 * Therefore we implement Strategy B below, but wrapped so that
 * the ggml.h change is minimal (1 enum value + 1 function declaration).
 */

/**
 * Construct a lowbit-Q matmul node in the ggml computation graph.
 *
 * Implements: out = diag(a) × unpack(sign) × diag(b) × x
 *
 * Uses ggml_custom_4d (GGML_OP_CUSTOM) as the integration mechanism,
 * requiring NO changes to ggml.h. All 4 tensors (a, b, sign, x) are
 * passed as args and stored in dst->src[0..3].
 *
 * Thread partitioning: output rows are split across ggml threads.
 * The kernel pre-scales x by b, then does conditional add/sub
 * over sign bits (no per-weight multiply).
 */
struct ggml_tensor * lowbit_q_build_mul_mat(
    struct ggml_context * ctx,
    struct ggml_tensor  * a,           /* (out_features,) fp16 */
    struct ggml_tensor  * b,           /* (in_features,) fp16 */
    struct ggml_tensor  * sign_packed, /* (ceil(out*in/8),) uint8 */
    struct ggml_tensor  * x);          /* (in_features[, batch]) f32 */

/**
 * Check if a model's GGUF metadata indicates lowbit-Q format.
 * Returns the lowbit-Q format version (>0 if lowbit-Q), 0 if standard model.
 */
int lowbit_q_detect_format(const struct llama_model * model);

#ifdef __cplusplus
}
#endif

#endif /* LOWBIT_Q_MUL_MAT_H */
