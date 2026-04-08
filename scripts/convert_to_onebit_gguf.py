#!/usr/bin/env python3
"""
Reference converter: standard GGUF → onebit GGUF.

Reads a standard GGUF file (F32, F16, Q8_0), decomposes weight tensors
into the OneBit representation (a, b, sign), and writes a new GGUF file
with onebit tensor triplets.

Usage:
    python scripts/convert_to_onebit_gguf.py input.gguf output.gguf [--verify]

This script serves as a reference implementation for validating the
browser-side TypeScript converter and for generating test fixtures.

Requirements:
    pip install numpy
"""

import argparse
import struct
import sys
from pathlib import Path
from typing import Any, Union

import numpy as np

# ---------------------------------------------------------------------------
# GGUF constants
# ---------------------------------------------------------------------------

GGUF_MAGIC = 0x46554747  # "GGUF" little-endian
GGUF_VERSION = 3
ALIGNMENT = 32

# Metadata value types
GGUF_TYPE_UINT8 = 0
GGUF_TYPE_INT8 = 1
GGUF_TYPE_UINT16 = 2
GGUF_TYPE_INT16 = 3
GGUF_TYPE_UINT32 = 4
GGUF_TYPE_INT32 = 5
GGUF_TYPE_FLOAT32 = 6
GGUF_TYPE_BOOL = 7
GGUF_TYPE_STRING = 8
GGUF_TYPE_ARRAY = 9
GGUF_TYPE_UINT64 = 10
GGUF_TYPE_INT64 = 11
GGUF_TYPE_FLOAT64 = 12

# Tensor types
GGML_TYPE_F32 = 0
GGML_TYPE_F16 = 1
GGML_TYPE_Q8_0 = 8
GGML_TYPE_I8 = 24


# ---------------------------------------------------------------------------
# GGUF reader
# ---------------------------------------------------------------------------

class GGUFReader:
    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0

    def read_uint8(self) -> int:
        v = struct.unpack_from("<B", self.data, self.pos)[0]
        self.pos += 1
        return v

    def read_int8(self) -> int:
        v = struct.unpack_from("<b", self.data, self.pos)[0]
        self.pos += 1
        return v

    def read_uint16(self) -> int:
        v = struct.unpack_from("<H", self.data, self.pos)[0]
        self.pos += 2
        return v

    def read_int16(self) -> int:
        v = struct.unpack_from("<h", self.data, self.pos)[0]
        self.pos += 2
        return v

    def read_uint32(self) -> int:
        v = struct.unpack_from("<I", self.data, self.pos)[0]
        self.pos += 4
        return v

    def read_int32(self) -> int:
        v = struct.unpack_from("<i", self.data, self.pos)[0]
        self.pos += 4
        return v

    def read_uint64(self) -> int:
        v = struct.unpack_from("<Q", self.data, self.pos)[0]
        self.pos += 8
        return v

    def read_int64(self) -> int:
        v = struct.unpack_from("<q", self.data, self.pos)[0]
        self.pos += 8
        return v

    def read_float32(self) -> float:
        v = struct.unpack_from("<f", self.data, self.pos)[0]
        self.pos += 4
        return v

    def read_float64(self) -> float:
        v = struct.unpack_from("<d", self.data, self.pos)[0]
        self.pos += 8
        return v

    def read_bool(self) -> bool:
        return self.read_uint8() != 0

    def read_string(self) -> str:
        length = self.read_uint64()
        s = self.data[self.pos:self.pos + length].decode("utf-8")
        self.pos += length
        return s

    def read_bytes(self, n: int) -> bytes:
        b = self.data[self.pos:self.pos + n]
        self.pos += n
        return b

    def read_metadata_value(self, vtype: int) -> Any:
        readers = {
            GGUF_TYPE_UINT8: self.read_uint8,
            GGUF_TYPE_INT8: self.read_int8,
            GGUF_TYPE_UINT16: self.read_uint16,
            GGUF_TYPE_INT16: self.read_int16,
            GGUF_TYPE_UINT32: self.read_uint32,
            GGUF_TYPE_INT32: self.read_int32,
            GGUF_TYPE_FLOAT32: self.read_float32,
            GGUF_TYPE_BOOL: self.read_bool,
            GGUF_TYPE_STRING: self.read_string,
            GGUF_TYPE_UINT64: self.read_uint64,
            GGUF_TYPE_INT64: self.read_int64,
            GGUF_TYPE_FLOAT64: self.read_float64,
        }
        if vtype == GGUF_TYPE_ARRAY:
            elem_type = self.read_uint32()
            count = self.read_uint64()
            return (elem_type, [self.read_metadata_value(elem_type) for _ in range(count)])
        return readers[vtype]()


