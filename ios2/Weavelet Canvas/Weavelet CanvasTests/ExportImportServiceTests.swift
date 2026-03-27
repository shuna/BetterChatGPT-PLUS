import Testing
import Foundation
@testable import Weavelet_Canvas

// MARK: - ExportImportService Tests

@Suite("ExportImportService")
struct ExportImportServiceTests {

    // MARK: - Helpers

    private func makeSampleChat(
        id: String = "chat-1",
        messages: [(Role, String)] = [(.user, "Hello"), (.assistant, "Hi")]
    ) -> (chat: Chat, store: ContentStoreData) {
        var store: ContentStoreData = [:]
        let msgs = messages.map { Message(role: $0.0, content: [.text($0.1)]) }
        var chat = Chat(id: id, title: "Test Chat")
        chat.branchTree = BranchService.flatMessagesToBranchTree(messages: msgs, contentStore: &store)
        chat.messages = msgs
        return (chat, store)
    }

    // MARK: - V3 Round-Trip

    @Test("V3 export and re-import preserves data")
    func v3RoundTrip() throws {
        let (chat, store) = makeSampleChat()
        let data = try ExportImportService.exportAsV3(chats: [chat], contentStore: store, folders: [:])
        let imported = try ExportImportService.importFromJSON(data)

        #expect(imported.chats.count == 1)
        #expect(imported.chats[0].id == chat.id)
        #expect(imported.chats[0].title == chat.title)
        #expect(imported.chats[0].branchTree!.activePath.count == 2)
        #expect(imported.contentStore.count == store.count)
    }

    @Test("V3 export with folders preserves folder data")
    func v3WithFolders() throws {
        let (chat, store) = makeSampleChat()
        let folder = Folder(id: "f1", name: "My Folder", expanded: true, order: 0, color: "blue")
        var chatWithFolder = chat
        chatWithFolder.folder = "f1"

        let data = try ExportImportService.exportAsV3(
            chats: [chatWithFolder], contentStore: store, folders: ["f1": folder]
        )
        let imported = try ExportImportService.importFromJSON(data)

        #expect(imported.folders["f1"]?.name == "My Folder")
        #expect(imported.chats[0].folder == "f1")
    }

    // MARK: - Format Detection

    @Test("detectImportType identifies V3")
    func detectV3() {
        let json: [String: Any] = ["version": 3, "chats": [], "contentStore": [:]]
        #expect(ExportImportService.detectImportType(json) == .exportV3)
    }

    @Test("detectImportType identifies V2")
    func detectV2() {
        let json: [String: Any] = ["chats": [], "contentStore": [:]]
        #expect(ExportImportService.detectImportType(json) == .exportV2)
    }

    @Test("detectImportType identifies V1")
    func detectV1() {
        let json: [String: Any] = ["chats": []]
        #expect(ExportImportService.detectImportType(json) == .exportV1)
    }

    @Test("detectImportType identifies legacy")
    func detectLegacy() {
        let json: [String: Any] = ["messages": []]
        #expect(ExportImportService.detectImportType(json) == .legacyImport)
    }

    @Test("detectImportType identifies OpenAI array")
    func detectOpenAI() {
        let json: [[String: Any]] = [["mapping": [:]]]
        #expect(ExportImportService.detectImportType(json) == .openAIContent)
    }

    @Test("detectImportType returns unknown for unrecognized")
    func detectUnknown() {
        let json: [String: Any] = ["foo": "bar"]
        #expect(ExportImportService.detectImportType(json) == .unknown)
    }

    // MARK: - V1 Import (no contentStore)

    @Test("V1 import creates content store from messages")
    func v1Import() throws {
        // Build V1-like JSON: chats with messages but no contentStore
        let msgs: [[String: Any]] = [
            ["role": "user", "content": [["type": "text", "text": "Hello"]]],
            ["role": "assistant", "content": [["type": "text", "text": "Hi"]]]
        ]
        let v1: [String: Any] = [
            "chats": [
                ["id": "c1", "title": "Test", "messages": msgs, "config": [
                    "model": "", "max_tokens": 4000, "temperature": 1.0,
                    "presence_penalty": 0, "top_p": 1.0, "frequency_penalty": 0
                ], "titleSet": false, "imageDetail": "auto"]
            ]
        ]
        let data = try JSONSerialization.data(withJSONObject: v1)
        let imported = try ExportImportService.importFromJSON(data)

        #expect(imported.chats.count == 1)
        #expect(imported.chats[0].branchTree != nil)
        #expect(imported.contentStore.count >= 1)
    }

    // MARK: - OpenAI Import

