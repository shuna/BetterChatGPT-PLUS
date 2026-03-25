import SwiftUI
import WeaveletDomain

/// Sidebar chat list with folders, search, sort, edit mode, and chat management.
struct ChatListView: View {
    @Environment(AppState.self) private var appState
    @State private var showSettings = false
    @State private var showNewFolder = false
    @State private var newFolderName = ""
    @State private var showSortMenu = false
    @State private var renamingChatId: String?
    @State private var renameText = ""
    @State private var renamingFolderId: String?
    @State private var renameFolderText = ""
    @State private var showDeleteConfirm = false
    @State private var exportingChat: Chat?

    private var chatList: ChatListViewModel { appState.chatList }

    var body: some View {
        @Bindable var cl = appState.chatList

        List(selection: cl.isEditing ? Bindable(cl).selectedChatIds : nil) {
            // New chat button
            newChatButton
                .listRowSeparator(.hidden)

            // Folders (reorderable)
            ForEach(chatList.sortedFolders) { folder in
                folderSection(folder)
            }
            .onMove { source, destination in
                chatList.moveFolders(from: source, to: destination)
            }

            // Unfoldered chats
            Section(chatList.sortedFolders.isEmpty ? "" : "Chats") {
                ForEach(chatList.unfolderedChats, id: \.id) { chat in
                    chatRow(chat)
                }
            }
        }
        .listStyle(.sidebar)
        .searchable(text: Bindable(cl).searchText, prompt: "Search chats")
        .environment(\.editMode, cl.isEditing ? .constant(.active) : .constant(.inactive))
        .toolbar { toolbarContent }
        .onChange(of: chatList.currentChatIndex) {
            if let chat = chatList.currentChat {
                appState.conversation.syncToList(appState.chatList)
                appState.conversation.setActiveChat(chat, contentStore: appState.conversation.contentStore)
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .environment(appState)
        }
        .alert("New Folder", isPresented: $showNewFolder) {
            TextField("Folder name", text: $newFolderName)
            Button("Create") {
                if !newFolderName.isEmpty {
                    chatList.createFolder(name: newFolderName)
                    newFolderName = ""
                }
            }
            Button("Cancel", role: .cancel) { newFolderName = "" }
        }
        .alert("Rename Chat", isPresented: .init(
            get: { renamingChatId != nil },
            set: { if !$0 { renamingChatId = nil } }
        )) {
            TextField("Chat title", text: $renameText)
            Button("Save") {
                if let id = renamingChatId, !renameText.isEmpty {
                    chatList.renameChat(id: id, title: renameText)
                }
                renamingChatId = nil
            }
            Button("Cancel", role: .cancel) { renamingChatId = nil }
        }
        .alert("Rename Folder", isPresented: .init(
            get: { renamingFolderId != nil },
            set: { if !$0 { renamingFolderId = nil } }
        )) {
            TextField("Folder name", text: $renameFolderText)
            Button("Save") {
                if let id = renamingFolderId, !renameFolderText.isEmpty {
                    chatList.renameFolder(id: id, name: renameFolderText)
                }
                renamingFolderId = nil
            }
            Button("Cancel", role: .cancel) { renamingFolderId = nil }
        }
        .confirmationDialog(
            "Delete \(chatList.selectedChatIds.count) chat(s)?",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                chatList.deleteChats(ids: chatList.selectedChatIds, contentStore: appState.conversation.contentStore)
                if let chat = chatList.currentChat {
                    appState.conversation.setActiveChat(chat, contentStore: appState.conversation.contentStore)
                }
                chatList.isEditing = false
            }
        }
        .sheet(item: $exportingChat) { chat in
            ExportFormatsView(
                chat: chat,
                contentStore: appState.conversation.contentStore,
                folders: chatList.folders
            )
        }
    }

    // MARK: - New Chat Button

    @ViewBuilder
    private var newChatButton: some View {
        Button {
            chatList.createNewChat(contentStore: appState.conversation.contentStore, defaultSystemMessage: appState.settings.defaultSystemMessage, defaultChatConfig: appState.settings.defaultChatConfig)
            if let chat = chatList.currentChat {
                appState.conversation.setActiveChat(chat, contentStore: appState.conversation.contentStore)
            }
        } label: {
            Label("New Chat", systemImage: "plus.bubble")
        }
    }

