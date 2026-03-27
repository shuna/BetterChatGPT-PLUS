import Foundation

// MARK: - Codec

enum SnapshotCodec: UInt8 {
    case zstd = 0x01
    case zlib = 0x02  // reserved
    case lz4  = 0x03  // reserved
}

// MARK: - Errors

enum SnapshotContainerError: Error, LocalizedError {
    case dataTooShort
    case invalidMagic
    case unknownVersion(UInt16)
    case unknownCodec(UInt8)
    case compressedLenMismatch(expected: UInt32, actual: Int)
    case uncompressedLenMismatch(expected: UInt32, actual: Int)
    case decodeFailed(underlying: Error)

    var errorDescription: String? {
        switch self {
        case .dataTooShort:
            "WVLT container too short (< 20 bytes)"
        case .invalidMagic:
            "Not a WVLT container (invalid magic)"
        case .unknownVersion(let v):
            "Unknown WVLT format version: \(v)"
        case .unknownCodec(let c):
            "Unknown WVLT codec: 0x\(String(c, radix: 16))"
        case .compressedLenMismatch(let expected, let actual):
            "WVLT compressed length mismatch: header says \(expected), payload is \(actual)"
        case .uncompressedLenMismatch(let expected, let actual):
            "WVLT uncompressed length mismatch: header says \(expected), decompressed is \(actual)"
        case .decodeFailed(let e):
            "WVLT JSON decode failed: \(e.localizedDescription)"
        }
    }
}

// MARK: - Container

enum SnapshotContainer {

    // Header layout (20 bytes)
    // [0..3]   magic           "WVLT" (0x57564C54)
    // [4..5]   formatVersion   uint16LE
    // [6]      codec           uint8
    // [7]      level           uint8
    // [8..11]  uncompressedLen uint32LE
    // [12..15] compressedLen   uint32LE
    // [16..19] reserved        uint32LE (0)
    // [20...]  payload         (compressedLen bytes)

    static let headerSize = 20
    static let magic: UInt32 = 0x57564C54  // "WVLT" in little-endian
    static let currentVersion: UInt16 = 1

    /// Check if data starts with the WVLT magic.
    static func isWVLT(_ data: Data) -> Bool {
        guard data.count >= 4 else { return false }
        return data.withUnsafeBytes { buf in
            buf.loadUnaligned(fromByteOffset: 0, as: UInt32.self) == magic.littleEndian
        }
    }

    /// Encode a SyncSnapshot into a WVLT v1 container.
    static func encode(
        _ snapshot: SyncSnapshot,
        codec: SnapshotCodec = .zstd,
        level: UInt8 = 3
    ) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let json = try encoder.encode(snapshot)

        let compressed: Data
        switch codec {
        case .zstd:
            compressed = try ZstdCompressor.compress(json, level: Int32(level))
        default:
            throw SnapshotContainerError.unknownCodec(codec.rawValue)
        }

        var container = Data(capacity: headerSize + compressed.count)

        // magic
        var m = magic.littleEndian
        container.append(Data(bytes: &m, count: 4))
        // formatVersion
        var v = currentVersion.littleEndian
        container.append(Data(bytes: &v, count: 2))
        // codec
        var c = codec.rawValue
        container.append(Data(bytes: &c, count: 1))
        // level
        var l = level
        container.append(Data(bytes: &l, count: 1))
        // uncompressedLen
        var ucLen = UInt32(json.count).littleEndian
        container.append(Data(bytes: &ucLen, count: 4))
        // compressedLen
        var cLen = UInt32(compressed.count).littleEndian
        container.append(Data(bytes: &cLen, count: 4))
        // reserved
        var reserved: UInt32 = 0
        container.append(Data(bytes: &reserved, count: 4))
        // payload
        container.append(compressed)

        return container
    }

    /// Decode a WVLT v1 container into a SyncSnapshot.
    /// Performs all header and length validations.
    static func decode(_ data: Data) throws -> SyncSnapshot {
        // 1. Minimum size
        guard data.count >= headerSize else {
            throw SnapshotContainerError.dataTooShort
        }

        try data.withUnsafeBytes { buf in
            // 2. Magic
            let m = buf.loadUnaligned(fromByteOffset: 0, as: UInt32.self)
            guard m == magic.littleEndian else {
                throw SnapshotContainerError.invalidMagic
            }

            // 3. Version
            let version = UInt16(littleEndian: buf.loadUnaligned(fromByteOffset: 4, as: UInt16.self))
            guard version == currentVersion else {
                throw SnapshotContainerError.unknownVersion(version)
            }

            // 4. Codec
            let codecRaw = buf.load(fromByteOffset: 6, as: UInt8.self)
            guard SnapshotCodec(rawValue: codecRaw) != nil else {
                throw SnapshotContainerError.unknownCodec(codecRaw)
            }
        }

        let (uncompressedLen, compressedLen, codecRaw) = data.withUnsafeBytes { buf -> (UInt32, UInt32, UInt8) in
            let ucLen = UInt32(littleEndian: buf.loadUnaligned(fromByteOffset: 8, as: UInt32.self))
            let cLen = UInt32(littleEndian: buf.loadUnaligned(fromByteOffset: 12, as: UInt32.self))
            let codec = buf.load(fromByteOffset: 6, as: UInt8.self)
            return (ucLen, cLen, codec)
        }

        // 5. Compressed length matches actual payload
        let actualPayloadLen = data.count - headerSize
        guard actualPayloadLen == Int(compressedLen) else {
            throw SnapshotContainerError.compressedLenMismatch(
                expected: compressedLen, actual: actualPayloadLen
            )
        }

        let payload = data[headerSize...]

        // 6. Decompress
        let json: Data
        switch SnapshotCodec(rawValue: codecRaw)! {
        case .zstd:
            json = try ZstdCompressor.decompress(
                Data(payload),
                uncompressedSize: Int(uncompressedLen)
            )
        default:
            throw SnapshotContainerError.unknownCodec(codecRaw)
        }

        // 7. Verify uncompressed length
        guard json.count == Int(uncompressedLen) else {
            throw SnapshotContainerError.uncompressedLenMismatch(
                expected: uncompressedLen, actual: json.count
            )
        }

        // 8. Decode JSON
        do {
            return try JSONDecoder().decode(SyncSnapshot.self, from: json)
        } catch {
            throw SnapshotContainerError.decodeFailed(underlying: error)
        }
    }
}
