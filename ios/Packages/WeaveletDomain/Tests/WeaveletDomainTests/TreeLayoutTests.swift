import Testing
import Foundation
@testable import WeaveletDomain

// MARK: - TreeLayout Tests

@Test func emptyTreeLayout() {
    let tree = BranchTree()
    let result = TreeLayoutEngine.layout(tree)
    #expect(result.nodes.isEmpty)
    #expect(result.totalWidth == 0)
    #expect(result.totalHeight == 0)
}

@Test func singleNodeLayout() {
    let node = BranchNode(id: "a", role: .user, contentHash: "h1")
    let tree = BranchTree(nodes: ["a": node], rootId: "a", activePath: ["a"])
    let result = TreeLayoutEngine.layout(tree)
    #expect(result.nodes.count == 1)
    let layout = result.nodes["a"]!
    #expect(layout.x == 0)
    #expect(layout.y == 0)
    #expect(layout.depth == 0)
    #expect(result.totalWidth == TreeLayoutEngine.nodeWidth)
    #expect(result.totalHeight == TreeLayoutEngine.nodeHeight)
}

@Test func linearChainLayout() {
    // a → b → c (linear, no branches)
    let nodes: [String: BranchNode] = [
        "a": BranchNode(id: "a", role: .user, contentHash: "h1", createdAt: 1000),
        "b": BranchNode(id: "b", parentId: "a", role: .assistant, contentHash: "h2", createdAt: 2000),
        "c": BranchNode(id: "c", parentId: "b", role: .user, contentHash: "h3", createdAt: 3000),
    ]
    let tree = BranchTree(nodes: nodes, rootId: "a", activePath: ["a", "b", "c"])
    let result = TreeLayoutEngine.layout(tree)

    #expect(result.nodes.count == 3)

    // All nodes should be vertically aligned (same x)
    let ax = result.nodes["a"]!.x
    let bx = result.nodes["b"]!.x
    let cx = result.nodes["c"]!.x
    #expect(ax == bx)
    #expect(bx == cx)

    // Depths should increase
    #expect(result.nodes["a"]!.depth == 0)
    #expect(result.nodes["b"]!.depth == 1)
    #expect(result.nodes["c"]!.depth == 2)

    // Y positions should increase
    #expect(result.nodes["a"]!.y < result.nodes["b"]!.y)
    #expect(result.nodes["b"]!.y < result.nodes["c"]!.y)
}

@Test func branchingLayout() {
    // a → b1, a → b2 (fork at root)
    let nodes: [String: BranchNode] = [
        "a":  BranchNode(id: "a", role: .user, contentHash: "h1", createdAt: 1000),
        "b1": BranchNode(id: "b1", parentId: "a", role: .assistant, contentHash: "h2", createdAt: 2000),
        "b2": BranchNode(id: "b2", parentId: "a", role: .assistant, contentHash: "h3", createdAt: 3000),
    ]
    let tree = BranchTree(nodes: nodes, rootId: "a", activePath: ["a", "b2"])
    let result = TreeLayoutEngine.layout(tree)

    #expect(result.nodes.count == 3)

    // Children should be at same depth
    #expect(result.nodes["b1"]!.depth == 1)
    #expect(result.nodes["b2"]!.depth == 1)

    // Children should be horizontally separated
    let b1x = result.nodes["b1"]!.x
    let b2x = result.nodes["b2"]!.x
    #expect(b1x < b2x)

    // Parent should be centered between children
    let ax = result.nodes["a"]!.x
    let midpoint = (b1x + b2x) / 2
    #expect(abs(ax - midpoint) < 1.0)
}

@Test func deepBranchLayout() {
    // a → b → c1, c → c2 (branch at depth 2)
    let nodes: [String: BranchNode] = [
        "a":  BranchNode(id: "a", role: .user, contentHash: "h1", createdAt: 1000),
        "b":  BranchNode(id: "b", parentId: "a", role: .assistant, contentHash: "h2", createdAt: 2000),
        "c1": BranchNode(id: "c1", parentId: "b", role: .user, contentHash: "h3", createdAt: 3000),
        "c2": BranchNode(id: "c2", parentId: "b", role: .user, contentHash: "h4", createdAt: 4000),
    ]
    let tree = BranchTree(nodes: nodes, rootId: "a", activePath: ["a", "b", "c1"])
    let result = TreeLayoutEngine.layout(tree)

    #expect(result.nodes.count == 4)

    // c1 and c2 should be horizontally separated
    #expect(result.nodes["c1"]!.x < result.nodes["c2"]!.x)

    // Total width should accommodate both branches
    #expect(result.totalWidth > TreeLayoutEngine.nodeWidth)
}

@Test func layoutRankSeparation() {
    let nodes: [String: BranchNode] = [
        "a": BranchNode(id: "a", role: .user, contentHash: "h1", createdAt: 1000),
        "b": BranchNode(id: "b", parentId: "a", role: .assistant, contentHash: "h2", createdAt: 2000),
    ]
    let tree = BranchTree(nodes: nodes, rootId: "a", activePath: ["a", "b"])
    let result = TreeLayoutEngine.layout(tree)

    let yDiff = result.nodes["b"]!.y - result.nodes["a"]!.y
    let expected = TreeLayoutEngine.nodeHeight + TreeLayoutEngine.rankSeparation
    #expect(abs(yDiff - expected) < 0.001)
}
