import Foundation

/// Core branch tree mutation operations.
///
/// All functions operate on value types (Chat, BranchTree) and mutate them
/// in place. In Swift, struct value semantics handle the "clone" pattern
/// automatically — no explicit cloneChatAt needed.
///
/// Functions take `ContentStore` (reference type) as a parameter for shared
/// content management across operations.
public enum BranchOps {

    // MARK: - Ensure Branch Tree

    /// Ensure a chat has a branch tree. Creates one from flat messages if missing.
    public static func ensureBranchTree(chat: inout Chat, contentStore: ContentStore) {
        if chat.branchTree != nil { return }
        chat.branchTree = BranchTree.fromFlatMessages(chat.messages, contentStore: contentStore)
    }

    // MARK: - Create Branch

    /// Create a sibling branch from an existing node.
    /// Returns the new node ID.
    @discardableResult
    public static func createBranch(
        chat: inout Chat,
        fromNodeId: String,
        newContent: [ContentItem]?,
        contentStore: ContentStore
    ) -> String {
        var tree = chat.branchTree!
        let fromNode = tree.nodes[fromNodeId]!

        let newId = UUID().uuidString
        let contentHash: String
        if let newContent {
            contentHash = contentStore.addContentDelta(newContent, baseHash: fromNode.contentHash)
        } else {
            contentStore.retainContent(fromNode.contentHash)
            contentHash = fromNode.contentHash
        }

        tree.nodes[newId] = BranchNode(
            id: newId,
            parentId: fromNode.parentId,
            role: fromNode.role,
            contentHash: contentHash
        )

        if let fromIdx = tree.activePath.firstIndex(of: fromNodeId) {
            tree.activePath = Array(tree.activePath.prefix(fromIdx)) + [newId]
        }

        chat.branchTree = tree
        chat.messages = tree.materializeActivePath(contentStore: contentStore)
        return newId
    }

    // MARK: - Switch Active Path

    /// Switch the active path to a new path.
    public static func switchActivePath(
        chat: inout Chat,
        newPath: [String],
        contentStore: ContentStore
    ) {
        chat.branchTree!.activePath = newPath
        chat.messages = chat.branchTree!.materializeActivePath(contentStore: contentStore)
    }

    /// Switch active path to go through a specific node, extending to the deepest leaf.
    public static func switchBranchAtNode(
        chat: inout Chat,
        nodeId: String,
        contentStore: ContentStore
    ) {
        let path = chat.branchTree!.buildPathToLeaf(from: nodeId)
        switchActivePath(chat: &chat, newPath: path, contentStore: contentStore)
    }

    // MARK: - Delete Branch

    /// Delete a node and all its descendants.
    public static func deleteBranch(
        chat: inout Chat,
        nodeId: String,
        contentStore: ContentStore
    ) {
        var tree = chat.branchTree!
        let toDelete = tree.collectDescendants(of: nodeId)
        let parentId = tree.nodes[nodeId]?.parentId

        for id in toDelete {
            if let hash = tree.nodes[id]?.contentHash {
                contentStore.releaseContent(hash)
            }
            tree.nodes.removeValue(forKey: id)
        }

        // Fix active path if it intersected deleted nodes
        if tree.activePath.contains(where: { toDelete.contains($0) }) {
            if let parentId {
                let siblings = tree.getChildren(of: parentId)
                if !siblings.isEmpty {
                    tree.activePath = tree.buildPathToLeaf(from: siblings[0].id)
                } else if let parentIdx = tree.activePath.firstIndex(of: parentId) {
                    tree.activePath = Array(tree.activePath.prefix(parentIdx + 1))
                }
            } else {
                tree.activePath = []
            }
        }

        chat.branchTree = tree
        chat.messages = tree.materializeActivePath(contentStore: contentStore)
    }

    // MARK: - Prune Hidden Nodes

