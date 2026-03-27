import Testing
import Foundation
@testable import Weavelet_Canvas

// MARK: - AppState Codable Tests

@Suite("PersistenceService / AppState")
struct PersistenceServiceTests {

    // MARK: - Helpers

    private func makeSampleState() -> AppState {
        var store: ContentStoreData = [:]
        let msgs = [
            Message(role: .user, content: [.text("Hello")]),
            Message(role: .assistant, content: [.text("Hi")])
        ]
        var chat = Chat(id: "c1", title: "Test Chat")
        chat.branchTree = BranchService.flatMessagesToBranchTree(messages: msgs, contentStore: &store)
        chat.messages = msgs
        chat.collapsedNodes = ["node1": true]
        chat.omittedNodes = ["node2": true]
        chat.protectedNodes = ["node3": true]

        var chat2 = Chat(id: "c2", title: "Chat 2", folder: "f1")
        chat2.branchTree = BranchService.flatMessagesToBranchTree(
            messages: [Message(role: .system, content: [.text("sys")])],
            contentStore: &store
        )

        let folder = Folder(id: "f1", name: "Work", expanded: true, order: 0, color: "red")

        return AppState(
            chats: [chat, chat2],
            contentStore: store,
            folders: ["f1": folder],
            currentChatID: "c1"
        )
    }

    // MARK: - AppState Codable Round-Trip

    @Test("AppState encodes and decodes correctly")
    func appStateRoundTrip() throws {
        let state = makeSampleState()
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(state)

        let decoder = JSONDecoder()
        let decoded = try decoder.decode(AppState.self, from: data)

        #expect(decoded.chats.count == 2)
        #expect(decoded.currentChatID == "c1")
        #expect(decoded.version == AppState.currentVersion)
        #expect(decoded.folders["f1"]?.name == "Work")
        #expect(decoded.contentStore.count == state.contentStore.count)
    }

    @Test("AppState preserves collapsed/omitted/protected nodes")
    func preserveNodeFlags() throws {
        let state = makeSampleState()
        let data = try JSONEncoder().encode(state)
        let decoded = try JSONDecoder().decode(AppState.self, from: data)

        #expect(decoded.chats[0].collapsedNodes?["node1"] == true)
        #expect(decoded.chats[0].omittedNodes?["node2"] == true)
        #expect(decoded.chats[0].protectedNodes?["node3"] == true)
    }

    @Test("AppState preserves folder assignments")
    func preserveFolderAssignment() throws {
        let state = makeSampleState()
        let data = try JSONEncoder().encode(state)
        let decoded = try JSONDecoder().decode(AppState.self, from: data)

        #expect(decoded.chats[1].folder == "f1")
        #expect(decoded.folders["f1"]?.color == "red")
    }

    @Test("AppState preserves branchTree structure")
    func preserveBranchTree() throws {
        let state = makeSampleState()
        let data = try JSONEncoder().encode(state)
        let decoded = try JSONDecoder().decode(AppState.self, from: data)

        let origTree = state.chats[0].branchTree!
        let decodedTree = decoded.chats[0].branchTree!

        #expect(decodedTree.activePath.count == origTree.activePath.count)
        #expect(decodedTree.nodes.count == origTree.nodes.count)
        #expect(decodedTree.rootId == origTree.rootId)

        // Verify parent chain
        for (id, node) in decodedTree.nodes {
            #expect(node.parentId == origTree.nodes[id]!.parentId)
            #expect(node.role == origTree.nodes[id]!.role)
            #expect(node.contentHash == origTree.nodes[id]!.contentHash)
        }
    }

    @Test("AppState preserves contentStore entries and refCounts")
    func preserveContentStore() throws {
        let state = makeSampleState()
        let data = try JSONEncoder().encode(state)
        let decoded = try JSONDecoder().decode(AppState.self, from: data)

        for (hash, entry) in state.contentStore {
            let decodedEntry = decoded.contentStore[hash]
            #expect(decodedEntry != nil)
            #expect(decodedEntry!.refCount == entry.refCount)
            #expect(decodedEntry!.content == entry.content)
        }
    }

    @Test("AppState with empty state encodes/decodes")
    func emptyState() throws {
        let state = AppState()
        let data = try JSONEncoder().encode(state)
        let decoded = try JSONDecoder().decode(AppState.self, from: data)

        #expect(decoded.chats.isEmpty)
        #expect(decoded.contentStore.isEmpty)
        #expect(decoded.folders.isEmpty)
        #expect(decoded.currentChatID == nil)
    }

