import SwiftUI

// MARK: - ReadableTextEditor

/// A TextEditor wrapper that supports read-only mode via UITextView.isEditable,
/// preserving text selection while preventing input when not editing.
struct ReadableTextEditor: View {
    @Binding var text: AttributedString
    var isEditable: Bool

    var body: some View {
        TextEditor(text: $text)
            .onIntrospectTextView { textView in
                textView.isEditable = isEditable
            }
    }
}

private extension View {
    /// Applies a closure to the underlying UITextView of a TextEditor.
    func onIntrospectTextView(_ configure: @escaping (UITextView) -> Void) -> some View {
        background(TextViewIntrospector(configure: configure))
    }
}

private struct TextViewIntrospector: UIViewRepresentable {
    let configure: (UITextView) -> Void

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.isHidden = true
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        DispatchQueue.main.async {
            guard let textView = uiView.findSiblingTextView() else { return }
            configure(textView)
        }
    }
}

private extension UIView {
    func findSiblingTextView() -> UITextView? {
        // Walk up to the common ancestor and search for UITextView
        var current: UIView? = superview
        while let parent = current {
            if let textView = parent.findDescendant(ofType: UITextView.self, excluding: self) {
                return textView
            }
            current = parent.superview
        }
        return nil
    }

    func findDescendant<T: UIView>(ofType type: T.Type, excluding: UIView) -> T? {
        for child in subviews {
            if child === excluding { continue }
            if let match = child as? T { return match }
            if let match = child.findDescendant(ofType: type, excluding: excluding) {
                return match
            }
        }
        return nil
    }
}

// MARK: - MessageBubble

struct MessageBubble: View {
    let message: ChatMessage
    let onCopy: () -> Void
    let onDelete: () -> Void
    let onRegenerate: () -> Void
    let onToggleOmit: () -> Void
    let onToggleProtect: () -> Void
    let onChangeRole: (MessageRole) -> Void
    let onToggleCollapse: () -> Void
    @Binding var isEditing: Bool
    @Binding var editText: String
    var showCardFooter: Bool = false
    var searchQuery: String = ""
    var isCurrentSearchMatch: Bool = false
    var markdownMode: Bool = false
    var inlineLatex: Bool = false
    var streamingMarkdownPolicy: StreamingMarkdownPolicy = .auto

    @State private var showDeleteConfirmation = false
    @State private var displayText: AttributedString = AttributedString()
    @State private var editAttributedText: AttributedString = AttributedString()
    @FocusState private var isEditFieldFocused: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            // Collapse toggle bar — role-colored
            collapseBar