def parse_gguf(data: bytes) -> dict:
    reader = GGUFReader(data)

    magic = reader.read_uint32()
    assert magic == GGUF_MAGIC, f"Invalid GGUF magic: 0x{magic:08x}"

    version = reader.read_uint32()
    assert version in (2, 3), f"Unsupported GGUF version: {version}"

    tensor_count = reader.read_uint64()
    metadata_count = reader.read_uint64()

    metadata = {}
    for _ in range(metadata_count):
        key = reader.read_string()
        vtype = reader.read_uint32()
        value = reader.read_metadata_value(vtype)
        metadata[key] = (vtype, value)

    tensors = []
    for _ in range(tensor_count):
        name = reader.read_string()
        n_dims = reader.read_uint32()
        dims = [reader.read_uint64() for _ in range(n_dims)]
        ttype = reader.read_uint32()
        offset = reader.read_uint64()
        tensors.append({
            "name": name,
            "n_dims": n_dims,
            "dims": dims,
            "type": ttype,
            "offset": offset,
        })

    # Compute data offset (aligned)
    alignment = metadata.get("general.alignment", (GGUF_TYPE_UINT32, ALIGNMENT))[1]
    data_offset = (reader.pos + alignment - 1) // alignment * alignment

    return {
        "version": version,
        "metadata": metadata,
        "tensors": tensors,
        "data_offset": data_offset,
    }


# ---------------------------------------------------------------------------
# Dequantization
# ---------------------------------------------------------------------------

def dequant_f32(data: bytes, total_elements: int) -> np.ndarray:
    return np.frombuffer(data[:total_elements * 4], dtype=np.float32).copy()


def dequant_f16(data: bytes, total_elements: int) -> np.ndarray:
    return np.frombuffer(data[:total_elements * 2], dtype=np.float16).astype(np.float32)


def dequant_q8_0(data: bytes, total_elements: int) -> np.ndarray:
    n_blocks = (total_elements + 31) // 32
    result = np.zeros(total_elements, dtype=np.float32)

    for block in range(n_blocks):
        offset = block * 34
        delta_fp16 = np.frombuffer(data[offset:offset + 2], dtype=np.float16)[0]
        delta = float(delta_fp16)

        elems = min(32, total_elements - block * 32)
        qs = np.frombuffer(data[offset + 2:offset + 2 + elems], dtype=np.int8)
        result[block * 32:block * 32 + elems] = delta * qs.astype(np.float32)

    return result


def dequantize(data: bytes, ttype: int, total_elements: int) -> np.ndarray:
    if ttype == GGML_TYPE_F32:
        return dequant_f32(data, total_elements)
    elif ttype == GGML_TYPE_F16:
        return dequant_f16(data, total_elements)
    elif ttype == GGML_TYPE_Q8_0:
        return dequant_q8_0(data, total_elements)
    else:
        raise ValueError(f"Unsupported dequantization type: {ttype}")