    // MARK: - ChatConfig Codable

    @Test("ChatConfig uses Web-compatible JSON keys")
    func chatConfigKeys() throws {
        let config = ChatConfig(
            model: "gpt-4", maxTokens: 2000, temperature: 0.7,
            presencePenalty: 0.5, topP: 0.9, frequencyPenalty: 0.3
        )
        let data = try JSONEncoder().encode(config)
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        // Web-compatible snake_case keys
        #expect(json["max_tokens"] as? Int == 2000)
        #expect(json["presence_penalty"] as? Double == 0.5)
        #expect(json["top_p"] as? Double == 0.9)
        #expect(json["frequency_penalty"] as? Double == 0.3)
    }

    // MARK: - ContentItem Codable

    @Test("ContentItem text round-trips")
    func contentItemText() throws {
        let item = ContentItem.text("Hello world")
        let data = try JSONEncoder().encode(item)
        let decoded = try JSONDecoder().decode(ContentItem.self, from: data)
        #expect(decoded == item)
    }

    @Test("ContentItem imageURL round-trips")
    func contentItemImage() throws {
        let item = ContentItem.imageURL(url: "https://example.com/img.png", detail: .high)
        let data = try JSONEncoder().encode(item)
        let decoded = try JSONDecoder().decode(ContentItem.self, from: data)
        #expect(decoded == item)
    }

    @Test("ContentItem reasoning round-trips")
    func contentItemReasoning() throws {
        let item = ContentItem.reasoning("thinking...")
        let data = try JSONEncoder().encode(item)
        let decoded = try JSONDecoder().decode(ContentItem.self, from: data)
        #expect(decoded == item)
    }

    @Test("ContentItem toolCall round-trips")
    func contentItemToolCall() throws {
        let item = ContentItem.toolCall(id: "tc1", name: "search", arguments: "{\"q\":\"test\"}")
        let data = try JSONEncoder().encode(item)
        let decoded = try JSONDecoder().decode(ContentItem.self, from: data)
        #expect(decoded == item)
    }

    @Test("ContentItem toolResult round-trips")
    func contentItemToolResult() throws {
        let item = ContentItem.toolResult(toolCallId: "tc1", content: "result text")
        let data = try JSONEncoder().encode(item)
        let decoded = try JSONDecoder().decode(ContentItem.self, from: data)
        #expect(decoded == item)
    }

    // MARK: - Branch Edit → Save → Restore Scenario

    @Test("Branch operations followed by encode/decode preserves state")
    func branchEditSaveRestore() throws {
        // Create initial state
        var store: ContentStoreData = [:]
        let msgs = [
            Message(role: .user, content: [.text("Q")]),
            Message(role: .assistant, content: [.text("A")])
        ]
        var chat = Chat(id: "c1", title: "T")
        chat.branchTree = BranchService.flatMessagesToBranchTree(messages: msgs, contentStore: &store)
        chat.messages = msgs

        // Create a branch
        let secondId = chat.branchTree!.activePath[1]
        let branched = BranchService.createBranch(
            chats: [chat], chatIndex: 0, fromNodeId: secondId,
            newContent: [.text("A2")], contentStore: store
        )

        // Switch back to original branch
        let switched = BranchService.switchBranchAtNode(
            chats: branched.chats, chatIndex: 0,
            nodeId: secondId, contentStore: branched.contentStore
        )

        // Save as AppState
        let state = AppState(
            chats: switched,
            contentStore: branched.contentStore,
            currentChatID: "c1"
        )
        let data = try JSONEncoder().encode(state)
        let restored = try JSONDecoder().decode(AppState.self, from: data)

        // Verify restored state
        let restoredTree = restored.chats[0].branchTree!
        #expect(restoredTree.nodes.count == 3) // original 2 + branch
        #expect(restoredTree.activePath.count == 2)

        // Active path should end at original node
        let lastId = restoredTree.activePath.last!
        let text = ContentStore.resolveContentText(restored.contentStore, hash: restoredTree.nodes[lastId]!.contentHash)
        #expect(text == "A")

        // Can switch to branch
        let switchedAgain = BranchService.switchBranchAtNode(
            chats: restored.chats, chatIndex: 0,
            nodeId: branched.newId, contentStore: restored.contentStore
        )
        let branchText = ContentStore.resolveContentText(
            restored.contentStore,
            hash: switchedAgain[0].branchTree!.nodes[branched.newId]!.contentHash
        )
        #expect(branchText == "A2")
    }
}
