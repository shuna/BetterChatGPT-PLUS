import Foundation

/// BranchService: pure functions for branch tree operations.
/// All functions take state as input and return new state without side effects.
/// Mirrors Web's `branch-domain.ts` + `branchUtils.ts`.
enum BranchService {

    // MARK: - Result Types

    struct MutationResult {
        var chats: [Chat]
        var contentStore: ContentStoreData
    }

    struct MutationResultWithId {
        var chats: [Chat]
        var contentStore: ContentStoreData
        var newId: String
    }

    struct UpsertWithAutoBranchResult {
        var chats: [Chat]
        var contentStore: ContentStoreData
        var newId: String?
        var noOp: Bool
    }

    // MARK: - Materialize

    /// Convert BranchTree's activePath to an array of Messages.
    static func materializeActivePath(
        tree: BranchTree,
        contentStore: ContentStoreData
    ) -> [Message] {
        tree.activePath.compactMap { id in
            guard let node = tree.nodes[id] else { return nil }
            let content = ContentStore.resolveContent(contentStore, hash: node.contentHash)
            return Message(role: node.role, content: content)
        }
    }

    // MARK: - Ensure Branch Tree

    /// If chat has no branchTree, create one from flat messages.
    static func ensureBranchTree(
        chats: [Chat],
        chatIndex: Int,
        contentStore: ContentStoreData
    ) -> MutationResult {
        guard chats.indices.contains(chatIndex) else {
            return MutationResult(chats: chats, contentStore: contentStore)
        }
        if chats[chatIndex].branchTree != nil {
            return MutationResult(chats: chats, contentStore: contentStore)
        }

        var store = contentStore
        var updatedChats = chats
        let tree = flatMessagesToBranchTree(
            messages: updatedChats[chatIndex].messages,
            contentStore: &store
        )
        updatedChats[chatIndex].branchTree = tree
        return MutationResult(chats: updatedChats, contentStore: store)
    }

    // MARK: - Flat Messages → Branch Tree

    /// Convert a flat array of Messages to a BranchTree.
    /// Each message becomes a node; nodes are linked in linear sequence.
    static func flatMessagesToBranchTree(
        messages: [Message],
        contentStore: inout ContentStoreData
    ) -> BranchTree {
        var nodes: [String: BranchNode] = [:]
        var ids: [String] = []
        let now = Date().timeIntervalSince1970 * 1000

        for (i, message) in messages.enumerated() {
            let id = UUID().uuidString
            ids.append(id)
            let hash = ContentStore.addContent(&contentStore, content: message.content)
            nodes[id] = BranchNode(
                id: id,
                parentId: i == 0 ? nil : ids[i - 1],
                role: message.role,
                contentHash: hash,
                createdAt: now - Double(messages.count - i) * 1000
            )
        }

        return BranchTree(
            nodes: nodes,
            rootId: ids.first ?? "",
            activePath: ids
        )
    }

    // MARK: - Append Node

    /// Append a new message node at the end of the active path.
    static func appendNodeToActivePath(
        chats: [Chat],
        chatIndex: Int,
        role: Role,
        content: [ContentItem],
        contentStore: ContentStoreData
    ) -> MutationResultWithId {
        var state = prepareMutation(chats: chats, chatIndex: chatIndex, contentStore: contentStore)
        let parentId = state.tree.activePath.last
        let newId = UUID().uuidString
        let hash = ContentStore.addContent(&state.contentStore, content: content)

        state.tree.nodes[newId] = BranchNode(
            id: newId,
            parentId: parentId,
            role: role,
            contentHash: hash
        )
        state.tree.activePath.append(newId)

        finalize(&state)
        return MutationResultWithId(
            chats: state.chats,
            contentStore: state.contentStore,
            newId: newId
        )
    }

    // MARK: - Create Branch

