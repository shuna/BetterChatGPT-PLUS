import Testing
import Foundation
@testable import Weavelet_Canvas

@Suite("SyncSnapshot")
struct SyncSnapshotTests {

    @Test("Init from AppState copies sync fields")
    func initFromAppState() {
        let chat = Chat(id: "c1", title: "Test")
        let state = AppState(
            chats: [chat],
            contentStore: ["h1": ContentEntry(content: [.text("text")], refCount: 1)],
            folders: ["f1": Folder(id: "f1", name: "Folder")],
            currentChatID: "c1"
        )

        let snapshot = SyncSnapshot(from: state, deviceId: "dev-1")

        #expect(snapshot.chats.count == 1)
        #expect(snapshot.chats[0].id == "c1")
        #expect(snapshot.contentStore.count == 1)
        #expect(snapshot.folders.count == 1)
        #expect(snapshot.currentChatID == "c1")
        #expect(snapshot.deviceId == "dev-1")
        #expect(snapshot.updatedAt > 0)
    }

    @Test("ApplyTo overwrites sync fields only")
    func applyTo() {
        let remoteChat = Chat(id: "c-remote", title: "Remote Chat")
        let snapshot = SyncSnapshot(
            chats: [remoteChat],
            contentStore: ["h-remote": ContentEntry(content: [.text("remote")], refCount: 1)],
            folders: [:],
            currentChatID: "c-remote",
            snapshotVersion: 1,
            updatedAt: 1711600000000,
            deviceId: "remote-dev"
        )

        var localState = AppState(
            chats: [Chat(id: "c-local", title: "Local Chat")],
            contentStore: ["h-local": ContentEntry(content: [.text("local")], refCount: 1)],
            folders: ["f1": Folder(id: "f1", name: "F")],
            currentChatID: "c-local"
        )

        snapshot.applyTo(&localState)

        #expect(localState.chats.count == 1)
        #expect(localState.chats[0].id == "c-remote")
        #expect(localState.contentStore.count == 1)
        #expect(localState.contentStore["h-remote"] != nil)
        #expect(localState.folders.isEmpty)
        #expect(localState.currentChatID == "c-remote")
        // version should NOT be overwritten
        #expect(localState.version == AppState.currentVersion)
    }

    @Test("ApplyTo sets currentChatID to nil if chat not found")
    func applyToMissingChat() {
        let snapshot = SyncSnapshot(
            chats: [Chat(id: "c1", title: "C1")],
            contentStore: [:],
            folders: [:],
            currentChatID: "c-nonexistent",
            snapshotVersion: 1,
            updatedAt: 1711600000000,
            deviceId: "dev"
        )

        var state = AppState()
        snapshot.applyTo(&state)

        #expect(state.currentChatID == nil)
    }

    @Test("ApplyTo preserves nil currentChatID")
    func applyToNilChatID() {
        let snapshot = SyncSnapshot(
            chats: [Chat(id: "c1", title: "C1")],
            contentStore: [:],
            folders: [:],
            currentChatID: nil,
            snapshotVersion: 1,
            updatedAt: 1711600000000,
            deviceId: "dev"
        )

        var state = AppState(currentChatID: "old")
        snapshot.applyTo(&state)

        #expect(state.currentChatID == nil)
    }

    @Test("SyncSnapshot is Codable roundtrip")
    func codableRoundtrip() throws {
        let original = SyncSnapshot(
            chats: [Chat(id: "c1", title: "Test")],
            contentStore: ["h": ContentEntry(content: [.text("hi")], refCount: 2)],
            folders: ["f1": Folder(id: "f1", name: "Folder")],
            currentChatID: "c1",
            snapshotVersion: 1,
            updatedAt: 1711600000000,
            deviceId: "dev-abc"
        )

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(SyncSnapshot.self, from: data)

        #expect(decoded.chats.count == 1)
        #expect(decoded.updatedAt == 1711600000000)
        #expect(decoded.deviceId == "dev-abc")
    }
}
