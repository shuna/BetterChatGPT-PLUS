import Foundation
import os

// MARK: - CloudSyncService

/// Orchestrates cloud sync: debounce, guards, format routing, pull/push.
/// Public state is `@Observable` for UI binding.
/// Internal I/O runs through `SyncEngine` actor for race-free operation.
@Observable
final class CloudSyncService {

    // MARK: - Public state (UI binding)

    private(set) var syncStatus: SyncStatus = .unauthenticated
    private(set) var lastSyncTimestamp: Date?
    var lastError: String?

    // MARK: - Internal

    private let engine = SyncEngine()
    private var debounceTask: Task<Void, Never>?
    private let logger = Logger(subsystem: "org.sstcr.WeaveletCanvas", category: "CloudSync")
    private static let debounceInterval: Duration = .seconds(5)

    /// Called after a successful upload or when a SyncSnapshot is created, with its `updatedAt` value.
    /// The app layer should use this to persist `lastLocalUpdatedAt` in SettingsViewModel.
    @ObservationIgnored
    var onTimestampUpdate: (@Sendable (Int64) -> Void)?

    /// The device identifier used in sync snapshots.
    private let deviceId: String = {
        let key = "cloudSyncDeviceId"
        if let existing = UserDefaults.standard.string(forKey: key) {
            return existing
        }
        let id = UUID().uuidString
        UserDefaults.standard.set(id, forKey: key)
        return id
    }()

    // MARK: - Provider management

    func setProvider(_ provider: any CloudSyncProvider) async {
        await engine.setProvider(provider)
        let authed = await provider.checkAuth()
        syncStatus = authed ? .synced : .unauthenticated
    }

    func disconnect() async {
        debounceTask?.cancel()
        debounceTask = nil
        if let provider = await engine.currentProvider() {
            await provider.disconnect()
        }
        await engine.setProvider(nil)
        syncStatus = .unauthenticated
        lastSyncTimestamp = nil
        lastError = nil
    }

    // MARK: - Upload (debounced)

    /// Schedule a cloud upload after the debounce interval.
    /// Called by PersistenceService's onSaveComplete callback.
    func scheduleUpload(_ state: AppState) {
        debounceTask?.cancel()
        let snapshot = SyncSnapshot(from: state, deviceId: deviceId)
        onTimestampUpdate?(snapshot.updatedAt)
        Task { await engine.setPendingSnapshot(snapshot) }
        debounceTask = Task { @MainActor in
            try? await Task.sleep(for: Self.debounceInterval)
            guard !Task.isCancelled else { return }
            await performUpload()
        }
    }

    /// Flush immediately (background transition).
    func flushPendingSync() async {
        debounceTask?.cancel()
        debounceTask = nil
        await performUpload()
    }

    // MARK: - Pull (startup)

    /// Pull remote state and apply if newer.
    /// Returns the applied AppState if remote was newer, nil otherwise.
    func pullRemoteState(localState: AppState, localUpdatedAt: Int64) async -> AppState? {
        guard await engine.currentProvider() != nil else { return nil }

        syncStatus = .syncing
        lastError = nil

        do {
            guard let remoteData = try await engine.pull() else {
                // No remote snapshot exists
                syncStatus = .synced
                return nil
            }

            let remoteSnapshot = try decodeRemoteData(remoteData)

            // Compare updatedAt — only adopt if remote is strictly newer
            guard remoteSnapshot.updatedAt > localUpdatedAt else {
                logger.info("Remote snapshot not newer (remote: \(remoteSnapshot.updatedAt), local: \(localUpdatedAt)). Keeping local.")
                syncStatus = .synced
                // Schedule upload to push local to remote
                let snapshot = SyncSnapshot(from: localState, deviceId: deviceId)
                await engine.setPendingSnapshot(snapshot)
                await performUpload()
                return nil
            }

            // Apply remote to local
            var updatedState = localState
            remoteSnapshot.applyTo(&updatedState)

            lastSyncTimestamp = Date()
            syncStatus = .synced
            logger.info("Applied remote snapshot (updatedAt: \(remoteSnapshot.updatedAt))")

            // Re-upload as WVLT to promote legacy format
            let freshSnapshot = SyncSnapshot(from: updatedState, deviceId: deviceId)
            await engine.setPendingSnapshot(freshSnapshot)
            await performUpload()

            return updatedState

        } catch {
            lastError = error.localizedDescription
            syncStatus = .synced
            logger.error("Pull failed: \(error.localizedDescription)")
            return nil
        }
    }

