import SwiftUI

struct ChatDetailView: View {
    private let keyboardClearance: CGFloat = 24

    @Bindable var viewModel: ChatViewModel
    var forceChat: Bool = false
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var keyboardVisible = false
    @State private var keyboardHeight: CGFloat = 0
    @State private var composerReservedHeight: CGFloat = 104
    @State private var editBarReservedHeight: CGFloat = 44
    @State private var currentMessageIndex = 0
    @State private var scrollProxy: ScrollViewProxy?
    @State private var selectedMessageID: UUID?

    var body: some View {
        Group {
            if forceChat || viewModel.viewMode == .chat {
                chatContentView
            } else {
                BranchEditorView(chatViewModel: viewModel, showNavButtons: horizontalSizeClass == .compact)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { notification in
            handleKeyboardWillShow(notification)
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            withAnimation(.easeOut(duration: 0.25)) {
                keyboardVisible = false
                keyboardHeight = 0
            }
        }
    }

    private var chatContentView: some View {
        ZStack {
            AppColors.background.ignoresSafeArea()
            messageList

            if !keyboardVisible {
                floatingControls
                    .padding(.bottom, 12)
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if viewModel.isSearching {
                ChatFindBar(
                    query: $viewModel.searchQuery,
                    currentMatch: viewModel.searchCurrentMatch,
                    totalMatches: viewModel.searchTotalMatches,
                    onPrevious: { viewModel.searchPrevious() },
                    onNext: { viewModel.searchNext() },
                    onClose: {
                        viewModel.isSearching = false
                        viewModel.searchQuery = ""
                    }
                )
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 0) {
                if let error = viewModel.errorMessage {
                    ErrorToast(
                        message: error,
                        onRetry: { viewModel.retryLastMessage() },
                        onDismiss: { withAnimation { viewModel.errorMessage = nil } }
                    )
                    .padding(.bottom, 6)
                }

                ChatInputBar(
                    text: $viewModel.draftText,
                    isGenerating: viewModel.isGenerating,
                    enterToSubmit: viewModel.settings?.enterToSubmit ?? true,
                    prompts: viewModel.settings?.allPrompts ?? [],
                    onSend: { viewModel.sendMessage() },
                    onStop: { viewModel.stopGenerating() }
                )
                .padding(.horizontal, 12)
                .padding(.top, 6)
                .padding(.bottom, 8)
                .onGeometryChange(for: CGFloat.self) { proxy in
                    proxy.size.height
                } action: { newHeight in
                    let roundedHeight = ceil(newHeight)
                    if abs(composerReservedHeight - roundedHeight) > 1 {
                        composerReservedHeight = roundedHeight
                    }
                }
            }
        }
    }

    // MARK: - Floating Controls

    private var floatingControls: some View {
        VStack {
            Spacer()
            HStack(alignment: .bottom) {
                VStack(spacing: 6) {
                    // Back/Forward nav on compact
                    if horizontalSizeClass == .compact {
                        ChatNavButtons(viewModel: viewModel)
                    }

                    // Left: Collapse controls
                    CollapseControls(
                        onCollapseAll: { viewModel.collapseAll() },
                        onExpandAll: { viewModel.expandAll() }
                    )
                }
                .padding(.leading, 12)
                .padding(.bottom, 8)

                Spacer()

                // Right: Bubble navigation
                BubbleNavigationControls(
                    onScrollToTop: { scrollTo(index: 0) },
                    onPrevious: { scrollTo(index: max(currentMessageIndex - 1, 0)) },
                    onNext: { scrollTo(index: min(currentMessageIndex + 1, viewModel.messages.count - 1)) },
                    onScrollToBottom: { scrollTo(index: viewModel.messages.count - 1) }
                )
                .padding(.trailing, 12)
                .padding(.bottom, 8)
            }
        }
    }

    private func scrollTo(index: Int) {
        guard viewModel.messages.indices.contains(index) else { return }
        currentMessageIndex = index
        withAnimation(.easeOut(duration: 0.3)) {
            scrollProxy?.scrollTo(viewModel.messages[index].id, anchor: .center)
        }
    }

    // MARK: - Message List

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 0, pinnedViews: .sectionFooters) {
                    // Top padding so first message isn't clipped by navigation bar
                    Color.clear.frame(height: 8)

                    ForEach(Array(viewModel.messages.enumerated()), id: \.element.id) { index, message in
                        let isEditing = Binding<Bool>(
                            get: { viewModel.editingMessageID == message.id },
                            set: { viewModel.editingMessageID = $0 ? message.id : nil }
                        )

                        Section {
                            MessageBubble(
                                message: message,
                                onCopy: { viewModel.copyMessage(message) },
                                onDelete: { viewModel.deleteMessage(message.id) },
                                onRegenerate: { viewModel.regenerateMessage(message.id) },
                                onToggleOmit: { viewModel.toggleOmit(message.id) },
                                onToggleProtect: { viewModel.toggleProtect(message.id) },
                                onChangeRole: { viewModel.changeRole(message.id, to: $0) },
                                onToggleCollapse: { viewModel.toggleCollapse(message.id) },
                                isEditing: isEditing,
                                editText: $viewModel.editText,
                                showCardFooter: !message.isGenerating && !message.isCollapsed,
                                searchQuery: viewModel.isSearching ? viewModel.searchQuery : "",
                                isCurrentSearchMatch: isCurrentSearchMatch(message),
                                markdownMode: viewModel.settings?.markdownMode ?? false,
                                inlineLatex: viewModel.settings?.inlineLatex ?? false,
                                streamingMarkdownPolicy: viewModel.settings?.streamingMarkdownPolicy ?? .auto
                            )
                            .id(message.id)
                            .onTapGesture {
                                withAnimation(.easeOut(duration: 0.2)) {
                                    selectedMessageID = selectedMessageID == message.id ? nil : message.id
                                }
                            }
                        } footer: {
                            if !message.isGenerating && !message.isCollapsed {
                                let isSelected = selectedMessageID == message.id
                                let idx = viewModel.messages.firstIndex(where: { $0.id == message.id })
                                cardFooter(message: message) {
                                    ZStack {
                                        MessageEditBar(
                                            message: message,
                                            onSaveAndGenerate: {
                                                viewModel.editMessage(message.id, newContent: viewModel.editText)
                                                isEditing.wrappedValue = false
                                                viewModel.regenerateMessage(message.id)
                                            },
                                            onSave: {
                                                viewModel.editMessage(message.id, newContent: viewModel.editText)
                                                isEditing.wrappedValue = false
                                            },
                                            onCancel: { isEditing.wrappedValue = false },
                                            hasChanges: viewModel.editText != message.content
                                        )
                                        .opacity(isEditing.wrappedValue ? 1 : 0)
                                        .allowsHitTesting(isEditing.wrappedValue)

                                        MessageActionBar(
                                            message: message,
                                            onCopy: { viewModel.copyMessage(message) },
                                            onDelete: { viewModel.deleteMessage(message.id) },
                                            onRegenerate: { viewModel.regenerateMessage(message.id) },
                                            onMoveUp: { viewModel.moveMessageUp(message.id) },
                                            onMoveDown: { viewModel.moveMessageDown(message.id) },
                                            onEdit: { isEditing.wrappedValue = true },
                                            isFirst: idx == viewModel.messages.startIndex,
                                            isLast: idx == viewModel.messages.index(before: viewModel.messages.endIndex)
                                        )
                                        .opacity(!isEditing.wrappedValue && isSelected ? 1 : 0)
                                        .allowsHitTesting(!isEditing.wrappedValue && isSelected)
                                    }
                                }
                            }
                        }

                        // Separator with "+" button centered on it (outside Section)
                        if index < viewModel.messages.count - 1 {
                            ZStack {
                                Rectangle()
                                    .fill(Color.primary.opacity(0.06))
                                    .frame(height: 1)
                                if !viewModel.isGenerating {
                                    NewMessageButton(
                                        viewModel: viewModel,
                                        messageIndex: index,
                                        nodeId: message.nodeId,
                                        role: message.role
                                    )
                                }
                            }
                            .zIndex(1)
                        }
                    }
                }

                Color.clear
                    .frame(height: messageListBottomSpacerHeight)
            }
            .scrollDismissesKeyboard(.immediately)
            .onTapGesture {
                UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                withAnimation(.easeOut(duration: 0.2)) {
                    selectedMessageID = nil
                }
            }
            .onChange(of: viewModel.messages.count) {
                if let lastID = viewModel.messages.last?.id {
                    withAnimation(.easeOut(duration: 0.3)) {
                        proxy.scrollTo(lastID, anchor: .bottom)
                    }
                }
            }
            .onAppear { scrollProxy = proxy }
            .onChange(of: viewModel.searchCurrentMatch) {
                scrollToCurrentSearchMatch()
            }
            .onChange(of: viewModel.editingMessageID) { _, editingMessageID in
                if editingMessageID == nil {
                    editBarReservedHeight = 44
                    return
                }
                // Scroll so that the edit bar is visible near the bottom
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    if let id = editingMessageID {
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo("editbar-\(id)", anchor: .bottom)
                        }
                    }
                }
            }
        }
    }

    private var messageListBottomSpacerHeight: CGFloat {
        if viewModel.editingMessageID != nil {
            return max(
                composerReservedHeight + editBarReservedHeight,
                keyboardHeight + composerReservedHeight + editBarReservedHeight + keyboardClearance
            )
        }
        if keyboardVisible {
            return composerReservedHeight
        }
        return 0
    }

    /// Whether the given message is the currently focused search match.
    private func isCurrentSearchMatch(_ message: ChatMessage) -> Bool {
        guard viewModel.isSearching,
              viewModel.searchCurrentMatch > 0,
              viewModel.searchCurrentMatch <= viewModel.searchMatchIndices.count else {
            return false
        }
        let matchIndex = viewModel.searchMatchIndices[viewModel.searchCurrentMatch - 1]
        guard matchIndex < viewModel.messages.count else { return false }
        return viewModel.messages[matchIndex].id == message.id
    }

    /// Scroll to the currently focused search match.
    private func scrollToCurrentSearchMatch() {
        guard viewModel.searchCurrentMatch > 0,
              viewModel.searchCurrentMatch <= viewModel.searchMatchIndices.count else { return }
        let matchIndex = viewModel.searchMatchIndices[viewModel.searchCurrentMatch - 1]
        guard matchIndex < viewModel.messages.count else { return }
        let msgId = viewModel.messages[matchIndex].id
        withAnimation(.easeOut(duration: 0.3)) {
            scrollProxy?.scrollTo(msgId, anchor: .center)
        }
    }

    private func handleKeyboardWillShow(_ notification: Notification) {
        keyboardVisible = true
        keyboardHeight = keyboardOverlapHeight(from: notification)

        guard let editingID = viewModel.editingMessageID else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            withAnimation(.easeOut(duration: 0.2)) {
                scrollProxy?.scrollTo("editbar-\(editingID)", anchor: .bottom)
            }
        }
    }

    private func keyboardOverlapHeight(from notification: Notification) -> CGFloat {
        guard
            let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
            let windowScene = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .first,
            let window = windowScene.windows.first(where: \.isKeyWindow)
        else {
            return 0
        }

        let frameInWindow = window.convert(frame, from: nil)
        let overlap = max(0, window.bounds.maxY - frameInWindow.minY)
        return max(0, overlap - window.safeAreaInsets.bottom)
    }

    // Card-styled footer that visually continues the message card
    private func cardFooter<Content: View>(message: ChatMessage, @ViewBuilder content: () -> Content) -> some View {
        let bg: Color = switch message.role {
        case .user: AppColors.messageSurfaceUser
        case .assistant: AppColors.messageSurfaceAssistant
        case .system: Color(.tertiarySystemBackground)
        }
        let collapseColor: Color = switch message.role {
        case .user: Color(red: 0.22, green: 0.45, blue: 0.85)
        case .assistant: Color(red: 0.06, green: 0.64, blue: 0.50)
        case .system: Color(red: 0.49, green: 0.64, blue: 0.89)
        }
        let shape = UnevenRoundedRectangle(
            topLeadingRadius: 0, bottomLeadingRadius: 14,
            bottomTrailingRadius: 14, topTrailingRadius: 0
        )
        return HStack(spacing: 0) {
            // Collapse bar continuation
            Rectangle()
                .fill(message.isCollapsed ? collapseColor.opacity(0.6) : collapseColor.opacity(0.2))
                .frame(width: 3)
                .clipShape(UnevenRoundedRectangle(
                    topLeadingRadius: 0, bottomLeadingRadius: 2,
                    bottomTrailingRadius: 2, topTrailingRadius: 0
                ))
                .padding(.horizontal, 7)

            // Footer card
            content()
                .padding(.horizontal, 8)
                .padding(.top, 4)
                .padding(.bottom, 8)
                .frame(maxWidth: .infinity)
                .background(bg, in: shape)
                .overlay {
                    shape
                        .stroke(Color.primary.opacity(0.06), lineWidth: 0.5)
                        .mask {
                            VStack(spacing: 0) {
                                Color.clear.frame(height: 1)
                                Color.black
                            }
                        }
                }
                .padding(.trailing, 16)
        }
        .padding(.bottom, 12) // Space before separator / "+" button
    }
}

// MARK: - Empty State

struct ChatEmptyState: View {
    var body: some View {
        ZStack {
            AppColors.background.ignoresSafeArea()
            VStack(spacing: 12) {
                Image(systemName: "bubble.left.and.bubble.right")
                    .font(.system(size: 48))
                    .foregroundStyle(.quaternary)
                Text("Select or start a conversation")
                    .foregroundStyle(.secondary)
            }
        }
    }
}
