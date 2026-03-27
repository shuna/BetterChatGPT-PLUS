import Foundation

// MARK: - Provider Type

enum CloudSyncProviderType: String, CaseIterable, Identifiable, Codable {
    case icloud
    case googleDrive

    var id: String { rawValue }

    var label: String {
        switch self {
        case .icloud: "iCloud"
        case .googleDrive: "Google Drive"
        }
    }
}

// MARK: - Sync Status

enum SyncStatus: String {
    case unauthenticated
    case syncing
    case synced
}

// MARK: - Sync Metrics

struct CloudSyncMetrics {
    let jsonBytes: Int
    let compressedBytes: Int
    let chatCount: Int
    let contentEntryCount: Int
}

// MARK: - Sync Snapshot

/// Cloud sync payload. Contains only data that should be synced across devices.
/// Excludes: API keys, tokens, proxy settings, UI preferences, debug flags,
/// stream recovery records, sync metadata, and token counters.
struct SyncSnapshot: Codable {
    var chats: [Chat]
    var contentStore: ContentStoreData
    var folders: FolderCollection
    var currentChatID: String?
    var snapshotVersion: Int
    var updatedAt: Int64       // Unix ms — comparison key for conflict resolution
    var deviceId: String

    /// Memberwise init (used by tests and LegacySnapshotDecoder).
    init(chats: [Chat], contentStore: ContentStoreData, folders: FolderCollection,
         currentChatID: String?, snapshotVersion: Int, updatedAt: Int64, deviceId: String) {
        self.chats = chats
        self.contentStore = contentStore
        self.folders = folders
        self.currentChatID = currentChatID
        self.snapshotVersion = snapshotVersion
        self.updatedAt = updatedAt
        self.deviceId = deviceId
    }

    /// Create from current AppState.
    init(from state: AppState, deviceId: String) {
        self.chats = state.chats
        self.contentStore = state.contentStore
        self.folders = state.folders
        self.currentChatID = state.currentChatID
        self.snapshotVersion = state.version
        self.updatedAt = Int64(Date().timeIntervalSince1970 * 1000)
        self.deviceId = deviceId
    }

    /// Apply synced data to a local AppState.
    /// Only overwrites: chats, contentStore, folders, currentChatID.
    /// If currentChatID points to a non-existent chat, sets it to nil.
    func applyTo(_ state: inout AppState) {
        state.chats = chats
        state.contentStore = contentStore
        state.folders = folders

        if let chatID = currentChatID, chats.contains(where: { $0.id == chatID }) {
            state.currentChatID = chatID
        } else {
            state.currentChatID = nil
        }
    }
}

// MARK: - Provider Protocol

protocol CloudSyncProvider: Sendable {
    var providerType: CloudSyncProviderType { get }
    func checkAuth() async -> Bool
    func authenticate() async throws
    func disconnect() async
    /// Read raw WVLT container bytes from remote. Returns nil if no snapshot exists.
    func readSnapshot() async throws -> Data?
    /// Write raw WVLT container bytes to remote.
    func writeSnapshot(_ data: Data) async throws
    func deleteSnapshot() async throws
}
