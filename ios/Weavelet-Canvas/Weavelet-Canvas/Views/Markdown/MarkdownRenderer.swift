import SwiftUI
import Markdown

/// Converts a Markdown string into an `AttributedString` for display in SwiftUI `Text`.
///
/// Uses Apple's swift-markdown for parsing (GFM-compatible AST), then walks
/// the tree to build a single `AttributedString`. This enables full text
/// selection across paragraphs via `.textSelection(.enabled)`.
///
/// Code blocks are extracted separately for syntax highlighting via HighlightSwift.
struct MarkdownRenderer {

    /// A rendered segment — either attributed text or a code block.
    enum Segment: Identifiable {
        case text(AttributedString)
        case codeBlock(language: String?, code: String)

        var id: String {
            switch self {
            case .text(let str): return "text-\(str.hashValue)"
            case .codeBlock(_, let code): return "code-\(code.hashValue)"
            }
        }
    }

    /// Parse markdown and return segments for rendering.
    static func render(_ markdown: String) -> [Segment] {
        let document = Document(parsing: markdown, options: [.parseBlockDirectives])
        var visitor = SegmentVisitor()
        visitor.visit(document)
        visitor.flush()
        return visitor.segments
    }

    /// Parse markdown into a single AttributedString (no code block extraction).
    static func renderAttributedString(_ markdown: String) -> AttributedString {
        let document = Document(parsing: markdown, options: [.parseBlockDirectives])
        var visitor = AttributedStringVisitor()
        visitor.visit(document)
        return visitor.result
    }
}

// MARK: - Segment Visitor

/// Walks the AST and produces segments: text runs and code blocks.
private struct SegmentVisitor: MarkupWalker {
    var segments: [MarkdownRenderer.Segment] = []
    private var currentText = AttributedString()
    private var pendingNewlines = 0

    mutating func flush() {
        if !currentText.characters.isEmpty {
            segments.append(.text(currentText))
            currentText = AttributedString()
        }
    }

    // MARK: Block Elements

    mutating func visitParagraph(_ paragraph: Paragraph) {
        appendNewlines()
        for child in paragraph.children {
            visit(child)
        }
        pendingNewlines = 2
    }

    mutating func visitHeading(_ heading: Heading) {
        appendNewlines()
        var container = AttributeContainer()
        switch heading.level {
        case 1: container.font = .title.bold()
        case 2: container.font = .title2.bold()
        case 3: container.font = .title3.bold()
        default: container.font = .headline
        }

        let saved = pushAttributes(container)
        for child in heading.children {
            visit(child)
        }
        restoreAttributes(saved)
        pendingNewlines = 2
    }

    mutating func visitCodeBlock(_ codeBlock: CodeBlock) {
        // Flush text before code block
        flush()
        segments.append(.codeBlock(
            language: codeBlock.language,
            code: codeBlock.code.trimmingCharacters(in: .newlines)
        ))
        pendingNewlines = 2
    }

    mutating func visitBlockQuote(_ blockQuote: BlockQuote) {
        appendNewlines()
        var prefix = AttributedString("│ ")
        prefix.foregroundColor = .secondary
        currentText.append(prefix)

        for child in blockQuote.children {
            visit(child)
        }
        pendingNewlines = 2
    }

    mutating func visitListItem(_ listItem: ListItem) {
        appendNewlines()
        let bullet: String
        if let ordered = listItem.parent as? OrderedList {
            let index = Int(listItem.indexInParent) + Int(ordered.startIndex)
            bullet = "\(index). "
        } else {
            bullet = "• "
        }
        currentText.append(AttributedString(bullet))
        for child in listItem.children {
            visit(child)
        }
        pendingNewlines = 1
    }

    mutating func visitThematicBreak(_ thematicBreak: ThematicBreak) {
        appendNewlines()
        var hr = AttributedString("───────────────")
        hr.foregroundColor = .secondary
        currentText.append(hr)
        pendingNewlines = 2
    }

    // MARK: Inline Elements

    mutating func visitText(_ text: Markdown.Text) {
        currentText.append(AttributedString(text.string))
    }