    /// Create a sibling branch from an existing node.
    static func createBranch(
        chats: [Chat],
        chatIndex: Int,
        fromNodeId: String,
        newContent: [ContentItem]?,
        contentStore: ContentStoreData
    ) -> MutationResultWithId {
        var store = contentStore
        var updatedChats = cloneChat(chats, at: chatIndex)
        var tree = updatedChats[chatIndex].branchTree!
        let fromNode = tree.nodes[fromNodeId]!

        let newId = UUID().uuidString
        let hash: String
        if let content = newContent {
            hash = ContentStore.addContent(&store, content: content)
        } else {
            ContentStore.retainContent(&store, hash: fromNode.contentHash)
            hash = fromNode.contentHash
        }

        tree.nodes[newId] = BranchNode(
            id: newId,
            parentId: fromNode.parentId,
            role: fromNode.role,
            contentHash: hash
        )

        if let idx = tree.activePath.firstIndex(of: fromNodeId) {
            tree.activePath = Array(tree.activePath.prefix(idx)) + [newId]
        }
        updatedChats[chatIndex].branchTree = tree
        updatedChats[chatIndex].messages = materializeActivePath(tree: tree, contentStore: store)

        return MutationResultWithId(chats: updatedChats, contentStore: store, newId: newId)
    }

    // MARK: - Switch Branch

    /// Switch the active path to pass through the given nodeId.
    static func switchBranchAtNode(
        chats: [Chat],
        chatIndex: Int,
        nodeId: String,
        contentStore: ContentStoreData
    ) -> [Chat] {
        let tree = chats[chatIndex].branchTree!
        let newPath = tree.buildPathToLeaf(from: nodeId)
        return switchActivePath(chats: chats, chatIndex: chatIndex, newPath: newPath, contentStore: contentStore)
    }

    /// Switch to an explicit path.
    static func switchActivePath(
        chats: [Chat],
        chatIndex: Int,
        newPath: [String],
        contentStore: ContentStoreData
    ) -> [Chat] {
        var updatedChats = cloneChat(chats, at: chatIndex)
        updatedChats[chatIndex].branchTree!.activePath = newPath
        updatedChats[chatIndex].messages = materializeActivePath(
            tree: updatedChats[chatIndex].branchTree!,
            contentStore: contentStore
        )
        return updatedChats
    }

    // MARK: - Delete Branch

    /// Delete a branch node and all its descendants.
    static func deleteBranch(
        chats: [Chat],
        chatIndex: Int,
        nodeId: String,
        contentStore: ContentStoreData
    ) -> MutationResult {
        var store = contentStore
        var updatedChats = cloneChat(chats, at: chatIndex)
        var tree = updatedChats[chatIndex].branchTree!
        let toDelete = tree.collectDescendants(of: nodeId).union([nodeId])
        let parentId = tree.nodes[nodeId]?.parentId

        for id in toDelete {
            if let node = tree.nodes[id] {
                ContentStore.releaseContent(&store, hash: node.contentHash)
                tree.nodes.removeValue(forKey: id)
            }
        }

        // Fix activePath if it passed through deleted nodes
        if tree.activePath.contains(where: { toDelete.contains($0) }) {
            if let parentId = parentId {
                let siblings = tree.childrenOf(parentId)
                if !siblings.isEmpty {
                    tree.activePath = tree.buildPathToLeaf(from: siblings[0].id)
                } else if let parentIdx = tree.activePath.firstIndex(of: parentId) {
                    tree.activePath = Array(tree.activePath.prefix(parentIdx + 1))
                }
            } else {
                tree.activePath = []
            }
            updatedChats[chatIndex].branchTree = tree
            updatedChats[chatIndex].messages = materializeActivePath(tree: tree, contentStore: store)
        } else {
            updatedChats[chatIndex].branchTree = tree
        }

        return MutationResult(chats: updatedChats, contentStore: store)
    }

    // MARK: - Upsert Message