    // MARK: - Folder Section

    @ViewBuilder
    private func folderSection(_ folder: Folder) -> some View {
        Section(isExpanded: Binding(
            get: { folder.expanded },
            set: { _ in chatList.toggleFolderExpanded(id: folder.id) }
        )) {
            ForEach(chatList.chatsInFolder(folder.id), id: \.id) { chat in
                chatRow(chat)
            }
        } header: {
            folderHeader(folder)
        }
    }

    @ViewBuilder
    private func folderHeader(_ folder: Folder) -> some View {
        HStack(spacing: 6) {
            if let colorHex = folder.color {
                Circle()
                    .fill(Color(hex: colorHex) ?? .accentColor)
                    .frame(width: 8, height: 8)
            }
            Text(folder.name)
                .fontWeight(.semibold)
        }
        .contextMenu {
            Button {
                renameFolderText = folder.name
                renamingFolderId = folder.id
            } label: {
                Label("Rename", systemImage: "pencil")
            }

            Menu("Folder Color") {
                ForEach(FolderColors.all, id: \.self) { hex in
                    Button {
                        chatList.setFolderColor(id: folder.id, color: hex)
                    } label: {
                        Label(FolderColors.name(for: hex), systemImage: "circle.fill")
                    }
                }
                Button("Reset") {
                    chatList.setFolderColor(id: folder.id, color: nil)
                }
            }

            Divider()

            Button(role: .destructive) {
                chatList.deleteFolder(id: folder.id)
            } label: {
                Label("Delete Folder", systemImage: "trash")
            }
        }
    }

    // MARK: - Chat Row

