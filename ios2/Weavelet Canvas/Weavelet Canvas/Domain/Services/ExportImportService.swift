import Foundation

/// ExportImportService: Web-compatible JSON import/export.
/// Separate from PersistenceService (internal storage).
/// Handles normalization for round-trip compatibility.
enum ExportImportService {

    // MARK: - Export Types

    /// V3 export format (current Web version)
    struct ExportV3: Codable {
        let version: Int  // 3
        let chats: [Chat]
        let contentStore: ContentStoreData
        let folders: FolderCollection?
    }

    struct PreparedChatExport {
        let chat: Chat
        let contentStore: ContentStoreData
    }

    // MARK: - Import Types

    enum ImportType {
        case exportV3
        case exportV2      // has contentStore but no version field
        case exportV1      // old format, no contentStore
        case legacyImport  // flat messages, no branchTree
        case openAIContent // OpenAI conversation format
        case unknown
    }

    struct ImportResult {
        let chats: [Chat]
        let contentStore: ContentStoreData
        let folders: FolderCollection
    }

    // MARK: - Export

    /// Prepare a single chat for export with its content store subset.
    static func prepareChatForExport(
        chat: Chat,
        sourceContentStore: ContentStoreData,
        visibleBranchOnly: Bool = false
    ) -> PreparedChatExport {
        var exportStore: ContentStoreData = [:]

        if let tree = chat.branchTree {
            let nodeIds: Set<String>
            if visibleBranchOnly {
                nodeIds = Set(tree.activePath)
            } else {
                nodeIds = Set(tree.nodes.keys)
            }

            for id in nodeIds {
                guard let node = tree.nodes[id] else { continue }
                let hash = node.contentHash
                if let entry = sourceContentStore[hash] {
                    exportStore[hash] = ContentEntry(content: entry.content, refCount: entry.refCount)
                }
            }
        }

        // If no branch tree, include content from messages
        if chat.branchTree == nil {
            // No content store entries needed for flat messages
        }

        var exportChat = chat
        if visibleBranchOnly, var tree = exportChat.branchTree {
            // Strip non-active nodes
            let activeSet = Set(tree.activePath)
            tree.nodes = tree.nodes.filter { activeSet.contains($0.key) }
            exportChat.branchTree = tree
        }

        return PreparedChatExport(chat: exportChat, contentStore: exportStore)
    }

