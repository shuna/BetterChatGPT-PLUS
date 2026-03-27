import Testing
import Foundation
@testable import Weavelet_Canvas

@Suite("CloudSyncGuards")
struct CloudSyncGuardsTests {

    private func makeSnapshot(chatCount: Int = 3, contentCount: Int = 5, hasBranchTree: Bool = false) -> SyncSnapshot {
        let chats = (0..<chatCount).map { i in
            var chat = Chat(id: "chat-\(i)", title: "Chat \(i)")
            if hasBranchTree {
                chat.branchTree = BranchTree(
                    nodes: ["node-0": BranchNode(id: "node-0", parentId: nil, role: .user, contentHash: "h")],
                    rootId: "node-0",
                    activePath: ["node-0"]
                )
            }
            return chat
        }
        var store: ContentStoreData = [:]
        for i in 0..<contentCount {
            store["hash-\(i)"] = ContentEntry(content: [.text("content \(i)")], refCount: 1)
        }
        return SyncSnapshot(
            chats: chats,
            contentStore: store,
            folders: [:],
            currentChatID: chatCount > 0 ? "chat-0" : nil,
            snapshotVersion: 1,
            updatedAt: 1711600000000,
            deviceId: "test"
        )
    }

    private func makeMetrics(jsonBytes: Int = 1000, compressedBytes: Int = 500, chatCount: Int = 3, contentCount: Int = 5) -> CloudSyncMetrics {
        CloudSyncMetrics(jsonBytes: jsonBytes, compressedBytes: compressedBytes, chatCount: chatCount, contentEntryCount: contentCount)
    }

    @Test("Normal snapshot passes guard")
    func normalPass() {
        let snapshot = makeSnapshot()
        let metrics = makeMetrics()
        let result = CloudSyncGuards.check(metrics: metrics, snapshot: snapshot, lastSuccessfulMetrics: nil)
        #expect(result == nil)
    }

    @Test("Compressed > 1MB is rejected")
    func compressedTooLarge() {
        let snapshot = makeSnapshot()
        let metrics = makeMetrics(compressedBytes: 1_500_000)
        let result = CloudSyncGuards.check(metrics: metrics, snapshot: snapshot, lastSuccessfulMetrics: nil)
        #expect(result != nil)
        #expect(result!.contains("too large"))
    }

    @Test("JSON > 2MB is rejected")
    func jsonTooLarge() {
        let snapshot = makeSnapshot()
        let metrics = makeMetrics(jsonBytes: 2_500_000)
        let result = CloudSyncGuards.check(metrics: metrics, snapshot: snapshot, lastSuccessfulMetrics: nil)
        #expect(result != nil)
        #expect(result!.contains("too large"))
    }

    @Test("Zero chats is rejected")
    func zeroChats() {
        let snapshot = makeSnapshot(chatCount: 0)
        let metrics = makeMetrics(chatCount: 0)
        let result = CloudSyncGuards.check(metrics: metrics, snapshot: snapshot, lastSuccessfulMetrics: nil)
        #expect(result != nil)
        #expect(result!.contains("no chats"))
    }

    @Test("Empty contentStore with branchTree is rejected")
    func emptyContentWithBranch() {
        let snapshot = makeSnapshot(chatCount: 2, contentCount: 0, hasBranchTree: true)
        let metrics = makeMetrics(chatCount: 2, contentCount: 0)
        let result = CloudSyncGuards.check(metrics: metrics, snapshot: snapshot, lastSuccessfulMetrics: nil)
        #expect(result != nil)
        #expect(result!.contains("content store is empty"))
    }

    @Test("Empty contentStore without branchTree passes")
    func emptyContentNoBranch() {
        let snapshot = makeSnapshot(chatCount: 2, contentCount: 0, hasBranchTree: false)
        let metrics = makeMetrics(chatCount: 2, contentCount: 0)
        let result = CloudSyncGuards.check(metrics: metrics, snapshot: snapshot, lastSuccessfulMetrics: nil)
        #expect(result == nil)
    }

    @Test("Size ratio shrink logs but does not block in v1")
    func sizeRatioShrink() {
        let snapshot = makeSnapshot()
        let last = makeMetrics(compressedBytes: 100_000)
        let current = makeMetrics(compressedBytes: 5_000)  // 95% shrink
        let result = CloudSyncGuards.check(metrics: current, snapshot: snapshot, lastSuccessfulMetrics: last)
        // v1: log only, does not block
        #expect(result == nil)
    }
}
