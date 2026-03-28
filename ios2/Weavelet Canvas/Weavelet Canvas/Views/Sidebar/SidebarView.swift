//
//  SidebarView.swift
//  Weavelet Canvas
//

import SwiftUI
import Observation
import UniformTypeIdentifiers

// MARK: - Shared State

@Observable
final class SidebarState {
    var editMode: EditMode = .inactive
    var selectedChatIDs: Set<String> = []

    var isEditing: Bool { editMode.isEditing }

    func toggleEditMode() {
        withAnimation {
            if editMode.isEditing {
                editMode = .inactive
                selectedChatIDs.removeAll()
            } else {
                editMode = .active
            }
        }
    }
}

// MARK: - Sidebar Root

struct SidebarView: View {
    @Bindable var state: SidebarState
    var chatViewModel: ChatViewModel
    var settings: SettingsViewModel?
    @State private var searchText = ""
    @State private var menuOptionsExpanded = true
    @State private var exportChatId: String?

    var body: some View {
        VStack(spacing: 0) {
            ChatListSection(
                state: state,
                chatViewModel: chatViewModel,
                searchText: $searchText,
                exportChatId: $exportChatId
            )

            Divider()

            MenuOptionsSection(
                isExpanded: $menuOptionsExpanded,
                chatViewModel: chatViewModel,
                settings: settings
            )
        }
        .navigationTitle("")
        .sheet(item: Binding(
            get: { exportChatId.map { IdentifiableChatId(id: $0) } },
            set: { exportChatId = $0?.id }
        )) { item in
            ExportSheet(chatId: item.id, chatViewModel: chatViewModel)
        }
    }
}

private struct IdentifiableChatId: Identifiable {
    let id: String
}

// MARK: - Chat List

private struct ChatListSection: View {
    @Bindable var state: SidebarState
    var chatViewModel: ChatViewModel
    @Binding var searchText: String
    @Binding var exportChatId: String?

    private var folderEntries: [(id: String, folder: Folder)] {
        chatViewModel.folders
            .sorted { ($0.value.order ?? 0) < ($1.value.order ?? 0) }
            .map { (id: $0.key, folder: $0.value) }
    }

    /// Chats not in any folder
    private var unfolderedChats: [Chat] {
        let folderIDs = Set(chatViewModel.folders.keys)
        return chatViewModel.chats.filter { chat in
            chat.folder == nil || !folderIDs.contains(chat.folder!)
        }
    }

    private var filteredUnfolderedChats: [Chat] {
        if searchText.isEmpty { return unfolderedChats }
        return unfolderedChats.filter { $0.title.localizedCaseInsensitiveContains(searchText) }
    }

    private func chatsInFolder(_ folderID: String) -> [Chat] {
        let chats = chatViewModel.chats.filter { $0.folder == folderID }
        if searchText.isEmpty { return chats }
        return chats.filter { $0.title.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        List(selection: state.isEditing ? $state.selectedChatIDs : nil) {
            ForEach(folderEntries, id: \.id) { entry in
                FolderRow(
                    folderID: entry.id,
                    folder: entry.folder,
                    chats: chatsInFolder(entry.id),
                    activeChatID: chatViewModel.currentChatID,
                    allFolders: folderEntries,
                    onSelectChat: { chatViewModel.selectChat($0) },
                    onDeleteChat: { chatViewModel.deleteChat($0) },
                    onRenameChat: { chatID, newTitle in
                        chatViewModel.renameChat(chatID, title: newTitle)
                    },
                    onMoveChat: { chatID, targetFolderID in
                        chatViewModel.moveChatToFolder(chatID, folderID: targetFolderID)
                    },
                    onDuplicateChat: { chatID in
                        chatViewModel.duplicateChat(chatID)
                    },
                    onExportChat: { chatID in
                        exportChatId = chatID
                    },
                    onRenameFolder: { newName in
                        chatViewModel.renameFolder(entry.id, name: newName)
                    },
                    onDeleteFolder: {
                        chatViewModel.deleteFolder(entry.id)
                    },
                    onChangeFolderColor: { color in
                        chatViewModel.changeFolderColor(entry.id, color: color)
                    }
                )
            }

            ForEach(filteredUnfolderedChats) { chat in
                ChatRow(
                    chat: chat,
                    isActive: chat.id == chatViewModel.currentChatID,
                    folders: folderEntries,
                    onSelect: { chatViewModel.selectChat(chat.id) },
                    onDelete: { chatViewModel.deleteChat(chat.id) },
                    onRename: { newTitle in chatViewModel.renameChat(chat.id, title: newTitle) },
                    onDuplicate: { chatViewModel.duplicateChat(chat.id) },
                    onMove: { folderID in chatViewModel.moveChatToFolder(chat.id, folderID: folderID) },
                    onExport: { exportChatId = chat.id }
                )
            }
        }
        .listStyle(.sidebar)
        .searchable(text: $searchText, prompt: "Search chats")
        .environment(\.editMode, $state.editMode)
    }
}

// MARK: - Folder Row

private struct FolderRow: View {
    let folderID: String
    let folder: Folder
    let chats: [Chat]
    let activeChatID: String?
    let allFolders: [(id: String, folder: Folder)]

