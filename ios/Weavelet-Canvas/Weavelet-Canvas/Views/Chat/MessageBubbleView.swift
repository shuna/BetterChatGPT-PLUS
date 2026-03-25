import SwiftUI
import WeaveletDomain

/// Displays a single message bubble with role indicator, content,
/// and full action bar matching the Web version.
struct MessageBubbleView: View {
    let message: Message
    let index: Int
    let nodeId: String
    let isCollapsed: Bool
    let isOmitted: Bool
    let isProtected: Bool
    let siblingCount: Int
    let siblingIndex: Int   // 1-based current position among siblings
    let totalMessages: Int

    @Environment(AppState.self) private var appState
    @State private var isEditing = false
    @State private var editText = ""
    @State private var showDeleteConfirm = false
    @State private var isHovering = false
    @State private var bubbleFrame: CGRect = .zero

    private var conversation: ConversationViewModel { appState.conversation }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Omit/Protect indicators (top-right)
            HStack(spacing: 4) {
                Spacer()
                if isOmitted {
                    metaBadge("Omitted", color: .orange, icon: "eye.slash")
                }
                if isProtected {
                    metaBadge("Protected", color: .blue, icon: "lock.fill")
                }
            }
            .padding(.bottom, isOmitted || isProtected ? 2 : 0)

            HStack(alignment: .top, spacing: 10) {
                // Collapse indicator (left bar)
                collapseBar

                // Avatar
                AvatarView(role: message.role)

                // Content
                VStack(alignment: .leading, spacing: 4) {
                    // Role label + advanced role selector
                    roleHeader

                    if isCollapsed {
                        collapsedPreview
                    } else if isEditing {
                        editView
                    } else {
                        messageContent
                    }

                    // Reserve space for the floating action bar overlay
                    if !isEditing && !isCollapsed {
                        Color.clear.frame(height: 44)
                    }
                }
                .padding(.trailing, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 4)
        .background(backgroundForRole)
        .background(
            GeometryReader { geo in
                Color.clear.preference(
                    key: BubbleFrameKey.self,
                    value: geo.frame(in: .global)
                )
            }
        )
        .onPreferenceChange(BubbleFrameKey.self) { bubbleFrame = $0 }
        // Floating action bar overlay — sticky to visible bottom
        .overlay {
            if !isEditing && !isCollapsed {
                GeometryReader { geo in
                    let globalFrame = geo.frame(in: .global)
                    // Screen height minus safe areas and input bar (~140pt from bottom)
                    let visibleBottom = UIScreen.main.bounds.height - 140
                    let bubbleBottom = globalFrame.maxY
                    let actionBarHeight: CGFloat = 36
                    let naturalY = globalFrame.height - 6 - actionBarHeight / 2 // natural position: near bubble bottom
                    // If bubble bottom is below visible area, clamp the bar up
                    let clampedY: CGFloat = bubbleBottom > visibleBottom
                        ? naturalY - (bubbleBottom - visibleBottom)
                        : naturalY
                    // Don't let it go above the top of the bubble
                    let finalY = max(clampedY, 40)

                    actionBar
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .background(.ultraThinMaterial, in: Capsule())
                        .shadow(color: .black.opacity(0.08), radius: 4, y: 2)
                        .position(x: globalFrame.width / 2, y: finalY)
                }
            }
        }
        .overlay(alignment: .leading) {
            if isProtected {
                Rectangle()
                    .fill(Color.blue.opacity(0.3))
                    .frame(width: 3)
            }
        }
        .contextMenu { fullContextMenu }
        .confirmationDialog("Delete this message?", isPresented: $showDeleteConfirm) {
            Button("Delete", role: .destructive) {
                conversation.removeMessage(at: index)
                conversation.syncToList(appState.chatList)
            }
        }
    }

    // MARK: - Collapse Bar

    @ViewBuilder
    private var collapseBar: some View {
        Rectangle()
            .fill(isCollapsed ? Color.accentColor : Color(.separator))
            .frame(width: 3)
            .frame(maxHeight: .infinity)
            .clipShape(Capsule())
            .contentShape(Rectangle().inset(by: -8))
            .onTapGesture {
                withAnimation(.easeInOut(duration: 0.2)) {
                    conversation.toggleCollapsed(nodeId: nodeId)
                }
            }
    }

    // MARK: - Role Header

