import Testing
import Foundation
@testable import Weavelet_Canvas

@Suite("StreamRecoveryService", .serialized)
struct StreamRecoveryServiceTests {

    private func tempFileURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("test_stream_\(UUID().uuidString).json")
    }

    // MARK: - StreamRecord Codable

    @Test("StreamRecord round-trip encode/decode")
    func streamRecordCodable() throws {
        let record = StreamRecord(
            id: "r1", chatId: "c1", nodeId: "n1",
            bufferedText: "hello", status: .streaming,
            createdAt: Date(timeIntervalSince1970: 1000),
            updatedAt: Date(timeIntervalSince1970: 2000)
        )
        let data = try JSONEncoder().encode(record)
        let decoded = try JSONDecoder().decode(StreamRecord.self, from: data)
        #expect(decoded.id == "r1")
        #expect(decoded.chatId == "c1")
        #expect(decoded.nodeId == "n1")
        #expect(decoded.bufferedText == "hello")
        #expect(decoded.status == .streaming)
    }

    // MARK: - CRUD

    @Test("Save and retrieve pending records")
    func saveAndAllPending() async {
        let url = tempFileURL()
        let svc = StreamRecoveryService(fileURL: url)
        defer { try? FileManager.default.removeItem(at: url) }

        let record = StreamRecord(
            id: "r1", chatId: "c1", nodeId: "n1",
            bufferedText: "partial", status: .streaming,
            createdAt: Date(), updatedAt: Date()
        )
        await svc.save(record)

        let pending = await svc.allPending()
        #expect(pending.count == 1)
        #expect(pending[0].id == "r1")
        #expect(pending[0].bufferedText == "partial")
    }

    @Test("replaceBufferedText overwrites (does not append)")
    func replaceBufferedText() async {
        let url = tempFileURL()
        let svc = StreamRecoveryService(fileURL: url)
        defer { try? FileManager.default.removeItem(at: url) }

        let record = StreamRecord(
            id: "r1", chatId: "c1", nodeId: "n1",
            bufferedText: "a", status: .streaming,
            createdAt: Date(), updatedAt: Date()
        )
        await svc.save(record)

        await svc.replaceBufferedText(id: "r1", text: "ab")
        await svc.replaceBufferedText(id: "r1", text: "abc")

        let pending = await svc.allPending()
        #expect(pending[0].bufferedText == "abc") // NOT "aababc"
    }

    @Test("updateStatus changes record status")
    func updateStatus() async {
        let url = tempFileURL()
        let svc = StreamRecoveryService(fileURL: url)
        defer { try? FileManager.default.removeItem(at: url) }

        let record = StreamRecord(
            id: "r1", chatId: "c1", nodeId: "n1",
            bufferedText: "text", status: .streaming,
            createdAt: Date(), updatedAt: Date()
        )
        await svc.save(record)
        await svc.updateStatus(id: "r1", .interrupted)

        let pending = await svc.allPending()
        #expect(pending[0].status == .interrupted)
    }

    @Test("allPending includes failed records")
    func allPendingIncludesFailed() async {
        let url = tempFileURL()
        let svc = StreamRecoveryService(fileURL: url)
        defer { try? FileManager.default.removeItem(at: url) }

        await svc.save(StreamRecord(id: "r1", chatId: "c1", nodeId: "n1", bufferedText: "a", status: .failed, createdAt: Date(), updatedAt: Date()))
        await svc.save(StreamRecord(id: "r2", chatId: "c1", nodeId: "n2", bufferedText: "b", status: .completed, createdAt: Date(), updatedAt: Date()))
        await svc.save(StreamRecord(id: "r3", chatId: "c1", nodeId: "n3", bufferedText: "c", status: .interrupted, createdAt: Date(), updatedAt: Date()))

        let pending = await svc.allPending()
        let ids = Set(pending.map(\.id))
        #expect(ids.contains("r1")) // failed
        #expect(!ids.contains("r2")) // completed excluded
        #expect(ids.contains("r3")) // interrupted
    }

    @Test("delete removes a record")
    func deleteRecord() async {
        let url = tempFileURL()
        let svc = StreamRecoveryService(fileURL: url)
        defer { try? FileManager.default.removeItem(at: url) }

        await svc.save(StreamRecord(id: "r1", chatId: "c1", nodeId: "n1", bufferedText: "text", status: .streaming, createdAt: Date(), updatedAt: Date()))
        await svc.delete(id: "r1")

        let pending = await svc.allPending()
        #expect(pending.isEmpty)
    }

    @Test("deleteCompleted removes only completed records")
    func deleteCompleted() async {
        let url = tempFileURL()
        let svc = StreamRecoveryService(fileURL: url)
        defer { try? FileManager.default.removeItem(at: url) }

        await svc.save(StreamRecord(id: "r1", chatId: "c1", nodeId: "n1", bufferedText: "a", status: .completed, createdAt: Date(), updatedAt: Date()))
        await svc.save(StreamRecord(id: "r2", chatId: "c1", nodeId: "n2", bufferedText: "b", status: .interrupted, createdAt: Date(), updatedAt: Date()))

        await svc.deleteCompleted()
        let pending = await svc.allPending()
        #expect(pending.count == 1)
        #expect(pending[0].id == "r2")
    }

    // MARK: - Stale Detection

    @Test("markStaleAsInterrupted marks old streaming records")
    func markStale() async {
        let url = tempFileURL()
        let svc = StreamRecoveryService(fileURL: url)
        defer { try? FileManager.default.removeItem(at: url) }

        // Record with updatedAt 60 seconds ago
        let stale = StreamRecord(
            id: "r1", chatId: "c1", nodeId: "n1",
            bufferedText: "old", status: .streaming,
            createdAt: Date().addingTimeInterval(-120),
            updatedAt: Date().addingTimeInterval(-60)
        )
        await svc.save(stale)
        await svc.markStaleAsInterrupted(threshold: 30)

        let pending = await svc.allPending()
        #expect(pending[0].status == .interrupted)
    }

    @Test("markStaleAsInterrupted skips recent streaming records")
    func markStaleSkipsRecent() async {
        let url = tempFileURL()
        let svc = StreamRecoveryService(fileURL: url)
        defer { try? FileManager.default.removeItem(at: url) }

        // Record with updatedAt 5 seconds ago (still fresh)
        let recent = StreamRecord(
            id: "r1", chatId: "c1", nodeId: "n1",
            bufferedText: "fresh", status: .streaming,
            createdAt: Date().addingTimeInterval(-10),
            updatedAt: Date().addingTimeInterval(-5)
        )
        await svc.save(recent)
        await svc.markStaleAsInterrupted(threshold: 30)

        let pending = await svc.allPending()
        #expect(pending[0].status == .streaming) // not changed
    }

    // MARK: - Flush & Persistence

    @Test("flush writes data to disk immediately")
    func flushWritesToDisk() async throws {
        let url = tempFileURL()
        let svc = StreamRecoveryService(fileURL: url)
        defer { try? FileManager.default.removeItem(at: url) }

        await svc.save(StreamRecord(id: "r1", chatId: "c1", nodeId: "n1", bufferedText: "buffered", status: .streaming, createdAt: Date(), updatedAt: Date()))
        await svc.flush()

        // Verify file exists and can be read
        let data = try Data(contentsOf: url)
        let records = try JSONDecoder().decode([StreamRecord].self, from: data)
        #expect(records.count == 1)
        #expect(records[0].bufferedText == "buffered")
    }

    @Test("Data persists across service instances")
    func persistenceAcrossInstances() async {
        let url = tempFileURL()
        defer { try? FileManager.default.removeItem(at: url) }

        // Save with first instance
        let svc1 = StreamRecoveryService(fileURL: url)
        await svc1.save(StreamRecord(id: "r1", chatId: "c1", nodeId: "n1", bufferedText: "survived", status: .interrupted, createdAt: Date(), updatedAt: Date()))
        await svc1.flush()

        // Load with second instance
        let svc2 = StreamRecoveryService(fileURL: url)
        let pending = await svc2.allPending()
        #expect(pending.count == 1)
        #expect(pending[0].bufferedText == "survived")
    }
}
