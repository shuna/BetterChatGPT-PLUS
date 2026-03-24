import SwiftUI
import WeaveletDomain

/// Root view that adapts layout to iPad (3-column) or iPhone (sidebar + tabs).
struct AdaptiveRootView: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        if horizontalSizeClass == .regular {
            RegularLayoutView()
        } else {
            CompactLayoutView()
        }
    }
}

// MARK: - iPad: 3-Column Resizable Layout

/// iPad layout with NavigationSplitView: sidebar | conversation | inspector (branch editor).
/// All panels are resizable.
struct RegularLayoutView: View {
    @Environment(AppState.self) private var appState
    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    @State private var sidebarWidth: CGFloat = 260

    var body: some View {
        @Bindable var conversation = appState.conversation

        HStack(spacing: 0) {
            // Sidebar with resize handle
            NavigationStack {
                ChatListView()
                    .navigationTitle("Chats")
            }
            .frame(width: sidebarWidth)

            ResizableHandle(
                axis: .horizontal,
                offset: $sidebarWidth,
                range: 180...400
            )

            // Main content area
            if conversation.activeView.isBranchEditorVisible {
                // Split view: conversation + branch editor
                ResizableSplitView(
                    axis: conversation.activeView == .splitVertical ? .vertical : .horizontal,
                    ratio: Bindable(appState.settings).splitPanelRatio,
                    minRatio: 0.25,
                    maxRatio: 0.75
                ) {
                    if conversation.panelsSwapped {
                        BranchTreeEditorView()
                    } else {
                        ConversationView()
                    }
                } trailing: {
                    if conversation.panelsSwapped {
                        ConversationView()
                    } else {
                        BranchTreeEditorView()
                    }
                }
            } else {
                // Chat only
                ConversationView()
            }
        }
    }
}

// MARK: - iPhone: Swipe Sidebar + Tab Switching

/// iPhone layout: swipe-from-left sidebar + tab bar for conversation/branch editor.
struct CompactLayoutView: View {
    @Environment(AppState.self) private var appState
    @State private var showSidebar = false

    var body: some View {
        @Bindable var conversation = appState.conversation

        ZStack {
            // Main content with tab switching
            NavigationStack {
                CompactTabView()
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button {
                                withAnimation(.easeInOut(duration: 0.25)) {
                                    showSidebar = true
                                }
                            } label: {
                                Image(systemName: "sidebar.left")
                            }
                        }
                        ToolbarItem(placement: .principal) {
                            Text(appState.conversation.chat.title)
                                .font(.headline)
                                .lineLimit(1)
                        }
                    }
            }

            // Sidebar overlay
            if showSidebar {
                SidebarOverlay(isPresented: $showSidebar)
            }
        }
        .gesture(
            DragGesture()
                .onEnded { value in
                    // Swipe from left edge to open sidebar
                    if value.startLocation.x < 20 && value.translation.width > 80 {
                        withAnimation(.easeInOut(duration: 0.25)) {
                            showSidebar = true
                        }
                    }
                }
        )
    }
}

/// Tab view switching between conversation and branch editor on iPhone.
struct CompactTabView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        @Bindable var conversation = appState.conversation

        TabView(selection: Bindable(conversation).activeView) {
            Tab("Chat", systemImage: "bubble.left.and.bubble.right", value: ChatView.chat) {
                ConversationView()
            }
            Tab("Branches", systemImage: "point.3.connected.trianglepath.dotted", value: ChatView.branchEditor) {
                BranchTreeEditorView()
            }
        }
        .tabViewStyle(.tabBarOnly)
    }
}

// MARK: - Sidebar Overlay (iPhone)

/// Slide-in sidebar with backdrop for iPhone.
struct SidebarOverlay: View {
    @Binding var isPresented: Bool
    @Environment(AppState.self) private var appState
    @State private var dragOffset: CGFloat = 0

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                // Backdrop
                Color.black
                    .opacity(0.3 * Double(1 - dragOffset / sidebarWidth(geo)))
                    .ignoresSafeArea()
                    .onTapGesture {
                        dismiss()
                    }

                // Sidebar panel
                HStack(spacing: 0) {
                    ChatListView()
                        .frame(width: sidebarWidth(geo))
                        .background(.regularMaterial)
                        .offset(x: dragOffset)

                    Spacer(minLength: 0)
                }
            }
        }
        .transition(.move(edge: .leading))
        .gesture(
            DragGesture()
                .onChanged { value in
                    if value.translation.width < 0 {
                        dragOffset = value.translation.width
                    }
                }
                .onEnded { value in
                    if value.translation.width < -80 {
                        dismiss()
                    } else {
                        withAnimation(.easeOut(duration: 0.2)) {
                            dragOffset = 0
                        }
                    }
                }
        )
    }

    private func sidebarWidth(_ geo: GeometryProxy) -> CGFloat {
        min(geo.size.width * 0.8, 320)
    }

    private func dismiss() {
        withAnimation(.easeInOut(duration: 0.25)) {
            isPresented = false
            dragOffset = 0
        }
    }
}
