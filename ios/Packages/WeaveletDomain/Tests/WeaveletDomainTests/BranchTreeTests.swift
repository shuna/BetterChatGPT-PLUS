import Testing
import Foundation
@testable import WeaveletDomain

// MARK: - Helper

private func makeChat(messages: [Message], contentStore: ContentStore) -> Chat {
    var chat = Chat(messages: messages)
    BranchOps.ensureBranchTree(chat: &chat, contentStore: contentStore)
    return chat
}

private func userMsg(_ text: String) -> Message {
    Message(role: .user, text: text)
}

private func assistantMsg(_ text: String) -> Message {
    Message(role: .assistant, text: text)
}

// MARK: - BranchTree Utils Tests

@Test func materializeActivePath() {
    let store = ContentStore()
    let chat = makeChat(messages: [userMsg("Hi"), assistantMsg("Hello")], contentStore: store)

    let materialized = chat.branchTree!.materializeActivePath(contentStore: store)
    #expect(materialized.count == 2)
    #expect(materialized[0].content[0].textValue == "Hi")
    #expect(materialized[1].content[0].textValue == "Hello")
}

@Test func flatMessagesToBranchTree() {
    let store = ContentStore()
    let messages = [userMsg("A"), assistantMsg("B"), userMsg("C")]
    let tree = BranchTree.fromFlatMessages(messages, contentStore: store)

    #expect(tree.nodes.count == 3)
    #expect(tree.activePath.count == 3)
    #expect(tree.rootId == tree.activePath[0])

    // Verify parent chain
    let root = tree.nodes[tree.activePath[0]]!
    #expect(root.parentId == nil)
    let second = tree.nodes[tree.activePath[1]]!
    #expect(second.parentId == tree.activePath[0])
    let third = tree.nodes[tree.activePath[2]]!
    #expect(third.parentId == tree.activePath[1])
}

@Test func getChildrenAndSiblings() {
    let store = ContentStore()
    let chat = makeChat(messages: [userMsg("A"), assistantMsg("B")], contentStore: store)
    let tree = chat.branchTree!
    let rootId = tree.activePath[0]

    let children = tree.getChildren(of: rootId)
    #expect(children.count == 1)
    #expect(children[0].id == tree.activePath[1])

    let siblings = tree.getSiblings(of: tree.activePath[1])
    #expect(siblings.count == 1)
}

@Test func buildPathToLeaf() {
    let store = ContentStore()
    let chat = makeChat(messages: [userMsg("A"), assistantMsg("B"), userMsg("C")], contentStore: store)
    let tree = chat.branchTree!
    let rootId = tree.activePath[0]

    let path = tree.buildPathToLeaf(from: rootId)
    #expect(path.count == 3)
    #expect(path[0] == tree.activePath[0])
    #expect(path[2] == tree.activePath[2])
}

@Test func findLCA() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("Root"), assistantMsg("B"), userMsg("C")], contentStore: store)
    let rootId = chat.branchTree!.activePath[0]
    let nodeB = chat.branchTree!.activePath[1]

    // Create a branch from nodeB
    let newId = BranchOps.createBranch(chat: &chat, fromNodeId: nodeB, newContent: [.fromString("B2")], contentStore: store)

    // LCA of the new branch and nodeC (on original path)
    let lca = chat.branchTree!.findLCA(newId, chat.branchTree!.activePath.last ?? "")
    // After branch creation, active path is [root, newId], so last node is newId
    // LCA of newId and newId is newId itself
    #expect(lca != nil)
}

@Test func collectDescendants() {
    let store = ContentStore()
    let chat = makeChat(messages: [userMsg("A"), assistantMsg("B"), userMsg("C")], contentStore: store)
    let tree = chat.branchTree!
    let rootId = tree.activePath[0]

    let descendants = tree.collectDescendants(of: rootId)
    #expect(descendants.count == 3) // root + B + C
}

// MARK: - Branch Operations Tests