    mutating func visitInlineCode(_ inlineCode: InlineCode) {
        var code = AttributedString(inlineCode.code)
        code.font = .body.monospaced()
        code.backgroundColor = Color(.tertiarySystemFill)
        currentText.append(code)
    }

    mutating func visitStrong(_ strong: Strong) {
        var container = AttributeContainer()
        container.font = .body.bold()
        let saved = pushAttributes(container)
        for child in strong.children {
            visit(child)
        }
        restoreAttributes(saved)
    }

    mutating func visitEmphasis(_ emphasis: Emphasis) {
        var container = AttributeContainer()
        container.font = .body.italic()
        let saved = pushAttributes(container)
        for child in emphasis.children {
            visit(child)
        }
        restoreAttributes(saved)
    }

    mutating func visitStrikethrough(_ strikethrough: Strikethrough) {
        var container = AttributeContainer()
        container.strikethroughStyle = .single
        let saved = pushAttributes(container)
        for child in strikethrough.children {
            visit(child)
        }
        restoreAttributes(saved)
    }

    mutating func visitLink(_ link: Markdown.Link) {
        if let url = URL(string: link.destination ?? "") {
            var container = AttributeContainer()
            container.link = url
            container.foregroundColor = .accentColor
            let saved = pushAttributes(container)
            for child in link.children {
                visit(child)
            }
            restoreAttributes(saved)
        } else {
            for child in link.children {
                visit(child)
            }
        }
    }

    mutating func visitImage(_ image: Markdown.Image) {
        // Images can't be embedded in AttributedString; show alt text as link
        var alt = AttributedString("[\(image.plainText)]")
        if let src = image.source, let url = URL(string: src) {
            alt.link = url
            alt.foregroundColor = .accentColor
        }
        currentText.append(alt)
    }

    mutating func visitSoftBreak(_ softBreak: SoftBreak) {
        currentText.append(AttributedString(" "))
    }

    mutating func visitLineBreak(_ lineBreak: LineBreak) {
        currentText.append(AttributedString("\n"))
    }

    // MARK: Table (GFM)

    mutating func visitTable(_ table: Markdown.Table) -> () {
        appendNewlines()
        // Render head
        let head = table.head
        for (i, cell) in head.cells.enumerated() {
            if i > 0 {
                var sep = AttributedString(" │ ")
                sep.foregroundColor = .secondary
                currentText.append(sep)
            }
            for child in cell.children {
                visit(child)
            }
        }
        currentText.append(AttributedString("\n"))
        var divider = AttributedString(String(repeating: "─", count: 30))
        divider.foregroundColor = .secondary
        currentText.append(divider)
        currentText.append(AttributedString("\n"))

        // Render body rows
        let body = table.body
        for row in body.rows {
            for (i, cell) in row.cells.enumerated() {
                if i > 0 {
                    var sep = AttributedString(" │ ")
                    sep.foregroundColor = .secondary
                    currentText.append(sep)
                }
                for child in cell.children {
                    visit(child)
                }
            }
            currentText.append(AttributedString("\n"))
        }
        pendingNewlines = 2
    }

    // MARK: Helpers

    private var attributeStack: [AttributeContainer] = []

    private mutating func pushAttributes(_ container: AttributeContainer) -> Int {
        attributeStack.append(container)
        return attributeStack.count - 1
    }

    private mutating func restoreAttributes(_ to: Int) {
        if to < attributeStack.count {
            attributeStack.removeSubrange(to...)
        }
    }

    private mutating func appendNewlines() {
        if !currentText.characters.isEmpty && pendingNewlines > 0 {
            currentText.append(AttributedString(String(repeating: "\n", count: pendingNewlines)))
        }
        pendingNewlines = 0
    }
}

// MARK: - Simple AttributedString Visitor (no code block extraction)

private struct AttributedStringVisitor: MarkupWalker {
    var result = AttributedString()

    mutating func visitText(_ text: Markdown.Text) {
        result.append(AttributedString(text.string))
    }

    mutating func visitSoftBreak(_ softBreak: SoftBreak) {
        result.append(AttributedString(" "))
    }

    mutating func visitLineBreak(_ lineBreak: LineBreak) {
        result.append(AttributedString("\n"))
    }
}
