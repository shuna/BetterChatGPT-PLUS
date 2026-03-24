import SwiftUI
import WeaveletDomain
import WeaveletInfra

/// Manages the active conversation: messages, branch operations, streaming, undo/redo.
/// Replaces Zustand branch-slice + chat-slice (conversation portion).
@Observable
final class ConversationViewModel {
    /// The active chat being displayed/edited.
    var chat: Chat = Chat()

    /// The shared content store.
    let contentStore: ContentStore

    /// Current view mode.
    var activeView: ChatView = .chat

    /// Whether split panels are swapped (left↔right).
    var panelsSwapped: Bool = false

    /// Sync mode: scroll chat ↔ branch editor selection.
    var syncMode: Bool = false

    /// Undo/redo history.
    private var undoStack: [ChatSnapshot] = []
    private var redoStack: [ChatSnapshot] = []
    private let maxUndoHistory = 50

    /// Active streaming sessions.
    var streamingBuffer = StreamingBuffer()
    var isStreaming: Bool = false

    /// Branch clipboard for copy/paste.
    var branchClipboard: BranchClipboard?

    /// Collapsed/omitted/protected node maps.
    var collapsedNodes: [String: Bool] = [:]
    var omittedNodes: [String: Bool] = [:]
    var protectedNodes: [String: Bool] = [:]

    init(contentStore: ContentStore) {
        self.contentStore = contentStore
    }

    // MARK: - Active Chat

    func setActiveChat(_ chat: Chat, contentStore: ContentStore) {
        self.chat = chat
        self.collapsedNodes = chat.collapsedNodes ?? [:]
        self.omittedNodes = chat.omittedNodes ?? [:]
        self.protectedNodes = chat.protectedNodes ?? [:]
    }

    /// Sync chat back to the chat list.
    func syncToList(_ chatList: ChatListViewModel) {
        guard let idx = chatList.chats.firstIndex(where: { $0.id == chat.id }) else { return }
        chat.collapsedNodes = collapsedNodes.isEmpty ? nil : collapsedNodes
        chat.omittedNodes = omittedNodes.isEmpty ? nil : omittedNodes
        chat.protectedNodes = protectedNodes.isEmpty ? nil : protectedNodes
        chatList.chats[idx] = chat
    }

    // MARK: - Message Operations

    func appendMessage(role: Role, content: [ContentItem]) {
        pushUndo()
        BranchOps.appendNodeToActivePath(
            chat: &chat, role: role, content: content, contentStore: contentStore
        )
    }

    func upsertMessage(at index: Int, message: Message) {
        pushUndo()
        let result = BranchOps.upsertWithAutoBranch(
            chat: &chat, messageIndex: index, message: message, contentStore: contentStore
        )
        if result.noOp { popUndo() }
    }

    func insertMessage(at index: Int, message: Message) {
        pushUndo()
        BranchOps.insertMessageAtIndex(
            chat: &chat, messageIndex: index, message: message, contentStore: contentStore
        )
    }

    func removeMessage(at index: Int) {
        pushUndo()
        BranchOps.removeMessageAtIndex(
            chat: &chat, messageIndex: index, contentStore: contentStore
        )
    }

    func moveMessage(at index: Int, direction: BranchOps.MoveDirection) {
        pushUndo()
        BranchOps.moveMessage(
            chat: &chat, messageIndex: index, direction: direction, contentStore: contentStore
        )
    }

    // MARK: - Branch Operations

    func createBranch(fromNodeId: String, newContent: [ContentItem]?) {
        pushUndo()
        BranchOps.createBranch(
            chat: &chat, fromNodeId: fromNodeId, newContent: newContent, contentStore: contentStore
        )
    }

    func switchBranch(toNodeId: String) {
        BranchOps.switchBranchAtNode(
            chat: &chat, nodeId: toNodeId, contentStore: contentStore
        )
    }

    func deleteBranch(nodeId: String) {
        pushUndo()
        BranchOps.deleteBranch(
            chat: &chat, nodeId: nodeId, contentStore: contentStore
        )
    }

    func pruneHiddenNodes() {
        pushUndo()
        BranchOps.pruneHiddenNodes(chat: &chat, contentStore: contentStore)
    }

    func renameBranchNode(nodeId: String, label: String) {
        BranchOps.renameBranchNode(chat: &chat, nodeId: nodeId, label: label)
    }

    func toggleStar(nodeId: String) {
        BranchOps.toggleNodeStar(chat: &chat, nodeId: nodeId)
    }