@Test func ensureBranchTreeCreatesTree() {
    let store = ContentStore()
    var chat = Chat(messages: [userMsg("Test")])
    #expect(chat.branchTree == nil)

    BranchOps.ensureBranchTree(chat: &chat, contentStore: store)
    #expect(chat.branchTree != nil)
    #expect(chat.branchTree!.activePath.count == 1)
}

@Test func ensureBranchTreeIdempotent() {
    let store = ContentStore()
    var chat = Chat(messages: [userMsg("Test")])
    BranchOps.ensureBranchTree(chat: &chat, contentStore: store)
    let firstRootId = chat.branchTree!.rootId

    BranchOps.ensureBranchTree(chat: &chat, contentStore: store)
    #expect(chat.branchTree!.rootId == firstRootId)
}

@Test func createBranch() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A"), assistantMsg("B")], contentStore: store)
    let nodeB = chat.branchTree!.activePath[1]

    let newId = BranchOps.createBranch(
        chat: &chat,
        fromNodeId: nodeB,
        newContent: [.fromString("B-alt")],
        contentStore: store
    )

    // Active path should now end at newId (sibling of B)
    #expect(chat.branchTree!.activePath.last == newId)
    #expect(chat.messages.count == 2)
    #expect(chat.messages[1].content[0].textValue == "B-alt")

    // Old node B should still exist in the tree
    #expect(chat.branchTree!.nodes[nodeB] != nil)
}

@Test func createBranchWithSameContent() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A"), assistantMsg("B")], contentStore: store)
    let nodeB = chat.branchTree!.activePath[1]
    let originalHash = chat.branchTree!.nodes[nodeB]!.contentHash
    let initialRefCount = store.data[originalHash]?.refCount ?? 0

    let newId = BranchOps.createBranch(
        chat: &chat,
        fromNodeId: nodeB,
        newContent: nil,
        contentStore: store
    )

    // Should share the same contentHash with increased refCount
    #expect(chat.branchTree!.nodes[newId]!.contentHash == originalHash)
    #expect(store.data[originalHash]!.refCount == initialRefCount + 1)
}

@Test func switchBranchAtNode() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A"), assistantMsg("B"), userMsg("C")], contentStore: store)
    let nodeB = chat.branchTree!.activePath[1]

    // Create alternate branch at B
    let newId = BranchOps.createBranch(
        chat: &chat,
        fromNodeId: nodeB,
        newContent: [.fromString("B-alt")],
        contentStore: store
    )

    // Switch back to original B
    BranchOps.switchBranchAtNode(chat: &chat, nodeId: nodeB, contentStore: store)
    #expect(chat.branchTree!.activePath.contains(nodeB))
    #expect(chat.messages[1].content[0].textValue == "B")
}

@Test func deleteBranch() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A"), assistantMsg("B"), userMsg("C")], contentStore: store)
    let nodeC = chat.branchTree!.activePath[2]

    BranchOps.deleteBranch(chat: &chat, nodeId: nodeC, contentStore: store)

    #expect(chat.branchTree!.nodes[nodeC] == nil)
    #expect(chat.branchTree!.activePath.count == 2) // A, B remain
}

@Test func deleteBranchWithDescendants() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A"), assistantMsg("B"), userMsg("C")], contentStore: store)
    let nodeB = chat.branchTree!.activePath[1]

    // Delete B and its descendant C
    BranchOps.deleteBranch(chat: &chat, nodeId: nodeB, contentStore: store)

    #expect(chat.branchTree!.activePath.count == 1) // Only A remains
    #expect(chat.branchTree!.nodes.count == 1)
}

@Test func appendNodeToActivePath() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A")], contentStore: store)

    let newId = BranchOps.appendNodeToActivePath(
        chat: &chat,
        role: .assistant,
        content: [.fromString("Response")],
        contentStore: store
    )

    #expect(chat.branchTree!.activePath.count == 2)
    #expect(chat.branchTree!.activePath.last == newId)
    #expect(chat.messages.count == 2)
    #expect(chat.messages[1].content[0].textValue == "Response")
}

