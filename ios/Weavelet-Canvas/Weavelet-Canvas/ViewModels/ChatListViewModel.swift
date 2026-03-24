import SwiftUI
import WeaveletDomain

/// Sort order for chat list.
enum ChatSortOrder: String, CaseIterable {
    case dateDesc = "Newest First"
    case dateAsc = "Oldest First"
    case nameAsc = "Name A→Z"
    case nameDesc = "Name Z→A"
}

/// Manages the list of chats, folders, and current selection.
/// Replaces Zustand chat-slice (list/folder portion).
@Observable
final class ChatListViewModel {
    var chats: [Chat] = []
    var currentChatIndex: Int = 0
    var folders: [String: Folder] = [:]
    var searchText: String = ""
    var sortOrder: ChatSortOrder = .dateDesc

    /// Edit mode for multi-select operations.
    var isEditing = false
    var selectedChatIds: Set<String> = []

    /// The currently selected chat, if any.
    var currentChat: Chat? {
        guard currentChatIndex >= 0, currentChatIndex < chats.count else { return nil }
        return chats[currentChatIndex]
    }

    private let contentStore: ContentStore

    init(contentStore: ContentStore) {
        self.contentStore = contentStore
    }

    // MARK: - Chat Operations

    func createNewChat(contentStore: ContentStore) {
        let chat = Chat(
            title: "New Chat",
            config: ChatConfig()
        )
        chats.insert(chat, at: 0)
        currentChatIndex = 0
    }

    func selectChat(at index: Int) {
        guard index >= 0, index < chats.count else { return }
        currentChatIndex = index
    }

    func selectChat(id: String) {
        if let index = chats.firstIndex(where: { $0.id == id }) {
            currentChatIndex = index
        }
    }

    func deleteChat(at index: Int, contentStore: ContentStore) {
        guard index >= 0, index < chats.count else { return }

        // Release all content references
        if let tree = chats[index].branchTree {
            for node in tree.nodes.values {
                contentStore.releaseContent(node.contentHash)
            }
        }

        chats.remove(at: index)

        if currentChatIndex >= chats.count {
            currentChatIndex = max(0, chats.count - 1)
        }
    }

    func deleteChats(ids: Set<String>, contentStore: ContentStore) {
        for id in ids {
            if let idx = chats.firstIndex(where: { $0.id == id }) {
                if let tree = chats[idx].branchTree {
                    for node in tree.nodes.values {
                        contentStore.releaseContent(node.contentHash)
                    }
                }
            }
        }
        chats.removeAll { ids.contains($0.id) }
        if currentChatIndex >= chats.count {
            currentChatIndex = max(0, chats.count - 1)
        }
        selectedChatIds.removeAll()
    }

    func renameChat(at index: Int, title: String) {
        guard index >= 0, index < chats.count else { return }
        chats[index].title = title
        chats[index].titleSet = true
    }

    func renameChat(id: String, title: String) {
        guard let idx = chats.firstIndex(where: { $0.id == id }) else { return }
        chats[idx].title = title
        chats[idx].titleSet = true
    }

    func cloneChat(_ chat: Chat, contentStore: ContentStore) -> Chat {
        var clone = chat
        clone.id = UUID().uuidString
        clone.title = chat.title + " (Copy)"
        clone.titleSet = true

        // Increment content refcounts for the clone
        if let tree = clone.branchTree {
            for node in tree.nodes.values {
                contentStore.retainContent(node.contentHash)
            }
        }

        chats.insert(clone, at: 0)
        currentChatIndex = 0
        return clone
    }

    func moveChat(from source: IndexSet, to destination: Int) {
        chats.move(fromOffsets: source, toOffset: destination)
        if let first = source.first {
            if first == currentChatIndex {
                currentChatIndex = destination > first ? destination - 1 : destination
            }
        }
    }

    // MARK: - Folder Operations

    func createFolder(name: String) {
        let folder = Folder(name: name, order: folders.count)
        folders[folder.id] = folder
    }

    func renameFolder(id: String, name: String) {
        folders[id]?.name = name
    }

    func deleteFolder(id: String) {
        // Move chats out of folder first
        for i in chats.indices where chats[i].folder == id {
            chats[i].folder = nil
        }
        folders.removeValue(forKey: id)
    }

    func toggleFolderExpanded(id: String) {
        folders[id]?.expanded.toggle()
    }

    func setFolderColor(id: String, color: String?) {
        folders[id]?.color = color
    }

    func moveToFolder(chatIndex: Int, folderId: String?) {
        guard chatIndex >= 0, chatIndex < chats.count else { return }
        chats[chatIndex].folder = folderId
    }

    func moveToFolder(chatId: String, folderId: String?) {
        guard let idx = chats.firstIndex(where: { $0.id == chatId }) else { return }
        chats[idx].folder = folderId
    }

    func moveFolders(from source: IndexSet, to destination: Int) {
        var ordered = sortedFolders
        ordered.move(fromOffsets: source, toOffset: destination)
        for (i, folder) in ordered.enumerated() {
            folders[folder.id]?.order = i
        }
    }

    /// Sorted folder list.
    var sortedFolders: [Folder] {
        folders.values.sorted { $0.order < $1.order }
    }

    /// Chats not in any folder.
    var unfolderedChats: [Chat] {
        sortedAndFiltered(chats.filter { $0.folder == nil })
    }

    /// Chats in a specific folder.
    func chatsInFolder(_ folderId: String) -> [Chat] {
        sortedAndFiltered(chats.filter { $0.folder == folderId })
    }

    // MARK: - Search & Sort

    var filteredChats: [Chat] {
        sortedAndFiltered(chats)
    }

    private func sortedAndFiltered(_ source: [Chat]) -> [Chat] {
        var result = source
        if !searchText.isEmpty {
            result = result.filter { $0.title.localizedCaseInsensitiveContains(searchText) }
        }
        switch sortOrder {
        case .dateDesc:
            break // Already in insertion order (newest first)
        case .dateAsc:
            result.reverse()
        case .nameAsc:
            result.sort { $0.title.localizedCompare($1.title) == .orderedAscending }
        case .nameDesc:
            result.sort { $0.title.localizedCompare($1.title) == .orderedDescending }
        }
        return result
    }

    // MARK: - Edit Mode

    func toggleSelection(_ chatId: String) {
        if selectedChatIds.contains(chatId) {
            selectedChatIds.remove(chatId)
        } else {
            selectedChatIds.insert(chatId)
        }
    }

    func selectAll() {
        selectedChatIds = Set(filteredChats.map(\.id))
    }

    func deselectAll() {
        selectedChatIds.removeAll()
    }

    // MARK: - Export

    func exportChatJSON(_ chat: Chat) -> Data? {
        let persisted = PersistedChat(from: chat)
        let export = ExportV3(
            chats: [persisted],
            contentStore: contentStore.data,
            folders: folders
        )
        return try? JSONEncoder().encode(export)
    }
}
