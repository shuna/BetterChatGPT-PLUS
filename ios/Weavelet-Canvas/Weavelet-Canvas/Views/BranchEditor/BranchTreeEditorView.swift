import SwiftUI
import WeaveletDomain

/// Full branch tree editor with zoom, pan, node selection, and context menus.
/// Replaces the Web version's ReactFlow-based BranchEditorCanvas.
struct BranchTreeEditorView: View {
    @Environment(AppState.self) private var appState

    @State private var zoom: CGFloat = 1.0
    @State private var selectedNodeId: String?
    @State private var searchText = ""
    @State private var isSearchVisible = false
    @State private var renameNodeId: String?
    @State private var renameText = ""
    @State private var detailNode: BranchNode?
    @State private var compareTargetId: String?

    private var conversation: ConversationViewModel { appState.conversation }
    private var tree: BranchTree? { conversation.chat.branchTree }

    var body: some View {
        ZStack {
            if let tree, !tree.nodes.isEmpty {
                let layout = TreeLayoutEngine.layout(tree)
                let activePathSet = Set(tree.activePath)

                treeCanvas(tree: tree, layout: layout, activePathSet: activePathSet)
                    .overlay(alignment: .topTrailing) { toolbarOverlay }
                    .overlay(alignment: .top) { searchBarOverlay(tree: tree) }
            } else {
                ContentUnavailableView(
                    "No Branch Tree",
                    systemImage: "point.3.connected.trianglepath.dotted",
                    description: Text("Send a message to create the conversation tree.")
                )
            }
        }
        .navigationTitle("Branch Editor")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { isSearchVisible.toggle() } label: {
                    Image(systemName: "magnifyingglass")
                }
            }
        }
        .alert("Rename Node", isPresented: .init(
            get: { renameNodeId != nil },
            set: { if !$0 { renameNodeId = nil } }
        )) {
            TextField("Label", text: $renameText)
            Button("Save") {
                if let id = renameNodeId {
                    conversation.renameBranchNode(nodeId: id, label: renameText)
                    conversation.syncToList(appState.chatList)
                }
                renameNodeId = nil
            }
            Button("Cancel", role: .cancel) { renameNodeId = nil }
        }
        .sheet(item: $detailNode) { node in
            MessageDetailModal(
                node: node,
                contentStore: conversation.contentStore
            )
        }
        .sheet(isPresented: Binding(
            get: { compareNodes != nil },
            set: { if !$0 { compareNodes = nil } }
        )) {
            if let (nodeA, nodeB) = compareNodes {
                BranchCompareView(
                    nodeA: nodeA,
                    nodeB: nodeB,
                    contentStore: conversation.contentStore
                )
            }
        }
    }

    /// Node IDs matching current search text.
    private var searchMatchIds: Set<String> {
        guard let tree, !searchText.isEmpty else { return [] }
        let query = searchText.lowercased()
        return Set(tree.nodes.values.filter { node in
            let text = conversation.contentStore.resolveContentText(node.contentHash).lowercased()
            return text.contains(query) || (node.label?.lowercased().contains(query) ?? false)
        }.map(\.id))
    }

    // MARK: - Tree Canvas

    @ViewBuilder
    private func treeCanvas(
        tree: BranchTree,
        layout: TreeLayoutResult,
        activePathSet: Set<String>
    ) -> some View {
        let padding: CGFloat = 40
        let contentSize = CGSize(
            width: (layout.totalWidth + padding * 2) * zoom,
            height: (layout.totalHeight + padding * 2) * zoom
        )

        ScrollView([.horizontal, .vertical], showsIndicators: true) {
            ZStack(alignment: .topLeading) {
                // Edges
                TreeEdgesView(layout: layout, activePathSet: activePathSet)
                    .frame(
                        width: layout.totalWidth + padding * 2,
                        height: layout.totalHeight + padding * 2
                    )

                // Nodes
                ForEach(Array(layout.nodes.values), id: \.id) { nodeLayout in
                    if let node = tree.nodes[nodeLayout.id] {
                        let preview = conversation.contentStore
                            .resolveContentText(node.contentHash)

                        BranchNodeCardView(
                            node: node,
                            contentPreview: String(preview.prefix(80)),
                            isOnActivePath: activePathSet.contains(node.id),
                            isSelected: selectedNodeId == node.id,
                            isSearchMatch: searchMatchIds.contains(node.id),
                            isCompareTarget: compareTargetId == node.id,
                            onTap: { handleNodeTap(node: node) },
                            onDoubleTap: { handleNodeDoubleTap(node: node) }
                        )
                        .contextMenu { nodeContextMenu(node: node, tree: tree) }
                        .position(
                            x: nodeLayout.x + TreeLayoutEngine.nodeWidth / 2 + padding,
                            y: nodeLayout.y + TreeLayoutEngine.nodeHeight / 2 + padding
                        )
                    }
                }
            }
            .frame(width: contentSize.width, height: contentSize.height)
            .scaleEffect(zoom, anchor: .topLeading)
            // Undo actual scale so the frame encloses the scaled content
            .frame(
                width: (layout.totalWidth + padding * 2) * zoom,
                height: (layout.totalHeight + padding * 2) * zoom
            )
        }
        .gesture(
            MagnifyGesture()
                .onChanged { value in
                    let newZoom = zoom * value.magnification
                    zoom = min(max(newZoom, 0.2), 3.0)
                }
        )
        .background(Color(.systemGroupedBackground))
    }

    // MARK: - Toolbar Overlay

    @ViewBuilder
    private var toolbarOverlay: some View {
        VStack(spacing: 8) {
            // Zoom controls
            VStack(spacing: 0) {
                Button { withAnimation { zoom = min(zoom + 0.2, 3.0) } } label: {
                    Image(systemName: "plus")
                        .frame(width: 36, height: 36)
                }
                Divider()
                Button { withAnimation { zoom = max(zoom - 0.2, 0.2) } } label: {
                    Image(systemName: "minus")
                        .frame(width: 36, height: 36)
                }
                Divider()
                Button { withAnimation { zoom = 1.0 } } label: {
                    Text("1:1")
                        .font(.caption2)
                        .frame(width: 36, height: 36)
                }
            }
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))

            // Undo/Redo
            VStack(spacing: 0) {
                Button {
                    conversation.undo()
                    conversation.syncToList(appState.chatList)
                } label: {
                    Image(systemName: "arrow.uturn.backward")
                        .frame(width: 36, height: 36)
                }
                .disabled(!conversation.canUndo)

                Divider()

                Button {
                    conversation.redo()
                    conversation.syncToList(appState.chatList)
                } label: {
                    Image(systemName: "arrow.uturn.forward")
                        .frame(width: 36, height: 36)
                }
                .disabled(!conversation.canRedo)
            }
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
        }
        .padding(12)
    }

    // MARK: - Search Bar

    @ViewBuilder
    private func searchBarOverlay(tree: BranchTree) -> some View {
        if isSearchVisible {
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Search nodes...", text: $searchText)
                    .textFieldStyle(.plain)
                    .submitLabel(.search)
                Button { isSearchVisible = false; searchText = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
            }
            .padding(10)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
            .padding(.horizontal, 40)
            .padding(.top, 8)
        }
    }

    // MARK: - Context Menu

    @ViewBuilder
    private func nodeContextMenu(node: BranchNode, tree: BranchTree) -> some View {
        let siblings = tree.getSiblings(of: node.id)

        // Switch to this branch
        Button {
            conversation.switchBranch(toNodeId: node.id)
            conversation.syncToList(appState.chatList)
        } label: {
            Label("Switch to This Path", systemImage: "arrow.triangle.branch")
        }

        if siblings.count > 1 {
            Menu("Switch Branch (\(siblings.count))") {
                ForEach(siblings, id: \.id) { sibling in
                    let preview = conversation.contentStore
                        .resolveContentText(sibling.contentHash)
                    Button {
                        conversation.switchBranch(toNodeId: sibling.id)
                        conversation.syncToList(appState.chatList)
                    } label: {
                        Label(
                            String(preview.prefix(40)),
                            systemImage: sibling.id == node.id ? "checkmark" : "arrow.right"
                        )
                    }
                }
            }
        }

        Divider()

        Button {
            renameText = node.label ?? ""
            renameNodeId = node.id
        } label: {
            Label("Rename", systemImage: "pencil")
        }

        Button {
            conversation.toggleStar(nodeId: node.id)
            conversation.syncToList(appState.chatList)
        } label: {
            Label(
                node.starred == true ? "Unstar" : "Star",
                systemImage: node.starred == true ? "star.slash" : "star"
            )
        }

        Button {
            conversation.togglePin(nodeId: node.id)
            conversation.syncToList(appState.chatList)
        } label: {
            Label(
                node.pinned == true ? "Unpin" : "Pin",
                systemImage: node.pinned == true ? "pin.slash" : "pin"
            )
        }

        Divider()

        // View detail
        Button {
            detailNode = node
        } label: {
            Label("View Detail", systemImage: "doc.text.magnifyingglass")
        }

        // Compare target
        Button {
            if compareTargetId == node.id {
                compareTargetId = nil
            } else {
                compareTargetId = node.id
            }
        } label: {
            Label(
                compareTargetId == node.id ? "Clear Compare" : "Compare With...",
                systemImage: "arrow.left.arrow.right"
            )
        }

        // Navigate to message in chat
        Button {
            conversation.switchBranch(toNodeId: node.id)
            conversation.activeView = .chat
            conversation.syncToList(appState.chatList)
        } label: {
            Label("Navigate to Message", systemImage: "arrow.right.circle")
        }

        Divider()

        Button(role: .destructive) {
            conversation.deleteBranch(nodeId: node.id)
            conversation.syncToList(appState.chatList)
            if selectedNodeId == node.id { selectedNodeId = nil }
        } label: {
            Label("Delete Branch", systemImage: "trash")
        }
    }

    // MARK: - Actions

    @State private var compareNodes: (BranchNode, BranchNode)?

    private func handleNodeTap(node: BranchNode) {
        // If compare target is set, open compare view
        if let targetId = compareTargetId, targetId != node.id,
           let targetNode = conversation.chat.branchTree?.nodes[targetId] {
            compareNodes = (targetNode, node)
            compareTargetId = nil
            return
        }
        selectedNodeId = node.id
        conversation.switchBranch(toNodeId: node.id)
        conversation.syncToList(appState.chatList)
    }

    private func handleNodeDoubleTap(node: BranchNode) {
        conversation.switchBranch(toNodeId: node.id)
        conversation.activeView = .chat
        conversation.syncToList(appState.chatList)
    }
}
