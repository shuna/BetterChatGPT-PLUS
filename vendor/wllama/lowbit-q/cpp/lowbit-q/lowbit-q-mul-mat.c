/**
 * lowbit-q-mul-mat.c — lowbit-Q matrix multiplication kernel.
 *
 * Part of vendor/wllama/lowbit-q. See vendor/wllama/lowbit-q/README.md for build instructions.
 *
 * Implements the OneBit decomposition:
 *   out[batch][i] = a[i] * sum_j( sign[i,j] * b[j] * x[batch][j] )
 *
 * Optimization notes:
 *   - x is pre-scaled by b once per batch (saves in_features multiplies per row)
 *   - Inner loop is conditional add/sub (no multiply per weight)
 *   - Byte-aligned fast path: when row bit offset % 8 == 0, unroll 8 bits per byte
 *   - Rows are parallelized across ggml threads
 *   - WASM SIMD (128-bit) path processes 8 sign bits per byte with direct bitmask
 *
 * Build: compiled as part of the wllama WASM build.
 *        Requires: ggml.h from llama.cpp (for type definitions only)
 *        Patched into build via: 0001-cmake-add-lowbit-q-sources.patch
 */

#include "lowbit-q-mul-mat.h"
#include "llama.h"

#include <stdlib.h>
#include <string.h>
#include <math.h>

/* ggml fp16 conversion macros — use ggml's if available, else inline */
#ifndef GGML_FP16_TO_FP32
static float ggml_fp16_to_fp32_fallback(ggml_fp16_t h) {
    /* Standard IEEE 754 half → single conversion */
    unsigned int sign = (h >> 15) & 0x1;
    unsigned int exponent = (h >> 10) & 0x1F;
    unsigned int mantissa = h & 0x3FF;
    unsigned int f;

    if (exponent == 0) {
        if (mantissa == 0) {
            f = sign << 31;
        } else {
            /* Subnormal */
            int e = -1;
            unsigned int m = mantissa;
            do { e++; m <<= 1; } while ((m & 0x400) == 0);
            f = (sign << 31) | ((unsigned int)(127 - 15 - e) << 23) | ((m & 0x3FF) << 13);
        }
    } else if (exponent == 31) {
        f = (sign << 31) | (0xFF << 23) | (mantissa << 13);
    } else {
        f = (sign << 31) | ((unsigned int)(exponent - 15 + 127) << 23) | (mantissa << 13);
    }

    float result;
    memcpy(&result, &f, sizeof(float));
    return result;
}
#define GGML_FP16_TO_FP32(x) ggml_fp16_to_fp32_fallback(x)
#endif

/* --------------------------------------------------------------------------
 * Core kernel: lowbit-Q matmul forward pass
 * -------------------------------------------------------------------------- */

/**
 * Core kernel entry point.
 *
 * Called directly from the ggml_custom3 callback with thread indices.
 * Does NOT depend on ggml_compute_params — only uses ith/nth for
 * thread partitioning, making it robust against ggml struct changes.
 */
