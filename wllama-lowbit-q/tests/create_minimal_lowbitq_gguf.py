#!/usr/bin/env python3
"""
create_minimal_lowbitq_gguf.py

Creates a minimal lowbit-Q v2 GGUF fixture with:
  - 2 transformer layers
  - Layer 0: attn_q/k/v/output all Q4_0 (native path)
  - Layer 1: attn_q SVID_1BIT, ffn_gate/up/down SVID_1BIT, others Q4_0

Used to verify that the lowbit-Q loader and dispatch code work correctly.
The GGUF is a metadata-only "skeleton" — tensors contain zero data — it
verifies the loader runs without crashing on the tensor names and metadata,
but cannot produce correct inference output.

Run:
    python3 wllama-lowbit-q/tests/create_minimal_lowbitq_gguf.py
Output:
    wllama-lowbit-q/tests/fixtures/minimal_lowbitq_v2.gguf
"""

import sys
import os
import json
import struct
import numpy as np

REPO_ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
GGUF_PY   = os.path.join(REPO_ROOT, '.wllama-fork', 'llama.cpp', 'gguf-py')
sys.path.insert(0, GGUF_PY)

from gguf import GGUFWriter, GGMLQuantizationType

# ---------------------------------------------------------------------------
# Model dimensions (tiny, just enough to be valid)
# ---------------------------------------------------------------------------
N_VOCAB   = 32000
N_EMBD    = 64
N_HEAD    = 4           # must divide N_EMBD
N_HEAD_KV = 4
N_FF      = 128
N_LAYER   = 2
HEAD_DIM  = N_EMBD // N_HEAD  # = 16
N_CTX     = 128

# ---------------------------------------------------------------------------
# Output path
# ---------------------------------------------------------------------------
FIXTURE_DIR = os.path.join(os.path.dirname(__file__), 'fixtures')
os.makedirs(FIXTURE_DIR, exist_ok=True)
OUTPUT_PATH = os.path.join(FIXTURE_DIR, 'minimal_lowbitq_v2.gguf')

# ---------------------------------------------------------------------------
# tensor_alloc JSON
# Layer 0: all Q4_0 (native path)
# Layer 1: attn_q, ffn_gate, ffn_up, ffn_down → SVID_1BIT; rest → Q4_0
# ---------------------------------------------------------------------------
PROJS = ['attn_q', 'attn_k', 'attn_v', 'attn_output', 'ffn_gate', 'ffn_up', 'ffn_down']

# Which proj/layer combinations get SVID_1BIT?
SVID_LAYERS: set = {
    (1, 'attn_q'),
    (1, 'ffn_gate'),
    (1, 'ffn_up'),
    (1, 'ffn_down'),
}

def make_tensor_alloc():
    records = []
    for il in range(N_LAYER):
        for proj in PROJS:
            key = (il, proj)
            qt = 'svid_1bit' if key in SVID_LAYERS else 'q4_0'
            records.append({
                'name': f'blk.{il}.{proj}.weight',
                'quantType': qt,
                'family': proj,
                'layerIndex': il,
                'rotationApplied': False,
                'originalBytes': N_EMBD * N_FF * 4,
                'quantizedBytes': N_EMBD * N_FF // 8 if qt == 'svid_1bit' else N_EMBD * N_FF // 2,
            })
    return json.dumps(records, separators=(',', ':'))

# ---------------------------------------------------------------------------
# Helpers to make minimal valid tensor data
# ---------------------------------------------------------------------------
def q4_0_bytes(rows: int, cols: int) -> bytes:
    """Create minimal Q4_0 tensor data (32-element blocks with 2B scale + 16B nibbles)."""
    n_elements = rows * cols
    # Q4_0 block: 32 elements, 2B float16 scale + 16B nibbles = 18B
    n_blocks = (n_elements + 31) // 32
    return b'\x00' * (n_blocks * 18)

def f32_bytes(n: int) -> bytes:
    """Create zero F32 data."""
    return b'\x00' * (n * 4)

def f16_bytes(n: int) -> bytes:
    """Create zero F16 data."""
    return b'\x00' * (n * 2)

def u8_bytes(n: int) -> bytes:
    """Create zero U8 data."""
    return b'\x00' * n

# ---------------------------------------------------------------------------
# Build GGUF
# ---------------------------------------------------------------------------
print(f"Creating minimal lowbit-Q v2 GGUF: {OUTPUT_PATH}")

writer = GGUFWriter(OUTPUT_PATH, 'llama')

# --- General metadata ---
writer.add_name('minimal-lowbitq-v2-test')
writer.add_description('Minimal lowbit-Q v2 GGUF for dispatch verification')
writer.add_file_type(GGMLQuantizationType.Q4_0)

# --- Llama hyperparameters ---
writer.add_context_length(N_CTX)
writer.add_embedding_length(N_EMBD)
writer.add_block_count(N_LAYER)
writer.add_feed_forward_length(N_FF)
writer.add_head_count(N_HEAD)
writer.add_head_count_kv(N_HEAD_KV)
writer.add_rope_dimension_count(HEAD_DIM)
writer.add_layer_norm_rms_eps(1e-5)

# --- Tokenizer (minimal) ---
# Required by llama.cpp loader
tokens = [f'tok{i}'.encode() for i in range(N_VOCAB)]
scores = [0.0] * N_VOCAB
token_types = [1] * N_VOCAB  # normal tokens

writer.add_tokenizer_model('llama')
writer.add_tokenizer_pre('default')
writer.add_token_list(tokens)
writer.add_token_scores(scores)
writer.add_token_types(token_types)
writer.add_bos_token_id(1)
writer.add_eos_token_id(2)
writer.add_unk_token_id(0)
writer.add_pad_token_id(0)