    @Test("OpenAI format import extracts messages")
    func openAIImport() throws {
        let openAI: [[String: Any]] = [[
            "title": "ChatGPT Convo",
            "mapping": [
                "root": [
                    "parent": NSNull(),
                    "children": ["msg1"],
                    "message": NSNull()
                ],
                "msg1": [
                    "parent": "root",
                    "children": ["msg2"],
                    "message": [
                        "author": ["role": "user"],
                        "content": ["parts": ["Hello GPT"]]
                    ]
                ],
                "msg2": [
                    "parent": "msg1",
                    "children": [],
                    "message": [
                        "author": ["role": "assistant"],
                        "content": ["parts": ["Hello!"]]
                    ]
                ]
            ]
        ]]
        let data = try JSONSerialization.data(withJSONObject: openAI)
        let imported = try ExportImportService.importFromJSON(data)

        #expect(imported.chats.count == 1)
        #expect(imported.chats[0].title == "ChatGPT Convo")
        #expect(imported.chats[0].branchTree!.activePath.count == 2)
    }

    // MARK: - Visible Branch Only Export

    @Test("prepareChatForExport with visibleBranchOnly strips non-active nodes")
    func visibleBranchOnly() {
        let (chat, store) = makeSampleChat()
        // Create a branch to add a non-active node
        let secondId = chat.branchTree!.activePath[1]
        let branched = BranchService.createBranch(
            chats: [chat], chatIndex: 0, fromNodeId: secondId,
            newContent: [.text("Alt")], contentStore: store
        )
        let branchedChat = branched.chats[0]
        // Now branchedChat has 3 nodes, 2 on active path

        let prepared = ExportImportService.prepareChatForExport(
            chat: branchedChat,
            sourceContentStore: branched.contentStore,
            visibleBranchOnly: true
        )
        #expect(prepared.chat.branchTree!.nodes.count == 2)
        #expect(prepared.contentStore.count == 2)
    }

    @Test("prepareChatForExport without visibleBranchOnly keeps all nodes")
    func fullExport() {
        let (chat, store) = makeSampleChat()
        let secondId = chat.branchTree!.activePath[1]
        let branched = BranchService.createBranch(
            chats: [chat], chatIndex: 0, fromNodeId: secondId,
            newContent: [.text("Alt")], contentStore: store
        )
        let branchedChat = branched.chats[0]

        let prepared = ExportImportService.prepareChatForExport(
            chat: branchedChat,
            sourceContentStore: branched.contentStore,
            visibleBranchOnly: false
        )
        #expect(prepared.chat.branchTree!.nodes.count == 3)
    }

    // MARK: - Normalize

    @Test("normalizeForComparison sets all refCounts to 1")
    func normalize() {
        var store: ContentStoreData = [:]
        let hash = ContentStore.addContent(&store, content: [.text("x")])
        ContentStore.retainContent(&store, hash: hash) // refCount = 2
        #expect(store[hash]!.refCount == 2)

        let (_, normalized) = ExportImportService.normalizeForComparison(chats: [], contentStore: store)
        #expect(normalized[hash]!.refCount == 1)
    }

    // MARK: - clearMissingFolderReferences

    @Test("clearMissingFolderReferences removes invalid folder IDs")
    func clearMissingFolders() {
        var chats = [Chat(id: "c1", title: "T", folder: "nonexistent")]
        ExportImportService.clearMissingFolderReferences(chats: &chats, folders: [:])
        #expect(chats[0].folder == nil)
    }

    @Test("clearMissingFolderReferences keeps valid folder IDs")
    func keepValidFolders() {
        let folders: FolderCollection = ["f1": Folder(id: "f1", name: "F")]
        var chats = [Chat(id: "c1", title: "T", folder: "f1")]
        ExportImportService.clearMissingFolderReferences(chats: &chats, folders: folders)
        #expect(chats[0].folder == "f1")
    }

    // MARK: - Merge

    @Test("mergeChats adds new chats and skips duplicates")
    func mergeChats() {
        let (chat1, store1) = makeSampleChat(id: "c1")
        let (chat2, store2) = makeSampleChat(id: "c2", messages: [(.user, "New")])

        var existing = [chat1]
        var existingStore = store1
        var existingFolders: FolderCollection = [:]

        let importResult = ExportImportService.ImportResult(
            chats: [chat1, chat2], // chat1 is duplicate
            contentStore: store2,
            folders: [:]
        )

        ExportImportService.mergeChats(
            existing: &existing, existingStore: &existingStore,
            existingFolders: &existingFolders, imported: importResult
        )

        #expect(existing.count == 2) // chat1 not duplicated
        #expect(existing[1].id == "c2")
    }

    @Test("mergeChats merges folders")
    func mergeFolders() {
        var existing: [Chat] = []
        var store: ContentStoreData = [:]
        var folders: FolderCollection = ["f1": Folder(id: "f1", name: "Old")]

        let importResult = ExportImportService.ImportResult(
            chats: [],
            contentStore: [:],
            folders: ["f1": Folder(id: "f1", name: "Newer"), "f2": Folder(id: "f2", name: "New")]
        )

        ExportImportService.mergeChats(
            existing: &existing, existingStore: &store,
            existingFolders: &folders, imported: importResult
        )

        // f1 not overwritten, f2 added
        #expect(folders["f1"]!.name == "Old")
        #expect(folders["f2"]!.name == "New")
    }

