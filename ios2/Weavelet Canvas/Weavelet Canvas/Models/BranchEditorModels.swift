import SwiftUI

// MARK: - UI Branch Node (presentation layer)

struct UIBranchNode: Identifiable, Equatable, Hashable {
    let id: String          // domain BranchNode id
    var role: MessageRole
    var content: String
    var label: String?
    var parentID: String?
    var isActive: Bool = false
    var isStarred: Bool = false
    var isPinned: Bool = false
    var position: CGPoint = .zero  // layout position

    var contentPreview: String {
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.count <= 80 { return trimmed }
        return String(trimmed.prefix(80)) + "…"
    }
}

// MARK: - Branch Edge

struct BranchEdge: Identifiable, Equatable {
    let id: String
    let sourceID: String
    let targetID: String
    var isActive: Bool = false
}

// MARK: - Interaction Mode

enum BranchInteractionMode: String, CaseIterable {
    case pan
    case select

    var icon: String {
        switch self {
        case .pan: "hand.draw"
        case .select: "rectangle.dashed"
        }
    }

    var label: String {
        switch self {
        case .pan: "Pan"
        case .select: "Select"
        }
    }
}

// MARK: - Branch Editor View Model (derives from ChatViewModel)

@Observable
class BranchEditorViewModel {
    // Source of truth
    private weak var chatViewModel: ChatViewModel?

    // Presentation state
    var nodes: [UIBranchNode] = []
    var edges: [BranchEdge] = []
    var selectedNodeIDs: Set<String> = []
    var interactionMode: BranchInteractionMode = .pan
    var zoom: CGFloat = 1.0
    var offset: CGSize = .zero
    var isSearching: Bool = false
    var searchQuery: String = "" { didSet { performSearch() } }
    var searchCurrentMatch: Int = 0
    var searchTotalMatches: Int = 0
    /// Node IDs that match the current search query, in order.
    private(set) var searchMatchNodeIDs: [String] = []

    // Detail modal
    var detailNode: UIBranchNode? = nil

    static let nodeWidth: CGFloat = 280
    static let nodeHeight: CGFloat = 90
    static let nodeSpacingX: CGFloat = 80
    static let nodeSpacingY: CGFloat = 100
    static let minZoom: CGFloat = 0.2
    static let maxZoom: CGFloat = 3.0

    var canUndo: Bool { chatViewModel?.canGoBack ?? false }
    var canRedo: Bool { chatViewModel?.canGoForward ?? false }

    init(chatViewModel: ChatViewModel) {
        self.chatViewModel = chatViewModel
        rebuildFromDomain()
    }

    // MARK: - Sync from Domain

    func rebuildFromDomain() {
        guard let vm = chatViewModel,
              let chat = vm.currentChat,
              let tree = chat.branchTree else {
            nodes = []
            edges = []
            return
        }

        let activePath = Set(tree.activePath)

        nodes = tree.nodes.values.map { node in
            let content = ContentStore.resolveContent(vm.contentStore, hash: node.contentHash)
            let text = content.toText()
            return UIBranchNode(
                id: node.id,
                role: node.role,
                content: text,
                label: node.label,
                parentID: node.parentId,
                isActive: activePath.contains(node.id),
                isStarred: node.starred ?? false,
                isPinned: node.pinned ?? false
            )
        }

        buildEdges()
        layoutNodes()

        // Re-run search if active to keep results in sync with updated nodes
        if isSearching, !searchQuery.isEmpty {
            performSearch()
        }
    }

    func buildEdges() {
        let activeSet = Set(nodes.filter(\.isActive).map(\.id))
        edges = nodes.compactMap { node in
            guard let parentID = node.parentID else { return nil }
            return BranchEdge(
                id: "\(parentID)-\(node.id)",
                sourceID: parentID,
                targetID: node.id,
                isActive: activeSet.contains(node.id) && activeSet.contains(parentID)
            )
        }
    }

    func layoutNodes() {
        guard !nodes.isEmpty else { return }

        var childrenMap: [String: [String]] = [:]
        for node in nodes {
            if let pid = node.parentID {
                childrenMap[pid, default: []].append(node.id)
            }
        }

        let nodeUnit = Self.nodeWidth + Self.nodeSpacingX
        let rowHeight: CGFloat = Self.nodeHeight + Self.nodeSpacingY

        var subtreeWidth: [String: CGFloat] = [:]
        func computeWidth(_ id: String) -> CGFloat {
            let children = childrenMap[id] ?? []
            if children.isEmpty {
                subtreeWidth[id] = 1
                return 1
            }
            let total = children.reduce(CGFloat(0)) { $0 + computeWidth($1) }
            subtreeWidth[id] = total
            return total
        }

        let roots = nodes.filter { $0.parentID == nil }
        for root in roots { _ = computeWidth(root.id) }

        func assignPositions(_ id: String, depth: Int, leftX: CGFloat) {
            let w = subtreeWidth[id] ?? 1
            let centerX = leftX + (w * nodeUnit - Self.nodeSpacingX) / 2 - Self.nodeWidth / 2

            if let i = nodes.firstIndex(where: { $0.id == id }) {
                nodes[i].position = CGPoint(x: centerX, y: CGFloat(depth) * rowHeight)
            }

            var childLeft = leftX
            for child in (childrenMap[id] ?? []) {
                assignPositions(child, depth: depth + 1, leftX: childLeft)
                childLeft += (subtreeWidth[child] ?? 1) * nodeUnit
            }
        }

        var rootLeft: CGFloat = 0
        for root in roots {
            assignPositions(root.id, depth: 0, leftX: rootLeft)
            rootLeft += (subtreeWidth[root.id] ?? 1) * nodeUnit
        }
    }

