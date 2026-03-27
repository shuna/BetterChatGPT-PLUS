import SwiftUI

// MARK: - MessageRole alias

typealias MessageRole = Role

// MARK: - ChatMessage (UI bridge type)

/// UI-facing message type that bridges domain models to Views.
/// Each ChatMessage maps to a BranchNode on the active path.
struct ChatMessage: Identifiable, Equatable {
    let id: UUID            // stable UI identity
    let nodeId: String      // domain BranchNode id
    var role: MessageRole
    var content: String
    var timestamp: Date
    var isGenerating: Bool = false
    var isOmitted: Bool = false
    var isProtected: Bool = false
    var isCollapsed: Bool = false

    static func == (lhs: ChatMessage, rhs: ChatMessage) -> Bool {
        lhs.id == rhs.id && lhs.content == rhs.content && lhs.isGenerating == rhs.isGenerating
            && lhs.isOmitted == rhs.isOmitted && lhs.isProtected == rhs.isProtected && lhs.role == rhs.role
            && lhs.isCollapsed == rhs.isCollapsed
    }
}

// MARK: - AI Model (UI type, maps to ProviderModel)

struct AIModel: Identifiable, Hashable {
    let id: String
    let name: String
    let provider: String
    let supportsVision: Bool
    let supportsReasoning: Bool
    let supportsAudio: Bool

    static let samples: [AIModel] = [
        AIModel(id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", supportsVision: true, supportsReasoning: false, supportsAudio: true),
        AIModel(id: "claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic", supportsVision: true, supportsReasoning: false, supportsAudio: false),
        AIModel(id: "o1", name: "o1", provider: "OpenAI", supportsVision: false, supportsReasoning: true, supportsAudio: false),
        AIModel(id: "gemini-pro", name: "Gemini Pro", provider: "Google", supportsVision: true, supportsReasoning: false, supportsAudio: true),
    ]
}

// DetailViewMode is in Domain/Models/ChatTypes.swift

// MARK: - Chat View Model

@Observable
class ChatViewModel {

    // MARK: - Domain State

    var chats: [Chat] = []
    var contentStore: ContentStoreData = [:]
    var folders: FolderCollection = [:]
    var currentChatID: String?

    private let persistence = PersistenceService()
    private let undoManager = BranchUndoManager()

    /// Snapshot of contentStore at the last undo push point, for correct diff computation.
    private var lastSnapshotContentStore: ContentStoreData = [:]

    // MARK: - UI State

    var selectedModelID: String = "claude-3.5-sonnet"
    var availableModels: [AIModel] = AIModel.samples
    var isGenerating: Bool = false
    var isSearching: Bool = false
    var searchQuery: String = ""
    var searchCurrentMatch: Int = 0
    var searchTotalMatches: Int = 0
    var canGoBack: Bool { undoManager.canUndo }
    var canGoForward: Bool { undoManager.canRedo }
    var draftText: String = ""
    var viewMode: DetailViewMode = .chat
    var errorMessage: String? = nil
    var editingMessageID: UUID? = nil
    var editText: String = ""

    // MARK: - Stable ID mapping

    /// Maps nodeId → UUID for stable UI identity across re-materializations
    private var nodeIdToUUID: [String: UUID] = [:]

    // MARK: - Computed Properties

    var currentChatIndex: Int? {
        guard let id = currentChatID else { return nil }
        return chats.firstIndex { $0.id == id }
    }

    var currentChat: Chat? {
        guard let idx = currentChatIndex else { return nil }
        return chats[idx]
    }

    /// UI-facing messages derived from domain state.
    var messages: [ChatMessage] {
        guard let chat = currentChat else { return [] }
        let tree = chat.branchTree
        let activePath = tree?.activePath ?? []

        return activePath.enumerated().compactMap { (index, nodeId) in
            guard let node = tree?.nodes[nodeId] else { return nil }
            let content = ContentStore.resolveContent(contentStore, hash: node.contentHash)
            let text = content.toText()

            // Get or create stable UUID for this nodeId
            let uuid = stableUUID(for: nodeId)

            let isOmitted = chat.omittedNodes?[nodeId] ?? false
            let isProtected = chat.protectedNodes?[nodeId] ?? false
            let isCollapsed = chat.collapsedNodes?[nodeId] ?? false

            return ChatMessage(
                id: uuid,
                nodeId: nodeId,
                role: node.role,
                content: text,
                timestamp: Date(timeIntervalSince1970: node.createdAt / 1000),
                isOmitted: isOmitted,
                isProtected: isProtected,
                isCollapsed: isCollapsed
            )
        }
    }

    var selectedModel: AIModel? {
        availableModels.first { $0.id == selectedModelID }
    }

    // MARK: - Init

