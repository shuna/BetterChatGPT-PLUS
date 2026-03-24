import SwiftUI
import WeaveletDomain

/// Shows the full content of a branch node's message.
struct MessageDetailModal: View {
    let node: BranchNode
    let contentStore: ContentStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    // Role + metadata
                    HStack {
                        AvatarView(role: node.role)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(node.role.rawValue.capitalized)
                                .font(.headline)
                            if let label = node.label, !label.isEmpty {
                                Text(label)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Text(formatDate(node.createdAt))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        HStack(spacing: 4) {
                            if node.starred == true {
                                Image(systemName: "star.fill")
                                    .foregroundStyle(.yellow)
                            }
                            if node.pinned == true {
                                Image(systemName: "pin.fill")
                                    .foregroundStyle(.red)
                            }
                        }
                    }

                    Divider()

                    // Full content
                    let content = contentStore.resolveContent(node.contentHash)
                    ForEach(Array(content.enumerated()), id: \.offset) { _, item in
                        switch item {
                        case .text(let textContent):
                            MarkdownMessageView(markdown: textContent.text)
                        case .reasoning(let reasoningContent):
                            DisclosureGroup("Reasoning") {
                                Text(reasoningContent.text)
                                    .font(.caption)
                            }
                            .foregroundStyle(.secondary)
                        case .imageURL(let imgContent):
                            AsyncImage(url: URL(string: imgContent.imageURL.url)) { image in
                                image.resizable().scaledToFit()
                            } placeholder: {
                                ProgressView()
                            }
                            .frame(maxHeight: 300)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        default:
                            EmptyView()
                        }
                    }

                    // Node info
                    Divider()
                    Group {
                        LabeledContent("Node ID", value: String(node.id.prefix(12)) + "...")
                        LabeledContent("Content Hash", value: String(node.contentHash.prefix(12)) + "...")
                        if let parentId = node.parentId {
                            LabeledContent("Parent", value: String(parentId.prefix(12)) + "...")
                        }
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
                .padding()
            }
            .navigationTitle("Message Detail")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        let text = contentStore.resolveContentText(node.contentHash)
                        UIPasteboard.general.string = text
                    } label: {
                        Label("Copy", systemImage: "doc.on.doc")
                    }
                }
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }

    private func formatDate(_ ms: Double) -> String {
        let date = Date(timeIntervalSince1970: ms / 1000)
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}