def compute_tensor_data_size(ttype: int, total_elements: int) -> int:
    if ttype == GGML_TYPE_F32:
        return total_elements * 4
    elif ttype == GGML_TYPE_F16:
        return total_elements * 2
    elif ttype == GGML_TYPE_Q8_0:
        n_blocks = (total_elements + 31) // 32
        return n_blocks * 34
    else:
        raise ValueError(f"Unknown type size for type: {ttype}")


# ---------------------------------------------------------------------------
# OneBit decomposition
# ---------------------------------------------------------------------------

def decompose_onebit(
    weights: np.ndarray, out_features: int, in_features: int
):
    """
    SVID decomposition: W ≈ diag(a) × Sign(W) × diag(b)

    Faithful implementation of OneCompression's SVID algorithm:
      1. Compute |W|
      2. Rank-1 SVD of |W|: |W| ≈ σ₁ · u₁ · v₁ᵀ
      3. a = |u₁| · √σ₁, b = |v₁| · √σ₁
      4. Gauge normalization to balance ‖a‖ and ‖b‖

    Reference: FujitsuResearch/OneCompression onecomp/quantizer/onebit/onebit_impl.py

    Returns (a, b, sign_packed) where:
      a: per-row scaling (out_features,) float32
      b: per-column scaling (in_features,) float32
      sign_packed: MSB-first bitpacked signs (ceil(out*in/8),) uint8
    """
    W = weights.reshape(out_features, in_features)
    abs_W = np.abs(W)

    # Rank-1 SVD of |W|
    U, S, Vh = np.linalg.svd(abs_W, full_matrices=False)
    sigma_max = S[0]
    u_max = np.abs(U[:, 0])   # first left singular vector (absolute)
    v_max = np.abs(Vh[0, :])  # first right singular vector (absolute)

    # Scale by √σ₁
    sqrt_sigma = np.sqrt(max(sigma_max, 0.0))
    a = u_max * sqrt_sigma
    b = v_max * sqrt_sigma

    # Gauge normalization: balance ‖a‖ and ‖b‖
    a_norm = np.linalg.norm(a)
    b_norm = np.linalg.norm(b)
    if a_norm > 1e-12 and b_norm > 1e-12:
        balance = np.sqrt(b_norm / a_norm)
        a = a * balance
        b = b / balance

    # Pack sign bits (MSB first), zeros → +1 (matching OneCompression)
    total_bits = out_features * in_features
    sign_bytes = (total_bits + 7) // 8
    sign_packed = np.zeros(sign_bytes, dtype=np.uint8)

    flat_w = W.flatten()
    for idx in range(total_bits):
        if flat_w[idx] >= 0:
            byte_idx = idx // 8
            bit_pos = 7 - (idx % 8)
            sign_packed[byte_idx] |= (1 << bit_pos)

    return a.astype(np.float32), b.astype(np.float32), sign_packed


def reconstruct_onebit(
    a: np.ndarray, b: np.ndarray, sign_packed: np.ndarray,
    out_features: int, in_features: int
) -> np.ndarray:
    """Reconstruct W from onebit decomposition."""
    W = np.zeros((out_features, in_features), dtype=np.float32)
    for i in range(out_features):
        for j in range(in_features):
            bit_idx = i * in_features + j
            byte_idx = bit_idx // 8
            bit_pos = 7 - (bit_idx % 8)
            sign = 1.0 if (sign_packed[byte_idx] >> bit_pos) & 1 else -1.0
            W[i, j] = a[i] * sign * b[j]
    return W


# ---------------------------------------------------------------------------
# Weight tensor detection
# ---------------------------------------------------------------------------

def is_weight_tensor(name: str) -> bool:
    if not name.endswith(".weight"):
        return False
    if name == "token_embd.weight":
        return False
    if name == "output.weight":
        return False
    if "_norm.weight" in name:
        return False
    if "layernorm" in name:
        return False
    if "ln_" in name:
        return False
    return True


# ---------------------------------------------------------------------------
# GGUF writer
# ---------------------------------------------------------------------------