    /// Remove all non-active, non-pinned nodes.
    public static func pruneHiddenNodes(
        chat: inout Chat,
        contentStore: ContentStore
    ) {
        var tree = chat.branchTree!
        let activeSet = Set(tree.activePath)

        // Collect pinned subtrees
        var protectedSet = Set<String>()
        for node in tree.nodes.values where node.pinned == true {
            for id in tree.collectDescendants(of: node.id) {
                protectedSet.insert(id)
            }
        }

        let toDelete = tree.nodes.keys.filter { !activeSet.contains($0) && !protectedSet.contains($0) }
        for id in toDelete {
            if let hash = tree.nodes[id]?.contentHash {
                contentStore.releaseContent(hash)
            }
            tree.nodes.removeValue(forKey: id)
        }

        // Fix orphaned parent pointers
        for id in tree.nodes.keys {
            if let parentId = tree.nodes[id]?.parentId, tree.nodes[parentId] == nil {
                tree.nodes[id]!.parentId = nil
            }
        }

        if !tree.activePath.isEmpty {
            tree.rootId = tree.activePath[0]
        }

        chat.branchTree = tree
        chat.messages = tree.materializeActivePath(contentStore: contentStore)
    }

    // MARK: - Append Node

    /// Append a new node to the end of the active path.
    @discardableResult
    public static func appendNodeToActivePath(
        chat: inout Chat,
        role: Role,
        content: [ContentItem],
        contentStore: ContentStore
    ) -> String {
        ensureBranchTree(chat: &chat, contentStore: contentStore)
        var tree = chat.branchTree!

        let parentId = tree.activePath.last
        let newId = UUID().uuidString
        let contentHash = contentStore.addContent(content)

        tree.nodes[newId] = BranchNode(
            id: newId,
            parentId: parentId,
            role: role,
            contentHash: contentHash
        )
        tree.activePath.append(newId)
        tree.rootId = tree.activePath[0]

        chat.branchTree = tree
        chat.messages = tree.materializeActivePath(contentStore: contentStore)
        return newId
    }

    // MARK: - Upsert Message At Index

    /// Update or create a message at the given index.
    public static func upsertMessageAtIndex(
        chat: inout Chat,
        messageIndex: Int,
        message: Message,
        contentStore: ContentStore
    ) {
        ensureBranchTree(chat: &chat, contentStore: contentStore)
        var tree = chat.branchTree!

        if messageIndex < tree.activePath.count {
            // Update existing
            let existingId = tree.activePath[messageIndex]
            let oldHash = tree.nodes[existingId]!.contentHash
            let newHash = contentStore.addContentDelta(message.content, baseHash: oldHash)
            contentStore.releaseContent(oldHash)
            tree.nodes[existingId]!.role = message.role
            tree.nodes[existingId]!.contentHash = newHash
        } else if messageIndex == tree.activePath.count {
            // Append new
            let parentId = messageIndex == 0 ? nil : tree.activePath[messageIndex - 1]
            let newId = UUID().uuidString
            tree.nodes[newId] = BranchNode(
                id: newId,
                parentId: parentId,
                role: message.role,
                contentHash: contentStore.addContent(message.content)
            )
            tree.activePath.append(newId)
            if messageIndex == 0 { tree.rootId = newId }
        }

        tree.rootId = tree.activePath.first ?? ""
        chat.branchTree = tree
        chat.messages = tree.materializeActivePath(contentStore: contentStore)
    }

    // MARK: - Insert Message At Index

    /// Insert a new message at the given index, re-linking parent pointers.
    @discardableResult
    public static func insertMessageAtIndex(
        chat: inout Chat,
        messageIndex: Int,
        message: Message,
        contentStore: ContentStore
    ) -> String {
        ensureBranchTree(chat: &chat, contentStore: contentStore)
        var tree = chat.branchTree!

        let prevId = messageIndex > 0 ? tree.activePath[messageIndex - 1] : nil
        let nextId = messageIndex < tree.activePath.count ? tree.activePath[messageIndex] : nil
        let newId = UUID().uuidString

        tree.nodes[newId] = BranchNode(
            id: newId,
            parentId: prevId,
            role: message.role,
            contentHash: contentStore.addContent(message.content)
        )

        if let nextId {
            tree.nodes[nextId]!.parentId = newId
        }

        tree.activePath.insert(newId, at: messageIndex)
        if messageIndex == 0 { tree.rootId = newId }

        tree.rootId = tree.activePath.first ?? ""
        chat.branchTree = tree
        chat.messages = tree.materializeActivePath(contentStore: contentStore)
        return newId
    }

