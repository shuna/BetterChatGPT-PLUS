import SwiftUI
import WeaveletDomain

/// Placeholder branch editor view. Will be replaced with full DAG visualization in Phase 10.
struct BranchEditorPlaceholderView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        let conversation = appState.conversation
        let tree = conversation.chat.branchTree

        VStack {
            if let tree, !tree.nodes.isEmpty {
                // Simple tree overview
                List {
                    Section("Active Path (\(tree.activePath.count) nodes)") {
                        ForEach(Array(tree.activePath.enumerated()), id: \.element) { index, nodeId in
                            if let node = tree.nodes[nodeId] {
                                nodeRow(node: node, index: index, tree: tree)
                            }
                        }
                    }

                    Section("Tree Stats") {
                        LabeledContent("Total Nodes", value: "\(tree.nodes.count)")
                        LabeledContent("Active Path", value: "\(tree.activePath.count)")
                        LabeledContent("Root", value: tree.rootId.prefix(8) + "...")

                        let branchCount = tree.nodes.values.filter { nodeId in
                            tree.getChildren(of: nodeId.id).count > 1
                        }.count
                        LabeledContent("Branch Points", value: "\(branchCount)")
                    }
                }
                .listStyle(.insetGrouped)
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
    }

    @ViewBuilder
    private func nodeRow(node: BranchNode, index: Int, tree: BranchTree) -> some View {
        let preview = appState.conversation.contentStore.resolveContentText(node.contentHash)
        let siblings = tree.getSiblings(of: node.id)

        HStack {
            // Role indicator
            AvatarView(role: node.role)
                .scaleEffect(0.7)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    if let label = node.label {
                        Text(label)
                            .font(.caption)
                            .fontWeight(.bold)
                    }
                    if node.starred == true {
                        Image(systemName: "star.fill")
                            .font(.caption2)
                            .foregroundStyle(.yellow)
                    }
                    if node.pinned == true {
                        Image(systemName: "pin.fill")
                            .font(.caption2)
                            .foregroundStyle(.red)
                    }
                }

                Text(String(preview.prefix(80)))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            Spacer()

            // Sibling count badge
            if siblings.count > 1 {
                Text("\(siblings.count)")
                    .font(.caption2)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.tint.opacity(0.15), in: Capsule())
            }
        }
        .contextMenu {
            if siblings.count > 1 {
                Menu("Switch Branch") {
                    ForEach(siblings, id: \.id) { sibling in
                        Button(String(sibling.id.prefix(8))) {
                            appState.conversation.switchBranch(toNodeId: sibling.id)
                            appState.conversation.syncToList(appState.chatList)
                        }
                    }
                }
            }

            Button {
                appState.conversation.toggleStar(nodeId: node.id)
            } label: {
                Label(node.starred == true ? "Unstar" : "Star", systemImage: "star")
            }

            Button {
                appState.conversation.togglePin(nodeId: node.id)
            } label: {
                Label(node.pinned == true ? "Unpin" : "Pin", systemImage: "pin")
            }

            Button(role: .destructive) {
                appState.conversation.deleteBranch(nodeId: node.id)
                appState.conversation.syncToList(appState.chatList)
            } label: {
                Label("Delete Branch", systemImage: "trash")
            }
        }
    }
}