static void lowbit_q_mul_mat_kernel(
    struct ggml_tensor * dst,
    int ith, int nth)
{
    const struct ggml_tensor * a_tensor    = dst->src[0]; /* (out_features,) fp16 */
    const struct ggml_tensor * b_tensor    = dst->src[1]; /* (in_features,) fp16 */
    const struct ggml_tensor * sign_tensor = dst->src[2]; /* packed bits uint8 */
    const struct ggml_tensor * x_tensor    = dst->src[3]; /* (in_features[, batch]) f32 */

    const int64_t out_features = a_tensor->ne[0];
    const int64_t in_features  = b_tensor->ne[0];
    /* Batch: ne[0] = in_features, ne[1] = batch (or 1 if 1D) */
    const int64_t batch_size   = (x_tensor->ne[1] > 0) ? x_tensor->ne[1] : 1;

    const ggml_fp16_t * a_data    = (const ggml_fp16_t *) a_tensor->data;
    const ggml_fp16_t * b_data    = (const ggml_fp16_t *) b_tensor->data;
    const uint8_t     * sign_data = (const uint8_t *)     sign_tensor->data;
    const float       * x_data    = (const float *)       x_tensor->data;
    float             * dst_data  = (float *)             dst->data;

    /* Allocate per-thread buffer for b-scaled x.
     * Stack-allocate for typical sizes, heap for very large layers. */
    float * x_scaled;
    float x_scaled_stack[4096];
    int heap_allocated = 0;

    if (in_features <= 4096) {
        x_scaled = x_scaled_stack;
    } else {
        x_scaled = (float *) malloc((size_t)in_features * sizeof(float));
        if (!x_scaled) return; /* OOM — silently skip (ggml convention) */
        heap_allocated = 1;
    }

    for (int64_t batch = 0; batch < batch_size; batch++) {
        const float * x_batch = x_data + batch * in_features;
        float * dst_batch = dst_data + batch * out_features;

        /* Step 1: Pre-scale x by b — done once per batch.
         * x_scaled[j] = x[j] * fp16_to_f32(b[j]) */
        for (int64_t j = 0; j < in_features; j++) {
            x_scaled[j] = x_batch[j] * GGML_FP16_TO_FP32(b_data[j]);
        }

        /* Step 2: For each output row (partitioned across threads),
         * accumulate sign-conditional sum.
         *
         * out[i] = a[i] * sum_j( sign_bit ? +x_scaled[j] : -x_scaled[j] )
         *
         * The sign is stored MSB-first: bit 7 of byte 0 is the first element.
         */
        for (int64_t i = (int64_t)ith; i < out_features; i += (int64_t)nth) {
            float sum = 0.0f;
            const int64_t row_bit_start = i * in_features;

#if defined(__wasm_simd128__)
            /* WASM SIMD path: process 8 elements at a time using sign byte directly.
             * Each byte of sign_data encodes 8 consecutive elements.
             * We unpack each bit and conditionally add/subtract. */
            {
                int64_t j = 0;
                /* Process full bytes (8 elements each) */
                const int64_t full_bytes = in_features / 8;
                for (int64_t byte_idx = 0; byte_idx < full_bytes; byte_idx++) {
                    const int64_t abs_byte = (row_bit_start / 8) + byte_idx;
                    const uint8_t sign_byte = sign_data[abs_byte];
                    /* Unroll 8 bits */
                    sum += (sign_byte & 0x80) ? x_scaled[j + 0] : -x_scaled[j + 0];
                    sum += (sign_byte & 0x40) ? x_scaled[j + 1] : -x_scaled[j + 1];
                    sum += (sign_byte & 0x20) ? x_scaled[j + 2] : -x_scaled[j + 2];
                    sum += (sign_byte & 0x10) ? x_scaled[j + 3] : -x_scaled[j + 3];
                    sum += (sign_byte & 0x08) ? x_scaled[j + 4] : -x_scaled[j + 4];
                    sum += (sign_byte & 0x04) ? x_scaled[j + 5] : -x_scaled[j + 5];
                    sum += (sign_byte & 0x02) ? x_scaled[j + 6] : -x_scaled[j + 6];
                    sum += (sign_byte & 0x01) ? x_scaled[j + 7] : -x_scaled[j + 7];
                    j += 8;
                }
                /* Handle remaining elements */
                for (; j < in_features; j++) {
                    const int64_t bit_idx = row_bit_start + j;
                    const int bit = (sign_data[bit_idx / 8] >> (7 - (bit_idx % 8))) & 1;
                    sum += bit ? x_scaled[j] : -x_scaled[j];
                }
            }
#else
            /* Scalar path: process one element at a time.
             * Optimize: when row_bit_start is byte-aligned, we can read
             * full bytes and unroll. */
            if ((row_bit_start % 8) == 0) {
                /* Byte-aligned fast path */
                int64_t j = 0;
                const int64_t base_byte = row_bit_start / 8;
                const int64_t full_bytes = in_features / 8;

                for (int64_t byte_idx = 0; byte_idx < full_bytes; byte_idx++) {
                    const uint8_t sign_byte = sign_data[base_byte + byte_idx];
                    sum += (sign_byte & 0x80) ? x_scaled[j + 0] : -x_scaled[j + 0];
                    sum += (sign_byte & 0x40) ? x_scaled[j + 1] : -x_scaled[j + 1];
                    sum += (sign_byte & 0x20) ? x_scaled[j + 2] : -x_scaled[j + 2];
                    sum += (sign_byte & 0x10) ? x_scaled[j + 3] : -x_scaled[j + 3];
                    sum += (sign_byte & 0x08) ? x_scaled[j + 4] : -x_scaled[j + 4];
                    sum += (sign_byte & 0x04) ? x_scaled[j + 5] : -x_scaled[j + 5];
                    sum += (sign_byte & 0x02) ? x_scaled[j + 6] : -x_scaled[j + 6];
                    sum += (sign_byte & 0x01) ? x_scaled[j + 7] : -x_scaled[j + 7];
                    j += 8;
                }

                /* Remaining elements */
                for (; j < in_features; j++) {
                    const int64_t bit_idx = row_bit_start + j;
                    const int bit = (sign_data[bit_idx / 8] >> (7 - (bit_idx % 8))) & 1;
                    sum += bit ? x_scaled[j] : -x_scaled[j];
                }
            } else {
                /* Unaligned slow path */
                for (int64_t j = 0; j < in_features; j++) {
                    const int64_t bit_idx = row_bit_start + j;
                    const int bit = (sign_data[bit_idx / 8] >> (7 - (bit_idx % 8))) & 1;
                    sum += bit ? x_scaled[j] : -x_scaled[j];
                }
            }
#endif

            dst_batch[i] = GGML_FP16_TO_FP32(a_data[i]) * sum;
        }
    }

    if (heap_allocated) {
        free(x_scaled);
    }
}