    // MARK: - Remove Message At Index

    /// Remove the message at the given index from the active path.
    public static func removeMessageAtIndex(
        chat: inout Chat,
        messageIndex: Int,
        contentStore: ContentStore,
        preserveNode: Bool = false
    ) {
        ensureBranchTree(chat: &chat, contentStore: contentStore)
        var tree = chat.branchTree!

        removeFromActivePath(
            tree: &tree,
            messageIndex: messageIndex,
            contentStore: contentStore,
            preserveNode: preserveNode
        )

        tree.rootId = tree.activePath.first ?? ""
        chat.branchTree = tree
        chat.messages = tree.materializeActivePath(contentStore: contentStore)
    }

    // MARK: - Move Message

    /// Move a message up or down within the active path.
    public static func moveMessage(
        chat: inout Chat,
        messageIndex: Int,
        direction: MoveDirection,
        contentStore: ContentStore
    ) {
        ensureBranchTree(chat: &chat, contentStore: contentStore)
        var tree = chat.branchTree!

        let targetIndex = direction == .up ? messageIndex - 1 : messageIndex + 1
        guard targetIndex >= 0, targetIndex < tree.activePath.count,
              messageIndex >= 0, messageIndex < tree.activePath.count else {
            chat.branchTree = tree
            chat.messages = tree.materializeActivePath(contentStore: contentStore)
            return
        }

        let start = min(messageIndex, targetIndex)
        let end = max(messageIndex, targetIndex)

        // Swap in active path
        var reordered = tree.activePath
        let movedId = reordered.remove(at: messageIndex)
        reordered.insert(movedId, at: targetIndex)
        tree.activePath = reordered

        // Fix parent pointers in affected range
        for index in start...(end + 1) {
            guard index < tree.activePath.count else { continue }
            let nodeId = tree.activePath[index]
            tree.nodes[nodeId]?.parentId = index == 0 ? nil : tree.activePath[index - 1]
        }

        tree.rootId = tree.activePath.first ?? ""
        chat.branchTree = tree
        chat.messages = tree.materializeActivePath(contentStore: contentStore)
    }

    public enum MoveDirection: Sendable {
        case up, down
    }

    // MARK: - Replace Message and Prune Following

    /// Replace a message and remove the specified number of following messages.
    public static func replaceMessageAndPruneFollowing(
        chat: inout Chat,
        messageIndex: Int,
        message: Message,
        contentStore: ContentStore,
        removeCount: Int = 0
    ) {
        ensureBranchTree(chat: &chat, contentStore: contentStore)
        var tree = chat.branchTree!

        // Replace or append the message
        if messageIndex < tree.activePath.count {
            let existingId = tree.activePath[messageIndex]
            let oldHash = tree.nodes[existingId]!.contentHash
            let newHash = contentStore.addContentDelta(message.content, baseHash: oldHash)
            contentStore.releaseContent(oldHash)
            tree.nodes[existingId]!.role = message.role
            tree.nodes[existingId]!.contentHash = newHash
        } else if messageIndex == tree.activePath.count {
            let parentId = messageIndex == 0 ? nil : tree.activePath[messageIndex - 1]
            let newId = UUID().uuidString
            tree.nodes[newId] = BranchNode(
                id: newId,
                parentId: parentId,
                role: message.role,
                contentHash: contentStore.addContent(message.content)
            )
            tree.activePath.append(newId)
        }

        // Remove following messages
        for _ in 0..<removeCount {
            let removeIdx = messageIndex + 1
            if removeIdx < tree.activePath.count {
                removeFromActivePath(tree: &tree, messageIndex: removeIdx, contentStore: contentStore)
            }
        }

        tree.rootId = tree.activePath.first ?? ""
        chat.branchTree = tree
        chat.messages = tree.materializeActivePath(contentStore: contentStore)
    }

