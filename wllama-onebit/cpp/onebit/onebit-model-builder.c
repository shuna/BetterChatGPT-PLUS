/**
 * onebit-model-builder.c — Onebit tensor lookup for graph construction.
 */

#include "onebit-model-builder.h"

#include <string.h>
#include <stdio.h>

/* Suffix constants matching the GGUF tensor naming convention */
static const char * SUFFIX_A    = ".onebit_a";
static const char * SUFFIX_B    = ".onebit_b";
static const char * SUFFIX_SIGN = ".onebit_sign";

struct onebit_layer_tensors onebit_lookup(
    struct ggml_context * ctx,
    const char * prefix)
{
    struct onebit_layer_tensors result;
    memset(&result, 0, sizeof(result));

    /* Build full tensor names */
    char name_a[256], name_b[256], name_sign[256];
    snprintf(name_a,    sizeof(name_a),    "%s%s", prefix, SUFFIX_A);
    snprintf(name_b,    sizeof(name_b),    "%s%s", prefix, SUFFIX_B);
    snprintf(name_sign, sizeof(name_sign), "%s%s", prefix, SUFFIX_SIGN);

    /* Look up tensors in the ggml context */
    result.a    = ggml_get_tensor(ctx, name_a);
    result.b    = ggml_get_tensor(ctx, name_b);
    result.sign = ggml_get_tensor(ctx, name_sign);

    /* All three must be present for a valid onebit layer */
    result.valid = (result.a != NULL && result.b != NULL && result.sign != NULL) ? 1 : 0;

    return result;
}
