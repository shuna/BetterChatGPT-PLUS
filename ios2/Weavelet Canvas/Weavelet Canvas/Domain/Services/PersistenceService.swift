import Foundation
import os

// MARK: - AppState (persisted)

struct AppState: Codable {
    var chats: [Chat]
    var contentStore: ContentStoreData
    var folders: FolderCollection
    var currentChatID: String?
    var version: Int

    static let currentVersion = 1

    init(
        chats: [Chat] = [],
        contentStore: ContentStoreData = [:],
        folders: FolderCollection = [:],
        currentChatID: String? = nil
    ) {
        self.chats = chats
        self.contentStore = contentStore
        self.folders = folders
        self.currentChatID = currentChatID
        self.version = Self.currentVersion
    }
}

// MARK: - PersistenceService (actor)

/// Actor-based persistence with debounced saves, atomic writes, and flush.
/// - Debounce: 500ms after last save call before actual I/O
/// - Atomic: writes to .tmp then renames
/// - Flush: forced write on background transition
actor PersistenceService {

    private let baseURL: URL
    private let stateFileURL: URL
    private var pendingSave: Task<Void, Never>?
    private let debounceInterval: Duration = .milliseconds(500)
    private let logger = Logger(subsystem: "org.sstcr.WeaveletCanvas", category: "Persistence")

    /// Called after a successful save. Used by CloudSyncService to schedule uploads.
    var onSaveComplete: (@Sendable (AppState) -> Void)?

    init() {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        self.baseURL = appSupport.appendingPathComponent("WeaveletCanvas", isDirectory: true)
        self.stateFileURL = baseURL.appendingPathComponent("state.json")
    }

    // MARK: - Save (debounced)

    /// Schedule a debounced save. The actual write happens after the debounce interval.
    func save(_ state: AppState) {
        pendingSave?.cancel()
        pendingSave = Task {
            try? await Task.sleep(for: debounceInterval)
            guard !Task.isCancelled else { return }
            await performSave(state)
        }
    }

    // MARK: - Flush (immediate)

    /// Force an immediate write. Called on background transition.
    func flush(_ state: AppState) async {
        pendingSave?.cancel()
        pendingSave = nil
        await performSave(state)
    }

    // MARK: - Load

    /// Load state from disk. Returns nil if no saved state exists.
    func load() -> AppState? {
        guard FileManager.default.fileExists(atPath: stateFileURL.path) else {
            logger.info("No saved state found")
            return nil
        }

        do {
            let data = try Data(contentsOf: stateFileURL)
            let decoder = JSONDecoder()
            let state = try decoder.decode(AppState.self, from: data)
            logger.info("Loaded state: \(state.chats.count) chats, \(state.contentStore.count) content entries")
            return state
        } catch {
            logger.error("Failed to load state: \(error.localizedDescription)")
            // Try to preserve corrupted file for debugging
            let backupURL = baseURL.appendingPathComponent("state.json.corrupt.\(Int(Date().timeIntervalSince1970))")
            try? FileManager.default.copyItem(at: stateFileURL, to: backupURL)
            return nil
        }
    }

    // MARK: - Private

    private func performSave(_ state: AppState) async {
        do {
            // Ensure directory exists
            try FileManager.default.createDirectory(at: baseURL, withIntermediateDirectories: true)

            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            let data = try encoder.encode(state)

            // Atomic write: write to .tmp, then rename
            let tmpURL = stateFileURL.appendingPathExtension("tmp")
            try data.write(to: tmpURL, options: .atomic)

            // On iOS, .atomic already does tmp+rename, but we make it explicit
            if FileManager.default.fileExists(atPath: stateFileURL.path) {
                try FileManager.default.removeItem(at: stateFileURL)
            }
            try FileManager.default.moveItem(at: tmpURL, to: stateFileURL)

            logger.debug("Saved state: \(data.count) bytes")
            onSaveComplete?(state)
        } catch {
            logger.error("Failed to save state: \(error.localizedDescription)")
        }
    }
}