    // MARK: - Truncate Active Path

    /// Truncate the active path after a specific node.
    public static func truncateActivePath(
        chat: inout Chat,
        afterNodeId: String,
        contentStore: ContentStore
    ) {
        var tree = chat.branchTree!
        if let idx = tree.activePath.firstIndex(of: afterNodeId) {
            tree.activePath = Array(tree.activePath.prefix(idx + 1))
        }
        chat.branchTree = tree
        chat.messages = tree.materializeActivePath(contentStore: contentStore)
    }

    // MARK: - Update Last Node Content

    /// Update the content of the last node in the active path.
    public static func updateLastNodeContent(
        chat: inout Chat,
        content: [ContentItem],
        contentStore: ContentStore
    ) {
        var tree = chat.branchTree!
        guard let lastId = tree.activePath.last, tree.nodes[lastId] != nil else { return }

        let oldHash = tree.nodes[lastId]!.contentHash
        let newHash = contentStore.addContentDelta(content, baseHash: oldHash)
        contentStore.releaseContent(oldHash)
        tree.nodes[lastId]!.contentHash = newHash

        chat.branchTree = tree
        chat.messages = tree.materializeActivePath(contentStore: contentStore)
    }

    // MARK: - Copy/Paste Branch Sequence

    /// Copy a sequence of nodes from the branch tree.
    public static func copyBranchSequence(
        chat: Chat,
        fromNodeId: String,
        toNodeId: String
    ) -> BranchClipboard? {
        guard let tree = chat.branchTree else { return nil }

        // Walk from toNodeId up to fromNodeId
        var nodeIds: [String] = []
        var cur: String? = toNodeId
        while let current = cur {
            nodeIds.insert(current, at: 0)
            if current == fromNodeId { break }
            cur = tree.nodes[current]?.parentId
        }

        guard nodeIds.first == fromNodeId else { return nil }

        var nodes: [String: BranchNode] = [:]
        for id in nodeIds {
            nodes[id] = tree.nodes[id]!
        }

        return BranchClipboard(nodeIds: nodeIds, sourceChat: chat.id, nodes: nodes)
    }

    /// Paste a clipboard sequence into the tree after a specific node.
    public static func pasteBranchSequence(
        chat: inout Chat,
        afterNodeId: String,
        clipboard: BranchClipboard,
        contentStore: ContentStore
    ) {
        var tree = chat.branchTree!

        // Create ID mapping for new copies
        var idMap: [String: String] = [:]
        for id in clipboard.nodeIds {
            idMap[id] = UUID().uuidString
        }

        var prevId = afterNodeId
        for origId in clipboard.nodeIds {
            let newId = idMap[origId]!
            let srcNode = clipboard.nodes[origId]!
            contentStore.retainContent(srcNode.contentHash)
            tree.nodes[newId] = BranchNode(
                id: newId,
                parentId: prevId,
                role: srcNode.role,
                contentHash: srcNode.contentHash
            )
            prevId = newId
        }

        if let insertIdx = tree.activePath.firstIndex(of: afterNodeId) {
            let prefix = Array(tree.activePath.prefix(insertIdx + 1))
            let newIds = clipboard.nodeIds.map { idMap[$0]! }
            tree.activePath = prefix + newIds
        }

        chat.branchTree = tree
        chat.messages = tree.materializeActivePath(contentStore: contentStore)
    }

    // MARK: - Node Metadata Operations

    /// Rename a branch node.
    public static func renameBranchNode(chat: inout Chat, nodeId: String, label: String) {
        chat.branchTree?.nodes[nodeId]?.label = label.isEmpty ? nil : label
    }

    /// Toggle star status on a node.
    public static func toggleNodeStar(chat: inout Chat, nodeId: String) {
        guard let starred = chat.branchTree?.nodes[nodeId]?.starred else {
            chat.branchTree?.nodes[nodeId]?.starred = true
            return
        }
        chat.branchTree?.nodes[nodeId]?.starred = starred ? nil : true
    }