# --- lowbit-Q v2 metadata ---
writer.add_uint32('lowbit-q.version', 2)
writer.add_string('lowbit-q.source_model', 'minimal-test-fixture')
writer.add_string('lowbit-q.size_budget', '0.60')
writer.add_string('lowbit-q.quality.nmse_mean', '0.0')
writer.add_string('lowbit-q.quality.nmse_max', '0.0')
writer.add_string('lowbit-q.tensor_alloc', make_tensor_alloc())

print(f"  tensor_alloc JSON: {len(make_tensor_alloc())} bytes")
print(f"  SVID_1BIT layers: {sorted(SVID_LAYERS)}")
print(f"  Q4_0 layers: {[(il, p) for il in range(N_LAYER) for p in PROJS if (il, p) not in SVID_LAYERS]}")

# --- Token embedding + output ---
embd_data = f32_bytes(N_VOCAB * N_EMBD)
writer.add_tensor('token_embd.weight', np.zeros((N_VOCAB, N_EMBD), dtype=np.float32))
writer.add_tensor('output_norm.weight', np.zeros(N_EMBD, dtype=np.float32))
writer.add_tensor('output.weight', np.zeros((N_VOCAB, N_EMBD), dtype=np.float32))

# --- Per-layer tensors ---
for il in range(N_LAYER):
    prefix = f'blk.{il}'

    # Norm weights (always F32)
    writer.add_tensor(f'{prefix}.attn_norm.weight', np.zeros(N_EMBD, dtype=np.float32))
    writer.add_tensor(f'{prefix}.ffn_norm.weight',  np.zeros(N_EMBD, dtype=np.float32))

    # Attention projections
    # ggml shape convention: {ggml_d0, ggml_d1} where ggml_d0 = n_in (input features).
    # gguf-py stores numpy shape in REVERSED order:
    #   np.zeros((ggml_d1, ggml_d0)) → GGUF dimensions [ggml_d0, ggml_d1]
    for proj, (ggml_d0, ggml_d1) in [
        ('attn_q',      (N_EMBD, N_HEAD * HEAD_DIM)),
        ('attn_k',      (N_EMBD, N_HEAD_KV * HEAD_DIM)),
        ('attn_v',      (N_EMBD, N_HEAD_KV * HEAD_DIM)),
        ('attn_output', (N_HEAD * HEAD_DIM, N_EMBD)),
    ]:
        n_total = ggml_d0 * ggml_d1
        if (il, proj) in SVID_LAYERS:
            # SVID_1BIT: write a (ggml_d1), b (ggml_d0), sign — NO .weight
            n_sign = (n_total + 7) // 8
            writer.add_tensor(f'{prefix}.{proj}.lowbit_q_a',    np.zeros(ggml_d1, dtype=np.float16))
            writer.add_tensor(f'{prefix}.{proj}.lowbit_q_b',    np.zeros(ggml_d0, dtype=np.float16))
            writer.add_tensor(f'{prefix}.{proj}.lowbit_q_sign', np.zeros(n_sign,   dtype=np.int8))
        else:
            # F16 weight: reversed numpy shape → correct ggml shape in GGUF
            writer.add_tensor(f'{prefix}.{proj}.weight', np.zeros((ggml_d1, ggml_d0), dtype=np.float16))

    # FFN projections
    # ggml shapes: ffn_gate/up: {n_embd, n_ff}, ffn_down: {n_ff, n_embd}
    for proj, (ggml_d0, ggml_d1) in [
        ('ffn_gate', (N_EMBD, N_FF)),
        ('ffn_up',   (N_EMBD, N_FF)),
        ('ffn_down', (N_FF,   N_EMBD)),
    ]:
        n_total = ggml_d0 * ggml_d1
        if (il, proj) in SVID_LAYERS:
            n_sign = (n_total + 7) // 8
            writer.add_tensor(f'{prefix}.{proj}.lowbit_q_a',    np.zeros(ggml_d1, dtype=np.float16))
            writer.add_tensor(f'{prefix}.{proj}.lowbit_q_b',    np.zeros(ggml_d0, dtype=np.float16))
            writer.add_tensor(f'{prefix}.{proj}.lowbit_q_sign', np.zeros(n_sign,   dtype=np.int8))
        else:
            writer.add_tensor(f'{prefix}.{proj}.weight', np.zeros((ggml_d1, ggml_d0), dtype=np.float16))

# --- Write ---
writer.write_header_to_file()
writer.write_kv_data_to_file()
writer.write_tensors_to_file()
writer.close()

size_kb = os.path.getsize(OUTPUT_PATH) / 1024
print(f"\nOutput: {OUTPUT_PATH}")
print(f"Size:   {size_kb:.1f} KB")
print(f"\nExpected log output when loaded:")
print(f"  @@INFO[lowbit-q] ===== lowbit-Q v2 model =====")
print(f"  @@INFO[lowbit-q] source: minimal-test-fixture")
print(f"  @@INFO[lowbit-q] tensor alloc: 4 SVID_1BIT, 10 Q4_0/Q8_0, 0 passthrough, 0 other (total 14)")
print(f"\nDispatch at inference:")
print(f"  blk.0.* → all Q4_0 → native build_lora_mm / build_ffn")
print(f"  blk.1.attn_q → SVID_1BIT → lowbit_q_build_mul_mat (wq_a/b/sign non-null)")
print(f"  blk.1.ffn_gate/up/down → SVID_1BIT → lowbit_q_build_mul_mat (ffn_gate_a/b/sign non-null)")
