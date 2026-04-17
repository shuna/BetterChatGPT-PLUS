/**
 * lowbit-q-model-builder.c — lowbit-Q tensor lookup stubs.
 *
 * In the Phase 2 (struct-field) approach, dispatch decisions are made via
 * llama_layer struct fields (lowbit_q_wq_a etc.) populated at load time
 * by the patch 0002 loader.  These stub functions exist for API
 * compatibility only — they are not called by the shipped dispatch code.
 *
 * See lowbit-q-model-builder.h for the full design rationale.
 */

#include "lowbit-q-model-builder.h"

#include <string.h>

struct lowbit_q_layer_tensors lowbit_q_lookup(
    const struct llama_model * model,
    const char * prefix)
{
    (void)model;
    (void)prefix;

    struct lowbit_q_layer_tensors result;
    memset(&result, 0, sizeof(result));
    /* Stub: always returns valid=0.  Actual dispatch uses llama_layer fields. */
    return result;
}

void lowbit_q_log_model_tensors(
    const struct llama_model * model,
    int n_layer)
{
    (void)model;
    (void)n_layer;
    /* No-op stub.  Logging is handled by lowbit_q_log_model_info() in
     * lowbit-q-metadata.c, called from the patch 0002 loader. */
}