    // MARK: - Round-Trip Semantic Equivalence

    @Test("V3 round-trip preserves semantic equivalence after normalization")
    func roundTripSemantic() throws {
        let (chat, store) = makeSampleChat()
        let data = try ExportImportService.exportAsV3(chats: [chat], contentStore: store, folders: [:])
        let imported = try ExportImportService.importFromJSON(data)

        let (_, origNorm) = ExportImportService.normalizeForComparison(chats: [chat], contentStore: store)
        let (_, impNorm) = ExportImportService.normalizeForComparison(
            chats: imported.chats, contentStore: imported.contentStore
        )

        // Same content hashes exist
        #expect(Set(origNorm.keys) == Set(impNorm.keys))
        // Same content at each hash
        for key in origNorm.keys {
            let origText = origNorm[key]!.content.toText()
            let impText = impNorm[key]!.content.toText()
            #expect(origText == impText)
        }
    }

    // MARK: - OpenAI Export

    @Test("exportAsOpenAI produces valid structure")
    func openAIExport() throws {
        let (chat, store) = makeSampleChat()
        let data = ExportImportService.exportAsOpenAI(chat: chat, contentStore: store)
        let json = try JSONSerialization.jsonObject(with: data) as! [[String: Any]]
        #expect(json.count == 1)
        #expect(json[0]["title"] as? String == "Test Chat")
        let mapping = json[0]["mapping"] as! [String: Any]
        // root + 2 messages = 3 nodes
        #expect(mapping.count == 3)
    }

    @Test("exportAsOpenAI round-trips through import")
    func openAIRoundTrip() throws {
        let (chat, store) = makeSampleChat()
        let data = ExportImportService.exportAsOpenAI(chat: chat, contentStore: store)
        let imported = try ExportImportService.importFromJSON(data)
        #expect(imported.chats.count == 1)
        #expect(imported.chats[0].branchTree!.activePath.count == 2)
    }

    // MARK: - OpenRouter Export

    @Test("exportAsOpenRouter produces valid structure")
    func openRouterExport() throws {
        let (chat, store) = makeSampleChat()
        let data = ExportImportService.exportAsOpenRouter(chat: chat, contentStore: store)
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        #expect(json["version"] as? String == "orpg.3.0")
        #expect(json["title"] as? String == "Test Chat")
        let messages = json["messages"] as! [String: Any]
        #expect(messages.count == 2)
    }

    // MARK: - Markdown Export

    @Test("exportAsMarkdown produces valid markdown")
    func markdownExport() {
        let (chat, store) = makeSampleChat()
        let data = ExportImportService.exportAsMarkdown(chat: chat, contentStore: store)
        let md = String(data: data, encoding: .utf8)!
        #expect(md.contains("# Test Chat"))
        #expect(md.contains("### **user**:"))
        #expect(md.contains("### **assistant**:"))
        #expect(md.contains("Hello"))
        #expect(md.contains("Hi"))
    }

    // MARK: - Gzip

    @Test("gzipCompress produces smaller data")
    func gzipCompress() throws {
        let original = String(repeating: "Hello World! ", count: 100).data(using: .utf8)!
        let compressed = ExportImportService.gzipCompress(original)
        #expect(compressed != nil)
        #expect(compressed!.count < original.count)
    }

    @Test("gzipCompress returns nil for empty data")
    func gzipEmpty() {
        #expect(ExportImportService.gzipCompress(Data()) == nil)
    }

    // MARK: - ExportFormat

    @Test("ExportFormat has correct file extensions")
    func formatExtensions() {
        #expect(ExportImportService.ExportFormat.json.fileExtension == "json")
        #expect(ExportImportService.ExportFormat.openAI.fileExtension == "json")
        #expect(ExportImportService.ExportFormat.openRouter.fileExtension == "json")
        #expect(ExportImportService.ExportFormat.markdown.fileExtension == "md")
        #expect(ExportImportService.ExportFormat.image.fileExtension == "png")
    }

    // MARK: - Error Handling

    @Test("importFromJSON throws on garbage data")
    func importGarbage() {
        let data = "not json at all".data(using: .utf8)!
        #expect(throws: (any Error).self) {
            try ExportImportService.importFromJSON(data)
        }
    }

    @Test("importFromJSON throws on unrecognized format")
    func importUnknownFormat() throws {
        let json: [String: Any] = ["foo": "bar"]
        let data = try JSONSerialization.data(withJSONObject: json)
        #expect(throws: ExportImportService.ImportError.self) {
            try ExportImportService.importFromJSON(data)
        }
    }
}
