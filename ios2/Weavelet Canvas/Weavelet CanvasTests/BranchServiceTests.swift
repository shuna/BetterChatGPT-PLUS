import Testing
@testable import Weavelet_Canvas

// MARK: - Test Helpers

/// Build a minimal linear branch tree with content store for testing.
private func makeLinearChat(
    messages: [(Role, String)],
    chatId: String = "test-chat"
) -> (chats: [Chat], contentStore: ContentStoreData) {
    var store: ContentStoreData = [:]
    var chat = Chat(id: chatId, title: "Test")
    let msgs = messages.map { Message(role: $0.0, content: [.text($0.1)]) }
    chat.branchTree = BranchService.flatMessagesToBranchTree(messages: msgs, contentStore: &store)
    chat.messages = msgs
    return ([chat], store)
}

/// Shorthand for active path node IDs
private func activePath(_ chats: [Chat]) -> [String] {
    chats[0].branchTree!.activePath
}

/// Shorthand for resolving active path text
private func activeTexts(_ chats: [Chat], _ store: ContentStoreData) -> [String] {
    let tree = chats[0].branchTree!
    return tree.activePath.compactMap { id in
        guard let node = tree.nodes[id] else { return nil }
        return ContentStore.resolveContentText(store, hash: node.contentHash)
    }
}

// MARK: - BranchService Tests

@Suite("BranchService")
struct BranchServiceTests {

    // MARK: - flatMessagesToBranchTree

    @Test("flatMessagesToBranchTree creates linear chain")
    func flatMessagesToBranchTree() {
        var store: ContentStoreData = [:]
        let msgs = [
            Message(role: .user, content: [.text("Hello")]),
            Message(role: .assistant, content: [.text("Hi")])
        ]
        let tree = BranchService.flatMessagesToBranchTree(messages: msgs, contentStore: &store)

        #expect(tree.activePath.count == 2)
        #expect(tree.nodes.count == 2)
        #expect(tree.rootId == tree.activePath[0])
        // First node has no parent
        #expect(tree.nodes[tree.activePath[0]]!.parentId == nil)
        // Second node's parent is the first
        #expect(tree.nodes[tree.activePath[1]]!.parentId == tree.activePath[0])
        // Content store has entries
        #expect(store.count >= 1)
    }

    @Test("flatMessagesToBranchTree with empty messages")
    func flatMessagesEmpty() {
        var store: ContentStoreData = [:]
        let tree = BranchService.flatMessagesToBranchTree(messages: [], contentStore: &store)
        #expect(tree.activePath.isEmpty)
        #expect(tree.nodes.isEmpty)
        #expect(tree.rootId == "")
    }

    // MARK: - ensureBranchTree

    @Test("ensureBranchTree creates tree when missing")
    func ensureBranchTreeCreation() {
        var chat = Chat(id: "c1", title: "T")
        chat.messages = [Message(role: .user, content: [.text("hello")])]
        chat.branchTree = nil
        let result = BranchService.ensureBranchTree(chats: [chat], chatIndex: 0, contentStore: [:])
        #expect(result.chats[0].branchTree != nil)
        #expect(result.chats[0].branchTree!.activePath.count == 1)
    }

    @Test("ensureBranchTree is no-op when tree exists")
    func ensureBranchTreeNoOp() {
        let (chats, store) = makeLinearChat(messages: [(.user, "hi")])
        let originalPath = chats[0].branchTree!.activePath
        let result = BranchService.ensureBranchTree(chats: chats, chatIndex: 0, contentStore: store)
        #expect(result.chats[0].branchTree!.activePath == originalPath)
    }

    // MARK: - appendNodeToActivePath

    @Test("append adds node to end of active path")
    func appendNode() {
        let (chats, store) = makeLinearChat(messages: [(.user, "Hello")])
        let result = BranchService.appendNodeToActivePath(
            chats: chats, chatIndex: 0, role: .assistant,
            content: [.text("World")], contentStore: store
        )
        #expect(activePath(result.chats).count == 2)
        let texts = activeTexts(result.chats, result.contentStore)
        #expect(texts == ["Hello", "World"])
        // New node's parent is the first node
        let newNode = result.chats[0].branchTree!.nodes[result.newId]!
        #expect(newNode.parentId == activePath(chats)[0])
        // Content store refCount
        #expect(result.contentStore[newNode.contentHash]!.refCount == 1)
    }

