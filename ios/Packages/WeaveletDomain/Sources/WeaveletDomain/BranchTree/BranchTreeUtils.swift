import Foundation

// MARK: - Branch Tree Utility Functions

/// Utility functions for navigating and manipulating BranchTree structures.
extension BranchTree {

    /// Convert the active path node IDs to an array of Messages
    /// by resolving content hashes from the content store.
    public func materializeActivePath(contentStore: ContentStore) -> [Message] {
        activePath.compactMap { id in
            guard let node = nodes[id] else { return nil }
            return Message(
                role: node.role,
                content: contentStore.resolveContent(node.contentHash)
            )
        }
    }

    /// Get all immediate children of a node.
    public func getChildren(of nodeId: String) -> [BranchNode] {
        nodes.values.filter { $0.parentId == nodeId }
    }

    /// Get all siblings of a node (children of same parent), including the node itself.
    public func getSiblings(of nodeId: String) -> [BranchNode] {
        guard let node = nodes[nodeId], let parentId = node.parentId else {
            // Root node has no siblings
            if let node = nodes[nodeId] { return [node] }
            return []
        }
        return getChildren(of: parentId)
    }

    /// Build a path from root through the given node down to the deepest leaf.
    /// When multiple children exist, prefers the most recently created.
    public func buildPathToLeaf(from nodeId: String) -> [String] {
        // Walk from nodeId up to root
        var ancestors: [String] = []
        var cur: String? = nodeId
        while let current = cur {
            ancestors.insert(current, at: 0)
            cur = nodes[current]?.parentId
        }

        // Extend from nodeId down to deepest child (prefer most recent)
        var tip = nodeId
        while true {
            let children = getChildren(of: tip)
            if children.isEmpty { break }
            let mostRecent = children.max(by: { $0.createdAt < $1.createdAt })!
            ancestors.append(mostRecent.id)
            tip = mostRecent.id
        }

        return ancestors
    }

    /// Find the Lowest Common Ancestor of two nodes.
    public func findLCA(_ nodeIdA: String, _ nodeIdB: String) -> String? {
        var ancestorsA = Set<String>()
        var cur: String? = nodeIdA
        while let current = cur {
            ancestorsA.insert(current)
            cur = nodes[current]?.parentId
        }

        cur = nodeIdB
        while let current = cur {
            if ancestorsA.contains(current) { return current }
            cur = nodes[current]?.parentId
        }
        return nil
    }

    /// Collect a node and all its descendants (BFS).
    public func collectDescendants(of nodeId: String) -> Set<String> {
        var result = Set<String>()
        var queue = [nodeId]
        while !queue.isEmpty {
            let id = queue.removeLast()
            result.insert(id)
            for child in getChildren(of: id) {
                queue.append(child.id)
            }
        }
        return result
    }

    /// Convert a flat array of messages into a BranchTree.
    public static func fromFlatMessages(
        _ messages: [Message],
        contentStore: ContentStore
    ) -> BranchTree {
        var treeNodes: [String: BranchNode] = [:]
        var ids: [String] = []
        let now = Date().timeIntervalSince1970 * 1000

        for (i, message) in messages.enumerated() {
            let id = UUID().uuidString
            ids.append(id)
            let contentHash = contentStore.addContent(message.content)
            treeNodes[id] = BranchNode(
                id: id,
                parentId: i == 0 ? nil : ids[i - 1],
                role: message.role,
                contentHash: contentHash,
                createdAt: now - Double(messages.count - i) * 1000
            )
        }

        return BranchTree(
            nodes: treeNodes,
            rootId: ids.first ?? "",
            activePath: ids
        )
    }
}

// MARK: - Regenerate Target

/// Information about which message to remove/replace during regeneration.
public struct RegenerateTarget: Sendable, Equatable {
    public enum SubmitMode: String, Sendable {
        case append
        case insert
    }

    public var removeIndex: Int
    public var submitMode: SubmitMode
    public var insertIndex: Int

    public init(removeIndex: Int, submitMode: SubmitMode, insertIndex: Int) {
        self.removeIndex = removeIndex
        self.submitMode = submitMode
        self.insertIndex = insertIndex
    }

    /// Determine which message to remove/replace when regenerating.
    public static func resolve(
        role: Role,
        messageIndex: Int,
        messagesLength: Int
    ) -> RegenerateTarget? {
        if role == .system { return nil }

        if role == .assistant {
            let afterRemoval = messagesLength - 1
            return RegenerateTarget(
                removeIndex: messageIndex,
                submitMode: messageIndex >= afterRemoval ? .append : .insert,
                insertIndex: messageIndex
            )
        }

        // User: target the next assistant message
        let nextIndex = messageIndex + 1
        let hasNext = nextIndex < messagesLength
        let lengthAfterRemoval = hasNext ? messagesLength - 1 : messagesLength
        return RegenerateTarget(
            removeIndex: hasNext ? nextIndex : -1,
            submitMode: nextIndex >= lengthAfterRemoval ? .append : .insert,
            insertIndex: nextIndex
        )
    }
}
