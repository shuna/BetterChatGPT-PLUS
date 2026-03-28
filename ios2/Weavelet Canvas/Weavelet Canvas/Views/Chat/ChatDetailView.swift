import SwiftUI

struct ChatDetailView: View {
    @Bindable var viewModel: ChatViewModel
    var forceChat: Bool = false
    @State private var keyboardVisible = false
    @State private var currentMessageIndex = 0
    @State private var scrollProxy: ScrollViewProxy?
    @State private var selectedMessageID: UUID?

    var body: some View {
        Group {
            if forceChat || viewModel.viewMode == .chat {
                chatContentView
            } else {
                BranchEditorView(chatViewModel: viewModel)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            keyboardVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardVisible = false
        }
    }

    private var chatContentView: some View {
        ZStack {
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
            }
        }
    }

    // MARK: - Floating Controls

    private var floatingControls: some View {
        VStack {
            Spacer()
            HStack {
                // Left: Collapse controls
                CollapseControls(
                    onCollapseAll: { viewModel.collapseAll() },
                    onExpandAll: { viewModel.expandAll() }
                )
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
                    ForEach(viewModel.messages) { message in
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
                                if isEditing.wrappedValue {
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
                                } else if isSelected {
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
                                } else {
                                    // Reserve space so bubbles don't shift
                                    Color.clear.frame(height: 44)
                                }
                            }
                        }
                    }
                }
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
        }
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
}

// MARK: - Empty State

struct ChatEmptyState: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 48))
                .foregroundStyle(.quaternary)
            Text("Select or start a conversation")
                .foregroundStyle(.secondary)
        }
    }
}