    // MARK: - Private

    private func decodeRemoteData(_ data: Data) throws -> SyncSnapshot {
        if SnapshotContainer.isWVLT(data) {
            return try SnapshotContainer.decode(data)
        } else {
            // iOS uses a separate recordName (weavelet-ios-snapshot) from Web (weavelet-default-snapshot),
            // so we should never encounter legacy lz-string format. If we do, it indicates data corruption
            // or misconfiguration rather than a legitimate migration scenario.
            logger.warning("Received non-WVLT data (\(data.count) bytes). iOS should only receive WVLT format.")
            throw CloudSyncError.unexpectedFormat
        }
    }

    private func performUpload() async {
        do {
            if let result = try await engine.flush() {
                lastSyncTimestamp = Date()
                lastError = nil
                syncStatus = .synced
                logger.debug("Upload complete (\(result.compressedBytes) bytes)")
            }
        } catch {
            lastError = error.localizedDescription
            syncStatus = .synced
            logger.error("Upload failed: \(error.localizedDescription)")
        }
    }
}

// MARK: - SyncEngine (actor)

/// Race-free I/O engine for cloud sync operations.
private actor SyncEngine {
    private var provider: (any CloudSyncProvider)?
    private var pendingSnapshot: SyncSnapshot?
    private var isUploading = false
    private var lastSuccessfulMetrics: CloudSyncMetrics?

    func setProvider(_ provider: (any CloudSyncProvider)?) {
        self.provider = provider
        if provider == nil {
            pendingSnapshot = nil
            lastSuccessfulMetrics = nil
        }
    }

    func currentProvider() -> (any CloudSyncProvider)? {
        provider
    }

    func setPendingSnapshot(_ snapshot: SyncSnapshot) {
        pendingSnapshot = snapshot
    }

    /// Encode, guard-check, and upload the pending snapshot.
    /// Returns metrics on success, nil if nothing to upload.
    func flush() async throws -> CloudSyncMetrics? {
        guard let provider, let snapshot = pendingSnapshot else { return nil }
        guard !isUploading else { return nil }

        pendingSnapshot = nil
        isUploading = true
        defer { isUploading = false }

        // Encode JSON (for metrics)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let jsonData = try encoder.encode(snapshot)

        // Encode WVLT container
        let containerData = try SnapshotContainer.encode(snapshot)

        // Compute metrics
        let metrics = CloudSyncGuards.computeMetrics(
            jsonData: jsonData,
            compressedData: containerData,
            snapshot: snapshot
        )

        // Guard check
        if let reason = CloudSyncGuards.check(
            metrics: metrics,
            snapshot: snapshot,
            lastSuccessfulMetrics: lastSuccessfulMetrics
        ) {
            throw CloudSyncError.guardRejected(reason)
        }

        // Upload
        try await provider.writeSnapshot(containerData)
        lastSuccessfulMetrics = metrics
        return metrics
    }

    /// Download raw bytes from remote.
    func pull() async throws -> Data? {
        guard let provider else { return nil }
        return try await provider.readSnapshot()
    }
}

// MARK: - Error

enum CloudSyncError: Error, LocalizedError {
    case guardRejected(String)
    case noProvider
    case unexpectedFormat

    var errorDescription: String? {
        switch self {
        case .guardRejected(let reason): reason
        case .noProvider: "No cloud sync provider configured"
        case .unexpectedFormat: "Received non-WVLT snapshot format (expected iOS WVLT container)"
        }
    }
}