    @ViewBuilder
    private func chatRow(_ chat: Chat) -> some View {
        Button {
            chatList.selectChat(id: chat.id)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(chat.title)
                    .font(.body)
                    .lineLimit(1)

                if !chat.messages.isEmpty {
                    Text(lastMessagePreview(chat))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .padding(.vertical, 2)
        }
        .tag(chat.id)
        .listRowBackground(
            isSelected(chat)
                ? RoundedRectangle(cornerRadius: 8).fill(.tint.opacity(0.15))
                : nil
        )
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                if let idx = chatList.chats.firstIndex(where: { $0.id == chat.id }) {
                    chatList.deleteChat(at: idx, contentStore: appState.conversation.contentStore)
                    if let current = chatList.currentChat {
                        appState.conversation.setActiveChat(current, contentStore: appState.conversation.contentStore)
                    }
                }
            } label: {
                Label("Delete", systemImage: "trash")
            }

            Button {
                exportingChat = chat
            } label: {
                Label("Export", systemImage: "square.and.arrow.up")
            }
            .tint(.blue)
        }
        .swipeActions(edge: .leading, allowsFullSwipe: false) {
            Button {
                renameText = chat.title
                renamingChatId = chat.id
            } label: {
                Label("Rename", systemImage: "pencil")
            }
            .tint(.orange)
        }
        .contextMenu {
            chatContextMenu(chat)
        }
    }

    @ViewBuilder
    private func chatContextMenu(_ chat: Chat) -> some View {
        Button {
            renameText = chat.title
            renamingChatId = chat.id
        } label: {
            Label("Rename", systemImage: "pencil")
        }

        Button {
            _ = chatList.cloneChat(chat, contentStore: appState.conversation.contentStore)
            if let current = chatList.currentChat {
                appState.conversation.setActiveChat(current, contentStore: appState.conversation.contentStore)
            }
        } label: {
            Label("Clone", systemImage: "doc.on.doc")
        }

        Button {
            exportingChat = chat
        } label: {
            Label("Export", systemImage: "square.and.arrow.up")
        }

        // Move to folder submenu
        if !chatList.folders.isEmpty {
            Menu("Move to Folder") {
                Button("None (Remove from folder)") {
                    chatList.moveToFolder(chatId: chat.id, folderId: nil)
                }
                ForEach(chatList.sortedFolders) { folder in
                    Button(folder.name) {
                        chatList.moveToFolder(chatId: chat.id, folderId: folder.id)
                    }
                }
            }
        }

        Divider()

        Button(role: .destructive) {
            if let idx = chatList.chats.firstIndex(where: { $0.id == chat.id }) {
                chatList.deleteChat(at: idx, contentStore: appState.conversation.contentStore)
                if let current = chatList.currentChat {
                    appState.conversation.setActiveChat(current, contentStore: appState.conversation.contentStore)
                }
            }
        } label: {
            Label("Delete", systemImage: "trash")
        }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarTrailing) {
            Menu {
                ForEach(ChatSortOrder.allCases, id: \.self) { order in
                    Button {
                        chatList.sortOrder = order
                    } label: {
                        HStack {
                            Text(order.rawValue)
                            if chatList.sortOrder == order {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                }
            } label: {
                Image(systemName: "arrow.up.arrow.down")
            }

            Button {
                showNewFolder = true
            } label: {
                Image(systemName: "folder.badge.plus")
            }

            Button {
                withAnimation {
                    chatList.isEditing.toggle()
                    if !chatList.isEditing {
                        chatList.selectedChatIds.removeAll()
                    }
                }
            } label: {
                Text(chatList.isEditing ? "Done" : "Edit")
            }
        }

        ToolbarItemGroup(placement: .bottomBar) {
            if chatList.isEditing {
                Button("Select All") { chatList.selectAll() }
                Spacer()
                Button("Delete Selected", role: .destructive) {
                    if !chatList.selectedChatIds.isEmpty {
                        showDeleteConfirm = true
                    }
                }
                .disabled(chatList.selectedChatIds.isEmpty)
            } else {
                Button {
                    showSettings = true
                } label: {
                    Label("Settings", systemImage: "gear")
                }
                Spacer()
            }
        }
    }

    // MARK: - Helpers

    private func isSelected(_ chat: Chat) -> Bool {
        guard let current = chatList.currentChat else { return false }
        return current.id == chat.id
    }

    private func lastMessagePreview(_ chat: Chat) -> String {
        guard let last = chat.messages.last else { return "" }
        let prefix = last.role == .user ? "You: " : ""
        let text = last.content.compactMap(\.textValue).joined()
        return prefix + String(text.prefix(60))
    }
}

// MARK: - Export Share Sheet

struct ExportShareSheet: View {
    let chat: Chat
    let chatList: ChatListViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Image(systemName: "square.and.arrow.up")
                    .font(.largeTitle)
                    .foregroundStyle(.secondary)

                Text("Export \"\(chat.title)\"")
                    .font(.headline)

                if let data = chatList.exportChatJSON(chat) {
                    let url = exportToTempFile(data: data, name: chat.title)
                    if let url {
                        ShareLink(item: url) {
                            Label("Share JSON", systemImage: "doc.text")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }

                Spacer()
            }
            .padding()
            .navigationTitle("Export Chat")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func exportToTempFile(data: Data, name: String) -> URL? {
        let safeName = name.replacingOccurrences(of: "/", with: "_")
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(safeName).json")
        try? data.write(to: url)
        return url
    }
}

// MARK: - Chat Identifiable conformance for sheet

extension Chat: @retroactive Identifiable {}

// MARK: - Folder Color Palette

enum FolderColors {
    static let all: [String] = [
        "#EF4444", "#F97316", "#EAB308", "#22C55E",
        "#06B6D4", "#3B82F6", "#8B5CF6", "#EC4899"
    ]

    static func name(for hex: String) -> String {
        switch hex {
        case "#EF4444": return "Red"
        case "#F97316": return "Orange"
        case "#EAB308": return "Yellow"
        case "#22C55E": return "Green"
        case "#06B6D4": return "Cyan"
        case "#3B82F6": return "Blue"
        case "#8B5CF6": return "Purple"
        case "#EC4899": return "Pink"
        default: return "Custom"
        }
    }
}

// MARK: - Color from Hex

extension Color {
    init?(hex: String) {
        var hexString = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if hexString.hasPrefix("#") { hexString.removeFirst() }
        guard hexString.count == 6,
              let rgb = UInt64(hexString, radix: 16) else { return nil }
        self.init(
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255
        )
    }
}