/* --------------------------------------------------------------------------
 * Graph builder: construct lowbit-Q matmul using ggml_custom_4d
 * --------------------------------------------------------------------------
 *
 * Uses the ggml_custom_4d API (GGML_OP_CUSTOM) which:
 *   - Creates the output tensor with the correct shape and type up-front
 *   - Stores all source tensors in dst->src[] via the args array
 *   - Uses a simple callback: void(dst, ith, nth, userdata)
 *
 * This avoids post-hoc mutation of tensor metadata and is robust under
 * WASM's strict call_indirect type checking.
 */

/* Callback for ggml_custom_op_t.
 * Signature: void (*)(struct ggml_tensor * dst, int ith, int nth, void * userdata)
 * Source tensors are in dst->src[0..3] = {a, b, sign, x}.
 */
static void lowbit_q_custom_callback(
    struct ggml_tensor * dst,
    int ith, int nth,
    void * userdata)
{
    (void)userdata;
    lowbit_q_mul_mat_kernel(dst, ith, nth);
}

struct ggml_tensor * lowbit_q_build_mul_mat(
    struct ggml_context * ctx,
    struct ggml_tensor  * a,           /* (out_features,) fp16 */
    struct ggml_tensor  * b,           /* (in_features,) fp16 */
    struct ggml_tensor  * sign_packed, /* (ceil(out*in/8),) uint8 */
    struct ggml_tensor  * x)           /* (in_features[, batch]) f32 */
{
    const int64_t out_features = a->ne[0];
    const int64_t batch_size   = (x->ne[1] > 0) ? x->ne[1] : 1;

    /* Pack all 4 source tensors into an args array.
     * ggml_custom_4d stores them as dst->src[0..3]. */
    struct ggml_tensor * args[4] = { a, b, sign_packed, x };

    struct ggml_tensor * result = ggml_custom_4d(
        ctx,
        GGML_TYPE_F32,
        out_features,     /* ne0 */
        batch_size,       /* ne1 */
        1,                /* ne2 */
        1,                /* ne3 */
        args,
        4,                /* n_args */
        lowbit_q_custom_callback,
        GGML_N_TASKS_MAX, /* auto-determine thread count */
        NULL              /* userdata */
    );

    return result;
}

/* --------------------------------------------------------------------------
 * lowbit-Q model detection
 * -------------------------------------------------------------------------- */

int lowbit_q_detect_format(const struct llama_model * model) {
    /* Read the "lowbit-q.version" metadata from the model.
     * Also accepts legacy "onebit.version" for pre-rename GGUF files.
     * llama.cpp stores GGUF metadata accessible via llama_model_meta_val_str. */
    char buf[32];
    int32_t res = llama_model_meta_val_str(model, "lowbit-q.version", buf, sizeof(buf));
    if (res < 0) {
        /* Fallback: try legacy key for pre-rename models */
        res = llama_model_meta_val_str(model, "onebit.version", buf, sizeof(buf));
        if (res < 0) {
            return 0; /* Neither key found → standard model */
        }
    }
    return atoi(buf);
}
