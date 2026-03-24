import SwiftUI
import WeaveletDomain

/// Side-by-side comparison of two branch nodes' content.
struct BranchCompareView: View {
    let nodeA: BranchNode
    let nodeB: BranchNode
    let contentStore: ContentStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            GeometryReader { geo in
                HStack(spacing: 1) {
                    // Left panel (Node A)
                    panelView(node: nodeA, label: "A")
                        .frame(width: geo.size.width / 2)

                    Divider()

                    // Right panel (Node B)
                    panelView(node: nodeB, label: "B")
                        .frame(width: geo.size.width / 2)
                }
            }
            .navigationTitle("Compare Branches")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    @ViewBuilder
    private func panelView(node: BranchNode, label: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text(label)
                    .font(.caption.bold())
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(label == "A" ? Color.blue.opacity(0.2) : Color.green.opacity(0.2), in: Capsule())

                AvatarView(role: node.role)
                    .scaleEffect(0.7)

                Text(node.role.rawValue.capitalized)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()

                if let lbl = node.label, !lbl.isEmpty {
                    Text(lbl)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(8)
            .background(.bar)

            Divider()

            // Content
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    let content = contentStore.resolveContent(node.contentHash)
                    ForEach(Array(content.enumerated()), id: \.offset) { _, item in
                        switch item {
                        case .text(let textContent):
                            Text(textContent.text)
                                .font(.callout)
                                .textSelection(.enabled)
                        case .reasoning(let reasoningContent):
                            DisclosureGroup("Reasoning") {
                                Text(reasoningContent.text)
                                    .font(.caption)
                            }
                            .foregroundStyle(.secondary)
                        default:
                            EmptyView()
                        }
                    }
                }
                .padding(8)
            }
        }
    }
}
