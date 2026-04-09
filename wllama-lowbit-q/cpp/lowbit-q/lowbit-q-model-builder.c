/**
 * lowbit-q-model-builder.c — lowbit-Q tensor lookup for graph construction.
 */

#include "lowbit-q-model-builder.h"

#include <string.h>
#include <stdio.h>

/* Suffix constants matching the GGUF tensor naming convention */
static const char * SUFFIX_A    = ".lowbit_q_a";
static const char * SUFFIX_B    = ".lowbit_q_b";
static const char * SUFFIX_SIGN = ".lowbit_q_sign";

/* Legacy suffixes for pre-rename GGUF files */
static const char * LEGACY_SUFFIX_A    = ".onebit_a";
static const char * LEGACY_SUFFIX_B    = ".onebit_b";
static const char * LEGACY_SUFFIX_SIGN = ".onebit_sign";

struct lowbit_q_layer_tensors lowbit_q_lookup(
    struct ggml_context * ctx,
    const char * prefix)
{
    struct lowbit_q_layer_tensors result;
    memset(&result, 0, sizeof(result));

    /* Build full tensor names — try new suffixes first */
    char name_a[256], name_b[256], name_sign[256];
    snprintf(name_a,    sizeof(name_a),    "%s%s", prefix, SUFFIX_A);
    snprintf(name_b,    sizeof(name_b),    "%s%s", prefix, SUFFIX_B);
    snprintf(name_sign, sizeof(name_sign), "%s%s", prefix, SUFFIX_SIGN);

    /* Look up tensors in the ggml context */
    result.a    = ggml_get_tensor(ctx, name_a);
    result.b    = ggml_get_tensor(ctx, name_b);
    result.sign = ggml_get_tensor(ctx, name_sign);

    /* Fallback: try legacy onebit suffixes for pre-rename models */
    if (result.a == NULL || result.b == NULL || result.sign == NULL) {
        snprintf(name_a,    sizeof(name_a),    "%s%s", prefix, LEGACY_SUFFIX_A);
        snprintf(name_b,    sizeof(name_b),    "%s%s", prefix, LEGACY_SUFFIX_B);
        snprintf(name_sign, sizeof(name_sign), "%s%s", prefix, LEGACY_SUFFIX_SIGN);

        result.a    = ggml_get_tensor(ctx, name_a);
        result.b    = ggml_get_tensor(ctx, name_b);
        result.sign = ggml_get_tensor(ctx, name_sign);
    }

    /* All three must be present for a valid lowbit-Q layer */
    result.valid = (result.a != NULL && result.b != NULL && result.sign != NULL) ? 1 : 0;

    return result;
}