    init() {
        Task {
            if let state = await persistence.load() {
                await MainActor.run {
                    self.chats = state.chats
                    self.contentStore = state.contentStore
                    self.folders = state.folders
                    self.currentChatID = state.currentChatID
                    self.lastSnapshotContentStore = state.contentStore
                }
            }

            // Create default chat if none exist
            await MainActor.run {
                if self.chats.isEmpty {
                    self.createNewChat()
                }
                if self.currentChatID == nil {
                    self.currentChatID = self.chats.first?.id
                }
            }
        }
    }

    // MARK: - Chat Management

    func createNewChat(title: String = "New Chat") {
        let chat = Chat(title: title)
        chats.insert(chat, at: 0)
        currentChatID = chat.id
        scheduleSave()
    }

    func selectChat(_ chatId: String) {
        currentChatID = chatId
        scheduleSave()
    }

    func deleteChat(_ chatId: String) {
        // Release content store entries
        if let idx = chats.firstIndex(where: { $0.id == chatId }),
           let tree = chats[idx].branchTree {
            for (_, node) in tree.nodes {
                ContentStore.releaseContent(&contentStore, hash: node.contentHash)
            }
        }
        chats.removeAll { $0.id == chatId }
        if currentChatID == chatId {
            currentChatID = chats.first?.id
        }
        scheduleSave()
    }

    func renameChat(_ chatId: String, title: String) {
        guard let idx = chats.firstIndex(where: { $0.id == chatId }) else { return }
        chats[idx].title = title
        chats[idx].titleSet = true
        scheduleSave()
    }

    func duplicateChat(_ chatId: String) {
        guard let idx = chats.firstIndex(where: { $0.id == chatId }) else { return }
        let source = chats[idx]
        let newId = UUID().uuidString
        var copy = Chat(
            id: newId,
            title: "Copy of \(source.title)",
            folder: source.folder,
            messages: source.messages,
            config: source.config,
            titleSet: source.titleSet,
            imageDetail: source.imageDetail,
            branchTree: source.branchTree,
            collapsedNodes: source.collapsedNodes,
            omittedNodes: source.omittedNodes,
            protectedNodes: source.protectedNodes
        )
        // Retain content store entries for duplicated tree
        if let tree = source.branchTree {
            for (_, node) in tree.nodes {
                ContentStore.retainContent(&contentStore, hash: node.contentHash)
            }
        }
        chats.insert(copy, at: 0)
        currentChatID = newId
        scheduleSave()
    }

    func moveChatToFolder(_ chatId: String, folderID: String?) {
        guard let idx = chats.firstIndex(where: { $0.id == chatId }) else { return }
        chats[idx].folder = folderID
        scheduleSave()
    }

    // MARK: - Folder Management

    func createFolder(name: String = "New Folder") {
        let id = UUID().uuidString
        folders[id] = Folder(id: id, name: name, order: folders.count)
        scheduleSave()
    }

    func renameFolder(_ folderId: String, name: String) {
        folders[folderId]?.name = name
        scheduleSave()
    }

    func deleteFolder(_ folderId: String) {
        // Move chats out of folder
        for i in chats.indices where chats[i].folder == folderId {
            chats[i].folder = nil
        }
        folders.removeValue(forKey: folderId)
        scheduleSave()
    }

    func changeFolderColor(_ folderId: String, color: String?) {
        folders[folderId]?.color = color
        scheduleSave()
    }

    // MARK: - Message Operations

    func sendMessage() {
        let text = draftText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let chatIndex = currentChatIndex else { return }

        pushUndo()

        let content: [ContentItem] = [.text(text)]
        let result = BranchService.appendNodeToActivePath(
            chats: chats, chatIndex: chatIndex,
            role: .user, content: content,
            contentStore: contentStore
        )
        chats = result.chats
        contentStore = result.contentStore
        draftText = ""

        scheduleSave()
        // API integration will add assistant response here
    }

    func deleteMessage(_ id: UUID) {
        guard let chatIndex = currentChatIndex,
              let nodeId = nodeIdForUUID(id),
              let tree = chats[chatIndex].branchTree,
              let msgIndex = tree.activePath.firstIndex(of: nodeId) else { return }

        pushUndo()
        let result = BranchService.removeMessageAtIndex(
            chats: chats, chatIndex: chatIndex,
            messageIndex: msgIndex, contentStore: contentStore
        )
        chats = result.chats
        contentStore = result.contentStore
        scheduleSave()
    }

    func editMessage(_ id: UUID, newContent: String) {
        guard let chatIndex = currentChatIndex,
              let nodeId = nodeIdForUUID(id),
              let tree = chats[chatIndex].branchTree,
              let msgIndex = tree.activePath.firstIndex(of: nodeId) else { return }

        pushUndo()

        let node = tree.nodes[nodeId]!
        let message = Message(role: node.role, content: [.text(newContent)])
        let result = BranchService.upsertWithAutoBranch(
            chats: chats, chatIndex: chatIndex,
            messageIndex: msgIndex, message: message,
            contentStore: contentStore
        )
        if !result.noOp {
            chats = result.chats
            contentStore = result.contentStore
            scheduleSave()
        }
    }