    // MARK: - createBranch

    @Test("createBranch creates sibling with new content")
    func createBranchNewContent() {
        let (chats, store) = makeLinearChat(messages: [(.user, "Q"), (.assistant, "A1")])
        let originalSecondId = activePath(chats)[1]

        let result = BranchService.createBranch(
            chats: chats, chatIndex: 0, fromNodeId: originalSecondId,
            newContent: [.text("A2")], contentStore: store
        )
        // Active path now ends at the new branch
        let texts = activeTexts(result.chats, result.contentStore)
        #expect(texts == ["Q", "A2"])
        // Old node still exists in the tree
        #expect(result.chats[0].branchTree!.nodes[originalSecondId] != nil)
        // New node has same parent as original
        let newNode = result.chats[0].branchTree!.nodes[result.newId]!
        let origNode = result.chats[0].branchTree!.nodes[originalSecondId]!
        #expect(newNode.parentId == origNode.parentId)
    }

    @Test("createBranch with nil content retains original hash")
    func createBranchRetainContent() {
        let (chats, store) = makeLinearChat(messages: [(.user, "Q"), (.assistant, "A1")])
        let secondId = activePath(chats)[1]
        let originalHash = chats[0].branchTree!.nodes[secondId]!.contentHash

        let result = BranchService.createBranch(
            chats: chats, chatIndex: 0, fromNodeId: secondId,
            newContent: nil, contentStore: store
        )
        let newNode = result.chats[0].branchTree!.nodes[result.newId]!
        #expect(newNode.contentHash == originalHash)
        // refCount incremented
        #expect(result.contentStore[originalHash]!.refCount == 2)
    }

    // MARK: - switchBranchAtNode

    @Test("switchBranch changes active path")
    func switchBranch() {
        // Create a branch, then switch back
        let (chats, store) = makeLinearChat(messages: [(.user, "Q"), (.assistant, "A1")])
        let secondId = activePath(chats)[1]

        let branched = BranchService.createBranch(
            chats: chats, chatIndex: 0, fromNodeId: secondId,
            newContent: [.text("A2")], contentStore: store
        )
        // Now switch back to original
        let switched = BranchService.switchBranchAtNode(
            chats: branched.chats, chatIndex: 0,
            nodeId: secondId, contentStore: branched.contentStore
        )
        let texts = activeTexts(switched, branched.contentStore)
        #expect(texts == ["Q", "A1"])
    }

    // MARK: - deleteBranch

    @Test("deleteBranch removes node and descendants, releases content")
    func deleteBranch() {
        let (chats, store) = makeLinearChat(messages: [(.user, "Q"), (.assistant, "A1")])
        let secondId = activePath(chats)[1]
        let secondHash = chats[0].branchTree!.nodes[secondId]!.contentHash

        // Create a branch so we have a sibling to fall back to
        let branched = BranchService.createBranch(
            chats: chats, chatIndex: 0, fromNodeId: secondId,
            newContent: [.text("A2")], contentStore: store
        )

        // Delete the original second node
        let result = BranchService.deleteBranch(
            chats: branched.chats, chatIndex: 0,
            nodeId: secondId, contentStore: branched.contentStore
        )
        #expect(result.chats[0].branchTree!.nodes[secondId] == nil)
        // Content released
        #expect(result.contentStore[secondHash] == nil)
    }

    // MARK: - upsertMessageAtIndex

    @Test("upsert updates existing node content")
    func upsertExisting() {
        let (chats, store) = makeLinearChat(messages: [(.user, "Old")])
        let result = BranchService.upsertMessageAtIndex(
            chats: chats, chatIndex: 0, messageIndex: 0,
            message: Message(role: .user, content: [.text("New")]),
            contentStore: store
        )
        let texts = activeTexts(result.chats, result.contentStore)
        #expect(texts == ["New"])
    }

    @Test("upsert appends when index == path count")
    func upsertAppend() {
        let (chats, store) = makeLinearChat(messages: [(.user, "Q")])
        let result = BranchService.upsertMessageAtIndex(
            chats: chats, chatIndex: 0, messageIndex: 1,
            message: Message(role: .assistant, content: [.text("A")]),
            contentStore: store
        )
        #expect(activePath(result.chats).count == 2)
        let texts = activeTexts(result.chats, result.contentStore)
        #expect(texts == ["Q", "A"])
    }

