import Foundation

/// Computed position for a tree node in 2D space.
public struct TreeNodeLayout: Sendable, Equatable {
    public let id: String
    public let x: Double
    public let y: Double
    public let depth: Int
    public let parentId: String?

    public init(id: String, x: Double, y: Double, depth: Int, parentId: String?) {
        self.id = id
        self.x = x
        self.y = y
        self.depth = depth
        self.parentId = parentId
    }
}

/// Result of tree layout computation.
public struct TreeLayoutResult: Sendable, Equatable {
    public let nodes: [String: TreeNodeLayout]
    public let totalWidth: Double
    public let totalHeight: Double

    public init(nodes: [String: TreeNodeLayout], totalWidth: Double, totalHeight: Double) {
        self.nodes = nodes
        self.totalWidth = totalWidth
        self.totalHeight = totalHeight
    }
}

/// Lays out a BranchTree using a Reingold-Tilford-style algorithm.
///
/// Top-to-bottom layout. Each node is assigned (x, y) coordinates.
/// Parameters mirror the Web version's dagre settings.
public enum TreeLayoutEngine {
    /// Node width in points.
    public static let nodeWidth: Double = 240
    /// Node height in points.
    public static let nodeHeight: Double = 72
    /// Horizontal gap between sibling subtrees.
    public static let nodeSeparation: Double = 32
    /// Vertical gap between ranks (parent to child).
    public static let rankSeparation: Double = 60

    /// Compute layout for a branch tree.
    public static func layout(_ tree: BranchTree) -> TreeLayoutResult {
        guard !tree.nodes.isEmpty, !tree.rootId.isEmpty,
              tree.nodes[tree.rootId] != nil else {
            return TreeLayoutResult(nodes: [:], totalWidth: 0, totalHeight: 0)
        }

        // Build children map, sorted by createdAt for stable ordering
        var childrenMap: [String: [String]] = [:]
        for (id, node) in tree.nodes {
            if let pid = node.parentId {
                childrenMap[pid, default: []].append(id)
            }
        }
        // Sort children by createdAt
        for (key, children) in childrenMap {
            childrenMap[key] = children.sorted { a, b in
                let ta = tree.nodes[a]?.createdAt ?? 0
                let tb = tree.nodes[b]?.createdAt ?? 0
                return ta < tb
            }
        }

        // Phase 1: Compute subtree widths (bottom-up)
        var subtreeWidths: [String: Double] = [:]
        computeSubtreeWidth(tree.rootId, childrenMap: childrenMap, widths: &subtreeWidths)

        // Phase 2: Assign positions (top-down)
        var positions: [String: TreeNodeLayout] = [:]
        assignPositions(
            nodeId: tree.rootId,
            depth: 0,
            leftX: 0,
            childrenMap: childrenMap,
            subtreeWidths: subtreeWidths,
            tree: tree,
            positions: &positions
        )

        // Compute bounds
        var maxX: Double = 0
        var maxY: Double = 0
        for layout in positions.values {
            maxX = max(maxX, layout.x + nodeWidth)
            maxY = max(maxY, layout.y + nodeHeight)
        }

        return TreeLayoutResult(
            nodes: positions,
            totalWidth: maxX,
            totalHeight: maxY
        )
    }

    // MARK: - Private

    private static func computeSubtreeWidth(
        _ nodeId: String,
        childrenMap: [String: [String]],
        widths: inout [String: Double]
    ) {
        let children = childrenMap[nodeId] ?? []
        if children.isEmpty {
            widths[nodeId] = nodeWidth
            return
        }

        for child in children {
            computeSubtreeWidth(child, childrenMap: childrenMap, widths: &widths)
        }

        let childrenTotalWidth = children.reduce(0.0) { sum, cid in
            sum + (widths[cid] ?? nodeWidth)
        }
        let gaps = Double(max(0, children.count - 1)) * nodeSeparation
        widths[nodeId] = max(nodeWidth, childrenTotalWidth + gaps)
    }

    private static func assignPositions(
        nodeId: String,
        depth: Int,
        leftX: Double,
        childrenMap: [String: [String]],
        subtreeWidths: [String: Double],
        tree: BranchTree,
        positions: inout [String: TreeNodeLayout]
    ) {
        let myWidth = subtreeWidths[nodeId] ?? nodeWidth
        let centerX = leftX + (myWidth - nodeWidth) / 2.0
        let y = Double(depth) * (nodeHeight + rankSeparation)

        positions[nodeId] = TreeNodeLayout(
            id: nodeId,
            x: centerX,
            y: y,
            depth: depth,
            parentId: tree.nodes[nodeId]?.parentId
        )

        let children = childrenMap[nodeId] ?? []
        guard !children.isEmpty else { return }

        var childLeftX = leftX
        for child in children {
            let childWidth = subtreeWidths[child] ?? nodeWidth
            assignPositions(
                nodeId: child,
                depth: depth + 1,
                leftX: childLeftX,
                childrenMap: childrenMap,
                subtreeWidths: subtreeWidths,
                tree: tree,
                positions: &positions
            )
            childLeftX += childWidth + nodeSeparation
        }
    }
}