@Test func upsertMessageAtIndexUpdate() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A"), assistantMsg("B")], contentStore: store)

    BranchOps.upsertMessageAtIndex(
        chat: &chat,
        messageIndex: 1,
        message: assistantMsg("B-updated"),
        contentStore: store
    )

    #expect(chat.messages[1].content[0].textValue == "B-updated")
    #expect(chat.branchTree!.activePath.count == 2) // Same path length
}

@Test func upsertMessageAtIndexAppend() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A")], contentStore: store)

    BranchOps.upsertMessageAtIndex(
        chat: &chat,
        messageIndex: 1,
        message: assistantMsg("New"),
        contentStore: store
    )

    #expect(chat.messages.count == 2)
    #expect(chat.messages[1].content[0].textValue == "New")
}

@Test func insertMessageAtIndex() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A"), userMsg("C")], contentStore: store)
    let nodeCId = chat.branchTree!.activePath[1]

    let newId = BranchOps.insertMessageAtIndex(
        chat: &chat,
        messageIndex: 1,
        message: assistantMsg("B"),
        contentStore: store
    )

    #expect(chat.branchTree!.activePath.count == 3)
    #expect(chat.branchTree!.activePath[1] == newId)
    #expect(chat.messages[1].content[0].textValue == "B")

    // C's parent should now be newId
    #expect(chat.branchTree!.nodes[nodeCId]?.parentId == newId)
}

@Test func removeMessageAtIndex() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A"), assistantMsg("B"), userMsg("C")], contentStore: store)
    let nodeA = chat.branchTree!.activePath[0]
    let nodeC = chat.branchTree!.activePath[2]

    BranchOps.removeMessageAtIndex(chat: &chat, messageIndex: 1, contentStore: store)

    #expect(chat.branchTree!.activePath.count == 2)
    #expect(chat.messages.count == 2)
    // C's parent should now be A (re-linked)
    #expect(chat.branchTree!.nodes[nodeC]?.parentId == nodeA)
}

@Test func moveMessageUp() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A"), assistantMsg("B"), userMsg("C")], contentStore: store)

    BranchOps.moveMessage(chat: &chat, messageIndex: 2, direction: .up, contentStore: store)

    #expect(chat.messages[1].content[0].textValue == "C")
    #expect(chat.messages[2].content[0].textValue == "B")
}

@Test func moveMessageDown() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A"), assistantMsg("B"), userMsg("C")], contentStore: store)

    BranchOps.moveMessage(chat: &chat, messageIndex: 0, direction: .down, contentStore: store)

    #expect(chat.messages[0].content[0].textValue == "B")
    #expect(chat.messages[1].content[0].textValue == "A")
}

@Test func pruneHiddenNodes() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A"), assistantMsg("B"), userMsg("C")], contentStore: store)
    let nodeB = chat.branchTree!.activePath[1]

    // Create a branch at B (this stays on the original path, newId goes to alt path)
    BranchOps.createBranch(chat: &chat, fromNodeId: nodeB, newContent: [.fromString("B-alt")], contentStore: store)

    // Now prune: should remove nodeB and nodeC (not on active path, not pinned)
    BranchOps.pruneHiddenNodes(chat: &chat, contentStore: store)

    // Active path should remain unchanged (A, B-alt)
    #expect(chat.branchTree!.activePath.count == 2)
}

@Test func prunePreservesPinnedNodes() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A"), assistantMsg("B"), userMsg("C")], contentStore: store)
    let nodeB = chat.branchTree!.activePath[1]

    // Create branch and pin original B
    BranchOps.createBranch(chat: &chat, fromNodeId: nodeB, newContent: [.fromString("B-alt")], contentStore: store)
    chat.branchTree!.nodes[nodeB]?.pinned = true

    BranchOps.pruneHiddenNodes(chat: &chat, contentStore: store)

    // Pinned nodeB should still exist
    #expect(chat.branchTree!.nodes[nodeB] != nil)
}