    // MARK: - insertMessageAtIndex

    @Test("insert pushes existing nodes down")
    func insertAtIndex() {
        let (chats, store) = makeLinearChat(messages: [(.user, "A"), (.assistant, "B")])
        let result = BranchService.insertMessageAtIndex(
            chats: chats, chatIndex: 0, messageIndex: 1,
            message: Message(role: .system, content: [.text("SYS")]),
            contentStore: store
        )
        let texts = activeTexts(result.chats, result.contentStore)
        #expect(texts == ["A", "SYS", "B"])
        // Parent chain integrity
        let path = activePath(result.chats)
        let tree = result.chats[0].branchTree!
        #expect(tree.nodes[path[1]]!.parentId == path[0])
        #expect(tree.nodes[path[2]]!.parentId == path[1])
    }

    // MARK: - removeMessageAtIndex

    @Test("remove deletes node and re-parents children")
    func removeAtIndex() {
        let (chats, store) = makeLinearChat(messages: [(.user, "A"), (.system, "B"), (.assistant, "C")])
        let result = BranchService.removeMessageAtIndex(
            chats: chats, chatIndex: 0, messageIndex: 1,
            contentStore: store
        )
        let texts = activeTexts(result.chats, result.contentStore)
        #expect(texts == ["A", "C"])
        // C's parent should now be A
        let path = activePath(result.chats)
        let tree = result.chats[0].branchTree!
        #expect(tree.nodes[path[1]]!.parentId == path[0])
    }

    // MARK: - moveMessage

    @Test("move up swaps positions")
    func moveUp() {
        let (chats, store) = makeLinearChat(messages: [(.user, "A"), (.assistant, "B")])
        let result = BranchService.moveMessage(
            chats: chats, chatIndex: 0, messageIndex: 1,
            direction: .up, contentStore: store
        )
        let texts = activeTexts(result.chats, result.contentStore)
        #expect(texts == ["B", "A"])
    }

    @Test("move down swaps positions")
    func moveDown() {
        let (chats, store) = makeLinearChat(messages: [(.user, "A"), (.assistant, "B")])
        let result = BranchService.moveMessage(
            chats: chats, chatIndex: 0, messageIndex: 0,
            direction: .down, contentStore: store
        )
        let texts = activeTexts(result.chats, result.contentStore)
        #expect(texts == ["B", "A"])
    }

    @Test("move out of bounds is no-op")
    func moveOutOfBounds() {
        let (chats, store) = makeLinearChat(messages: [(.user, "A")])
        let result = BranchService.moveMessage(
            chats: chats, chatIndex: 0, messageIndex: 0,
            direction: .up, contentStore: store
        )
        let texts = activeTexts(result.chats, result.contentStore)
        #expect(texts == ["A"])
    }

    // MARK: - updateLastNodeContent

    @Test("updateLastNodeContent replaces content of last node")
    func updateLastNode() {
        let (chats, store) = makeLinearChat(messages: [(.user, "Q"), (.assistant, "old")])
        let result = BranchService.updateLastNodeContent(
            chats: chats, chatIndex: 0,
            content: [.text("streamed")], contentStore: store
        )
        let texts = activeTexts(result.chats, result.contentStore)
        #expect(texts.last == "streamed")
    }

    // MARK: - updateNodeRole

    @Test("updateNodeRole changes role")
    func updateRole() {
        let (chats, store) = makeLinearChat(messages: [(.user, "hello")])
        let nodeId = activePath(chats)[0]
        let result = BranchService.updateNodeRole(
            chats: chats, chatIndex: 0, nodeId: nodeId,
            role: .system, contentStore: store
        )
        #expect(result[0].branchTree!.nodes[nodeId]!.role == .system)
    }

    // MARK: - renameBranchNode / toggleNodeStar / toggleNodePin

    @Test("rename sets and clears label")
    func renameNode() {
        let (chats, _) = makeLinearChat(messages: [(.user, "hi")])
        let nodeId = activePath(chats)[0]
        let labeled = BranchService.renameBranchNode(chats: chats, chatIndex: 0, nodeId: nodeId, label: "A")
        #expect(labeled[0].branchTree!.nodes[nodeId]!.label == "A")
        let cleared = BranchService.renameBranchNode(chats: labeled, chatIndex: 0, nodeId: nodeId, label: "")
        #expect(cleared[0].branchTree!.nodes[nodeId]!.label == nil)
    }

