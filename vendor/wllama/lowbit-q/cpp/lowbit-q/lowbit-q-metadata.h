/**
 * lowbit-q-metadata.h — lowbit-Q v2 GGUF metadata reader.
 *
 * Reads and parses the "lowbit-q.tensor_alloc" JSON metadata from a loaded
 * llama_model. This metadata is the authoritative record of which
 * quantization type was assigned to each tensor during conversion.
 *
 * Metadata keys (v2):
 *   lowbit-q.version      (uint32)  — format version, must be 2
 *   lowbit-q.source_model (string)  — source model name
 *   lowbit-q.size_budget  (float32) — target size ratio (0.0–1.0)
 *   lowbit-q.tensor_alloc (string)  — JSON array of TensorAllocRecord
 *
 * tensor_alloc JSON format (TypeScript TensorAllocRecord):
 *   [
 *     {
 *       "name": "blk.0.attn_q.weight",
 *       "quantType": "svid_1bit",   // or "q4_0", "q8_0", "passthrough"
 *       "family": "attn-q",
 *       "layerIndex": 0,
 *       "rotationApplied": false,
 *       "originalBytes": 131072,
 *       "quantizedBytes": 8704
 *     },
 *     ...
 *   ]
 *
 * Usage:
 *   int n = lowbit_q_read_tensor_alloc(model, records, MAX_RECORDS);
 *   for (int i = 0; i < n; i++) {
 *       if (records[i].quant_type == LOWBIT_Q_QUANT_TYPE_SVID_1BIT) {
 *           // This tensor uses the custom SVID kernel
 *       }
 *   }
 */

#ifndef LOWBIT_Q_METADATA_H
#define LOWBIT_Q_METADATA_H

#include "llama.h"

#ifdef __cplusplus
extern "C" {
#endif

/* --------------------------------------------------------------------------
 * Quantization type codes (match TypeScript LowbitQQuantType enum)
 * -------------------------------------------------------------------------- */

/** Tensor kept unchanged (embeddings, norms, protected layers) */
#define LOWBIT_Q_QUANT_PASSTHROUGH   0
/** RTN 4-bit ggml Q4_0 native format */
#define LOWBIT_Q_QUANT_Q4_0          1
/** RTN 8-bit ggml Q8_0 native format */
#define LOWBIT_Q_QUANT_Q8_0          2
/** OneBit SVID 1-bit decomposition into (a, b, sign) triplet */
#define LOWBIT_Q_QUANT_SVID_1BIT     3
/** K-quant 3-bit native format (ggml Q3_K, 256 elements/block) — uses native ggml path */
#define LOWBIT_Q_QUANT_Q3_K          4
/** K-quant 2-bit native format (ggml Q2_K, 256 elements/block) — uses native ggml path */
#define LOWBIT_Q_QUANT_Q2_K          5
/** Not found in metadata */
#define LOWBIT_Q_QUANT_UNKNOWN      -1

/* --------------------------------------------------------------------------
 * Structs
 * -------------------------------------------------------------------------- */

/**
 * A single tensor allocation record from lowbit-q.tensor_alloc metadata.
 * Corresponds to one entry in the TypeScript TensorAllocRecord array.
 */
struct lowbit_q_alloc_record {
    char name[256];  /**< Full tensor name, e.g. "blk.0.attn_q.weight" */
    int  quant_type; /**< One of LOWBIT_Q_QUANT_* */
};

/* --------------------------------------------------------------------------
 * Functions
 * -------------------------------------------------------------------------- */

/**
 * Read and parse the lowbit-q.tensor_alloc JSON metadata from a model.
 *
 * Allocates a temporary 256 KB buffer internally for JSON parsing.
 * Thread-safety: safe for single-threaded use; no global state is modified.
 *
 * @param model       The loaded llama model (read-only)
 * @param records     Output array allocated by caller
 * @param max_records Maximum number of records to fill
 * @return Number of records written (>= 0), or -1 if metadata is absent/invalid
 */
int lowbit_q_read_tensor_alloc(
    const struct llama_model * model,
    struct lowbit_q_alloc_record * records,
    int max_records);

/**
 * Get the quantization type for a specific tensor (by full name) from metadata.
 *
 * This function caches the parsed alloc records on first call per model.
 * The cache is a static table with capacity LOWBIT_Q_ALLOC_CACHE_SIZE.
 * Not thread-safe; safe for WASM single-thread context.
 *
 * @param model       The loaded llama model
 * @param tensor_name Full tensor name, e.g. "blk.0.attn_q.weight"
 * @return LOWBIT_Q_QUANT_* constant, or LOWBIT_Q_QUANT_UNKNOWN if not found
 */
int lowbit_q_get_quant_type(
    const struct llama_model * model,
    const char * tensor_name);

/**
 * Check if a layer prefix has SVID_1BIT quantization per metadata.
 *
 * Checks "prefix.weight" in the tensor_alloc metadata for SVID_1BIT.
 * Falls back to tensor existence check (looks for prefix.lowbit_q_sign)
 * if metadata is unavailable.
 *
 * @param model  The loaded llama model
 * @param prefix Layer prefix, e.g. "blk.0.attn_q"
 * @return 1 if SVID_1BIT, 0 otherwise
 */
int lowbit_q_is_svid_layer(
    const struct llama_model * model,
    const char * prefix);

/**
 * Print a summary of lowbit-Q metadata to stderr.
 * Uses wllama's "@@INFO[lowbit-q] " prefix format.
 * No-op if the model has no lowbit-Q metadata.
 *
 * @param model   The loaded llama model
 * @param n_layer Number of transformer layers (used for allocation summary)
 */
void lowbit_q_log_model_info(
    const struct llama_model * model,
    int n_layer);

#ifdef __cplusplus
}
#endif

#endif /* LOWBIT_Q_METADATA_H */