    let onSelectChat: (String) -> Void
    let onDeleteChat: (String) -> Void
    let onRenameChat: (String, String) -> Void
    let onMoveChat: (String, String?) -> Void
    let onDuplicateChat: (String) -> Void
    let onExportChat: (String) -> Void
    let onRenameFolder: (String) -> Void
    let onDeleteFolder: () -> Void
    let onChangeFolderColor: (String?) -> Void

    @Environment(\.editMode) private var editMode
    @State private var isExpanded = true
    @State private var isRenaming = false
    @State private var editedName = ""
    @State private var showDeleteConfirmation = false

    private var folderColor: Color {
        if let c = folder.color {
            return FolderColor(rawValue: c)?.color ?? .secondary
        }
        return .secondary
    }

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            ForEach(chats) { chat in
                ChatRow(
                    chat: chat,
                    isActive: chat.id == activeChatID,
                    folders: allFolders,
                    onSelect: { onSelectChat(chat.id) },
                    onDelete: { onDeleteChat(chat.id) },
                    onRename: { newTitle in onRenameChat(chat.id, newTitle) },
                    onDuplicate: { onDuplicateChat(chat.id) },
                    onMove: { targetFolderID in onMoveChat(chat.id, targetFolderID) },
                    onExport: { onExportChat(chat.id) }
                )
            }
        } label: {
            Label {
                if isRenaming {
                    TextField("Folder name", text: $editedName)
                        .onSubmit { commitRename() }
                } else {
                    Text(folder.name)
                        .lineLimit(1)
                }
            } icon: {
                Image(systemName: "folder.fill")
                    .foregroundStyle(folderColor)
            }
            .contextMenu {
                if editMode?.wrappedValue.isEditing != true {
                    Button {
                        editedName = folder.name
                        isRenaming = true
                    } label: {
                        Label("Rename", systemImage: "pencil")
                    }

                    Menu {
                        ForEach(FolderColor.allCases) { fc in
                            Button {
                                onChangeFolderColor(fc.rawValue)
                            } label: {
                                Label(fc.name, systemImage: "circle.fill")
                            }
                        }
                        Divider()
                        Button {
                            onChangeFolderColor(nil)
                        } label: {
                            Label("Default", systemImage: "arrow.counterclockwise")
                        }
                    } label: {
                        Label("Color", systemImage: "paintpalette")
                    }

                    Divider()

                    Button(role: .destructive) {
                        showDeleteConfirmation = true
                    } label: {
                        Label("Delete Folder", systemImage: "trash")
                    }
                }
            }
        }
        .confirmationDialog(
            "Delete \"\(folder.name)\"?",
            isPresented: $showDeleteConfirmation,
            titleVisibility: .visible
        ) {
            Button("Delete Folder", role: .destructive) {
                onDeleteFolder()
            }
        } message: {
            Text("Chats in this folder will be moved out, not deleted.")
        }
    }

    private func commitRename() {
        let trimmed = editedName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            onRenameFolder(trimmed)
        }
        isRenaming = false
    }
}

// MARK: - Chat Row

private struct ChatRow: View {
    let chat: Chat
    let isActive: Bool
    let folders: [(id: String, folder: Folder)]

    let onSelect: () -> Void
    let onDelete: () -> Void
    let onRename: (String) -> Void
    let onDuplicate: () -> Void
    let onMove: (String?) -> Void
    let onExport: () -> Void

    @Environment(\.editMode) private var editMode
    @State private var isRenaming = false
    @State private var editedTitle = ""
    @State private var showDeleteConfirmation = false

    private var isEditing: Bool { editMode?.wrappedValue.isEditing == true }