    @ViewBuilder
    private var roleHeader: some View {
        HStack(spacing: 4) {
            if appState.settings.advancedMode {
                Menu {
                    ForEach([Role.user, .assistant, .system], id: \.self) { role in
                        Button {
                            changeRole(to: role)
                        } label: {
                            HStack {
                                Text(role.rawValue.capitalized)
                                if message.role == role {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                } label: {
                    Text(message.role.rawValue.capitalized)
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(roleColor)
                }
            } else {
                Text(message.role.rawValue.capitalized)
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(roleColor)
            }
        }
    }

    // MARK: - Collapsed Preview

    @ViewBuilder
    private var collapsedPreview: some View {
        let preview = message.content.compactMap(\.textValue).joined()
        HStack {
            Text(String(preview.prefix(60)))
                .font(.caption)
                .foregroundStyle(.secondary)
                .italic()
                .lineLimit(1)
            Spacer()
            Image(systemName: "chevron.down")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            withAnimation { conversation.toggleCollapsed(nodeId: nodeId) }
        }
    }

    // MARK: - Message Content

    @ViewBuilder
    private var messageContent: some View {
        ForEach(Array(message.content.enumerated()), id: \.offset) { _, item in
            contentView(for: item)
        }
    }

    @ViewBuilder
    private func contentView(for item: ContentItem) -> some View {
        switch item {
        case .text(let content):
            MarkdownMessageView(markdown: content.text)

        case .reasoning(let content):
            DisclosureGroup("Reasoning") {
                Text(content.text)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .font(.caption)
            .foregroundStyle(.secondary)

        case .imageURL(let content):
            AsyncImage(url: URL(string: content.imageURL.url)) { image in
                image.resizable().scaledToFit()
            } placeholder: {
                ProgressView()
            }
            .frame(maxHeight: 200)
            .clipShape(RoundedRectangle(cornerRadius: 8))

        case .toolCall(let content):
            Label(content.name, systemImage: "wrench.and.screwdriver")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(6)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 6))

        case .toolResult(let content):
            Text(content.content)
                .font(.caption)
                .padding(6)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 6))
        }
    }

    // MARK: - Edit View

    @ViewBuilder
    private var editView: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextEditor(text: $editText)
                .font(.body)
                .frame(minHeight: 60, maxHeight: 200)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .strokeBorder(Color(.separator), lineWidth: 0.5)
                )

