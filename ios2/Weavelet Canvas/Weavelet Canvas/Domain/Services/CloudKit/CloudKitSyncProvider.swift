import CloudKit
import Foundation
import os

/// CloudKit-based cloud sync provider using native CKContainer API.
///
/// Record design:
/// - recordType: `WeaveletSnapshot`
/// - recordName: `weavelet-ios-snapshot` (separate from Web's `weavelet-default-snapshot`)
/// - fields: payload (BYTES), snapshotVersion (INT64), updatedAt (INT64), deviceId (STRING)
actor CloudKitSyncProvider: CloudSyncProvider {

    nonisolated let providerType: CloudSyncProviderType = .icloud

    private let container: CKContainer
    private var database: CKDatabase { container.privateCloudDatabase }
    private let recordID: CKRecord.ID
    private let logger = Logger(subsystem: "org.sstcr.WeaveletCanvas", category: "CloudKit")

    static let recordType = "WeaveletSnapshot"
    static let recordName = "weavelet-ios-snapshot"

    // Cached recordChangeTag for optimistic locking
    private var cachedRecordChangeTag: String? {
        didSet { persistRecordChangeTag() }
    }

    init(containerIdentifier: String = "iCloud.com.sstcr.WeaveletCanvas") {
        self.container = CKContainer(identifier: containerIdentifier)
        self.recordID = CKRecord.ID(recordName: Self.recordName)
        self.cachedRecordChangeTag = UserDefaults.standard.string(forKey: "cloudkit.recordChangeTag")
    }

    // MARK: - CloudSyncProvider

    nonisolated func checkAuth() async -> Bool {
        do {
            let status = try await CKContainer(identifier: "iCloud.com.sstcr.WeaveletCanvas").accountStatus()
            return status == .available
        } catch {
            return false
        }
    }

    func authenticate() async throws {
        let status = try await container.accountStatus()
        guard status == .available else {
            throw CloudKitSyncError.accountNotAvailable(status)
        }
    }

    func disconnect() async {
        cachedRecordChangeTag = nil
        UserDefaults.standard.removeObject(forKey: "cloudkit.recordChangeTag")
    }

    func readSnapshot() async throws -> Data? {
        do {
            let record = try await database.record(for: recordID)
            cachedRecordChangeTag = record.recordChangeTag
            return record["payload"] as? Data
        } catch let error as CKError where error.code == .unknownItem {
            // Record doesn't exist yet
            cachedRecordChangeTag = nil
            return nil
        }
    }

    func writeSnapshot(_ data: Data) async throws {
        let updatedAt = Int64(Date().timeIntervalSince1970 * 1000)
        let deviceId = UserDefaults.standard.string(forKey: "cloudSyncDeviceId") ?? "unknown"

        do {
            // Try to fetch existing record first
            let record: CKRecord
            do {
                record = try await database.record(for: recordID)
                cachedRecordChangeTag = record.recordChangeTag
            } catch let error as CKError where error.code == .unknownItem {
                // Create new record
                let newRecord = CKRecord(recordType: Self.recordType, recordID: recordID)
                try setRecordFields(newRecord, payload: data, updatedAt: updatedAt, deviceId: deviceId)
                let saved = try await database.save(newRecord)
                cachedRecordChangeTag = saved.recordChangeTag
                return
            }

            // Update existing
            try setRecordFields(record, payload: data, updatedAt: updatedAt, deviceId: deviceId)
            let saved = try await database.save(record)
            cachedRecordChangeTag = saved.recordChangeTag

        } catch let error as CKError where error.code == .serverRecordChanged {
            try await resolveConflict(error: error, payload: data, updatedAt: updatedAt, deviceId: deviceId)
        }
    }

    func deleteSnapshot() async throws {
        do {
            try await database.deleteRecord(withID: recordID)
            cachedRecordChangeTag = nil
        } catch let error as CKError where error.code == .unknownItem {
            cachedRecordChangeTag = nil
            // Already deleted — not an error
        }
    }

    // MARK: - Conflict Resolution

    private func resolveConflict(
        error: CKError,
        payload: Data,
        updatedAt: Int64,
        deviceId: String
    ) async throws {
        // Get server record from error
        guard let serverRecord = error.serverRecord else {
            throw error
        }

        let serverUpdatedAt = serverRecord["updatedAt"] as? Int64 ?? 0

        if updatedAt >= serverUpdatedAt {
            // Local wins — overwrite server record and retry
            logger.info("Conflict: local wins (local: \(updatedAt), server: \(serverUpdatedAt))")
            try setRecordFields(serverRecord, payload: payload, updatedAt: updatedAt, deviceId: deviceId)
            let saved = try await database.save(serverRecord)
            cachedRecordChangeTag = saved.recordChangeTag
        } else {
            // Server wins — accept server version
            logger.info("Conflict: server wins (local: \(updatedAt), server: \(serverUpdatedAt))")
            cachedRecordChangeTag = serverRecord.recordChangeTag
            // The caller (CloudSyncService) will re-pull and apply the server state
            throw CloudKitSyncError.serverRecordNewer
        }
    }

    // MARK: - Helpers

    private func setRecordFields(
        _ record: CKRecord,
        payload: Data,
        updatedAt: Int64,
        deviceId: String
    ) throws {
        record["payload"] = payload as NSData
        record["snapshotVersion"] = NSNumber(value: SnapshotContainer.currentVersion)
        record["updatedAt"] = NSNumber(value: updatedAt)
        record["deviceId"] = deviceId as NSString
    }

    private func persistRecordChangeTag() {
        if let tag = cachedRecordChangeTag {
            UserDefaults.standard.set(tag, forKey: "cloudkit.recordChangeTag")
        } else {
            UserDefaults.standard.removeObject(forKey: "cloudkit.recordChangeTag")
        }
    }
}

// MARK: - Errors

enum CloudKitSyncError: Error, LocalizedError {
    case accountNotAvailable(CKAccountStatus)
    case serverRecordNewer

    var errorDescription: String? {
        switch self {
        case .accountNotAvailable(let status):
            "iCloud account not available (status: \(status.rawValue))"
        case .serverRecordNewer:
            "Server record is newer than local"
        }
    }
}
