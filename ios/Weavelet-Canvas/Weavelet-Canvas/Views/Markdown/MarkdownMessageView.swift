import SwiftUI
import HighlightSwift

/// Renders a markdown string as SwiftUI views with syntax-highlighted code blocks.
///
/// Text segments support full cross-paragraph selection.
/// Code blocks are rendered with HighlightSwift for syntax highlighting.
struct MarkdownMessageView: View {
    let markdown: String

    var body: some View {
        let segments = MarkdownRenderer.render(markdown)

        VStack(alignment: .leading, spacing: 8) {
            ForEach(segments) { segment in
                switch segment {
                case .text(let attributedString):
                    Text(attributedString)
                        .textSelection(.enabled)

                case .codeBlock(let language, let code):
                    CodeBlockView(code: code, language: language)
                }
            }
        }
    }
}

/// Syntax-highlighted code block with copy button and language badge.
struct CodeBlockView: View {
    let code: String
    let language: String?

    @State private var highlighted: AttributedString?
    @State private var copied = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header: language badge + copy button
            HStack {
                if let language, !language.isEmpty {
                    Text(language)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(.quaternary, in: Capsule())
                }

                Spacer()

                Button {
                    UIPasteboard.general.string = code
                    copied = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                        copied = false
                    }
                } label: {
                    Label(
                        copied ? "Copied" : "Copy",
                        systemImage: copied ? "checkmark" : "doc.on.doc"
                    )
                    .font(.caption2)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)

            // Code content
            Group {
                if let highlighted {
                    Text(highlighted)
                } else {
                    Text(code)
                }
            }
            .font(.system(.caption, design: .monospaced))
            .textSelection(.enabled)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
        .task {
            await highlightCode()
        }
    }

    private func highlightCode() async {
        do {
            let highlighter = Highlight()
            let mode: HighlightMode
            if let language, !language.isEmpty {
                mode = .languageAlias(language)
            } else {
                mode = .automatic
            }
            let result = try await highlighter.request(code, mode: mode)
            highlighted = result.attributedText
        } catch {
            // Fallback to plain text — already shown
        }
    }
}

#Preview {
    ScrollView {
        MarkdownMessageView(markdown: """
        # Hello World

        This is a **bold** and *italic* paragraph with `inline code`.

        ## Code Example

        ```swift
        func greet(name: String) -> String {
            return "Hello, \\(name)!"
        }
        ```

        - Item one
        - Item two
        - Item three

        > This is a blockquote with some wisdom.

        Visit [Apple](https://apple.com) for more info.
        """)
        .padding()
    }
}
