import Foundation

/// The branch tree structure for a conversation.
/// Contains all message nodes and the currently active path through the tree.
public struct BranchTree: Codable, Sendable, Equatable {
    /// All nodes keyed by their ID.
    public var nodes: [String: BranchNode]
    /// The ID of the root node.
    public var rootId: String
    /// The current active path from root to leaf (ordered list of node IDs).
    public var activePath: [String]

    public init(
        nodes: [String: BranchNode] = [:],
        rootId: String = "",
        activePath: [String] = []
    ) {
        self.nodes = nodes
        self.rootId = rootId
        self.activePath = activePath
    }
}

/// Clipboard data for branch copy/paste operations.
public struct BranchClipboard: Codable, Sendable, Equatable {
    public var nodeIds: [String]
    public var sourceChat: String
    public var nodes: [String: BranchNode]

    public init(nodeIds: [String], sourceChat: String, nodes: [String: BranchNode]) {
        self.nodeIds = nodeIds
        self.sourceChat = sourceChat
        self.nodes = nodes
    }
}