    func togglePin(nodeId: String) {
        BranchOps.toggleNodePin(chat: &chat, nodeId: nodeId)
    }

    // MARK: - Clipboard

    func copyBranchSequence(from fromNodeId: String, to toNodeId: String) {
        branchClipboard = BranchOps.copyBranchSequence(
            chat: chat, fromNodeId: fromNodeId, toNodeId: toNodeId
        )
    }

    func pasteBranchSequence(afterNodeId: String) {
        guard let clipboard = branchClipboard else { return }
        pushUndo()
        BranchOps.pasteBranchSequence(
            chat: &chat, afterNodeId: afterNodeId, clipboard: clipboard, contentStore: contentStore
        )
    }

    // MARK: - Undo/Redo

    var canUndo: Bool { !undoStack.isEmpty }
    var canRedo: Bool { !redoStack.isEmpty }

    func undo() {
        guard let snapshot = undoStack.popLast() else { return }
        redoStack.append(ChatSnapshot(chat: chat, contentStoreData: contentStore.data))
        chat = snapshot.chat
        contentStore.data = snapshot.contentStoreData
    }

    func redo() {
        guard let snapshot = redoStack.popLast() else { return }
        undoStack.append(ChatSnapshot(chat: chat, contentStoreData: contentStore.data))
        chat = snapshot.chat
        contentStore.data = snapshot.contentStoreData
    }

    private func pushUndo() {
        undoStack.append(ChatSnapshot(chat: chat, contentStoreData: contentStore.data))
        if undoStack.count > maxUndoHistory {
            undoStack.removeFirst()
        }
        redoStack.removeAll()
    }

    private func popUndo() {
        _ = undoStack.popLast()
    }

    // MARK: - LLM Streaming

    /// Error from last streaming attempt.
    var streamError: String?

    /// Current streaming task for cancellation.
    private var streamTask: Task<Void, Never>?

    /// Send the current conversation to the LLM and stream the response.
    func sendAndStream(settings: SettingsViewModel) {
        guard !isStreaming else { return }
        guard let providerConfig = resolveProviderConfig(settings: settings) else {
            streamError = "No API key configured for \(chat.config.providerId?.displayName ?? "provider")"
            return
        }

        isStreaming = true
        streamError = nil

        // Create empty assistant message node
        appendMessage(role: .assistant, content: [.fromString("")])

        let messages = buildMessagesForAPI(defaultSystemMessage: settings.defaultSystemMessage)
        let chatConfig = chat.config

        streamTask = Task { @MainActor in
            do {
                let stream = try await LLMClient.shared.streamCompletion(
                    config: providerConfig,
                    chatConfig: chatConfig,
                    messages: messages
                )

                var accumulatedText = ""
                var accumulatedReasoning = ""

                for try await event in stream {
                    if event.done { break }

                    // Extract delta text
                    if let deltaText = SSEParser.extractDeltaText(from: event.data) {
                        accumulatedText += deltaText
                        updateLastAssistantMessage(
                            text: accumulatedText,
                            reasoning: accumulatedReasoning.isEmpty ? nil : accumulatedReasoning
                        )
                    }

                    // Extract reasoning
                    if let deltaReasoning = SSEParser.extractReasoningText(from: event.data) {
                        accumulatedReasoning += deltaReasoning
                        updateLastAssistantMessage(
                            text: accumulatedText,
                            reasoning: accumulatedReasoning
                        )
                    }
                }

                isStreaming = false

                // Auto-generate title if not set
                if !chat.titleSet && chat.messages.count >= 2 {
                    await generateTitle(settings: settings)
                }
            } catch {
                isStreaming = false
                if !Task.isCancelled {
                    streamError = error.localizedDescription
                }
            }
        }
    }

    /// Stop the current stream.
    func stopStreaming() {
        LLMClient.shared.cancelStream()
        streamTask?.cancel()
        streamTask = nil
        isStreaming = false
    }

    /// Regenerate the last assistant message.
    func regenerate(settings: SettingsViewModel) {
        guard !isStreaming else { return }
        // Remove last assistant message
        if let lastMsg = chat.messages.last, lastMsg.role == .assistant {
            removeMessage(at: chat.messages.count - 1)
        }
        // Re-send
        sendAndStream(settings: settings)
    }

    /// Continue from last message.
    func continueGeneration(settings: SettingsViewModel) {
        guard !isStreaming else { return }
        sendAndStream(settings: settings)
    }