    /// Toggle pin status on a node.
    public static func toggleNodePin(chat: inout Chat, nodeId: String) {
        guard let pinned = chat.branchTree?.nodes[nodeId]?.pinned else {
            chat.branchTree?.nodes[nodeId]?.pinned = true
            return
        }
        chat.branchTree?.nodes[nodeId]?.pinned = pinned ? nil : true
    }

    /// Update a node's role.
    public static func updateNodeRole(
        chat: inout Chat,
        nodeId: String,
        role: Role,
        contentStore: ContentStore
    ) {
        chat.branchTree?.nodes[nodeId]?.role = role
        if let tree = chat.branchTree {
            chat.messages = tree.materializeActivePath(contentStore: contentStore)
        }
    }

    // MARK: - Upsert With Auto Branch

    /// Result of an auto-branch upsert operation.
    public struct UpsertResult {
        public var newId: String?
        public var noOp: Bool

        public init(newId: String? = nil, noOp: Bool = false) {
            self.newId = newId
            self.noOp = noOp
        }
    }

    /// Smart upsert: preserves branches when content changes mid-chain.
    ///
    /// - No content/role change → no-op
    /// - Role-only change → in-place role update
    /// - Content change + last node → in-place update
    /// - Content change + mid-chain node → create sibling, truncate activePath
    public static func upsertWithAutoBranch(
        chat: inout Chat,
        messageIndex: Int,
        message: Message,
        contentStore: ContentStore
    ) -> UpsertResult {
        ensureBranchTree(chat: &chat, contentStore: contentStore)
        let tree = chat.branchTree!

        guard messageIndex < tree.activePath.count else {
            // No existing node — standard upsert
            upsertMessageAtIndex(chat: &chat, messageIndex: messageIndex, message: message, contentStore: contentStore)
            return UpsertResult()
        }

        let existingId = tree.activePath[messageIndex]
        let node = tree.nodes[existingId]!
        let contentChanged = !contentStore.isContentEqual(node.contentHash, content: message.content)
        let roleChanged = node.role != message.role

        // No-op
        if !contentChanged && !roleChanged {
            return UpsertResult(noOp: true)
        }

        // Role-only change
        if !contentChanged {
            chat.branchTree!.nodes[existingId]!.role = message.role
            chat.messages = chat.branchTree!.materializeActivePath(contentStore: contentStore)
            return UpsertResult()
        }

        // Content changed + last node
        let isLastNode = messageIndex == tree.activePath.count - 1
        if isLastNode {
            upsertMessageAtIndex(chat: &chat, messageIndex: messageIndex, message: message, contentStore: contentStore)
            return UpsertResult()
        }

        // Content changed + mid-chain: create sibling, truncate
        let newId = UUID().uuidString
        let parentId = node.parentId

        chat.branchTree!.nodes[newId] = BranchNode(
            id: newId,
            parentId: parentId,
            role: message.role,
            contentHash: contentStore.addContentDelta(message.content, baseHash: node.contentHash)
        )

        chat.branchTree!.activePath = Array(chat.branchTree!.activePath.prefix(messageIndex)) + [newId]
        chat.branchTree!.rootId = chat.branchTree!.activePath.first ?? ""
        chat.messages = chat.branchTree!.materializeActivePath(contentStore: contentStore)

        return UpsertResult(newId: newId)
    }

    // MARK: - Private Helpers

    /// Remove a node from the active path, re-linking children to parent.
    private static func removeFromActivePath(
        tree: inout BranchTree,
        messageIndex: Int,
        contentStore: ContentStore,
        preserveNode: Bool = false
    ) {
        guard messageIndex < tree.activePath.count else { return }
        let nodeId = tree.activePath[messageIndex]
        let parentId = tree.nodes[nodeId]?.parentId

        // Re-link children of the removed node
        for (id, node) in tree.nodes where node.parentId == nodeId {
            tree.nodes[id]!.parentId = parentId
        }

        if !preserveNode {
            if let hash = tree.nodes[nodeId]?.contentHash {
                contentStore.releaseContent(hash)
            }
            tree.nodes.removeValue(forKey: nodeId)
        }
        tree.activePath.remove(at: messageIndex)
    }
}
