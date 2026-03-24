import Testing
import Foundation
@testable import WeaveletInfra
@testable import WeaveletDomain

@Test func saveAndLoadChat() throws {
    let tmpDir = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: tmpDir) }

    let repo = ChatRepository(baseDir: tmpDir)
    let store = ContentStore()

    // Create a chat with branch tree
    var chat = Chat(title: "Test Chat")
    BranchOps.appendNodeToActivePath(
        chat: &chat, role: .user, content: [.fromString("Hello")], contentStore: store
    )
    BranchOps.appendNodeToActivePath(
        chat: &chat, role: .assistant, content: [.fromString("Hi there!")], contentStore: store
    )

    // Save
    try repo.saveAll(chats: [chat], contentStore: store, activeChatId: chat.id)

    // Load into fresh store
    let freshStore = ContentStore()
    let (loaded, activeId) = repo.loadAll(contentStore: freshStore)

    #expect(loaded.count == 1)
    #expect(loaded[0].title == "Test Chat")
    #expect(loaded[0].messages.count == 2)
    #expect(loaded[0].messages[0].content[0].textValue == "Hello")
    #expect(loaded[0].messages[1].content[0].textValue == "Hi there!")
    #expect(activeId == chat.id)
    #expect(!freshStore.data.isEmpty)
}

@Test func persistedChatOmitsMessagesWhenBranchTreePresent() throws {
    let store = ContentStore()
    var chat = Chat(title: "Test")
    BranchOps.appendNodeToActivePath(
        chat: &chat, role: .user, content: [.fromString("Msg")], contentStore: store
    )

    let persisted = PersistedChat(from: chat)
    #expect(persisted.branchTree != nil)
    #expect(persisted.messages == nil) // Omitted when branchTree present

    // Encode and decode
    let data = try JSONEncoder().encode(persisted)
    let decoded = try JSONDecoder().decode(PersistedChat.self, from: data)
    #expect(decoded.messages == nil)

    // Restore to Chat
    let restored = decoded.toChat(contentStore: store)
    #expect(restored.messages.count == 1)
    #expect(restored.messages[0].content[0].textValue == "Msg")
}

@Test func persistedChatKeepsMessagesWhenNoBranchTree() throws {
    let chat = Chat(
        title: "Flat",
        messages: [Message(role: .user, text: "Hello")]
    )
    let persisted = PersistedChat(from: chat)
    #expect(persisted.messages?.count == 1)
    #expect(persisted.branchTree == nil)
}

@Test func exportV3Format() throws {
    let tmpDir = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: tmpDir) }

    let repo = ChatRepository(baseDir: tmpDir)
    let store = ContentStore()

    var chat = Chat(title: "Export Me")
    BranchOps.appendNodeToActivePath(
        chat: &chat, role: .user, content: [.fromString("Test")], contentStore: store
    )

    let folders: [String: Folder] = ["f1": Folder(id: "f1", name: "Work")]

    let export = repo.buildExportV3(chats: [chat], contentStore: store, folders: folders)
    let jsonData = try repo.encodeExportV3(export)

    // Verify JSON structure
    let json = try JSONSerialization.jsonObject(with: jsonData) as! [String: Any]
    #expect(json["version"] as? Int == 3)
    #expect((json["chats"] as? [[String: Any]])?.count == 1)
    #expect(json["contentStore"] != nil)
    #expect(json["folders"] != nil)
}

@Test func importExportV3RoundTrip() throws {
    let tmpDir = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: tmpDir) }

    let repo = ChatRepository(baseDir: tmpDir)
    let store = ContentStore()

    var chat = Chat(title: "Round Trip")
    BranchOps.appendNodeToActivePath(
        chat: &chat, role: .user, content: [.fromString("A")], contentStore: store
    )
    BranchOps.appendNodeToActivePath(
        chat: &chat, role: .assistant, content: [.fromString("B")], contentStore: store
    )

    // Export
    let export = repo.buildExportV3(chats: [chat], contentStore: store, folders: [:])
    let jsonData = try repo.encodeExportV3(export)

    // Import into fresh store
    let freshStore = ContentStore()
    let (imported, folders) = try repo.importExportV3(from: jsonData, contentStore: freshStore)

    #expect(imported.count == 1)
    #expect(imported[0].title == "Round Trip")
    #expect(imported[0].messages.count == 2)
    #expect(imported[0].messages[0].content[0].textValue == "A")
    #expect(imported[0].messages[1].content[0].textValue == "B")
}

@Test func deleteChatRemovesFile() throws {
    let tmpDir = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: tmpDir) }

    let repo = ChatRepository(baseDir: tmpDir)
    let chat = PersistedChat(from: Chat(title: "Delete Me"))
    try repo.saveChat(chat)

    // Verify file exists
    let loaded = repo.loadChat(id: chat.id)
    #expect(loaded != nil)

    // Delete
    repo.deleteChat(id: chat.id)
    let afterDelete = repo.loadChat(id: chat.id)
    #expect(afterDelete == nil)
}

@Test func metaPersistence() throws {
    let tmpDir = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: tmpDir) }

    let repo = ChatRepository(baseDir: tmpDir)
    try repo.saveMeta(chatIds: ["a", "b", "c"], activeChatId: "b")

    let repo2 = ChatRepository(baseDir: tmpDir)
    let meta = repo2.loadMeta()
    #expect(meta?.chatIds == ["a", "b", "c"])
    #expect(meta?.activeChatId == "b")
    #expect(meta?.version == 17)
}
