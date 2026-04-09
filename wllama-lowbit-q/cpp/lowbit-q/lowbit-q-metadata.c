/**
 * lowbit-q-metadata.c — lowbit-Q v2 GGUF metadata reader.
 *
 * Parses the "lowbit-q.tensor_alloc" JSON string stored in GGUF metadata.
 * Uses a simple hand-rolled JSON parser — no external dependencies.
 *
 * JSON format (subset parsed):
 *   [{"name":"blk.0.attn_q.weight","quantType":"svid_1bit",...}, ...]
 *
 * Only "name" and "quantType" fields are extracted; other fields are ignored.
 */

#include "lowbit-q-metadata.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Maximum JSON buffer for tensor_alloc string (256 KB).
 * A 28-layer model with 7 projections = 196 entries, ~100 bytes/entry = ~20 KB.
 * 256 KB comfortably handles models with up to ~2000 tensor entries. */
#define ALLOC_JSON_MAX (256 * 1024)

/* Cache size: up to 4096 alloc records (sufficient for 500+ layer models) */
#define LOWBIT_Q_ALLOC_CACHE_SIZE 4096

/* --------------------------------------------------------------------------
 * Simple JSON parser helpers
 * -------------------------------------------------------------------------- */

/**
 * Skip whitespace characters.
 */
static const char * skip_ws(const char * p)
{
    while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r') p++;
    return p;
}

/**
 * Read a JSON string value from position p (must point past the opening '"').
 * Writes at most buf_size - 1 characters to buf (null-terminated).
 * Returns pointer after the closing '"', or NULL on parse error.
 * Does NOT handle JSON escape sequences (sufficient for tensor names).
 */
static const char * read_json_string(const char * p, char * buf, size_t buf_size)
{
    size_t i = 0;
    while (*p && *p != '"') {
        if (*p == '\\') {
            p++; /* skip escape character */
            if (!*p) return NULL;
        }
        if (i + 1 < buf_size) buf[i++] = *p;
        p++;
    }
    if (*p != '"') return NULL;
    buf[i] = '\0';
    return p + 1; /* skip closing '"' */
}

/**
 * Find the value for a JSON key within the range [obj_start, obj_end).
 * Returns a pointer to the value (past '":'), or NULL if not found.
 */
static const char * find_json_key(
    const char * obj_start,
    const char * obj_end,
    const char * key)
{
    size_t key_len = strlen(key);
    const char * p = obj_start;

    while (p < obj_end) {
        /* Find '"key"' */
        const char * q = p;
        while (q < obj_end && *q != '"') q++;
        if (q >= obj_end) break;
        q++; /* skip '"' */

        /* Compare key */
        if ((size_t)(obj_end - q) >= key_len &&
            strncmp(q, key, key_len) == 0 &&
            q[key_len] == '"')
        {
            q += key_len + 1; /* skip key + '"' */
            q = skip_ws(q);
            if (q < obj_end && *q == ':') {
                q++;
                q = skip_ws(q);
                return q; /* points at value */
            }
        }
        p = q + 1;
    }
    return NULL;
}

/**
 * Map quantType string → LOWBIT_Q_QUANT_* constant.
 */
static int parse_quant_type(const char * s)
{
    if (strncmp(s, "svid_1bit",   9) == 0) return LOWBIT_Q_QUANT_SVID_1BIT;
    if (strncmp(s, "q4_0",       4) == 0) return LOWBIT_Q_QUANT_Q4_0;
    if (strncmp(s, "q8_0",       4) == 0) return LOWBIT_Q_QUANT_Q8_0;
    if (strncmp(s, "passthrough",11) == 0) return LOWBIT_Q_QUANT_PASSTHROUGH;
    return LOWBIT_Q_QUANT_UNKNOWN;
}

/**
 * Parse the tensor_alloc JSON array into records.
 * Returns number of records written.
 */
