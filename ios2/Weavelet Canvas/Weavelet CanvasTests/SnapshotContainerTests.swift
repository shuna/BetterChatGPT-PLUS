import Testing
import Foundation
@testable import Weavelet_Canvas

@Suite("SnapshotContainer")
struct SnapshotContainerTests {

    private func makeSyncSnapshot(chatCount: Int = 2) -> SyncSnapshot {
        let chats = (0..<chatCount).map { i in
            Chat(id: "chat-\(i)", title: "Chat \(i)")
        }
        return SyncSnapshot(
            chats: chats,
            contentStore: ["hash1": ContentEntry(content: [.text("hello")], refCount: 1)],
            folders: [:],
            currentChatID: chatCount > 0 ? "chat-0" : nil,
            snapshotVersion: 1,
            updatedAt: 1711600000000,
            deviceId: "test-device"
        )
    }

    @Test("isWVLT detects magic correctly")
    func isWVLT() {
        // Valid WVLT
        var data = Data()
        var magic = SnapshotContainer.magic.littleEndian
        data.append(Data(bytes: &magic, count: 4))
        data.append(Data(repeating: 0, count: 16))
        #expect(SnapshotContainer.isWVLT(data))

        // Not WVLT
        #expect(!SnapshotContainer.isWVLT(Data([0x00, 0x01, 0x02, 0x03])))

        // Too short
        #expect(!SnapshotContainer.isWVLT(Data([0x57, 0x56])))

        // Empty
        #expect(!SnapshotContainer.isWVLT(Data()))
    }

    @Test("Encode/decode roundtrip preserves data")
    func roundtrip() throws {
        let original = makeSyncSnapshot()
        let encoded = try SnapshotContainer.encode(original)
        let decoded = try SnapshotContainer.decode(encoded)

        #expect(decoded.chats.count == 2)
        #expect(decoded.chats[0].id == "chat-0")
        #expect(decoded.chats[1].id == "chat-1")
        #expect(decoded.contentStore["hash1"]?.content == [.text("hello")])
        #expect(decoded.currentChatID == "chat-0")
        #expect(decoded.snapshotVersion == 1)
        #expect(decoded.updatedAt == 1711600000000)
        #expect(decoded.deviceId == "test-device")
    }

    @Test("Encoded data starts with WVLT magic")
    func encodedMagic() throws {
        let snapshot = makeSyncSnapshot()
        let encoded = try SnapshotContainer.encode(snapshot)

        #expect(encoded.count >= 20)
        #expect(SnapshotContainer.isWVLT(encoded))
    }

    @Test("Header fields are correct")
    func headerFields() throws {
        let snapshot = makeSyncSnapshot()
        let encoded = try SnapshotContainer.encode(snapshot, level: 5)

        encoded.withUnsafeBytes { buf in
            let version = UInt16(littleEndian: buf.loadUnaligned(fromByteOffset: 4, as: UInt16.self))
            #expect(version == 1)

            let codec = buf.load(fromByteOffset: 6, as: UInt8.self)
            #expect(codec == SnapshotCodec.zstd.rawValue)

            let level = buf.load(fromByteOffset: 7, as: UInt8.self)
            #expect(level == 5)

            let uncompressedLen = UInt32(littleEndian: buf.loadUnaligned(fromByteOffset: 8, as: UInt32.self))
            #expect(uncompressedLen > 0)

            let compressedLen = UInt32(littleEndian: buf.loadUnaligned(fromByteOffset: 12, as: UInt32.self))
            #expect(compressedLen > 0)
            #expect(Int(compressedLen) == encoded.count - 20)

            let reserved = UInt32(littleEndian: buf.loadUnaligned(fromByteOffset: 16, as: UInt32.self))
            #expect(reserved == 0)
        }
    }

    @Test("Decode rejects data too short")
    func dataTooShort() {
        #expect(throws: SnapshotContainerError.self) {
            try SnapshotContainer.decode(Data(repeating: 0, count: 10))
        }
    }

    @Test("Decode rejects invalid magic")
    func invalidMagic() {
        let data = Data(repeating: 0xFF, count: 20)
        #expect(throws: SnapshotContainerError.self) {
            try SnapshotContainer.decode(data)
        }
    }

    @Test("Decode rejects unknown version")
    func unknownVersion() throws {
        let snapshot = makeSyncSnapshot()
        var encoded = try SnapshotContainer.encode(snapshot)

        // Overwrite version to 99
        var v: UInt16 = 99
        encoded.replaceSubrange(4..<6, with: Data(bytes: &v, count: 2))

        #expect(throws: SnapshotContainerError.self) {
            try SnapshotContainer.decode(encoded)
        }
    }

    @Test("Decode rejects unknown codec")
    func unknownCodec() throws {
        let snapshot = makeSyncSnapshot()
        var encoded = try SnapshotContainer.encode(snapshot)

        // Overwrite codec to 0xFF
        encoded[6] = 0xFF

        #expect(throws: SnapshotContainerError.self) {
            try SnapshotContainer.decode(encoded)
        }
    }

    @Test("Decode rejects compressedLen mismatch")
    func compressedLenMismatch() throws {
        let snapshot = makeSyncSnapshot()
        var encoded = try SnapshotContainer.encode(snapshot)

        // Append extra bytes — payload is now longer than header says
        encoded.append(Data(repeating: 0, count: 10))

        #expect(throws: SnapshotContainerError.self) {
            try SnapshotContainer.decode(encoded)
        }
    }

    @Test("Decode rejects truncated payload")
    func truncatedPayload() throws {
        let snapshot = makeSyncSnapshot()
        let encoded = try SnapshotContainer.encode(snapshot)

        // Truncate payload
        let truncated = encoded.prefix(encoded.count - 5)

        #expect(throws: SnapshotContainerError.self) {
            try SnapshotContainer.decode(Data(truncated))
        }
    }
}