    /// Update or insert a message at the given index.
    static func upsertMessageAtIndex(
        chats: [Chat],
        chatIndex: Int,
        messageIndex: Int,
        message: Message,
        contentStore: ContentStoreData
    ) -> MutationResult {
        var state = prepareMutation(chats: chats, chatIndex: chatIndex, contentStore: contentStore)
        let existingId = messageIndex < state.tree.activePath.count ? state.tree.activePath[messageIndex] : nil

        if let existingId = existingId {
            let oldHash = state.tree.nodes[existingId]!.contentHash
            let newHash = ContentStore.addContent(&state.contentStore, content: message.content)
            ContentStore.releaseContent(&state.contentStore, hash: oldHash)
            state.tree.nodes[existingId]!.role = message.role
            state.tree.nodes[existingId]!.contentHash = newHash
        } else if messageIndex == state.tree.activePath.count {
            let parentId = messageIndex == 0 ? nil : state.tree.activePath[messageIndex - 1]
            let newId = UUID().uuidString
            state.tree.nodes[newId] = BranchNode(
                id: newId,
                parentId: parentId,
                role: message.role,
                contentHash: ContentStore.addContent(&state.contentStore, content: message.content)
            )
            state.tree.activePath.append(newId)
            if messageIndex == 0 { state.tree.rootId = newId }
        }

        finalize(&state)
        return MutationResult(chats: state.chats, contentStore: state.contentStore)
    }

    // MARK: - Insert Message

    /// Insert a new message at the given index, pushing existing messages down.
    static func insertMessageAtIndex(
        chats: [Chat],
        chatIndex: Int,
        messageIndex: Int,
        message: Message,
        contentStore: ContentStoreData
    ) -> MutationResultWithId {
        var state = prepareMutation(chats: chats, chatIndex: chatIndex, contentStore: contentStore)
        let prevId = messageIndex > 0 ? state.tree.activePath[messageIndex - 1] : nil
        let nextId = messageIndex < state.tree.activePath.count ? state.tree.activePath[messageIndex] : nil
        let newId = UUID().uuidString

        state.tree.nodes[newId] = BranchNode(
            id: newId,
            parentId: prevId,
            role: message.role,
            contentHash: ContentStore.addContent(&state.contentStore, content: message.content)
        )

        if let nextId = nextId {
            state.tree.nodes[nextId]!.parentId = newId
        }

        state.tree.activePath.insert(newId, at: messageIndex)
        if messageIndex == 0 { state.tree.rootId = newId }

        finalize(&state)
        return MutationResultWithId(chats: state.chats, contentStore: state.contentStore, newId: newId)
    }

    // MARK: - Remove Message

    /// Remove a message at the given index.
    static func removeMessageAtIndex(
        chats: [Chat],
        chatIndex: Int,
        messageIndex: Int,
        contentStore: ContentStoreData,
        preserveNode: Bool = false
    ) -> MutationResult {
        var state = prepareMutation(chats: chats, chatIndex: chatIndex, contentStore: contentStore)
        removeFromPrepared(&state, at: messageIndex, preserveNode: preserveNode)
        finalize(&state)
        return MutationResult(chats: state.chats, contentStore: state.contentStore)
    }

    // MARK: - Move Message

    /// Move a message up or down in the active path.
    static func moveMessage(
        chats: [Chat],
        chatIndex: Int,
        messageIndex: Int,
        direction: MoveDirection,
        contentStore: ContentStoreData
    ) -> MutationResult {
        var state = prepareMutation(chats: chats, chatIndex: chatIndex, contentStore: contentStore)
        let targetIndex = direction == .up ? messageIndex - 1 : messageIndex + 1

        guard targetIndex >= 0,
              targetIndex < state.tree.activePath.count,
              messageIndex >= 0,
              messageIndex < state.tree.activePath.count else {
            finalize(&state)
            return MutationResult(chats: state.chats, contentStore: state.contentStore)
        }

        let start = min(messageIndex, targetIndex)
        let end = max(messageIndex, targetIndex)

        var reordered = state.tree.activePath
        let moved = reordered.remove(at: messageIndex)
        reordered.insert(moved, at: targetIndex)
        state.tree.activePath = reordered

        // Fix parent pointers
        for i in start...(end + 1) {
            guard i < state.tree.activePath.count else { continue }
            let nodeId = state.tree.activePath[i]
            state.tree.nodes[nodeId]?.parentId = i == 0 ? nil : state.tree.activePath[i - 1]
        }

        finalize(&state)
        return MutationResult(chats: state.chats, contentStore: state.contentStore)
    }

