import Foundation

// MARK: - BranchNode

struct BranchNode: Codable, Hashable, Identifiable {
    let id: String
    var parentId: String?
    var role: Role
    var contentHash: String
    let createdAt: Double  // Unix timestamp (ms), matches Web's Date.now()
    var label: String?
    var starred: Bool?
    var pinned: Bool?

    init(
        id: String = UUID().uuidString,
        parentId: String?,
        role: Role,
        contentHash: String,
        createdAt: Double = Date().timeIntervalSince1970 * 1000,
        label: String? = nil,
        starred: Bool? = nil,
        pinned: Bool? = nil
    ) {
        self.id = id
        self.parentId = parentId
        self.role = role
        self.contentHash = contentHash
        self.createdAt = createdAt
        self.label = label
        self.starred = starred
        self.pinned = pinned
    }
}

// MARK: - BranchTree

struct BranchTree: Codable, Hashable {
    var nodes: [String: BranchNode]
    var rootId: String
    var activePath: [String]

    init(nodes: [String: BranchNode] = [:], rootId: String = "", activePath: [String] = []) {
        self.nodes = nodes
        self.rootId = rootId
        self.activePath = activePath
    }
}

// MARK: - BranchTree Helpers

extension BranchTree {
    /// Get children of a given node, sorted by createdAt descending (most recent first, matching Web).
    func childrenOf(_ nodeId: String) -> [BranchNode] {
        nodes.values
            .filter { $0.parentId == nodeId }
            .sorted { $0.createdAt > $1.createdAt }
    }

    /// Get sibling nodes (same parent), sorted by createdAt descending (most recent first, matching Web).
    func siblingsOf(_ nodeId: String) -> [BranchNode] {
        guard let node = nodes[nodeId] else { return [] }
        return nodes.values
            .filter { $0.parentId == node.parentId && $0.id != nodeId }
            .sorted { $0.createdAt > $1.createdAt }
    }

    /// Build the path from root to a given node (inclusive).
    func buildPathTo(_ nodeId: String) -> [String] {
        var path: [String] = []
        var current: String? = nodeId
        while let id = current, let node = nodes[id] {
            path.insert(id, at: 0)
            current = node.parentId
        }
        return path
    }

    /// Build path from a node to its deepest first-child leaf.
    func buildPathToLeaf(from nodeId: String) -> [String] {
        var path = buildPathTo(nodeId)
        var current = nodeId
        while true {
            let children = childrenOf(current)
            guard let first = children.first else { break }
            path.append(first.id)
            current = first.id
        }
        return path
    }

    /// Collect all descendant node IDs of a given node.
    func collectDescendants(of nodeId: String) -> Set<String> {
        var result = Set<String>()
        var queue = [nodeId]
        while !queue.isEmpty {
            let current = queue.removeFirst()
            for child in childrenOf(current) {
                result.insert(child.id)
                queue.append(child.id)
            }
        }
        return result
    }

    /// Whether a node is on the active path.
    func isOnActivePath(_ nodeId: String) -> Bool {
        activePath.contains(nodeId)
    }
}

// MARK: - BranchClipboard (v1: type definition only, not persisted)

struct BranchClipboard: Codable, Hashable {
    let nodeIds: [String]
    let sourceChat: String
    let nodes: [String: BranchNode]
}