class GGUFWriter:
    def __init__(self):
        self.buf = bytearray()

    def write_uint8(self, v: int):
        self.buf += struct.pack("<B", v)

    def write_uint16(self, v: int):
        self.buf += struct.pack("<H", v)

    def write_uint32(self, v: int):
        self.buf += struct.pack("<I", v)

    def write_int32(self, v: int):
        self.buf += struct.pack("<i", v)

    def write_uint64(self, v: int):
        self.buf += struct.pack("<Q", v)

    def write_float32(self, v: float):
        self.buf += struct.pack("<f", v)

    def write_float64(self, v: float):
        self.buf += struct.pack("<d", v)

    def write_string(self, s: str):
        encoded = s.encode("utf-8")
        self.write_uint64(len(encoded))
        self.buf += encoded

    def write_bool(self, v: bool):
        self.write_uint8(1 if v else 0)

    def write_bytes(self, data: Union[bytes, bytearray, np.ndarray]):
        if isinstance(data, np.ndarray):
            self.buf += data.tobytes()
        else:
            self.buf += data

    def write_padding(self, alignment: int):
        remainder = len(self.buf) % alignment
        if remainder:
            self.buf += b"\x00" * (alignment - remainder)

    def write_metadata_value(self, vtype: int, value: Any):
        writers = {
            GGUF_TYPE_UINT8: self.write_uint8,
            GGUF_TYPE_INT8: lambda v: self.write_uint8(v & 0xFF),
            GGUF_TYPE_UINT16: self.write_uint16,
            GGUF_TYPE_INT16: lambda v: self.write_uint16(v & 0xFFFF),
            GGUF_TYPE_UINT32: self.write_uint32,
            GGUF_TYPE_INT32: self.write_int32,
            GGUF_TYPE_FLOAT32: self.write_float32,
            GGUF_TYPE_BOOL: self.write_bool,
            GGUF_TYPE_STRING: self.write_string,
            GGUF_TYPE_UINT64: self.write_uint64,
            GGUF_TYPE_INT64: lambda v: self.write_uint64(v),
            GGUF_TYPE_FLOAT64: self.write_float64,
        }
        if vtype == GGUF_TYPE_ARRAY:
            elem_type, arr = value
            self.write_uint32(elem_type)
            self.write_uint64(len(arr))
            for item in arr:
                self.write_metadata_value(elem_type, item)
        else:
            writers[vtype](value)

    def write_metadata_entry(self, key: str, vtype: int, value: Any):
        self.write_string(key)
        self.write_uint32(vtype)
        self.write_metadata_value(vtype, value)


# ---------------------------------------------------------------------------
# Main conversion
# ---------------------------------------------------------------------------

