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
    let apiService = APIService()

    /// Reference to app-wide settings (set from app entry point).
    var settings: SettingsViewModel?

    // MARK: - UI State

    /// Per-chat model selection — reads/writes Chat.config.model
    var selectedModelID: String {
        get {
            guard let idx = currentChatIndex else { return "claude-3.5-sonnet" }
            return chats[idx].config.model
        }
        set {
            guard let idx = currentChatIndex else { return }
            chats[idx].config.model = newValue
            scheduleSave()
        }
    }
    var availableModels: [AIModel] = AIModel.samples
    var isGenerating: Bool = false
    var isSearching: Bool = false
    var searchQuery: String = "" { didSet { performSearch() } }
    var searchCurrentMatch: Int = 0
    var searchTotalMatches: Int = 0
    /// Navigation history for back/forward between chats
    private var navigationHistory: [String] = []
    private var navigationIndex: Int = -1
    private var isNavigating: Bool = false

    var canGoBack: Bool { navigationIndex > 0 }
    var canGoForward: Bool { navigationIndex < navigationHistory.count - 1 }
    var draftText: String = ""
    var viewMode: DetailViewMode = .chat
    /// Toggle to signal branch editor search from outside (inspector toolbar).
    var branchEditorSearchRequested: Bool = false
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

    func createNewChat(title: String = "New Chat", config: ChatConfig? = nil, systemMessage: String? = nil) {
        var messages: [Message] = []
        if let sys = systemMessage, !sys.isEmpty {
            messages.append(Message(role: .system, content: [.text(sys)]))
        }
        let imageDetail = settings?.defaultImageDetail ?? .auto
        let chat = Chat(title: title, messages: messages, config: config ?? .default, imageDetail: imageDetail)
        chats.insert(chat, at: 0)
        currentChatID = chat.id
        pushNavigation(chat.id)
        scheduleSave()
    }

    func selectChat(_ chatId: String) {
        currentChatID = chatId
        if !isNavigating { pushNavigation(chatId) }
        scheduleSave()
    }

    func goBack() {
        guard canGoBack else { return }
        navigationIndex -= 1
        isNavigating = true
        selectChat(navigationHistory[navigationIndex])
        isNavigating = false
    }

    func goForward() {
        guard canGoForward else { return }
        navigationIndex += 1
        isNavigating = true
        selectChat(navigationHistory[navigationIndex])
        isNavigating = false
    }

    private func pushNavigation(_ chatId: String) {
        // Trim forward history
        if navigationIndex < navigationHistory.count - 1 {
            navigationHistory.removeSubrange((navigationIndex + 1)...)
        }
        // Avoid duplicates at top
        if navigationHistory.last != chatId {
            navigationHistory.append(chatId)
            if navigationHistory.count > 50 { navigationHistory.removeFirst() }
        }
        navigationIndex = navigationHistory.count - 1
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

        // Request assistant response
        requestAssistantResponse()
    }

    /// Active generation task, cancellable via stopGenerating().
    private var generationTask: Task<Void, Never>?

    /// Request an assistant response for the current chat.
    /// Creates an empty assistant node and streams the API response into it.
    private func requestAssistantResponse() {
        guard let chatIndex = currentChatIndex else { return }
        let chat = chats[chatIndex]
        let config = chat.config
        let providerId = config.providerId ?? .openai

        // Add empty assistant node
        let emptyContent: [ContentItem] = [.text("")]
        let result = BranchService.appendNodeToActivePath(
            chats: chats, chatIndex: chatIndex,
            role: .assistant, content: emptyContent,
            contentStore: contentStore
        )
        chats = result.chats
        contentStore = result.contentStore

        // Track the new node for streaming updates
        guard let tree = chats[chatIndex].branchTree,
              let assistantNodeId = tree.activePath.last else { return }

        // Build messages for API from active path
        let apiMessages = APIService.buildMessagesForAPI(
            chat: chats[chatIndex],
            contentStore: contentStore
        )

        isGenerating = true

        generationTask = Task { @MainActor [weak self] in
            guard let self else { return }

            // Check if API key is configured
            let hasKey = await self.apiService.getAPIKey(for: providerId) != nil

            guard hasKey else {
                self.isGenerating = false
                self.errorMessage = "No API key configured for \(providerId.rawValue). Set your key in Settings → API Keys."
                return
            }

            do {
                let finalText = try await self.apiService.streamChatCompletion(
                    messages: apiMessages,
                    config: config,
                    providerId: providerId,
                    onChunk: { [weak self] accumulated in
                        guard let self, self.isGenerating else { return }
                        // Update the assistant node content with accumulated text (streaming)
                        guard let chatIndex = self.currentChatIndex,
                              let tree = self.chats[chatIndex].branchTree,
                              let msgIndex = tree.activePath.firstIndex(of: assistantNodeId) else { return }

                        // Transient update for streaming (no persist until done)
                        let streamResult = BranchService.updateLastNodeContent(
                            chats: self.chats, chatIndex: chatIndex,
                            content: [.text(accumulated)], contentStore: self.contentStore
                        )
                        self.chats = streamResult.chats
                        self.contentStore = streamResult.contentStore
                    }
                )

                guard self.isGenerating else { return } // cancelled

                // Final commit: upsert with proper content store management
                let content: [ContentItem] = [.text(finalText)]
                guard let chatIndex = self.currentChatIndex,
                      let tree = self.chats[chatIndex].branchTree,
                      let msgIndex = tree.activePath.firstIndex(of: assistantNodeId) else { return }

                let message = Message(role: .assistant, content: content)
                let upsertResult = BranchService.upsertMessageAtIndex(
                    chats: self.chats, chatIndex: chatIndex,
                    messageIndex: msgIndex, message: message,
                    contentStore: self.contentStore
                )
                self.chats = upsertResult.chats
                self.contentStore = upsertResult.contentStore
                self.isGenerating = false

                // Token tracking
                if let settings = self.settings, settings.countTotalTokens {
                    // Rough estimate: ~4 chars per token for input+output
                    let totalChars = apiMessages.reduce(0) { $0 + (($1["content"] as? String)?.count ?? 0) } + finalText.count
                    settings.totalTokensUsed += max(1, totalChars / 4)
                }

                // Auto-title generation
                self.autoGenerateTitleIfNeeded(chatIndex: chatIndex)

                self.scheduleSave()
            } catch is CancellationError {
                // User cancelled — keep whatever was accumulated
                self.isGenerating = false
                self.scheduleSave()
            } catch {
                self.isGenerating = false
                self.errorMessage = error.localizedDescription
                self.scheduleSave()
            }
        }
    }

    /// Auto-generate a chat title from the first user message if autoTitle is enabled.
    /// When `titleModel` is set, requests a short summary via the API; otherwise falls back to a local prefix.
    private func autoGenerateTitleIfNeeded(chatIndex: Int) {
        guard let settings, settings.autoTitle else { return }
        guard !chats[chatIndex].titleSet else { return }

        let messages = self.messages
        guard let firstUser = messages.first(where: { $0.role == .user }) else { return }
        let userText = firstUser.content
        guard !userText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        let titleModel = settings.titleModel.trimmingCharacters(in: .whitespacesAndNewlines)
        if titleModel.isEmpty {
            // Local fallback: first 50 chars of the user message
            let title = String(userText.prefix(50)).trimmingCharacters(in: .whitespacesAndNewlines)
            chats[chatIndex].title = title.count < userText.count ? title + "…" : title
            chats[chatIndex].titleSet = true
        } else {
            // API-based title generation using the configured model
            let chatId = chats[chatIndex].id
            let providerId = chats[chatIndex].config.providerId ?? .openai
            Task { @MainActor [weak self] in
                guard let self else { return }
                let titleConfig = ChatConfig(model: titleModel, maxTokens: 30, temperature: 0.7, presencePenalty: 0, topP: 1, frequencyPenalty: 0)
                let prompt: [[String: Any]] = [
                    ["role": "system", "content": "Generate a very short chat title (under 8 words) for this conversation. Reply with only the title, no quotes."],
                    ["role": "user", "content": String(userText.prefix(500))]
                ]
                do {
                    let result = try await self.apiService.streamChatCompletion(
                        messages: prompt, config: titleConfig,
                        providerId: providerId, onChunk: { _ in }
                    )
                    let generated = result.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !generated.isEmpty,
                          let idx = self.chats.firstIndex(where: { $0.id == chatId }),
                          !self.chats[idx].titleSet else { return }
                    self.chats[idx].title = String(generated.prefix(60))
                    self.chats[idx].titleSet = true
                    self.scheduleSave()
                } catch {
                    // Fallback to local prefix on API failure
                    guard let idx = self.chats.firstIndex(where: { $0.id == chatId }),
                          !self.chats[idx].titleSet else { return }
                    let title = String(userText.prefix(50)).trimmingCharacters(in: .whitespacesAndNewlines)
                    self.chats[idx].title = title.count < userText.count ? title + "…" : title
                    self.chats[idx].titleSet = true
                }
            }
        }
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
        scheduleSave()
    }

    func collapseAll() {
        guard let chatIndex = currentChatIndex,
              let tree = chats[chatIndex].branchTree else { return }
        var collapsed: [String: Bool] = [:]
        for nodeId in tree.activePath { collapsed[nodeId] = true }
        chats[chatIndex].collapsedNodes = collapsed
        scheduleSave()
    }

    func expandAll() {
        guard let chatIndex = currentChatIndex else { return }
        chats[chatIndex].collapsedNodes = nil
        scheduleSave()
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
        requestAssistantResponse()
    }

    /// Regenerate all messages below the given one by truncating and
    /// requesting a new API continuation.
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
        requestAssistantResponse()
    }

    func stopGenerating() {
        generationTask?.cancel()
        generationTask = nil
        isGenerating = false
    }

    // MARK: - Search

    /// Indices of messages (in `messages`) that contain the search query.
    private(set) var searchMatchIndices: [Int] = []

    func performSearch() {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else {
            searchMatchIndices = []
            searchTotalMatches = 0
            searchCurrentMatch = 0
            return
        }
        searchMatchIndices = messages.enumerated().compactMap { idx, msg in
            msg.content.lowercased().contains(query) ? idx : nil
        }
        searchTotalMatches = searchMatchIndices.count
        // Preserve current match position if still valid
        if searchCurrentMatch > searchTotalMatches {
            searchCurrentMatch = searchTotalMatches > 0 ? searchTotalMatches : 0
        } else if searchCurrentMatch == 0 && searchTotalMatches > 0 {
            searchCurrentMatch = 1
        }
    }

    /// Call after any mutation that changes messages to keep search results in sync.
    private func refreshSearchIfActive() {
        guard isSearching, !searchQuery.isEmpty else { return }
        performSearch()
    }

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
            currentContentStore: contentStore
        ) else { return }

        let (updatedChats, updatedStore) = BranchUndoManager.applySnapshot(
            snapshot, chats: chats, contentStore: contentStore
        )
        chats = updatedChats
        contentStore = updatedStore
        scheduleSave()
    }

    func redo() {
        guard let chatIndex = currentChatIndex else { return }
        guard let snapshot = undoManager.redo(
            currentChatID: currentChatID!,
            currentChat: chats[chatIndex],
            currentContentStore: contentStore
        ) else { return }

        let (updatedChats, updatedStore) = BranchUndoManager.applySnapshot(
            snapshot, chats: chats, contentStore: contentStore
        )
        chats = updatedChats
        contentStore = updatedStore
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

    /// Export a single chat, optionally only the visible branch.
    func exportChat(_ chatId: String, visibleBranchOnly: Bool = false) throws -> Data {
        guard let chat = chats.first(where: { $0.id == chatId }) else {
            throw ExportImportService.ImportError.unsupportedFormat
        }
        let prepared = ExportImportService.prepareChatForExport(
            chat: chat,
            sourceContentStore: contentStore,
            visibleBranchOnly: visibleBranchOnly
        )
        let export = ExportImportService.ExportV3(
            version: 3,
            chats: [prepared.chat],
            contentStore: ContentStore.buildExportContentStore(prepared.contentStore),
            folders: nil
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(export)
    }

    /// Data ready for share sheet, set by export operations.
    var exportedFileURL: URL? = nil

    /// Export a single chat to a temp file and set exportedFileURL for share sheet.
    func exportChatToShare(_ chatId: String) {
        do {
            let data = try exportChat(chatId)
            let chatTitle = chats.first { $0.id == chatId }?.title ?? "chat"
            let safeName = chatTitle.replacingOccurrences(of: "/", with: "-")
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(safeName).json")
            try data.write(to: url)
            exportedFileURL = url
        } catch {
            errorMessage = "Export failed: \(error.localizedDescription)"
        }
    }

    /// Export a single chat in the specified format with options.
    func exportChatToShare(
        _ chatId: String,
        format: ExportImportService.ExportFormat,
        visibleBranchOnly: Bool = false,
        gzipCompress: Bool = false
    ) {
        guard let chat = chats.first(where: { $0.id == chatId }) else {
            errorMessage = "Chat not found"
            return
        }
        do {
            let data: Data
            switch format {
            case .json:
                data = try exportChat(chatId, visibleBranchOnly: visibleBranchOnly)
            case .openAI:
                data = ExportImportService.exportAsOpenAI(chat: chat, contentStore: contentStore, visibleBranchOnly: visibleBranchOnly)
            case .openRouter:
                data = ExportImportService.exportAsOpenRouter(chat: chat, contentStore: contentStore)
            case .markdown:
                data = ExportImportService.exportAsMarkdown(
                    chat: chat, contentStore: contentStore, visibleBranchOnly: visibleBranchOnly
                )
            case .image:
                // Image export uses a different path — generate markdown-based text image
                let md = ExportImportService.exportAsMarkdown(
                    chat: chat, contentStore: contentStore, visibleBranchOnly: visibleBranchOnly
                )
                if let pngData = renderTextAsPNG(String(data: md, encoding: .utf8) ?? "") {
                    data = pngData
                } else {
                    errorMessage = "Image rendering failed"
                    return
                }
            }

            let finalData: Data
            let ext: String
            if gzipCompress, let compressed = ExportImportService.gzipCompress(data) {
                finalData = compressed
                ext = "\(format.fileExtension).gz"
            } else {
                finalData = data
                ext = format.fileExtension
            }

            let safeName = chat.title.replacingOccurrences(of: "/", with: "-")
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(safeName).\(ext)")
            try finalData.write(to: url)
            exportedFileURL = url
        } catch {
            errorMessage = "Export failed: \(error.localizedDescription)"
        }
    }

    /// Render plain text as a PNG image using UIKit.
    private func renderTextAsPNG(_ text: String) -> Data? {
        let maxWidth: CGFloat = 600
        let padding: CGFloat = 24
        let font = UIFont.systemFont(ofSize: 14)
        let attrs: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: UIColor.label
        ]
        let attrStr = NSAttributedString(string: text, attributes: attrs)
        let drawRect = CGSize(width: maxWidth - padding * 2, height: .greatestFiniteMagnitude)
        let boundingRect = attrStr.boundingRect(
            with: drawRect, options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil
        )
        let imageSize = CGSize(
            width: maxWidth,
            height: ceil(boundingRect.height) + padding * 2
        )
        let renderer = UIGraphicsImageRenderer(size: imageSize)
        let image = renderer.image { ctx in
            UIColor.systemBackground.setFill()
            ctx.fill(CGRect(origin: .zero, size: imageSize))
            attrStr.draw(in: CGRect(
                x: padding, y: padding,
                width: drawRect.width, height: boundingRect.height
            ))
        }
        return image.pngData()
    }

    // MARK: - Persistence

    func scheduleSave() {
        refreshSearchIfActive()
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
            contentStore: contentStore
        )
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
