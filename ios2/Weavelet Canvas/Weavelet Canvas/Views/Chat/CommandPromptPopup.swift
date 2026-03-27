import SwiftUI

/// A popup that appears above the input bar showing filtered prompt candidates.
/// Triggered by the "/" button; user can search and tap to insert prompt text.
struct CommandPromptPopup: View {
    let prompts: [Prompt]
    let onSelect: (Prompt) -> Void
    let onDismiss: () -> Void

    @State private var searchText = ""

    private var filtered: [Prompt] {
        let q = searchText.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return prompts }
        return prompts.filter { $0.name.lowercased().contains(q) }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Search field
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Search prompts…", text: $searchText)
                    .textFieldStyle(.plain)
                    .font(.subheadline)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(.secondarySystemBackground))

            Divider()

            // Results
            if filtered.isEmpty {
                Text("No matching prompts")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding()
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(filtered) { prompt in
                            Button {
                                onSelect(prompt)
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(prompt.name)
                                        .font(.subheadline.weight(.medium))
                                        .foregroundStyle(.primary)
                                    Text(prompt.prompt.prefix(80))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1)
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)

                            if prompt.id != filtered.last?.id {
                                Divider().padding(.leading, 12)
                            }
                        }
                    }
                }
                .frame(maxHeight: 200)
            }
        }
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.15), radius: 8, y: -2)
    }
}
