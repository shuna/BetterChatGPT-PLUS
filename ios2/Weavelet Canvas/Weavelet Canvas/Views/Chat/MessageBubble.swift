import SwiftUI

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
    var searchQuery: String = ""
    var isCurrentSearchMatch: Bool = false
    var markdownMode: Bool = false
    var inlineLatex: Bool = false
    var streamingMarkdownPolicy: StreamingMarkdownPolicy = .auto

    @State private var showDeleteConfirmation = false
    @FocusState private var isEditFieldFocused: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            // Collapse toggle bar
            collapseBar

            VStack(alignment: .leading, spacing: 0) {
                // Header: avatar + role selector + meta buttons
                messageHeader

                // Content
                if message.isCollapsed {
                    collapsedPreview
                } else {
                    unifiedContentView
                }

                // Action bar is now a pinned section footer (sticky)
            }
        }
        .padding(.trailing, 16)
        .padding(.vertical, 8)
        .background(backgroundForRole)
        .opacity(message.isOmitted ? 0.5 : 1.0)
        .overlay(alignment: .leading) {
            if message.isProtected {
                Rectangle()
                    .fill(Color.blue)
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
            Rectangle()
                .fill(message.isCollapsed ? Color.accentColor : Color(.quaternaryLabel))
                .frame(width: 3)
                .padding(.horizontal, 6)
                .frame(maxHeight: .infinity)
                .contentShape(Rectangle().inset(by: -8))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(message.isCollapsed ? "Expand" : "Collapse")
    }

    // MARK: - Collapsed Preview

    private var collapsedPreview: some View {
        Text(String(message.content.prefix(120)))
            .lineLimit(1)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Header

    private var messageHeader: some View {
        HStack(spacing: 8) {
            // Avatar
            Image(systemName: message.role.icon)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(avatarColor)
                .frame(width: 24, height: 24)
                .background(avatarColor.opacity(0.12), in: Circle())

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
                HStack(spacing: 2) {
                    Text(message.role.label)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.primary)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(.tertiary)
                }
            }

            Spacer()

            // Meta buttons: omit + protect
            HStack(spacing: 4) {
                Button {
                    onToggleOmit()
                } label: {
                    Image(systemName: message.isOmitted ? "eye.slash.fill" : "eye.slash")
                        .font(.system(size: 13))
                        .foregroundStyle(message.isOmitted ? Color.orange : Color(.tertiaryLabel))
                }
                .buttonStyle(.plain)

                Button {
                    onToggleProtect()
                } label: {
                    Image(systemName: message.isProtected ? "lock.fill" : "lock")
                        .font(.system(size: 13))
                        .foregroundStyle(message.isProtected ? Color.blue : Color(.tertiaryLabel))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.bottom, 6)
    }

    // MARK: - Content

    // MARK: - Unified Content (always TextEditor, disabled when not editing)

    /// Whether to render markdown for this message right now.
    private var shouldRenderMarkdown: Bool {
        guard markdownMode else { return false }
        if isEditing { return false }
        if message.isGenerating {
            switch streamingMarkdownPolicy {
            case .always: return true
            case .never: return false
            case .auto: return false // render only after completion
            }
        }
        return true
    }

    @ViewBuilder
    private var unifiedContentView: some View {
        if message.isGenerating && message.content.isEmpty {
            typingIndicator
        } else if isEditing {
            TextEditor(text: $editText)
                .font(.subheadline)
                .scrollContentBackground(.hidden)
                .scrollDisabled(true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                .tint(.accentColor)
                .focused($isEditFieldFocused)
                .onAppear {
                    editText = message.content
                    DispatchQueue.main.async {
                        isEditFieldFocused = true
                    }
                }
                .onChange(of: isEditing) { _, editing in
                    if editing {
                        editText = message.content
                        DispatchQueue.main.async {
                            isEditFieldFocused = true
                        }
                    } else {
                        isEditFieldFocused = false
                    }
                }
        } else if shouldRenderMarkdown {
            Text(markdownAttributed(message.content))
                .font(.subheadline)
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
        } else {
            Text(message.content)
                .font(.subheadline)
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
        }
    }

    /// Parse markdown content into AttributedString, falling back to plain text.
    private func markdownAttributed(_ text: String) -> AttributedString {
        (try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(text)
    }

    // MARK: - Edit Action Buttons

    // Action bar and edit bar are pinned section footers in ChatDetailView

    // MARK: - Typing Indicator

    private var typingIndicator: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(Color.secondary.opacity(0.5))
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

    // MARK: - Styling

    private var backgroundForRole: Color {
        switch message.role {
        case .user: Color(.systemBackground)
        case .assistant: Color(.secondarySystemBackground)
        case .system: Color(.tertiarySystemBackground)
        }
    }

    private var avatarColor: Color {
        switch message.role {
        case .user: .blue
        case .assistant: .purple
        case .system: .gray
        }
    }
}