@Test func copyPasteBranchSequence() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A"), assistantMsg("B"), userMsg("C")], contentStore: store)
    let nodeA = chat.branchTree!.activePath[0]
    let nodeC = chat.branchTree!.activePath[2]

    let clipboard = BranchOps.copyBranchSequence(chat: chat, fromNodeId: nodeA, toNodeId: nodeC)
    #expect(clipboard != nil)
    #expect(clipboard!.nodeIds.count == 3)

    // Paste after nodeC
    BranchOps.pasteBranchSequence(
        chat: &chat,
        afterNodeId: nodeC,
        clipboard: clipboard!,
        contentStore: store
    )

    // Active path should now be [A, B, C, A-copy, B-copy, C-copy]
    #expect(chat.branchTree!.activePath.count == 6)
    #expect(chat.messages.count == 6)
}

@Test func renameBranchNode() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A")], contentStore: store)
    let nodeA = chat.branchTree!.activePath[0]

    BranchOps.renameBranchNode(chat: &chat, nodeId: nodeA, label: "Root")
    #expect(chat.branchTree!.nodes[nodeA]?.label == "Root")

    BranchOps.renameBranchNode(chat: &chat, nodeId: nodeA, label: "")
    #expect(chat.branchTree!.nodes[nodeA]?.label == nil)
}

@Test func toggleNodeStar() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A")], contentStore: store)
    let nodeA = chat.branchTree!.activePath[0]

    BranchOps.toggleNodeStar(chat: &chat, nodeId: nodeA)
    #expect(chat.branchTree!.nodes[nodeA]?.starred == true)

    BranchOps.toggleNodeStar(chat: &chat, nodeId: nodeA)
    #expect(chat.branchTree!.nodes[nodeA]?.starred == nil)
}

@Test func toggleNodePin() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A")], contentStore: store)
    let nodeA = chat.branchTree!.activePath[0]

    BranchOps.toggleNodePin(chat: &chat, nodeId: nodeA)
    #expect(chat.branchTree!.nodes[nodeA]?.pinned == true)

    BranchOps.toggleNodePin(chat: &chat, nodeId: nodeA)
    #expect(chat.branchTree!.nodes[nodeA]?.pinned == nil)
}

@Test func updateNodeRole() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A")], contentStore: store)
    let nodeA = chat.branchTree!.activePath[0]

    BranchOps.updateNodeRole(chat: &chat, nodeId: nodeA, role: .system, contentStore: store)
    #expect(chat.branchTree!.nodes[nodeA]?.role == .system)
    #expect(chat.messages[0].role == .system)
}

@Test func truncateActivePath() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A"), assistantMsg("B"), userMsg("C")], contentStore: store)
    let nodeB = chat.branchTree!.activePath[1]

    BranchOps.truncateActivePath(chat: &chat, afterNodeId: nodeB, contentStore: store)

    #expect(chat.branchTree!.activePath.count == 2) // A, B
    #expect(chat.messages.count == 2)
}

@Test func updateLastNodeContent() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A"), assistantMsg("B")], contentStore: store)

    BranchOps.updateLastNodeContent(chat: &chat, content: [.fromString("B-updated")], contentStore: store)

    #expect(chat.messages.last?.content[0].textValue == "B-updated")
}

// MARK: - Upsert With Auto Branch Tests

@Test func upsertWithAutoBranchNoOp() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A")], contentStore: store)

    let result = BranchOps.upsertWithAutoBranch(
        chat: &chat,
        messageIndex: 0,
        message: userMsg("A"),
        contentStore: store
    )
    #expect(result.noOp == true)
}

@Test func upsertWithAutoBranchRoleOnly() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A")], contentStore: store)
    let nodeA = chat.branchTree!.activePath[0]

    let result = BranchOps.upsertWithAutoBranch(
        chat: &chat,
        messageIndex: 0,
        message: Message(role: .system, text: "A"),
        contentStore: store
    )

    #expect(result.noOp == false)
    #expect(result.newId == nil)
    #expect(chat.branchTree!.nodes[nodeA]?.role == .system)
}

