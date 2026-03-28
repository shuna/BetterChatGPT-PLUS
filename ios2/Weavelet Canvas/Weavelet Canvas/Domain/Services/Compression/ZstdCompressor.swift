import Foundation
import CZstd

enum ZstdError: Error, LocalizedError {
    case compressFailed(code: Int)
    case decompressFailed(code: Int)
    case outputSizeMismatch(expected: Int, actual: Int)

    var errorDescription: String? {
        switch self {
        case .compressFailed(let code):
            "zstd compress failed (code \(code))"
        case .decompressFailed(let code):
            "zstd decompress failed (code \(code))"
        case .outputSizeMismatch(let expected, let actual):
            "zstd decompress size mismatch: expected \(expected), got \(actual)"
        }
    }
}

nonisolated enum ZstdCompressor {

    /// Compress data using zstd.
    /// - Parameters:
    ///   - data: Raw bytes to compress.
    ///   - level: Compression level (1-22, default 3).
    /// - Returns: Compressed bytes.
    static func compress(_ data: Data, level: Int32 = 3) throws -> Data {
        guard !data.isEmpty else { return Data() }

        let bound = ZSTD_compressBound(data.count)
        var output = Data(count: bound)

        let compressedSize = output.withUnsafeMutableBytes { outBuf in
            data.withUnsafeBytes { inBuf in
                ZSTD_compress(
                    outBuf.baseAddress,
                    bound,
                    inBuf.baseAddress,
                    data.count,
                    level
                )
            }
        }

        if ZSTD_isError(compressedSize) != 0 {
            throw ZstdError.compressFailed(code: Int(compressedSize))
        }

        output.count = compressedSize
        return output
    }

    /// Decompress data using zstd with a known uncompressed size.
    /// - Parameters:
    ///   - data: Compressed bytes.
    ///   - uncompressedSize: Expected size of the decompressed output (from container header).
    /// - Returns: Decompressed bytes.
    static func decompress(_ data: Data, uncompressedSize: Int) throws -> Data {
        guard !data.isEmpty else { return Data() }

        var output = Data(count: uncompressedSize)

        let decompressedSize = output.withUnsafeMutableBytes { outBuf in
            data.withUnsafeBytes { inBuf in
                ZSTD_decompress(
                    outBuf.baseAddress,
                    uncompressedSize,
                    inBuf.baseAddress,
                    data.count
                )
            }
        }

        if ZSTD_isError(decompressedSize) != 0 {
            throw ZstdError.decompressFailed(code: Int(decompressedSize))
        }

        if decompressedSize != uncompressedSize {
            throw ZstdError.outputSizeMismatch(expected: uncompressedSize, actual: decompressedSize)
        }

        return output
    }
}
