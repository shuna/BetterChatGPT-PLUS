import Foundation
import os

/// Guards against destructive or oversized cloud sync uploads.
/// Mirrors Web version's guards.ts with iOS-specific limits.
nonisolated enum CloudSyncGuards {

    /// Maximum JSON size before compression (2MB).
    static let maxJsonBytes = 2_000_000

    /// Maximum compressed payload size (1MB).
    /// Derived from CloudKit CKRecord BYTES field limit.
    static let maxCompressedBytes = 1_000_000

    private static let logger = Logger(
        subsystem: "org.sstcr.WeaveletCanvas",
        category: "CloudSyncGuards"
    )

    /// Check if a snapshot is safe to upload.
    /// Returns a human-readable reason if the upload should be skipped, or nil if safe.
    static func check(
        metrics: CloudSyncMetrics,
        snapshot: SyncSnapshot,
        lastSuccessfulMetrics: CloudSyncMetrics?
    ) -> String? {
        // 1. Compressed size exceeds CloudKit BYTES limit
        if metrics.compressedBytes > maxCompressedBytes {
            return "Cloud sync skipped: compressed snapshot too large (\(metrics.compressedBytes) bytes > \(maxCompressedBytes) limit)."
        }

        // 2. JSON size too large
        if metrics.jsonBytes > maxJsonBytes {
            return "Cloud sync skipped: snapshot JSON too large (\(metrics.jsonBytes) bytes > \(maxJsonBytes) limit)."
        }

        // 3. Empty chats — would erase all data
        if metrics.chatCount == 0 {
            return "Cloud sync skipped: snapshot contains no chats."
        }

        // 4. Empty contentStore with branchTree data — corruption indicator
        if metrics.contentEntryCount == 0 {
            let hasBranchTree = snapshot.chats.contains { $0.branchTree != nil }
            if hasBranchTree {
                return "Cloud sync skipped: content store is empty but chats have branch data."
            }
        }

        // 5. Size ratio guard — log only in v1, do not block
        if let last = lastSuccessfulMetrics,
           last.compressedBytes > 0,
           metrics.compressedBytes < last.compressedBytes / 5 {
            logger.warning(
                "Cloud sync size shrank significantly: \(metrics.compressedBytes) bytes vs last \(last.compressedBytes) bytes"
            )
            // v1: log only, do not block
        }

        return nil
    }

    /// Compute metrics for a SyncSnapshot and its compressed WVLT container.
    static func computeMetrics(
        jsonData: Data,
        compressedData: Data,
        snapshot: SyncSnapshot
    ) -> CloudSyncMetrics {
        CloudSyncMetrics(
            jsonBytes: jsonData.count,
            compressedBytes: compressedData.count,
            chatCount: snapshot.chats.count,
            contentEntryCount: snapshot.contentStore.count
        )
    }
}