def convert(input_path: str, output_path: str, verify: bool = False):
    print(f"Reading {input_path}...")
    data = Path(input_path).read_bytes()
    header = parse_gguf(data)

    print(f"  GGUF v{header['version']}, {len(header['tensors'])} tensors")

    # Classify tensors
    output_tensors = []  # (name, type, dims, data_bytes)
    onebit_layer_indices = set()
    stats = {"converted": 0, "passthrough": 0}

    for tensor in header["tensors"]:
        name = tensor["name"]
        dims = tensor["dims"]
        ttype = tensor["type"]
        total_elements = 1
        for d in dims:
            total_elements *= d

        data_size = compute_tensor_data_size(ttype, total_elements)
        abs_offset = header["data_offset"] + tensor["offset"]
        raw_data = data[abs_offset:abs_offset + data_size]

        if is_weight_tensor(name):
            # Decompose to onebit
            print(f"  Converting: {name} ({total_elements} elements, type={ttype})")
            fp32 = dequantize(raw_data, ttype, total_elements)

            in_features = dims[0]
            out_features = dims[1] if len(dims) >= 2 else 1

            a, b, sign_packed = decompose_onebit(fp32, out_features, in_features)

            if verify:
                W_recon = reconstruct_onebit(a, b, sign_packed, out_features, in_features)
                W_orig = fp32.reshape(out_features, in_features)
                mse = np.mean((W_orig - W_recon) ** 2)
                var = np.var(W_orig)
                nmse = mse / var if var > 0 else float("inf")
                print(f"    NMSE: {nmse:.4f}")

            base_name = name.rsplit(".weight", 1)[0]

            # a tensor: fp16
            a_fp16 = a.astype(np.float16)
            output_tensors.append((
                base_name + ".onebit_a",
                GGML_TYPE_F16,
                [out_features],
                a_fp16.tobytes(),
            ))

            # b tensor: fp16
            b_fp16 = b.astype(np.float16)
            output_tensors.append((
                base_name + ".onebit_b",
                GGML_TYPE_F16,
                [in_features],
                b_fp16.tobytes(),
            ))

            # sign tensor: uint8 packed
            output_tensors.append((
                base_name + ".onebit_sign",
                GGML_TYPE_I8,
                [len(sign_packed)],
                sign_packed.tobytes(),
            ))

            # Extract layer index
            import re
            m = re.search(r"layers\.(\d+)\.", name)
            if m:
                onebit_layer_indices.add(int(m.group(1)))

            stats["converted"] += 1
        else:
            # Passthrough
            print(f"  Passthrough: {name}")
            output_tensors.append((name, ttype, dims, raw_data))
            stats["passthrough"] += 1

    # Build metadata
    metadata = dict(header["metadata"])
    metadata["onebit.version"] = (GGUF_TYPE_UINT32, 1)
    metadata["onebit.sign_packing"] = (GGUF_TYPE_STRING, "msb_first")
    sorted_layers = sorted(onebit_layer_indices)
    metadata["onebit.layers"] = (GGUF_TYPE_ARRAY, (GGUF_TYPE_UINT32, sorted_layers))

    # Compute tensor data offsets
    data_offsets = []
    pos = 0
    for _, _, _, tdata in output_tensors:
        data_offsets.append(pos)
        pos += len(tdata)
        rem = pos % ALIGNMENT
        if rem:
            pos += ALIGNMENT - rem

    # Write GGUF
    writer = GGUFWriter()

    # Header
    writer.write_uint32(GGUF_MAGIC)
    writer.write_uint32(GGUF_VERSION)
    writer.write_uint64(len(output_tensors))
    writer.write_uint64(len(metadata))

    # Metadata
    for key, (vtype, value) in metadata.items():
        writer.write_metadata_entry(key, vtype, value)

    # Tensor info
    for i, (name, ttype, dims, _) in enumerate(output_tensors):
        writer.write_string(name)
        writer.write_uint32(len(dims))
        for d in dims:
            writer.write_uint64(d)
        writer.write_uint32(ttype)
        writer.write_uint64(data_offsets[i])

    # Pad header
    writer.write_padding(ALIGNMENT)

    # Tensor data
    for _, _, _, tdata in output_tensors:
        writer.write_bytes(tdata)
        writer.write_padding(ALIGNMENT)

    output_data = bytes(writer.buf)
    Path(output_path).write_bytes(output_data)

    print(f"\nDone!")
    print(f"  Input:  {len(data):,} bytes")
    print(f"  Output: {len(output_data):,} bytes ({len(output_data)/len(data)*100:.1f}%)")
    print(f"  Converted: {stats['converted']} weight tensors")
    print(f"  Passthrough: {stats['passthrough']} non-weight tensors")
    print(f"  Onebit layers: {sorted_layers}")


def main():
    parser = argparse.ArgumentParser(
        description="Convert standard GGUF to onebit GGUF format",
    )
    parser.add_argument("input", help="Input GGUF file path")
    parser.add_argument("output", help="Output onebit GGUF file path")
    parser.add_argument("--verify", action="store_true",
                        help="Compute and print NMSE for each converted tensor")
    args = parser.parse_args()

    convert(args.input, args.output, verify=args.verify)


if __name__ == "__main__":
    main()