    enum MoveDirection {
        case up, down
    }

    // MARK: - Update Last Node Content (transient UI state, not persisted until commit)

    /// Update the content of the last node on the active path.
    /// Used for streaming display. Persistence only on commit.
    static func updateLastNodeContent(
        chats: [Chat],
        chatIndex: Int,
        content: [ContentItem],
        contentStore: ContentStoreData
    ) -> MutationResult {
        var store = contentStore
        var updatedChats = cloneChat(chats, at: chatIndex)
        var tree = updatedChats[chatIndex].branchTree!
        guard let lastId = tree.activePath.last else {
            return MutationResult(chats: updatedChats, contentStore: store)
        }

        let oldHash = tree.nodes[lastId]!.contentHash
        let newHash = ContentStore.addContent(&store, content: content)
        ContentStore.releaseContent(&store, hash: oldHash)
        tree.nodes[lastId]!.contentHash = newHash
        updatedChats[chatIndex].branchTree = tree
        updatedChats[chatIndex].messages = materializeActivePath(tree: tree, contentStore: store)

        return MutationResult(chats: updatedChats, contentStore: store)
    }

    // MARK: - Update Node Role

    /// Change the role of a specific node.
    static func updateNodeRole(
        chats: [Chat],
        chatIndex: Int,
        nodeId: String,
        role: Role,
        contentStore: ContentStoreData
    ) -> [Chat] {
        var updatedChats = cloneChat(chats, at: chatIndex)
        updatedChats[chatIndex].branchTree!.nodes[nodeId]!.role = role
        updatedChats[chatIndex].messages = materializeActivePath(
            tree: updatedChats[chatIndex].branchTree!,
            contentStore: contentStore
        )
        return updatedChats
    }

    // MARK: - Rename / Star / Pin

    static func renameBranchNode(
        chats: [Chat], chatIndex: Int, nodeId: String, label: String
    ) -> [Chat] {
        var updatedChats = cloneChat(chats, at: chatIndex)
        updatedChats[chatIndex].branchTree!.nodes[nodeId]!.label = label.isEmpty ? nil : label
        return updatedChats
    }

    static func toggleNodeStar(chats: [Chat], chatIndex: Int, nodeId: String) -> [Chat] {
        var updatedChats = cloneChat(chats, at: chatIndex)
        let current = updatedChats[chatIndex].branchTree!.nodes[nodeId]!.starred ?? false
        updatedChats[chatIndex].branchTree!.nodes[nodeId]!.starred = current ? nil : true
        return updatedChats
    }

    static func toggleNodePin(chats: [Chat], chatIndex: Int, nodeId: String) -> [Chat] {
        var updatedChats = cloneChat(chats, at: chatIndex)
        let current = updatedChats[chatIndex].branchTree!.nodes[nodeId]!.pinned ?? false
        updatedChats[chatIndex].branchTree!.nodes[nodeId]!.pinned = current ? nil : true
        return updatedChats
    }

    // MARK: - Truncate Active Path

    /// Truncate the active path to end at the given nodeId.
    static func truncateActivePath(
        chats: [Chat],
        chatIndex: Int,
        nodeId: String,
        contentStore: ContentStoreData
    ) -> [Chat] {
        var updatedChats = cloneChat(chats, at: chatIndex)
        var tree = updatedChats[chatIndex].branchTree!
        if let idx = tree.activePath.firstIndex(of: nodeId) {
            tree.activePath = Array(tree.activePath.prefix(idx + 1))
            updatedChats[chatIndex].branchTree = tree
            updatedChats[chatIndex].messages = materializeActivePath(tree: tree, contentStore: contentStore)
        }
        return updatedChats
    }