@Test func upsertWithAutoBranchLastNode() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A"), assistantMsg("B")], contentStore: store)

    let result = BranchOps.upsertWithAutoBranch(
        chat: &chat,
        messageIndex: 1,
        message: assistantMsg("B-edited"),
        contentStore: store
    )

    #expect(result.noOp == false)
    #expect(chat.messages[1].content[0].textValue == "B-edited")
}

@Test func upsertWithAutoBranchMidChain() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A"), assistantMsg("B"), userMsg("C")], contentStore: store)
    let nodeB = chat.branchTree!.activePath[1]

    let result = BranchOps.upsertWithAutoBranch(
        chat: &chat,
        messageIndex: 1,
        message: assistantMsg("B-alt"),
        contentStore: store
    )

    // Should create a new branch (sibling)
    #expect(result.newId != nil)
    #expect(chat.branchTree!.activePath.count == 2) // A, B-alt (truncated)
    #expect(chat.messages[1].content[0].textValue == "B-alt")

    // Original nodeB should still exist
    #expect(chat.branchTree!.nodes[nodeB] != nil)
}

// MARK: - Regenerate Target Tests

@Test func resolveRegenerateTargetSystem() {
    let target = RegenerateTarget.resolve(role: .system, messageIndex: 0, messagesLength: 3)
    #expect(target == nil)
}

@Test func resolveRegenerateTargetAssistant() {
    let target = RegenerateTarget.resolve(role: .assistant, messageIndex: 2, messagesLength: 3)!
    #expect(target.removeIndex == 2)
    #expect(target.submitMode == .append)
    #expect(target.insertIndex == 2)
}

@Test func resolveRegenerateTargetAssistantMid() {
    let target = RegenerateTarget.resolve(role: .assistant, messageIndex: 1, messagesLength: 3)!
    #expect(target.removeIndex == 1)
    #expect(target.submitMode == .insert)
    #expect(target.insertIndex == 1)
}

@Test func resolveRegenerateTargetUser() {
    let target = RegenerateTarget.resolve(role: .user, messageIndex: 0, messagesLength: 3)!
    #expect(target.removeIndex == 1) // Remove next assistant
    #expect(target.submitMode == .insert)
    #expect(target.insertIndex == 1)
}

@Test func resolveRegenerateTargetUserLast() {
    let target = RegenerateTarget.resolve(role: .user, messageIndex: 2, messagesLength: 3)!
    #expect(target.removeIndex == -1) // No next message to remove
    #expect(target.submitMode == .append)
    #expect(target.insertIndex == 3)
}

// MARK: - RefCount Integrity Tests

@Test func refCountConsistencyAfterBranchOps() {
    let store = ContentStore()
    var chat = makeChat(messages: [userMsg("A"), assistantMsg("B")], contentStore: store)

    // Verify initial refCounts
    let hashA = chat.branchTree!.nodes[chat.branchTree!.activePath[0]]!.contentHash
    let hashB = chat.branchTree!.nodes[chat.branchTree!.activePath[1]]!.contentHash
    #expect(store.data[hashA]?.refCount == 1)
    #expect(store.data[hashB]?.refCount == 1)

    // Create branch (retains B's hash)
    BranchOps.createBranch(chat: &chat, fromNodeId: chat.branchTree!.activePath.last!, newContent: nil, contentStore: store)
    #expect(store.data[hashB]?.refCount == 2)

    // Delete the new branch
    let newId = chat.branchTree!.activePath.last!
    BranchOps.deleteBranch(chat: &chat, nodeId: newId, contentStore: store)
    // refCount should be back to 1 (or pending GC)
    #expect(store.data[hashB]?.refCount == 1 || store.pendingGCHashes.contains(hashB))
}