            VStack(alignment: .leading, spacing: 0) {
                // Header: avatar + role selector + meta buttons
                messageHeader

                contentCard
                    .padding(.top, 4)
            }
            .padding(.trailing, 16)
            .padding(.top, 6)
            .padding(.bottom, showCardFooter ? 0 : 6)
        }
        .background(AppColors.background)
        .opacity(message.isOmitted ? 0.5 : 1.0)
        .overlay(alignment: .leading) {
            if message.isProtected {
                Rectangle()
                    .fill(Color.blue.opacity(0.5))
                    .frame(width: 3)
            }
        }
        .overlay {
            if isCurrentSearchMatch {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color.accentColor, lineWidth: 2)
                    .padding(2)
            } else if !searchQuery.isEmpty && message.content.localizedCaseInsensitiveContains(searchQuery) {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color.accentColor.opacity(0.4), lineWidth: 1)
                    .padding(2)
            }
        }
        .confirmationDialog("Delete this message?", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { onDelete() }
        }
    }

    // MARK: - Collapse Bar

    private var collapseBar: some View {
        Button {
            onToggleCollapse()
        } label: {
            Color.clear
                .frame(width: 17)
                .frame(maxHeight: .infinity)
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(message.isCollapsed
                              ? avatarColor.opacity(0.6)
                              : avatarColor.opacity(0.2))
                        .frame(width: 3)
                        .clipShape(UnevenRoundedRectangle(
                            topLeadingRadius: 1.5, bottomLeadingRadius: showCardFooter ? 0 : 1.5,
                            bottomTrailingRadius: showCardFooter ? 0 : 1.5, topTrailingRadius: 1.5
                        ))
                        .padding(.top, 6) // Align with avatar top
                }
                .contentShape(Rectangle().inset(by: -8))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(message.isCollapsed ? "Expand" : "Collapse")
    }

    // MARK: - Header

    private var messageHeader: some View {
        HStack(spacing: 8) {
            // Avatar — role-colored rounded square (matching web)
            Image(systemName: message.role.icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 26, height: 26)
                .background(avatarColor, in: RoundedRectangle(cornerRadius: 6))

            // Role selector
            Menu {
                ForEach(MessageRole.allCases, id: \.self) { role in
                    Button {
                        onChangeRole(role)
                    } label: {
                        HStack {
                            Label(role.label, systemImage: role.icon)
                            if role == message.role {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                }
            } label: {
                HStack(spacing: 3) {
                    Text(message.role.label)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(.tertiary)
                }
            }

            Spacer()

            // Meta buttons — pill container (matching web frosted glass style)
            HStack(spacing: 2) {
                metaButton(
                    icon: message.isOmitted ? "eye.slash.fill" : "eye.slash",
                    activeColor: .orange,
                    isActive: message.isOmitted,
                    action: onToggleOmit
                )
                metaButton(
                    icon: message.isProtected ? "lock.fill" : "lock.open",
                    activeColor: .blue,
                    isActive: message.isProtected,
                    action: onToggleProtect
                )
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 3)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().stroke(Color.primary.opacity(0.06), lineWidth: 0.5))
        }
    }

    private func metaButton(icon: String, activeColor: Color, isActive: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(isActive ? activeColor : Color(.tertiaryLabel))
                .frame(width: 26, height: 24)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Content Card

    @ViewBuilder
    private var contentCard: some View {
        if message.isCollapsed {
            collapsedPreview
        } else {
            VStack(alignment: .leading, spacing: 0) {
                unifiedContentView
                    .padding(.horizontal, 14)
                    .padding(.top, 10)
                    .padding(.bottom, 8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(cardBackground, in: cardShape)
            .overlay {
                cardShape
                    .stroke(Color.primary.opacity(0.06), lineWidth: 0.5)
                    .mask {
                        if showCardFooter {
                            // Hide bottom stroke when footer continues the card
                            VStack(spacing: 0) {
                                Color.black
                                Color.clear.frame(height: 1)
                            }
                        } else {
                            Color.black
                        }
                    }
            }
        }
    }

    private var cardShape: UnevenRoundedRectangle {
        if showCardFooter {
            UnevenRoundedRectangle(
                topLeadingRadius: 14, bottomLeadingRadius: 0,
                bottomTrailingRadius: 0, topTrailingRadius: 14
            )
        } else {
            UnevenRoundedRectangle(
                topLeadingRadius: 14, bottomLeadingRadius: 14,
                bottomTrailingRadius: 14, topTrailingRadius: 14
            )
        }
    }

    private var cardBackground: Color {
        switch message.role {
        case .user: AppColors.messageSurfaceUser
        case .assistant: AppColors.messageSurfaceAssistant
        case .system: AppColors.messageSurfaceSystem
        }
    }

    // MARK: - Collapsed Preview

    private var collapsedPreview: some View {
        Text(String(message.content.prefix(120)))
            .lineLimit(2)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(cardBackground.opacity(0.5), in: RoundedRectangle(cornerRadius: 14))
    }

    // MARK: - Content

    private var shouldRenderMarkdown: Bool {
        guard markdownMode else { return false }
        if isEditing { return false }
        if message.isGenerating {
            switch streamingMarkdownPolicy {
            case .always: return true
            case .never: return false
            case .auto: return false
            }
        }
        return true
    }

    @ViewBuilder
    private var unifiedContentView: some View {
        if message.isGenerating && message.content.isEmpty {
            typingIndicator
        } else {
            ReadableTextEditor(
                text: isEditing ? $editAttributedText : $displayText,
                isEditable: isEditing
            )
            .font(.subheadline)
            .scrollContentBackground(.hidden)
            .scrollDisabled(true)
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .tint(.accentColor)
            .focused($isEditFieldFocused)
            .onAppear { updateDisplayText() }
            .onChange(of: message.content) { _, _ in updateDisplayText() }
            .onChange(of: markdownMode) { _, _ in updateDisplayText() }
            .onChange(of: isEditing) { _, editing in
                if editing {
                    editAttributedText = AttributedString(message.content)
                    DispatchQueue.main.async { isEditFieldFocused = true }
                } else {
                    editText = String(editAttributedText.characters)
                    isEditFieldFocused = false
                }
            }
        }
    }

    private func updateDisplayText() {
        displayText = shouldRenderMarkdown
            ? markdownAttributed(message.content)
            : AttributedString(message.content)
    }

    private func markdownAttributed(_ text: String) -> AttributedString {
        // inlineOnlyPreservingWhitespace gives best results in SwiftUI Text
        // (`.full` merges headings/paragraphs and loses block structure)
        if let result = try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)) {
            return result
        }
        return AttributedString(text)
    }

    // MARK: - Typing Indicator

    private var typingIndicator: some View {
        HStack(spacing: 5) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(avatarColor.opacity(0.5))
                    .frame(width: 6, height: 6)
                    .phaseAnimator([false, true]) { view, phase in
                        view.offset(y: phase ? -4 : 0)
                    } animation: { phase in
                        .easeInOut(duration: 0.4).delay(Double(i) * 0.15)
                    }
            }
        }
        .padding(.vertical, 8)
    }

    // MARK: - Colors

    private var avatarColor: Color {
        switch message.role {
        case .user: AppColors.avatarUser
        case .assistant: AppColors.avatarAssistant
        case .system: AppColors.avatarSystem
        }
    }
}