            HStack(spacing: 12) {
                Button("Cancel") {
                    isEditing = false
                }
                .buttonStyle(.bordered)

                Button("Save") {
                    saveEdit()
                }
                .buttonStyle(.borderedProminent)

                Button("Save & Generate") {
                    saveEdit()
                    // TODO: Phase I — trigger LLM regeneration
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
            }
        }
    }

    // MARK: - Action Bar

    @ViewBuilder
    private var actionBar: some View {
        HStack(spacing: 0) {
            // Branch switcher (left, absolutely positioned in Web)
            if siblingCount > 1 {
                branchSwitcher
            }

            Spacer(minLength: 0)

            // Token count
            if appState.settings.displayChatSize {
                Text("\(estimatedTokens) tk")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundStyle(.tertiary)
                    .padding(.trailing, 4)
            }

            // Action buttons (centered, matching Web's justify-center)
            HStack(spacing: 2) {
                // Regenerate / Continue
                if message.role == .assistant {
                    actionButton("arrow.clockwise", tooltip: "Regenerate") {
                        conversation.regenerate(settings: appState.settings)
                        conversation.syncToList(appState.chatList)
                    }
                } else if message.role == .user && index == totalMessages - 1 {
                    actionButton("arrow.clockwise", tooltip: "Continue") {
                        conversation.continueGeneration(settings: appState.settings)
                        conversation.syncToList(appState.chatList)
                    }
                }

                // Move up
                if index > 0 {
                    actionButton("arrow.up", tooltip: "Move up") {
                        conversation.moveMessage(at: index, direction: .up)
                        conversation.syncToList(appState.chatList)
                    }
                }

                // Move down
                if index < totalMessages - 1 {
                    actionButton("arrow.down", tooltip: "Move down") {
                        conversation.moveMessage(at: index, direction: .down)
                        conversation.syncToList(appState.chatList)
                    }
                }

                // Copy
                actionButton("doc.on.doc", tooltip: "Copy") {
                    let text = message.content.compactMap(\.textValue).joined()
                    UIPasteboard.general.string = text
                }

                // Edit
                actionButton("pencil", tooltip: "Edit") {
                    editText = message.content.compactMap(\.textValue).joined()
                    isEditing = true
                }

                // Omit toggle
                actionButton(
                    isOmitted ? "eye" : "eye.slash",
                    tooltip: isOmitted ? "Include" : "Omit",
                    tint: isOmitted ? .orange : nil
                ) {
                    conversation.toggleOmitted(nodeId: nodeId)
                }

                // Protect toggle
                actionButton(
                    isProtected ? "lock.open" : "lock",
                    tooltip: isProtected ? "Unprotect" : "Protect",
                    tint: isProtected ? .blue : nil
                ) {
                    conversation.toggleProtected(nodeId: nodeId)
                }

                // Delete
                actionButton("trash", tooltip: "Delete", tint: .red) {
                    showDeleteConfirm = true
                }
            }

            Spacer(minLength: 0)
        }
    }

    // MARK: - Branch Switcher

    @ViewBuilder
    private var branchSwitcher: some View {
        HStack(spacing: 4) {
            Button {
                switchToPreviousSibling()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.caption2)
            }
            .disabled(siblingIndex <= 1)

            Text("\(siblingIndex)/\(siblingCount)")
                .font(.caption2)
                .monospacedDigit()
                .foregroundStyle(.secondary)

            Button {
                switchToNextSibling()
            } label: {
                Image(systemName: "chevron.right")
                    .font(.caption2)
            }
            .disabled(siblingIndex >= siblingCount)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(.quaternary, in: Capsule())
    }

    // MARK: - Helpers

    @ViewBuilder
    private func actionButton(
        _ icon: String,
        tooltip: String,
        tint: Color? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(tint ?? Color(.secondaryLabel))
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(tooltip)
    }

    @ViewBuilder
    private func metaBadge(_ text: String, color: Color, icon: String) -> some View {
        Label(text, systemImage: icon)
            .font(.system(size: 9))
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.1), in: Capsule())
    }

    /// Estimated token count for this message (~4 chars/token).
    private var estimatedTokens: Int {
        let chars = message.content.reduce(0) { sum, item in
            sum + (item.textValue?.count ?? 0)
        }
        return max(chars / 4, 1)
    }

    private var backgroundForRole: Color {
        switch message.role {
        case .assistant: return Color(.systemBackground)
        case .user: return Color(.secondarySystemBackground)
        case .system: return Color(.tertiarySystemBackground)
        }
    }

    private var roleColor: Color {
        switch message.role {
        case .assistant: return .green
        case .user: return .blue
        case .system: return .orange
        }
    }

    @ViewBuilder
    private var fullContextMenu: some View {
        Button {
            let text = message.content.compactMap(\.textValue).joined()
            UIPasteboard.general.string = text
        } label: {
            Label("Copy", systemImage: "doc.on.doc")
        }

        Button {
            editText = message.content.compactMap(\.textValue).joined()
            isEditing = true
        } label: {
            Label("Edit", systemImage: "pencil")
        }

        Button {
            conversation.toggleCollapsed(nodeId: nodeId)
        } label: {
            Label(isCollapsed ? "Expand" : "Collapse", systemImage: isCollapsed ? "chevron.down" : "chevron.up")
        }

        Button {
            conversation.toggleOmitted(nodeId: nodeId)
        } label: {
            Label(isOmitted ? "Include in Context" : "Omit from Context", systemImage: isOmitted ? "eye" : "eye.slash")
        }

        Button {
            conversation.toggleProtected(nodeId: nodeId)
        } label: {
            Label(isProtected ? "Unprotect" : "Protect", systemImage: isProtected ? "lock.open" : "lock")
        }

        Divider()

        Button(role: .destructive) {
            showDeleteConfirm = true
        } label: {
            Label("Delete", systemImage: "trash")
        }
    }

    private func saveEdit() {
        let newContent: [ContentItem] = [.fromString(editText)]
        let newMessage = Message(role: message.role, content: newContent)
        conversation.upsertMessage(at: index, message: newMessage)
        conversation.syncToList(appState.chatList)
        isEditing = false
    }

    private func changeRole(to role: Role) {
        let newMessage = Message(role: role, content: message.content)
        conversation.upsertMessage(at: index, message: newMessage)
        conversation.syncToList(appState.chatList)
    }

    private func switchToPreviousSibling() {
        guard let tree = conversation.chat.branchTree else { return }
        let siblings = tree.getSiblings(of: nodeId).sorted { $0.createdAt < $1.createdAt }
        guard let currentIdx = siblings.firstIndex(where: { $0.id == nodeId }),
              currentIdx > 0 else { return }
        conversation.switchBranch(toNodeId: siblings[currentIdx - 1].id)
        conversation.syncToList(appState.chatList)
    }

    private func switchToNextSibling() {
        guard let tree = conversation.chat.branchTree else { return }
        let siblings = tree.getSiblings(of: nodeId).sorted { $0.createdAt < $1.createdAt }
        guard let currentIdx = siblings.firstIndex(where: { $0.id == nodeId }),
              currentIdx < siblings.count - 1 else { return }
        conversation.switchBranch(toNodeId: siblings[currentIdx + 1].id)
        conversation.syncToList(appState.chatList)
    }
}

/// Role avatar indicator.
struct AvatarView: View {
    let role: Role

    var body: some View {
        ZStack {
            Circle()
                .fill(backgroundColor)
                .frame(width: 30, height: 30)

            Image(systemName: iconName)
                .font(.system(size: 14))
                .foregroundStyle(.white)
        }
    }

    private var iconName: String {
        switch role {
        case .user: return "person.fill"
        case .assistant: return "sparkles"
        case .system: return "gear"
        }
    }

    private var backgroundColor: Color {
        switch role {
        case .user: return .blue
        case .assistant: return .green
        case .system: return .orange
        }
    }
}

// MARK: - Preference Key for Bubble Frame

private struct BubbleFrameKey: PreferenceKey {
    static var defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) {
        value = nextValue()
    }
}