    @Test("toggleNodeStar toggles starred flag")
    func toggleStar() {
        let (chats, _) = makeLinearChat(messages: [(.user, "hi")])
        let nodeId = activePath(chats)[0]
        let starred = BranchService.toggleNodeStar(chats: chats, chatIndex: 0, nodeId: nodeId)
        #expect(starred[0].branchTree!.nodes[nodeId]!.starred == true)
        let unstarred = BranchService.toggleNodeStar(chats: starred, chatIndex: 0, nodeId: nodeId)
        #expect(unstarred[0].branchTree!.nodes[nodeId]!.starred == nil)
    }

    @Test("toggleNodePin toggles pinned flag")
    func togglePin() {
        let (chats, _) = makeLinearChat(messages: [(.user, "hi")])
        let nodeId = activePath(chats)[0]
        let pinned = BranchService.toggleNodePin(chats: chats, chatIndex: 0, nodeId: nodeId)
        #expect(pinned[0].branchTree!.nodes[nodeId]!.pinned == true)
        let unpinned = BranchService.toggleNodePin(chats: pinned, chatIndex: 0, nodeId: nodeId)
        #expect(unpinned[0].branchTree!.nodes[nodeId]!.pinned == nil)
    }

    // MARK: - truncateActivePath

    @Test("truncate shortens path to given node")
    func truncate() {
        let (chats, store) = makeLinearChat(messages: [(.user, "A"), (.assistant, "B"), (.user, "C")])
        let secondId = activePath(chats)[1]
        let result = BranchService.truncateActivePath(
            chats: chats, chatIndex: 0, nodeId: secondId, contentStore: store
        )
        #expect(activePath(result).count == 2)
        let texts = activeTexts(result, store)
        #expect(texts == ["A", "B"])
    }

    // MARK: - upsertWithAutoBranch

    @Test("upsertWithAutoBranch returns noOp when unchanged")
    func upsertAutoBranchNoOp() {
        let (chats, store) = makeLinearChat(messages: [(.user, "same")])
        let result = BranchService.upsertWithAutoBranch(
            chats: chats, chatIndex: 0, messageIndex: 0,
            message: Message(role: .user, content: [.text("same")]),
            contentStore: store
        )
        #expect(result.noOp == true)
    }

    @Test("upsertWithAutoBranch detects content change")
    func upsertAutoBranchChanged() {
        let (chats, store) = makeLinearChat(messages: [(.user, "old")])
        let result = BranchService.upsertWithAutoBranch(
            chats: chats, chatIndex: 0, messageIndex: 0,
            message: Message(role: .user, content: [.text("new")]),
            contentStore: store
        )
        #expect(result.noOp == false)
        let texts = activeTexts(result.chats, result.contentStore)
        #expect(texts == ["new"])
    }

    @Test("upsertWithAutoBranch detects role change")
    func upsertAutoBranchRoleChanged() {
        let (chats, store) = makeLinearChat(messages: [(.user, "same")])
        let result = BranchService.upsertWithAutoBranch(
            chats: chats, chatIndex: 0, messageIndex: 0,
            message: Message(role: .system, content: [.text("same")]),
            contentStore: store
        )
        #expect(result.noOp == false)
    }

    // MARK: - Content Store refCount integrity

    @Test("refCounts stay consistent through append and delete cycle")
    func refCountIntegrity() {
        let (chats, store) = makeLinearChat(messages: [(.user, "Q")])

        // Append
        let appended = BranchService.appendNodeToActivePath(
            chats: chats, chatIndex: 0, role: .assistant,
            content: [.text("A")], contentStore: store
        )
        let aHash = appended.chats[0].branchTree!.nodes[appended.newId]!.contentHash
        #expect(appended.contentStore[aHash]!.refCount == 1)

        // Delete the appended node
        let deleted = BranchService.deleteBranch(
            chats: appended.chats, chatIndex: 0,
            nodeId: appended.newId, contentStore: appended.contentStore
        )
        // Content should be released
        #expect(deleted.contentStore[aHash] == nil)
        // Original content still intact
        let qHash = deleted.chats[0].branchTree!.nodes[activePath(deleted.chats)[0]]!.contentHash
        #expect(deleted.contentStore[qHash] != nil)
    }
}