    func changeRole(_ id: UUID, to role: Role) {
        guard let chatIndex = currentChatIndex,
              let nodeId = nodeIdForUUID(id) else { return }

        pushUndo()
        chats = BranchService.updateNodeRole(
            chats: chats, chatIndex: chatIndex,
            nodeId: nodeId, role: role,
            contentStore: contentStore
        )
        scheduleSave()
    }

    func moveMessageUp(_ id: UUID) {
        moveMessage(id, direction: .up)
    }

    func moveMessageDown(_ id: UUID) {
        moveMessage(id, direction: .down)
    }

    private func moveMessage(_ id: UUID, direction: BranchService.MoveDirection) {
        guard let chatIndex = currentChatIndex,
              let nodeId = nodeIdForUUID(id),
              let tree = chats[chatIndex].branchTree,
              let msgIndex = tree.activePath.firstIndex(of: nodeId) else { return }

        pushUndo()
        let result = BranchService.moveMessage(
            chats: chats, chatIndex: chatIndex,
            messageIndex: msgIndex, direction: direction,
            contentStore: contentStore
        )
        chats = result.chats
        contentStore = result.contentStore
        scheduleSave()
    }

    func copyMessage(_ message: ChatMessage) {
        UIPasteboard.general.string = message.content
    }

    func toggleOmit(_ id: UUID) {
        guard let chatIndex = currentChatIndex,
              let nodeId = nodeIdForUUID(id) else { return }
        let current = chats[chatIndex].omittedNodes?[nodeId] ?? false
        if chats[chatIndex].omittedNodes == nil { chats[chatIndex].omittedNodes = [:] }
        chats[chatIndex].omittedNodes![nodeId] = current ? nil : true
        scheduleSave()
    }

    func toggleProtect(_ id: UUID) {
        guard let chatIndex = currentChatIndex,
              let nodeId = nodeIdForUUID(id) else { return }
        let current = chats[chatIndex].protectedNodes?[nodeId] ?? false
        if chats[chatIndex].protectedNodes == nil { chats[chatIndex].protectedNodes = [:] }
        chats[chatIndex].protectedNodes![nodeId] = current ? nil : true
        scheduleSave()
    }

    func toggleCollapse(_ id: UUID) {
        guard let chatIndex = currentChatIndex,
              let nodeId = nodeIdForUUID(id) else { return }
        let current = chats[chatIndex].collapsedNodes?[nodeId] ?? false
        if chats[chatIndex].collapsedNodes == nil { chats[chatIndex].collapsedNodes = [:] }
        chats[chatIndex].collapsedNodes![nodeId] = current ? nil : true
    }

    func collapseAll() {
        guard let chatIndex = currentChatIndex,
              let tree = chats[chatIndex].branchTree else { return }
        var collapsed: [String: Bool] = [:]
        for nodeId in tree.activePath { collapsed[nodeId] = true }
        chats[chatIndex].collapsedNodes = collapsed
    }

    func expandAll() {
        guard let chatIndex = currentChatIndex else { return }
        chats[chatIndex].collapsedNodes = nil
    }

    /// Regenerate: create a sibling branch at the given message's parent,
    /// ready for an API call to fill in a new assistant response.
    func regenerateMessage(_ id: UUID) {
        guard let chatIndex = currentChatIndex,
              let nodeId = nodeIdForUUID(id),
              let tree = chats[chatIndex].branchTree,
              let node = tree.nodes[nodeId],
              let parentId = node.parentId else { return }

        pushUndo()

        // Create a new branch from the node with empty content
        let content: [ContentItem] = [.text("")]
        let result = BranchService.createBranch(
            chats: chats, chatIndex: chatIndex,
            fromNodeId: nodeId, newContent: content,
            contentStore: contentStore
        )
        chats = result.chats
        contentStore = result.contentStore
        scheduleSave()
        // API integration will fill the new branch node
    }

    /// Regenerate all messages below the given one by truncating and
    /// preparing for a new API continuation.
    func regenerateBelow(_ id: UUID) {
        guard let chatIndex = currentChatIndex,
              let nodeId = nodeIdForUUID(id),
              let tree = chats[chatIndex].branchTree,
              let msgIndex = tree.activePath.firstIndex(of: nodeId) else { return }

        pushUndo()

        chats = BranchService.truncateActivePath(
            chats: chats, chatIndex: chatIndex,
            nodeId: nodeId, contentStore: contentStore
        )
        scheduleSave()
        // API integration will generate continuation
    }