static int parse_alloc_json(
    const char * json,
    struct lowbit_q_alloc_record * records,
    int max_records)
{
    int count = 0;
    const char * p = json;

    while (count < max_records) {
        /* Find next object '{' */
        while (*p && *p != '{') p++;
        if (!*p) break;
        const char * obj_start = p + 1;

        /* Find matching '}' (naïve: assumes no nested objects) */
        const char * obj_end = obj_start;
        while (*obj_end && *obj_end != '}') obj_end++;
        if (!*obj_end) break;

        /* Parse "name" field */
        char name[256] = {0};
        {
            const char * val = find_json_key(obj_start, obj_end, "name");
            if (val && *val == '"') {
                read_json_string(val + 1, name, sizeof(name));
            }
        }

        /* Parse "quantType" field */
        int quant_type = LOWBIT_Q_QUANT_UNKNOWN;
        {
            const char * val = find_json_key(obj_start, obj_end, "quantType");
            if (val && *val == '"') {
                char qt_str[32] = {0};
                read_json_string(val + 1, qt_str, sizeof(qt_str));
                quant_type = parse_quant_type(qt_str);
            }
        }

        /* Only record entries with both fields parsed */
        if (name[0] != '\0' && quant_type != LOWBIT_Q_QUANT_UNKNOWN) {
            strncpy(records[count].name, name, sizeof(records[count].name) - 1);
            records[count].name[sizeof(records[count].name) - 1] = '\0';
            records[count].quant_type = quant_type;
            count++;
        }

        p = obj_end + 1;
    }

    return count;
}

/* --------------------------------------------------------------------------
 * Public API
 * -------------------------------------------------------------------------- */

int lowbit_q_read_tensor_alloc(
    const struct llama_model * model,
    struct lowbit_q_alloc_record * records,
    int max_records)
{
    if (!model || !records || max_records <= 0) return -1;

    char * json = (char *)malloc(ALLOC_JSON_MAX);
    if (!json) return -1;

    int32_t res = llama_model_meta_val_str(
        model, "lowbit-q.tensor_alloc", json, ALLOC_JSON_MAX);

    if (res < 0) {
        free(json);
        return -1; /* metadata key not present */
    }

    int count = parse_alloc_json(json, records, max_records);
    free(json);
    return count;
}

/* Static cache for lowbit_q_get_quant_type().
 *
 * SINGLE-MODEL ASSUMPTION (Phase 1a limitation):
 * This cache is keyed solely on the last llama_model * seen. It works
 * correctly for the wllama prototype, which loads exactly one model at a
 * time. In a runtime that keeps multiple models alive concurrently (e.g. a
 * future multi-model session), interleaved calls from different models will
 * cause the cache to bounce between models unpredictably, producing incorrect
 * quant-type lookups and silent inference errors.
 *
 * If multi-model support is ever needed:
 *   - Replace the single cache with a hash-map keyed on model pointer, OR
 *   - Call lowbit_q_read_tensor_alloc() directly per call (acceptable if
 *     llama_model_meta_val_str() is cheap after the first call).
 *
 * See STATUS.md — "Known limitations" for tracking. */
static struct lowbit_q_alloc_record s_cache[LOWBIT_Q_ALLOC_CACHE_SIZE];
static int s_cache_count  = -1; /* -1 = not loaded */
static const struct llama_model * s_cached_model = NULL;

int lowbit_q_get_quant_type(
    const struct llama_model * model,
    const char * tensor_name)
{
    if (!model || !tensor_name) return LOWBIT_Q_QUANT_UNKNOWN;

    /* Reload cache if model changed */
    if (s_cached_model != model) {
        s_cache_count  = lowbit_q_read_tensor_alloc(model, s_cache, LOWBIT_Q_ALLOC_CACHE_SIZE);
        s_cached_model = model;
    }

    if (s_cache_count < 0) return LOWBIT_Q_QUANT_UNKNOWN;

    for (int i = 0; i < s_cache_count; i++) {
        if (strcmp(s_cache[i].name, tensor_name) == 0) {
            return s_cache[i].quant_type;
        }
    }

    return LOWBIT_Q_QUANT_UNKNOWN;
}

