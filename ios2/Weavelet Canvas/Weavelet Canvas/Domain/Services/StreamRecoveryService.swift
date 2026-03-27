import Foundation
import os

/// Actor-based service for persisting stream records to disk.
/// Enables recovery of partial assistant responses after app crashes or background termination.
actor StreamRecoveryService {

    private let fileURL: URL
    private var records: [String: StreamRecord] = [:]
    /// Tracks the last accepted sequence number per record to reject out-of-order writes.
    private var lastSequence: [String: UInt64] = [:]
    private var pendingWrite: Task<Void, Never>?
    private let debounceInterval: Duration = .milliseconds(800)
    private let logger = Logger(subsystem: "org.sstcr.WeaveletCanvas", category: "StreamRecovery")
    private var loaded = false

    init() {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = appSupport.appendingPathComponent("WeaveletCanvas", isDirectory: true)
        self.fileURL = dir.appendingPathComponent("stream_records.json")
    }

    /// Test-only initializer with explicit file path.
    init(fileURL: URL) {
        self.fileURL = fileURL
    }

    // MARK: - Public API

    /// Save a new stream record.
    func save(_ record: StreamRecord) {
        ensureLoaded()
        records[record.id] = record
        schedulePersist()
    }

    /// Replace the buffered text with the full accumulated value (not append).
    /// `seq` is a monotonically increasing sequence number; out-of-order calls are ignored.
    func replaceBufferedText(id: String, text: String, seq: UInt64 = 0, proxyEventId: Int? = nil) {
        ensureLoaded()
        guard records[id] != nil else { return }
        // Reject out-of-order writes: only apply if seq >= lastSeq
        if seq > 0 {
            let lastSeq = lastSequence[id] ?? 0
            guard seq >= lastSeq else { return }
            lastSequence[id] = seq
        }
        records[id]!.bufferedText = text
        records[id]!.updatedAt = Date()
        // Monotonic update for proxy event ID: only advance forward
        if let newId = proxyEventId {
            let existing = records[id]!.lastProxyEventId ?? 0
            records[id]!.lastProxyEventId = max(existing, newId)
        }
        schedulePersist()
    }

    /// Update the status of a stream record.
    func updateStatus(id: String, _ status: StreamStatus) {
        ensureLoaded()
        guard records[id] != nil else { return }
        records[id]!.status = status
        records[id]!.updatedAt = Date()
        schedulePersist()
    }

    /// Return all pending records (streaming, interrupted, and failed).
    func allPending() -> [StreamRecord] {
        ensureLoaded()
        return records.values.filter { $0.status != .completed }
    }

    /// Mark `.streaming` records as `.interrupted` if their `updatedAt` exceeds `threshold` seconds ago.
    func markStaleAsInterrupted(threshold: TimeInterval = 30) {
        ensureLoaded()
        let cutoff = Date().addingTimeInterval(-threshold)
        for (id, record) in records where record.status == .streaming && record.updatedAt < cutoff {
            records[id]!.status = .interrupted
        }
        schedulePersist()
    }

    /// Delete a single record by ID.
    func delete(id: String) {
        ensureLoaded()
        records.removeValue(forKey: id)
        schedulePersist()
    }

    /// Delete all completed records.
    func deleteCompleted() {
        ensureLoaded()
        records = records.filter { $0.value.status != .completed }
        schedulePersist()
    }

    /// Force-write any pending debounced data to disk immediately.
    func flush() async {
        pendingWrite?.cancel()
        pendingWrite = nil
        await performWrite()
    }

    // MARK: - Private

    private func ensureLoaded() {
        guard !loaded else { return }
        loaded = true
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        do {
            let data = try Data(contentsOf: fileURL)
            let decoded = try JSONDecoder().decode([StreamRecord].self, from: data)
            for record in decoded {
                records[record.id] = record
            }
            logger.info("Loaded \(decoded.count) stream records")
        } catch {
            logger.error("Failed to load stream records: \(error.localizedDescription)")
        }
    }

    private func schedulePersist() {
        pendingWrite?.cancel()
        pendingWrite = Task {
            try? await Task.sleep(for: debounceInterval)
            guard !Task.isCancelled else { return }
            await performWrite()
        }
    }

    private func performWrite() async {
        do {
            let dir = fileURL.deletingLastPathComponent()
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            let data = try encoder.encode(Array(records.values))
            try data.write(to: fileURL, options: .atomic)
            logger.debug("Wrote \(self.records.count) stream records (\(data.count) bytes)")
        } catch {
            logger.error("Failed to write stream records: \(error.localizedDescription)")
        }
    }
}
