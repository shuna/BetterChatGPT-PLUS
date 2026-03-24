import Foundation
import WeaveletDomain

/// File-based persistence for chats and content store.
///
/// Storage layout (Web-compatible JSON):
/// ```
/// ~/Documents/weavelet/
///   meta.json              ← version, chatIds, generation
///   content-store.json     ← ContentStoreData
///   chats/
///     {id}.json.gz         ← PersistedChat (gzip compressed)
/// ```
public final class ChatRepository: @unchecked Sendable {

    private let baseDir: URL
    private let chatsDir: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    /// Current generation counter for crash-safe writes.
    private var generation: Int = 0

    public init(baseDir: URL? = nil) {
        let dir = baseDir ?? Self.defaultBaseDir()
        self.baseDir = dir
        self.chatsDir = dir.appendingPathComponent("chats", isDirectory: true)
        self.encoder = JSONEncoder()
        self.encoder.outputFormatting = [.sortedKeys]
        self.decoder = JSONDecoder()

        // Ensure directories exist
        try? FileManager.default.createDirectory(at: chatsDir, withIntermediateDirectories: true)
    }

    // MARK: - Meta

    struct MetaRecord: Codable {
        var version: Int
        var generation: Int
        var activeChatId: String?
        var chatIds: [String]?
    }

    public func loadMeta() -> (version: Int, chatIds: [String], activeChatId: String?)? {
        let url = baseDir.appendingPathComponent("meta.json")
        guard let data = try? Data(contentsOf: url),
              let meta = try? decoder.decode(MetaRecord.self, from: data) else {
            return nil
        }
        generation = meta.generation
        return (meta.version, meta.chatIds ?? [], meta.activeChatId)
    }

    public func saveMeta(chatIds: [String], activeChatId: String?) throws {
        generation += 1
        let meta = MetaRecord(
            version: 17,
            generation: generation,
            activeChatId: activeChatId,
            chatIds: chatIds
        )
        let data = try encoder.encode(meta)
        try data.write(to: baseDir.appendingPathComponent("meta.json"), options: .atomic)
    }

    // MARK: - Content Store

    public func loadContentStore() -> ContentStoreData {
        let url = baseDir.appendingPathComponent("content-store.json")
        guard let data = try? Data(contentsOf: url),
              let store = try? decoder.decode(ContentStoreData.self, from: data) else {
            return [:]
        }
        return store
    }

    public func saveContentStore(_ store: ContentStoreData) throws {
        let data = try encoder.encode(store)
        try data.write(to: baseDir.appendingPathComponent("content-store.json"), options: .atomic)
    }

    // MARK: - Chats

    public func loadChat(id: String) -> PersistedChat? {
        // Try gzip first, then plain JSON
        let gzUrl = chatsDir.appendingPathComponent("\(id).json.gz")
        let plainUrl = chatsDir.appendingPathComponent("\(id).json")

        if let compressed = try? Data(contentsOf: gzUrl),
           let decompressed = decompress(compressed),
           let chat = try? decoder.decode(PersistedChat.self, from: decompressed) {
            return chat
        }

        if let data = try? Data(contentsOf: plainUrl),
           let chat = try? decoder.decode(PersistedChat.self, from: data) {
            return chat
        }

        return nil
    }

    public func saveChat(_ chat: PersistedChat) throws {
        let data = try encoder.encode(chat)
        if let compressed = compress(data) {
            let url = chatsDir.appendingPathComponent("\(chat.id).json.gz")
            try compressed.write(to: url, options: .atomic)
            // Remove plain version if exists
            let plainUrl = chatsDir.appendingPathComponent("\(chat.id).json")
            try? FileManager.default.removeItem(at: plainUrl)
        } else {
            // Fallback to uncompressed
            let url = chatsDir.appendingPathComponent("\(chat.id).json")
            try data.write(to: url, options: .atomic)
        }
    }

    public func deleteChat(id: String) {
        let gzUrl = chatsDir.appendingPathComponent("\(id).json.gz")
        let plainUrl = chatsDir.appendingPathComponent("\(id).json")
        try? FileManager.default.removeItem(at: gzUrl)
        try? FileManager.default.removeItem(at: plainUrl)
    }

    // MARK: - Load All

    /// Load all chats and content store from disk.
    public func loadAll(contentStore: ContentStore) -> (chats: [Chat], activeChatId: String?) {
        guard let meta = loadMeta() else { return ([], nil) }

        contentStore.data = loadContentStore()

        var chats: [Chat] = []
        for chatId in meta.chatIds {
            if let persisted = loadChat(id: chatId) {
                chats.append(persisted.toChat(contentStore: contentStore))
            }
        }

        return (chats, meta.activeChatId)
    }

    /// Save all chats and content store to disk (atomic 3-step commit).
    public func saveAll(chats: [Chat], contentStore: ContentStore, activeChatId: String?) throws {
        // Step 1: Save content store
        try saveContentStore(contentStore.data)

        // Step 2: Save each chat
        for chat in chats {
            try saveChat(PersistedChat(from: chat))
        }

        // Step 3: Save meta (commit marker)
        try saveMeta(chatIds: chats.map(\.id), activeChatId: activeChatId)

        // Step 4: Flush GC
        contentStore.flushPendingGC()
    }

    // MARK: - Export / Import (Web-Compatible V3)

    /// Export all data in Web V3 format.
    public func buildExportV3(
        chats: [Chat],
        contentStore: ContentStore,
        folders: [String: Folder]
    ) -> ExportV3 {
        let exportStore = contentStore.buildExportContentStore()
        let persistedChats = chats.map { PersistedChat(from: $0) }
        return ExportV3(chats: persistedChats, contentStore: exportStore, folders: folders)
    }

    /// Encode export data to JSON.
    public func encodeExportV3(_ export: ExportV3) throws -> Data {
        try encoder.encode(export)
    }

    /// Import from Web V3 JSON data.
    public func importExportV3(
        from data: Data,
        contentStore: ContentStore
    ) throws -> (chats: [Chat], folders: [String: Folder]) {
        let export = try decoder.decode(ExportV3.self, from: data)

        // Merge content store
        for (hash, entry) in export.contentStore {
            if contentStore.data[hash] == nil {
                contentStore.data[hash] = entry
            }
        }

        // Convert persisted chats to in-memory chats
        let chats = (export.chats ?? []).map { $0.toChat(contentStore: contentStore) }
        return (chats, export.folders)
    }

    // MARK: - Compression (gzip)

    private func compress(_ data: Data) -> Data? {
        try? (data as NSData).compressed(using: .zlib) as Data
    }

    private func decompress(_ data: Data) -> Data? {
        try? (data as NSData).decompressed(using: .zlib) as Data
    }

    // MARK: - Default Directory

    private static func defaultBaseDir() -> URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return docs.appendingPathComponent("weavelet", isDirectory: true)
    }
}