    var body: some View {
        Label {
            if isRenaming {
                TextField("Chat title", text: $editedTitle)
                    .onSubmit { commitRename() }
            } else {
                Text(chat.title)
                    .lineLimit(1)
            }
        } icon: {
            Image(systemName: "bubble.left")
                .foregroundStyle(.secondary)
        }
        .contentShape(Rectangle())
        .onTapGesture { onSelect() }
        .tag(chat.id)
        .listRowBackground(isActive ? Color.accentColor.opacity(0.12) : nil)
        .contextMenu {
            if !isEditing {
                Button {
                    editedTitle = chat.title
                    isRenaming = true
                } label: {
                    Label("Rename", systemImage: "pencil")
                }

                Button {
                    onDuplicate()
                } label: {
                    Label("Duplicate", systemImage: "doc.on.doc")
                }

                Menu {
                    Button {
                        onMove(nil)
                    } label: {
                        Label("No Folder", systemImage: "tray")
                    }

                    Divider()

                    ForEach(folders, id: \.id) { entry in
                        Button {
                            onMove(entry.id)
                        } label: {
                            Label(entry.folder.name, systemImage: "folder")
                        }
                    }
                } label: {
                    Label("Move to Folder", systemImage: "folder.badge.plus")
                }

                Button {
                    onExport()
                } label: {
                    Label("Export", systemImage: "square.and.arrow.up")
                }

                Divider()

                Button(role: .destructive) {
                    showDeleteConfirmation = true
                } label: {
                    Label("Delete", systemImage: "trash")
                }
            }
        }
        .confirmationDialog(
            "Delete \"\(chat.title)\"?",
            isPresented: $showDeleteConfirmation,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                onDelete()
            }
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            if !isEditing {
                Button(role: .destructive) {
                    showDeleteConfirmation = true
                } label: {
                    Label("Delete", systemImage: "trash")
                }
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: false) {
            if !isEditing {
                Button {
                    onDuplicate()
                } label: {
                    Label("Duplicate", systemImage: "doc.on.doc")
                }
                .tint(.blue)
            }
        }
    }

    private func commitRename() {
        let trimmed = editedTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            onRename(trimmed)
        }
        isRenaming = false
    }
}

// MARK: - Menu Options (Bottom Section)

private struct MenuOptionsSection: View {
    @Binding var isExpanded: Bool
    var chatViewModel: ChatViewModel
    var settings: SettingsViewModel?
    @State private var showImporter = false
    @State private var showExportAll = false
    @State private var showSettings = false
    @State private var importError: String?

    var body: some View {
        VStack(spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            } label: {
                Image(systemName: "chevron.down")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .rotationEffect(.degrees(isExpanded ? 0 : 180))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isExpanded {
                VStack(spacing: 2) {
                    MenuOptionButton(
                        title: "Settings",
                        icon: "gearshape",
                        action: { showSettings = true }
                    )
                    MenuOptionButton(
                        title: "Import",
                        icon: "square.and.arrow.down",
                        action: { showImporter = true }
                    )
                    MenuOptionButton(
                        title: "Export All",
                        icon: "square.and.arrow.up",
                        action: { exportAll() }
                    )
                    MenuOptionButton(
                        title: "Help",
                        icon: "questionmark.circle",
                        action: {}
                    )
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }

            Text("v1.0.0")
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .padding(.bottom, 4)
        }
        .fileImporter(
            isPresented: $showImporter,
            allowedContentTypes: [.json],
            allowsMultipleSelection: false
        ) { result in
            handleImport(result)
        }
        .alert("Import Error", isPresented: Binding(
            get: { importError != nil },
            set: { if !$0 { importError = nil } }
        )) {
            Button("OK") { importError = nil }
        } message: {
            Text(importError ?? "")
        }
        .sheet(isPresented: $showSettings) {
            if let settings {
                SettingsView(settings: settings, apiService: chatViewModel.apiService)
            }
        }
    }

    private func handleImport(_ result: Result<[URL], Error>) {
        do {
            let urls = try result.get()
            guard let url = urls.first else { return }

            guard url.startAccessingSecurityScopedResource() else {
                importError = "Unable to access the selected file."
                return
            }
            defer { url.stopAccessingSecurityScopedResource() }

            let data = try Data(contentsOf: url)
            try chatViewModel.importData(from: data)
        } catch {
            importError = error.localizedDescription
        }
    }

    private func exportAll() {
        do {
            let data = try chatViewModel.exportData()
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("weavelet-canvas-export.json")
            try data.write(to: url)
            chatViewModel.exportedFileURL = url
        } catch {
            chatViewModel.errorMessage = "Export failed: \(error.localizedDescription)"
        }
    }
}

private struct MenuOptionButton: View {
    let title: String
    let icon: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.subheadline)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 8)
                .padding(.horizontal, 8)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(.primary)
        .hoverEffect(.highlight)
    }
}

// MARK: - Folder Colors

enum FolderColor: String, CaseIterable, Identifiable {
    case red, orange, yellow, green, blue, purple, pink

    var id: String { rawValue }

    var name: String { rawValue.capitalized }

    var color: Color {
        switch self {
        case .red: .red
        case .orange: .orange
        case .yellow: .yellow
        case .green: .green
        case .blue: .blue
        case .purple: .purple
        case .pink: .pink
        }
    }
}

#Preview {
    NavigationStack {
        SidebarView(state: SidebarState(), chatViewModel: ChatViewModel())
            .navigationTitle("Chats")
    }
}