    private func updateLastAssistantMessage(text: String, reasoning: String?) {
        guard let tree = chat.branchTree else { return }
        let path = tree.activePath
        guard let lastNodeId = path.last,
              let node = tree.nodes[lastNodeId],
              node.role == .assistant else { return }

        var content: [ContentItem] = []
        if let reasoning, !reasoning.isEmpty {
            content.append(.reasoning(ReasoningContent(text: reasoning)))
        }
        content.append(.fromString(text))

        let newHash = contentStore.addContent(content)
        if newHash != node.contentHash {
            contentStore.releaseContent(node.contentHash)
            chat.branchTree?.nodes[lastNodeId]?.contentHash = newHash
            // Rematerialize
            chat.messages = tree.materializeActivePath(contentStore: contentStore)
        }
    }

    /// Build messages for API call (respecting omittedNodes, system message).
    func buildMessagesForAPI(defaultSystemMessage: String = "") -> [Message] {
        var messages: [Message] = []

        // Prepend system message if configured
        if chat.config.includeDefaultSystemPrompt && !defaultSystemMessage.isEmpty {
            // Only add if the first message isn't already a system message
            let hasSystemMsg = chat.messages.first?.role == .system
            if !hasSystemMsg {
                messages.append(Message(role: .system, content: [.fromString(defaultSystemMessage)]))
            }
        }

        guard let tree = chat.branchTree else {
            messages += chat.messages
            // Remove empty assistant placeholder
            if let last = messages.last, last.role == .assistant,
               last.content.compactMap(\.textValue).joined().isEmpty {
                messages.removeLast()
            }
            return messages
        }

        let path = tree.activePath
        for (i, nodeId) in path.enumerated() {
            if omittedNodes[nodeId] == true && i < path.count - 1 { continue }
            if i < chat.messages.count {
                messages.append(chat.messages[i])
            }
        }
        // Remove the empty assistant message (it's the placeholder)
        if let last = messages.last, last.role == .assistant,
           last.content.compactMap(\.textValue).joined().isEmpty {
            messages.removeLast()
        }
        return messages
    }

    /// Resolve the provider config for the current chat.
    private func resolveProviderConfig(settings: SettingsViewModel) -> ProviderConfig? {
        let providerId = chat.config.providerId ?? .openrouter
        guard var config = settings.providers[providerId] ?? DefaultProviders.configs[providerId] else {
            return nil
        }
        // Merge API key from settings
        if config.apiKey == nil || config.apiKey?.isEmpty == true {
            config.apiKey = settings.providers[providerId]?.apiKey
        }
        return config.apiKey != nil ? config : nil
    }

    /// Auto-generate a chat title from the first message.
    private func generateTitle(settings: SettingsViewModel) async {
        guard let providerConfig = resolveProviderConfig(settings: settings) else { return }
        let titlePrompt = Message(role: .user, content: [.fromString(
            "Generate a short title (max 6 words) for a conversation that starts with: \"\(chat.messages.first?.content.compactMap(\.textValue).joined().prefix(200) ?? "")\". Reply with ONLY the title, no quotes."
        )])
        var titleConfig = chat.config
        titleConfig.maxTokens = 30
        titleConfig.temperature = 0.7
        titleConfig.stream = false

        do {
            let title = try await LLMClient.shared.completion(
                config: providerConfig,
                chatConfig: titleConfig,
                messages: [titlePrompt]
            )
            let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
                .trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
            if !trimmed.isEmpty {
                chat.title = String(trimmed.prefix(60))
                chat.titleSet = true
            }
        } catch {
            // Silent fail for title generation
        }
    }

    // MARK: - Node Visibility

    func toggleCollapsed(nodeId: String) {
        collapsedNodes[nodeId] = !(collapsedNodes[nodeId] ?? false)
        if collapsedNodes[nodeId] == false { collapsedNodes.removeValue(forKey: nodeId) }
    }

    func toggleOmitted(nodeId: String) {
        omittedNodes[nodeId] = !(omittedNodes[nodeId] ?? false)
        if omittedNodes[nodeId] == false { omittedNodes.removeValue(forKey: nodeId) }
    }

    func toggleProtected(nodeId: String) {
        protectedNodes[nodeId] = !(protectedNodes[nodeId] ?? false)
        if protectedNodes[nodeId] == false { protectedNodes.removeValue(forKey: nodeId) }
    }
}

// MARK: - Snapshot for Undo/Redo

private struct ChatSnapshot {
    let chat: Chat
    let contentStoreData: ContentStoreData
}