    func stopGenerating() {
        isGenerating = false
    }

    // MARK: - Search

    func searchNext() {
        guard searchTotalMatches > 0 else { return }
        searchCurrentMatch = (searchCurrentMatch % searchTotalMatches) + 1
    }

    func searchPrevious() {
        guard searchTotalMatches > 0 else { return }
        searchCurrentMatch = searchCurrentMatch <= 1 ? searchTotalMatches : searchCurrentMatch - 1
    }

    // MARK: - Undo / Redo

    func undo() {
        guard let chatIndex = currentChatIndex else { return }
        guard let snapshot = undoManager.undo(
            currentChatID: currentChatID!,
            currentChat: chats[chatIndex],
            currentContentStore: contentStore,
            previousContentStore: lastSnapshotContentStore
        ) else { return }

        let (updatedChats, updatedStore) = BranchUndoManager.applySnapshot(
            snapshot, chats: chats, contentStore: contentStore
        )
        chats = updatedChats
        contentStore = updatedStore
        lastSnapshotContentStore = contentStore
        scheduleSave()
    }

    func redo() {
        guard let chatIndex = currentChatIndex else { return }
        guard let snapshot = undoManager.redo(
            currentChatID: currentChatID!,
            currentChat: chats[chatIndex],
            currentContentStore: contentStore,
            previousContentStore: lastSnapshotContentStore
        ) else { return }

        let (updatedChats, updatedStore) = BranchUndoManager.applySnapshot(
            snapshot, chats: chats, contentStore: contentStore
        )
        chats = updatedChats
        contentStore = updatedStore
        lastSnapshotContentStore = contentStore
        scheduleSave()
    }

    // MARK: - Error

    func retryLastMessage() {
        errorMessage = nil
        // Re-send: regenerate the last assistant message if present
        if let lastMsg = messages.last, lastMsg.role == .assistant {
            regenerateMessage(lastMsg.id)
        }
    }

    // MARK: - Import / Export

    func importData(from data: Data) throws {
        let result = try ExportImportService.importFromJSON(data)
        ExportImportService.mergeChats(
            existing: &chats,
            existingStore: &contentStore,
            existingFolders: &folders,
            imported: result
        )
        scheduleSave()
    }

    func exportData() throws -> Data {
        try ExportImportService.exportAsV3(
            chats: chats,
            contentStore: contentStore,
            folders: folders
        )
    }

    // MARK: - Persistence

    func scheduleSave() {
        let state = AppState(
            chats: chats,
            contentStore: contentStore,
            folders: folders,
            currentChatID: currentChatID
        )
        Task { await persistence.save(state) }
    }

    func flush() {
        let state = AppState(
            chats: chats,
            contentStore: contentStore,
            folders: folders,
            currentChatID: currentChatID
        )
        Task { await persistence.flush(state) }
    }

    // MARK: - Private Helpers

    private func pushUndo() {
        guard let chatIndex = currentChatIndex else { return }
        undoManager.push(
            currentChatID: currentChatID!,
            chat: chats[chatIndex],
            contentStore: contentStore,
            previousContentStore: lastSnapshotContentStore
        )
        lastSnapshotContentStore = contentStore
    }

    private func stableUUID(for nodeId: String) -> UUID {
        if let uuid = nodeIdToUUID[nodeId] { return uuid }
        let uuid = UUID()
        nodeIdToUUID[nodeId] = uuid
        return uuid
    }

    private func nodeIdForUUID(_ uuid: UUID) -> String? {
        nodeIdToUUID.first { $0.value == uuid }?.key
    }

    // MARK: - Branch Operations (exposed for BranchEditorView)

    func switchBranch(at nodeId: String, to childId: String) {
        guard let chatIndex = currentChatIndex else { return }
        pushUndo()
        // switchBranchAtNode switches active path to pass through nodeId
        chats = BranchService.switchBranchAtNode(
            chats: chats, chatIndex: chatIndex,
            nodeId: childId, contentStore: contentStore
        )
        scheduleSave()
    }

    func createBranch(parentNodeId: String, role: Role = .user, content: [ContentItem] = [.text("")]) {
        guard let chatIndex = currentChatIndex else { return }
        pushUndo()
        let result = BranchService.createBranch(
            chats: chats, chatIndex: chatIndex,
            fromNodeId: parentNodeId, newContent: content,
            contentStore: contentStore
        )
        chats = result.chats
        contentStore = result.contentStore
        scheduleSave()
    }

    func deleteBranch(nodeId: String) {
        guard let chatIndex = currentChatIndex else { return }
        pushUndo()
        let result = BranchService.deleteBranch(
            chats: chats, chatIndex: chatIndex,
            nodeId: nodeId, contentStore: contentStore
        )
        chats = result.chats
        contentStore = result.contentStore
        scheduleSave()
    }
}
