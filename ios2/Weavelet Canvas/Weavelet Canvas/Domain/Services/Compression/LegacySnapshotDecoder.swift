import Foundation

/// Read-only decoder for the Web version's legacy lz-string format.
///
/// Responsibilities:
/// - Can **read** legacy lz-string compressed snapshots
/// - Does **not write** in legacy format (write always uses WVLT)
/// - On next save, the snapshot is automatically promoted to WVLT
///
/// This decoder exists solely for migration from the Web's old CloudKit format.
/// Once the Web version migrates to WVLT, this can be removed.
enum LegacySnapshotDecoder {

    enum LegacyError: Error, LocalizedError {
        case notBase64
        case decompressFailed
        case decodeFailed(underlying: Error)

        var errorDescription: String? {
            switch self {
            case .notBase64: "Legacy snapshot: invalid Base64"
            case .decompressFailed: "Legacy snapshot: lz-string decompression failed"
            case .decodeFailed(let e): "Legacy snapshot: JSON decode failed: \(e.localizedDescription)"
            }
        }
    }

    /// Attempt to decode a legacy lz-string snapshot.
    /// Format: Base64(lz-string(JSON))
    ///
    /// - Note: A full lz-string decompressor is required for production use.
    ///   This is a placeholder that documents the expected flow.
    ///   Actual implementation will need a Swift lz-string port or a JS bridge.
    static func decode(_ data: Data) throws -> SyncSnapshot {
        // Step 1: The raw data from CloudKit is Base64 encoded lz-string
        guard let base64String = String(data: data, encoding: .utf8),
              let compressedData = Data(base64Encoded: base64String) else {
            throw LegacyError.notBase64
        }

        // Step 2: lz-string decompress
        // TODO: Implement lz-string decompression (Uint16Array-based, matching Web's base64ToLzString)
        // For now, this path is not reachable in production since iOS has never written lz-string format.
        // It would only be needed if reading a Web-created CloudKit record, which uses a separate recordName.
        _ = compressedData
        throw LegacyError.decompressFailed
    }
}
