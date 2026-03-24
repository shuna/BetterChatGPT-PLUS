import SwiftUI
import WeaveletDomain

/// In-chat message search bar matching Web's ChatFindBar.
/// Searches through visible messages and highlights/navigates matches.
struct ChatFindBar: View {
    @Binding var isVisible: Bool
    let messages: [Message]
    let onNavigate: (Int) -> Void  // scroll to message index

    @State private var searchText = ""
    @State private var matches: [SearchMatch] = []
    @State private var currentMatchIndex = 0
    @FocusState private var isFocused: Bool

    struct SearchMatch: Identifiable {
        let id = UUID()
        let messageIndex: Int
        let contentItemIndex: Int
        let range: Range<String.Index>
    }

    var body: some View {
        HStack(spacing: 8) {
            // Search field
            HStack(spacing: 4) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                    .font(.caption)
                TextField("Find in chat...", text: $searchText)
                    .textFieldStyle(.plain)
                    .font(.callout)
                    .focused($isFocused)
                    .onSubmit { navigateNext() }
                    .onChange(of: searchText) { performSearch() }

                if !searchText.isEmpty {
                    Button {
                        searchText = ""
                        matches = []
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                            .font(.caption)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))

            // Match count
            if !searchText.isEmpty {
                Text(matches.isEmpty ? "0/0" : "\(currentMatchIndex + 1)/\(matches.count)")
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .frame(minWidth: 36)
            }

            // Navigation arrows
            HStack(spacing: 2) {
                Button { navigatePrev() } label: {
                    Image(systemName: "chevron.up")
                        .font(.caption)
                }
                .disabled(matches.isEmpty)

                Button { navigateNext() } label: {
                    Image(systemName: "chevron.down")
                        .font(.caption)
                }
                .disabled(matches.isEmpty)
            }
            .buttonStyle(.plain)

            // Close
            Button {
                withAnimation {
                    isVisible = false
                    searchText = ""
                    matches = []
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.bar)
        .onAppear { isFocused = true }
    }

    // MARK: - Search

    private func performSearch() {
        guard !searchText.isEmpty else {
            matches = []
            currentMatchIndex = 0
            return
        }

        let query = searchText.lowercased()
        var newMatches: [SearchMatch] = []

        for (msgIdx, message) in messages.enumerated() {
            for (itemIdx, item) in message.content.enumerated() {
                guard let text = item.textValue else { continue }
                let lower = text.lowercased()
                var searchStart = lower.startIndex
                while let range = lower.range(of: query, range: searchStart..<lower.endIndex) {
                    newMatches.append(SearchMatch(
                        messageIndex: msgIdx,
                        contentItemIndex: itemIdx,
                        range: range
                    ))
                    searchStart = range.upperBound
                }
            }
        }

        matches = newMatches
        currentMatchIndex = 0
        if let first = matches.first {
            onNavigate(first.messageIndex)
        }
    }

    private func navigateNext() {
        guard !matches.isEmpty else { return }
        currentMatchIndex = (currentMatchIndex + 1) % matches.count
        onNavigate(matches[currentMatchIndex].messageIndex)
    }

    private func navigatePrev() {
        guard !matches.isEmpty else { return }
        currentMatchIndex = (currentMatchIndex - 1 + matches.count) % matches.count
        onNavigate(matches[currentMatchIndex].messageIndex)
    }
}