int lowbit_q_is_svid_layer(
    const struct llama_model * model,
    const char * prefix)
{
    if (!model || !prefix) return 0;

    /* Authoritative check: query tensor_alloc metadata */
    char weight_name[280];
    snprintf(weight_name, sizeof(weight_name), "%s.weight", prefix);
    int qt = lowbit_q_get_quant_type(model, weight_name);
    if (qt == LOWBIT_Q_QUANT_SVID_1BIT) return 1;
    if (qt != LOWBIT_Q_QUANT_UNKNOWN)   return 0; /* Q4_0 / passthrough */

    /* Fallback: metadata absent — cannot check tensor existence without
     * llama_get_model_tensor() (not available as public API in this fork).
     * In the struct-field approach, SVID dispatch is handled via
     * model.layers[il].lowbit_q_wq_a etc., so this fallback is not needed
     * during normal operation. Return 0 (unknown). */
    return 0;
}

void lowbit_q_log_model_info(
    const struct llama_model * model,
    int n_layer)
{
    if (!model) return;

    /* Check if this is a lowbit-Q model */
    char version_buf[16] = {0};
    if (llama_model_meta_val_str(model, "lowbit-q.version",
                                 version_buf, sizeof(version_buf)) < 0) {
        return; /* Not lowbit-Q */
    }

    char source_buf[256]  = "(unknown)";
    char budget_buf[32]   = "(unknown)";
    char nmse_mean_buf[32]= "(unknown)";
    char nmse_max_buf[32] = "(unknown)";

    llama_model_meta_val_str(model, "lowbit-q.source_model",    source_buf,    sizeof(source_buf));
    llama_model_meta_val_str(model, "lowbit-q.size_budget",     budget_buf,    sizeof(budget_buf));
    llama_model_meta_val_str(model, "lowbit-q.quality.nmse_mean", nmse_mean_buf, sizeof(nmse_mean_buf));
    llama_model_meta_val_str(model, "lowbit-q.quality.nmse_max",  nmse_max_buf,  sizeof(nmse_max_buf));

    fprintf(stderr, "@@INFO[lowbit-q] ===== lowbit-Q v%s model =====\n",
            version_buf);
    fprintf(stderr, "@@INFO[lowbit-q] source: %s\n",    source_buf);
    fprintf(stderr, "@@INFO[lowbit-q] size budget: %s\n", budget_buf);
    fprintf(stderr, "@@INFO[lowbit-q] quality NMSE mean=%s max=%s\n",
            nmse_mean_buf, nmse_max_buf);

    if (n_layer <= 0) return;

    /* Count allocations from metadata */
    int n_svid = 0, n_q4 = 0, n_pass = 0, n_unknown = 0;

    /* Ensure cache is loaded */
    lowbit_q_get_quant_type(model, "__probe__"); /* populates cache */

    if (s_cache_count > 0) {
        for (int i = 0; i < s_cache_count; i++) {
            switch (s_cache[i].quant_type) {
                case LOWBIT_Q_QUANT_SVID_1BIT:   n_svid++;    break;
                case LOWBIT_Q_QUANT_Q4_0:
                case LOWBIT_Q_QUANT_Q8_0:        n_q4++;      break;
                case LOWBIT_Q_QUANT_PASSTHROUGH: n_pass++;    break;
                default:                          n_unknown++; break;
            }
        }
        fprintf(stderr,
            "@@INFO[lowbit-q] tensor alloc: %d SVID_1BIT, %d Q4_0/Q8_0, "
            "%d passthrough, %d other (total %d)\n",
            n_svid, n_q4, n_pass, n_unknown, s_cache_count);
    } else {
        fprintf(stderr,
            "@@WARN[lowbit-q] tensor_alloc metadata not available "
            "(falling back to tensor-name lookup)\n");
    }
}