    /// Export multiple chats as V3 format JSON data.
    static func exportAsV3(
        chats: [Chat],
        contentStore: ContentStoreData,
        folders: FolderCollection
    ) throws -> Data {
        let export = ExportV3(
            version: 3,
            chats: chats,
            contentStore: ContentStore.buildExportContentStore(contentStore),
            folders: folders.isEmpty ? nil : folders
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(export)
    }

    // MARK: - Import

    /// Detect the import type from parsed JSON.
    static func detectImportType(_ json: Any) -> ImportType {
        guard let dict = json as? [String: Any] else {
            // Could be an array of chats
            if let arr = json as? [[String: Any]] {
                if arr.first?["messages"] != nil { return .legacyImport }
                if arr.first?["mapping"] != nil { return .openAIContent }
            }
            return .unknown
        }

        if let version = dict["version"] as? Int, version >= 3 {
            return .exportV3
        }
        if dict["contentStore"] != nil {
            return .exportV2
        }
        if dict["chats"] != nil {
            return .exportV1
        }
        if dict["messages"] != nil {
            return .legacyImport
        }
        return .unknown
    }

    /// Import from JSON data. Handles all supported formats.
    static func importFromJSON(_ data: Data) throws -> ImportResult {
        let json = try JSONSerialization.jsonObject(with: data)
        let type = detectImportType(json)

        switch type {
        case .exportV3:
            return try importV3(data)
        case .exportV2:
            return try importV2(data)
        case .exportV1:
            return try importV1(data)
        case .legacyImport:
            return try importLegacy(data)
        case .openAIContent:
            return try importOpenAI(data)
        case .unknown:
            throw ImportError.unsupportedFormat
        }
    }

    // MARK: - V3 Import

    private static func importV3(_ data: Data) throws -> ImportResult {
        let decoder = JSONDecoder()
        let export = try decoder.decode(ExportV3.self, from: data)
        return ImportResult(
            chats: export.chats,
            contentStore: export.contentStore,
            folders: export.folders ?? [:]
        )
    }

    // MARK: - V2 Import (has contentStore, no version)

    private struct ExportV2: Codable {
        let chats: [Chat]
        let contentStore: ContentStoreData
        let folders: FolderCollection?
    }

    private static func importV2(_ data: Data) throws -> ImportResult {
        let decoder = JSONDecoder()
        let export = try decoder.decode(ExportV2.self, from: data)
        return ImportResult(
            chats: export.chats,
            contentStore: export.contentStore,
            folders: export.folders ?? [:]
        )
    }

    // MARK: - V1 Import (no contentStore)

    private struct ExportV1Chats: Codable {
        let chats: [Chat]
        let folders: FolderCollection?
    }

    private static func importV1(_ data: Data) throws -> ImportResult {
        let decoder = JSONDecoder()
        let export = try decoder.decode(ExportV1Chats.self, from: data)
        // V1 has no content store; create one from branch trees
        var store: ContentStoreData = [:]
        var chats = export.chats
        for i in chats.indices {
            if chats[i].branchTree == nil && !chats[i].messages.isEmpty {
                chats[i].branchTree = BranchService.flatMessagesToBranchTree(
                    messages: chats[i].messages,
                    contentStore: &store
                )
            }
        }
        return ImportResult(chats: chats, contentStore: store, folders: export.folders ?? [:])
    }

    // MARK: - Legacy Import (flat messages array)

    private static func importLegacy(_ data: Data) throws -> ImportResult {
        let decoder = JSONDecoder()

        // Try as array of chats first
        if let chats = try? decoder.decode([Chat].self, from: data) {
            var store: ContentStoreData = [:]
            var result = chats
            for i in result.indices {
                if result[i].branchTree == nil && !result[i].messages.isEmpty {
                    result[i].branchTree = BranchService.flatMessagesToBranchTree(
                        messages: result[i].messages,
                        contentStore: &store
                    )
                }
            }
            return ImportResult(chats: result, contentStore: store, folders: [:])
        }

        // Try as single chat
        let chat = try decoder.decode(Chat.self, from: data)
        var store: ContentStoreData = [:]
        var result = chat
        if result.branchTree == nil && !result.messages.isEmpty {
            result.branchTree = BranchService.flatMessagesToBranchTree(
                messages: result.messages,
                contentStore: &store
            )
        }
        return ImportResult(chats: [result], contentStore: store, folders: [:])
    }

    // MARK: - OpenAI Import

    /// Import OpenAI ChatGPT conversation export format.
    /// Expects an array of objects with `title` and `mapping` (node tree with `message`).
    private static func importOpenAI(_ data: Data) throws -> ImportResult {
        let json = try JSONSerialization.jsonObject(with: data)
        guard let conversations = json as? [[String: Any]] else {
            throw ImportError.unsupportedFormat
        }

        var allChats: [Chat] = []
        var store: ContentStoreData = [:]

        for conversation in conversations {
            let title = conversation["title"] as? String ?? "Imported Chat"
            guard let mapping = conversation["mapping"] as? [String: [String: Any]] else { continue }

            // Extract messages in order from the mapping tree
            var flatMessages: [Message] = []
            // Find root node (no parent or parent not in mapping)
            var rootId: String?
            for (nodeId, node) in mapping {
                let parent = node["parent"] as? String
                if parent == nil || mapping[parent!] == nil {
                    rootId = nodeId
                    break
                }
            }

            // Walk the tree following children
            func walkNode(_ nodeId: String) {
                guard let node = mapping[nodeId] else { return }
                if let msgData = node["message"] as? [String: Any],
                   let author = msgData["author"] as? [String: Any],
                   let roleName = author["role"] as? String,
                   roleName != "system" {
                    let role: Role = roleName == "assistant" ? .assistant : .user
                    let contentData = msgData["content"] as? [String: Any]
                    let parts = contentData?["parts"] as? [Any] ?? []
                    let text = parts.compactMap { $0 as? String }.joined(separator: "\n")
                    if !text.isEmpty {
                        let msg = Message(
                            role: role,
                            content: [.text(text)]
                        )
                        flatMessages.append(msg)
                    }
                }
                // Follow children
                if let children = node["children"] as? [String] {
                    for child in children {
                        walkNode(child)
                    }
                }
            }

            if let rootId { walkNode(rootId) }

            guard !flatMessages.isEmpty else { continue }

            var chat = Chat(id: UUID().uuidString, title: title)
            chat.messages = flatMessages
            chat.branchTree = BranchService.flatMessagesToBranchTree(
                messages: flatMessages,
                contentStore: &store
            )
            allChats.append(chat)
        }

        guard !allChats.isEmpty else { throw ImportError.unsupportedFormat }
        return ImportResult(chats: allChats, contentStore: store, folders: [:])
    }

    // MARK: - Normalization

    /// Normalize a content store for comparison (sorted keys, normalized refCounts).
    static func normalizeForComparison(
        chats: [Chat],
        contentStore: ContentStoreData
    ) -> (chats: [Chat], contentStore: ContentStoreData) {
        // Normalize refCounts to 1 (for comparison purposes)
        var normalized = contentStore
        for (key, var entry) in normalized {
            entry.refCount = 1
            normalized[key] = entry
        }
        return (chats, normalized)
    }

    /// Validate folder references: remove folder IDs that don't exist.
    static func clearMissingFolderReferences(
        chats: inout [Chat],
        folders: FolderCollection
    ) {
        for i in chats.indices {
            if let folderId = chats[i].folder, folders[folderId] == nil {
                chats[i].folder = nil
            }
        }
    }

    // MARK: - Merge

    /// Merge imported chats into existing state.
    static func mergeChats(
        existing: inout [Chat],
        existingStore: inout ContentStoreData,
        existingFolders: inout FolderCollection,
        imported: ImportResult
    ) {
        // Merge content store (retain on hash collision)
        for (hash, entry) in imported.contentStore {
            if existingStore[hash] != nil {
                ContentStore.retainContent(&existingStore, hash: hash)
            } else {
                existingStore[hash] = entry
            }
        }

        // Merge folders
        for (id, folder) in imported.folders {
            if existingFolders[id] == nil {
                existingFolders[id] = folder
            }
        }

        // Clear invalid folder refs
        var importedChats = imported.chats
        clearMissingFolderReferences(chats: &importedChats, folders: existingFolders)

        // Append chats (skip duplicates by ID)
        let existingIds = Set(existing.map(\.id))
        for chat in importedChats {
            if !existingIds.contains(chat.id) {
                existing.append(chat)
            }
        }
    }

    // MARK: - Errors

    enum ImportError: Error, LocalizedError {
        case unsupportedFormat
        case invalidData

        var errorDescription: String? {
            switch self {
            case .unsupportedFormat: return "Unsupported import format"
            case .invalidData: return "Invalid import data"
            }
        }
    }
}