    // MARK: - Upsert with Auto Branch

    /// Smart upsert: no-op if unchanged, in-place update otherwise.
    static func upsertWithAutoBranch(
        chats: [Chat],
        chatIndex: Int,
        messageIndex: Int,
        message: Message,
        contentStore: ContentStoreData
    ) -> UpsertWithAutoBranchResult {
        let ensured = ensureBranchTree(chats: chats, chatIndex: chatIndex, contentStore: contentStore)
        let tree = ensured.chats[chatIndex].branchTree!
        guard messageIndex < tree.activePath.count else {
            let r = upsertMessageAtIndex(
                chats: ensured.chats, chatIndex: chatIndex,
                messageIndex: messageIndex, message: message,
                contentStore: ensured.contentStore
            )
            return UpsertWithAutoBranchResult(chats: r.chats, contentStore: r.contentStore, noOp: false)
        }

        let existingId = tree.activePath[messageIndex]
        let node = tree.nodes[existingId]!
        let contentChanged = !ContentStore.isContentEqual(
            ensured.contentStore, hash: node.contentHash, content: message.content
        )
        let roleChanged = node.role != message.role

        if !contentChanged && !roleChanged {
            return UpsertWithAutoBranchResult(
                chats: ensured.chats, contentStore: ensured.contentStore, noOp: true
            )
        }

        let r = upsertMessageAtIndex(
            chats: ensured.chats, chatIndex: chatIndex,
            messageIndex: messageIndex, message: message,
            contentStore: ensured.contentStore
        )
        return UpsertWithAutoBranchResult(chats: r.chats, contentStore: r.contentStore, noOp: false)
    }

    // MARK: - Private Helpers

    private struct PreparedState {
        var chats: [Chat]
        var chat: Chat
        var tree: BranchTree
        var contentStore: ContentStoreData
        var chatIndex: Int
    }

    private static func cloneChat(_ chats: [Chat], at index: Int) -> [Chat] {
        var result = chats
        // Swift structs are value types, so this is already a copy
        return result
    }

    private static func prepareMutation(
        chats: [Chat],
        chatIndex: Int,
        contentStore: ContentStoreData
    ) -> PreparedState {
        let ensured = ensureBranchTree(chats: chats, chatIndex: chatIndex, contentStore: contentStore)
        var updatedChats = ensured.chats
        let chat = updatedChats[chatIndex]
        return PreparedState(
            chats: updatedChats,
            chat: chat,
            tree: chat.branchTree!,
            contentStore: ensured.contentStore,
            chatIndex: chatIndex
        )
    }

    private static func finalize(_ state: inout PreparedState) {
        if !state.tree.activePath.isEmpty {
            state.tree.rootId = state.tree.activePath[0]
        }
        state.chat.branchTree = state.tree
        state.chat.messages = materializeActivePath(tree: state.tree, contentStore: state.contentStore)
        state.chats[state.chatIndex] = state.chat
    }

    private static func removeFromPrepared(
        _ state: inout PreparedState,
        at messageIndex: Int,
        preserveNode: Bool = false
    ) {
        guard messageIndex < state.tree.activePath.count else { return }
        let nodeId = state.tree.activePath[messageIndex]
        let parentId = state.tree.nodes[nodeId]?.parentId

        // Re-parent children of the removed node
        for (id, var node) in state.tree.nodes where node.parentId == nodeId {
            node.parentId = parentId
            state.tree.nodes[id] = node
        }

        if !preserveNode {
            if let hash = state.tree.nodes[nodeId]?.contentHash {
                ContentStore.releaseContent(&state.contentStore, hash: hash)
            }
            state.tree.nodes.removeValue(forKey: nodeId)
        }
        state.tree.activePath.remove(at: messageIndex)
    }
}