    // MARK: - Actions (delegate to ChatViewModel)

    func selectNode(_ id: String) {
        selectedNodeIDs = [id]
    }

    func navigateToNode(_ id: String) {
        guard let vm = chatViewModel,
              let _ = vm.currentChatIndex,
              let tree = vm.currentChat?.branchTree else { return }

        let path = tree.buildPathToLeaf(from: id)
        if let first = path.first {
            vm.switchBranch(at: tree.rootId, to: first)
        }
        rebuildFromDomain()
    }

    func toggleStarred(_ id: String) {
        guard let vm = chatViewModel, let chatIndex = vm.currentChatIndex else { return }
        vm.chats = BranchService.toggleNodeStar(chats: vm.chats, chatIndex: chatIndex, nodeId: id)
        vm.scheduleSave()
        rebuildFromDomain()
    }

    func togglePinned(_ id: String) {
        guard let vm = chatViewModel, let chatIndex = vm.currentChatIndex else { return }
        vm.chats = BranchService.toggleNodePin(chats: vm.chats, chatIndex: chatIndex, nodeId: id)
        vm.scheduleSave()
        rebuildFromDomain()
    }

    func deleteNode(_ id: String) {
        chatViewModel?.deleteBranch(nodeId: id)
        rebuildFromDomain()
    }

    func undo() {
        chatViewModel?.undo()
        rebuildFromDomain()
    }

    func redo() {
        chatViewModel?.redo()
        rebuildFromDomain()
    }

    func fitToView(canvasSize: CGSize) {
        guard !nodes.isEmpty else { return }
        let minX = nodes.map(\.position.x).min()!
        let maxX = nodes.map(\.position.x).max()! + Self.nodeWidth
        let minY = nodes.map(\.position.y).min()!
        let maxY = nodes.map(\.position.y).max()! + Self.nodeHeight

        let graphW = maxX - minX + 80
        let graphH = maxY - minY + 80

        let scaleX = canvasSize.width / graphW
        let scaleY = canvasSize.height / graphH
        zoom = min(min(scaleX, scaleY), 1.5)

        let centerX = (minX + maxX) / 2
        let centerY = (minY + maxY) / 2
        offset = CGSize(
            width: canvasSize.width / 2 - centerX * zoom,
            height: canvasSize.height / 2 - centerY * zoom
        )
    }

    func zoomIn() { zoom = min(zoom * 1.25, Self.maxZoom) }
    func zoomOut() { zoom = max(zoom / 1.25, Self.minZoom) }

    func searchNext() {
        guard searchTotalMatches > 0 else { return }
        searchCurrentMatch = (searchCurrentMatch % searchTotalMatches) + 1
        scrollToCurrentMatch()
    }

    func searchPrevious() {
        guard searchTotalMatches > 0 else { return }
        searchCurrentMatch = searchCurrentMatch <= 1 ? searchTotalMatches : searchCurrentMatch - 1
        scrollToCurrentMatch()
    }

    func performSearch() {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else {
            searchMatchNodeIDs = []
            searchTotalMatches = 0
            searchCurrentMatch = 0
            return
        }

        // Search across all nodes' content
        searchMatchNodeIDs = nodes.compactMap { node in
            node.content.lowercased().contains(query) || (node.label?.lowercased().contains(query) == true)
                ? node.id : nil
        }
        searchTotalMatches = searchMatchNodeIDs.count
        searchCurrentMatch = searchTotalMatches > 0 ? 1 : 0
        scrollToCurrentMatch()
    }

    /// Whether a node is the current search match.
    func isCurrentSearchMatch(_ nodeId: String) -> Bool {
        guard searchCurrentMatch > 0, searchCurrentMatch <= searchMatchNodeIDs.count else { return false }
        return searchMatchNodeIDs[searchCurrentMatch - 1] == nodeId
    }

    /// Whether a node matches the search query (any match).
    func isSearchMatch(_ nodeId: String) -> Bool {
        searchMatchNodeIDs.contains(nodeId)
    }

    private func scrollToCurrentMatch() {
        guard searchCurrentMatch > 0, searchCurrentMatch <= searchMatchNodeIDs.count else { return }
        let targetId = searchMatchNodeIDs[searchCurrentMatch - 1]
        guard let node = nodes.first(where: { $0.id == targetId }) else { return }
        // Center the viewport on the matched node
        offset = CGSize(
            width: -node.position.x * zoom + 200,
            height: -node.position.y * zoom + 200
        )
    }
}

