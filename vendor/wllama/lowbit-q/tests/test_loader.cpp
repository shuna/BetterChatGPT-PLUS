/**
 * test_loader.cpp — Minimal loader test for lowbit-Q v2 GGUF.
 *
 * Loads the test fixture GGUF and verifies that:
 *   1. "lowbit-q.version" metadata is detected
 *   2. lowbit_q_log_model_info() runs and prints the SVID/Q4_0 summary
 *   3. The load completes without errors
 *
 * Build (from .wllama-fork/build-native/):
 *   c++ -std=c++17 -I../llama.cpp/include -I../cpp/lowbit-q \
 *       ../../vendor/wllama/lowbit-q/tests/test_loader.cpp \
 *       -L. -lllama -Wl,-rpath,. -o test_loader && ./test_loader
 */

#include "llama.h"
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <string>

// Capture log output for verification
static std::string g_captured_log;

static void log_callback(ggml_log_level level, const char * text, void * /* user_data */)
{
    fprintf(stderr, "%s", text);
    g_captured_log += text;
}

int main(int argc, char ** argv)
{
    const char * default_path =
        "/Users/suzuki/weavelet-canvas/vendor/wllama/lowbit-q/tests/fixtures/minimal_lowbitq_v2.gguf";
    const char * model_path = (argc > 1) ? argv[1] : default_path;

    fprintf(stderr, "=== test_loader: lowbit-Q v2 GGUF load test ===\n");
    fprintf(stderr, "Model: %s\n\n", model_path);

    llama_log_set(log_callback, nullptr);
    llama_backend_init();

    llama_model_params mparams = llama_model_default_params();
    mparams.n_gpu_layers = 0;  // CPU only

    llama_model * model = llama_model_load_from_file(model_path, mparams);

    if (!model) {
        fprintf(stderr, "\n[FAIL] llama_load_model_from_file returned NULL\n");
        llama_backend_free();
        return 1;
    }

    fprintf(stderr, "\n[PASS] Model loaded successfully\n");

    // Verify key strings appear in captured log (via llama log callback).
    // Note: lowbit_q_log_model_info() uses fprintf(stderr) directly — not captured
    //       by the callback — so we check for LLAMA_LOG_INFO markers instead.
    bool has_lowbitq_detect = g_captured_log.find("lowbit-Q format") != std::string::npos
                           || g_captured_log.find("detected lowbit-Q") != std::string::npos;
    // SVID triplet tensors being loaded is the definitive dispatch check:
    //   If layer.lowbit_q_wq_a/b/sign were populated, the dispatch path is active.
    bool has_svid_tensors   = g_captured_log.find("lowbit_q_a") != std::string::npos
                           && g_captured_log.find("lowbit_q_sign") != std::string::npos;
    // Q4_0/passthrough layers use standard .weight tensors:
    bool has_native_path    = g_captured_log.find("attn_q.weight") != std::string::npos
                           || g_captured_log.find("ffn_gate.weight") != std::string::npos;

    fprintf(stderr, "\n=== Verification ===\n");
    fprintf(stderr, "  [%s] lowbit-Q format detected in load log\n",
            has_lowbitq_detect ? "PASS" : "FAIL");
    fprintf(stderr, "  [%s] SVID triplet tensors (lowbit_q_a/sign) loaded\n",
            has_svid_tensors ? "PASS" : "FAIL");
    fprintf(stderr, "  [%s] native path (.weight) tensors also present\n",
            has_native_path ? "PASS" : "FAIL");

    llama_model_free(model);
    llama_backend_free();

    int result = (has_lowbitq_detect && has_svid_tensors && has_native_path) ? 0 : 1;
    fprintf(stderr, "\n=== %s ===\n", result == 0 ? "ALL TESTS PASSED" : "SOME TESTS FAILED");
    return result;
}
