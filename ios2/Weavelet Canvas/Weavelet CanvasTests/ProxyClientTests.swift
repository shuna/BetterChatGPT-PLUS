import Testing
import Foundation
@testable import Weavelet_Canvas

@Suite("ProxySseParser")
struct ProxySseParserTests {

    // MARK: - Single complete event

    @Test("Parse single data event")
    func singleDataEvent() {
        var parser = ProxySseParser()
        let input = "id: 1\ndata: \"hello world\"\n\n"
        let events = parser.feed(input)
        #expect(events.count == 1)
        #expect(events[0].id == 1)
        #expect(events[0].rawText == "hello world")
        #expect(events[0].eventType == nil)
    }

    // MARK: - Multiple events in one chunk

    @Test("Parse multiple data events")
    func multipleDataEvents() {
        var parser = ProxySseParser()
        let input = "id: 1\ndata: \"hello\"\n\nid: 2\ndata: \" world\"\n\n"
        let events = parser.feed(input)
        #expect(events.count == 2)
        #expect(events[0].rawText == "hello")
        #expect(events[1].rawText == " world")
        #expect(events[1].id == 2)
    }

    // MARK: - Fragment boundary (incremental)

    @Test("Incremental parsing across fragment boundary")
    func fragmentBoundary() {
        var parser = ProxySseParser()

        // First chunk: incomplete event
        let events1 = parser.feed("id: 1\ndata: \"hel")
        #expect(events1.isEmpty)

        // Second chunk: completes the event
        let events2 = parser.feed("lo\"\n\n")
        #expect(events2.count == 1)
        #expect(events2[0].rawText == "hello")
        #expect(events2[0].id == 1)
    }

    // MARK: - Done event

    @Test("Parse done control event")
    func doneEvent() {
        var parser = ProxySseParser()
        let input = "id: 5\nevent: done\ndata: {\"totalChunks\":5,\"complete\":true}\n\n"
        let events = parser.feed(input)
        #expect(events.count == 1)
        #expect(events[0].eventType == "done")
        #expect(events[0].id == 5)
        #expect(events[0].meta?["totalChunks"] as? Int == 5)
        #expect(events[0].meta?["complete"] as? Bool == true)
    }

    // MARK: - Error event

    @Test("Parse error control event")
    func errorEvent() {
        var parser = ProxySseParser()
        let input = "id: 3\nevent: error\ndata: {\"error\":\"upstream timeout\"}\n\n"
        let events = parser.feed(input)
        #expect(events.count == 1)
        #expect(events[0].eventType == "error")
        #expect(events[0].meta?["error"] as? String == "upstream timeout")
    }

    // MARK: - Interrupted event

    @Test("Parse interrupted control event")
    func interruptedEvent() {
        var parser = ProxySseParser()
        let input = "event: interrupted\ndata: {}\n\n"
        let events = parser.feed(input)
        #expect(events.count == 1)
        #expect(events[0].eventType == "interrupted")
    }

    // MARK: - Flush

    @Test("Flush emits remaining buffered data")
    func flushRemainder() {
        var parser = ProxySseParser()
        _ = parser.feed("id: 1\ndata: \"leftover\"")
        let events = parser.flush()
        #expect(events.count == 1)
        #expect(events[0].rawText == "leftover")
    }

    @Test("Flush on empty buffer returns nothing")
    func flushEmpty() {
        var parser = ProxySseParser()
        let events = parser.flush()
        #expect(events.isEmpty)
    }

    // MARK: - CRLF handling

    @Test("Handle CRLF line endings")
    func crlfHandling() {
        var parser = ProxySseParser()
        let input = "id: 1\r\ndata: \"crlf\"\r\n\r\n"
        let events = parser.feed(input)
        #expect(events.count == 1)
        #expect(events[0].rawText == "crlf")
    }

    // MARK: - Malformed data skipped

    @Test("Malformed JSON data is skipped")
    func malformedSkipped() {
        var parser = ProxySseParser()
        let input = "id: 1\ndata: not-json\n\nid: 2\ndata: \"valid\"\n\n"
        let events = parser.feed(input)
        #expect(events.count == 1)
        #expect(events[0].rawText == "valid")
        #expect(events[0].id == 2)
    }

    // MARK: - Mixed data and control events

    @Test("Mix of data and done events")
    func mixedEvents() {
        var parser = ProxySseParser()
        let input = "id: 1\ndata: \"chunk1\"\n\nid: 2\ndata: \"chunk2\"\n\nid: 3\nevent: done\ndata: {\"totalChunks\":2,\"complete\":true}\n\n"
        let events = parser.feed(input)
        #expect(events.count == 3)
        #expect(events[0].rawText == "chunk1")
        #expect(events[1].rawText == "chunk2")
        #expect(events[2].eventType == "done")
    }

    // MARK: - Three-chunk incremental

    @Test("Three-chunk incremental feeding")
    func threeChunkIncremental() {
        var parser = ProxySseParser()

        let e1 = parser.feed("id: 1\n")
        #expect(e1.isEmpty)

        let e2 = parser.feed("data: \"part\"\n\n")
        #expect(e2.count == 1)
        #expect(e2[0].rawText == "part")

        let e3 = parser.feed("id: 2\ndata: \"next\"\n\n")
        #expect(e3.count == 1)
        #expect(e3[0].rawText == "next")
    }
}

// MARK: - StreamRecord Proxy Fields

@Suite("StreamRecord Proxy Fields")
struct StreamRecordProxyFieldsTests {

    @Test("StreamRecord proxy fields round-trip")
    func proxyFieldsCodable() throws {
        let record = StreamRecord(
            id: "r1", chatId: "c1", nodeId: "n1",
            bufferedText: "hello", status: .streaming,
            createdAt: Date(timeIntervalSince1970: 1000),
            updatedAt: Date(timeIntervalSince1970: 2000),
            proxySessionId: "c1:r1",
            lastProxyEventId: 42
        )
        let data = try JSONEncoder().encode(record)
        let decoded = try JSONDecoder().decode(StreamRecord.self, from: data)
        #expect(decoded.proxySessionId == "c1:r1")
        #expect(decoded.lastProxyEventId == 42)
    }

    @Test("StreamRecord nil proxy fields round-trip")
    func nilProxyFieldsCodable() throws {
        let record = StreamRecord(
            id: "r1", chatId: "c1", nodeId: "n1",
            bufferedText: "", status: .streaming,
            createdAt: Date(), updatedAt: Date()
        )
        let data = try JSONEncoder().encode(record)
        let decoded = try JSONDecoder().decode(StreamRecord.self, from: data)
        #expect(decoded.proxySessionId == nil)
        #expect(decoded.lastProxyEventId == nil)
    }

    @Test("StreamRecord backward compatible decode (no proxy fields)")
    func backwardCompatibleDecode() throws {
        // Simulate a record saved before proxy fields existed
        let json = """
        {"id":"r1","chatId":"c1","nodeId":"n1","bufferedText":"","status":"streaming","createdAt":0,"updatedAt":0}
        """
        let data = json.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StreamRecord.self, from: data)
        #expect(decoded.proxySessionId == nil)
        #expect(decoded.lastProxyEventId == nil)
    }
}

// MARK: - ProxyConfig Resolution

@Suite("ProxyConfig Resolution")
struct ProxyConfigTests {

    @Test("resolvedProxyConfig returns nil when disabled")
    func disabledReturnsNil() {
        let settings = SettingsViewModel()
        settings.proxyEnabled = false
        settings.proxyEndpoint = "https://proxy.example.com"
        #expect(settings.resolvedProxyConfig == nil)
    }

    @Test("resolvedProxyConfig returns nil when endpoint empty")
    func emptyEndpointReturnsNil() {
        let settings = SettingsViewModel()
        settings.proxyEnabled = true
        settings.proxyEndpoint = "   "
        #expect(settings.resolvedProxyConfig == nil)
    }

    @Test("resolvedProxyConfig returns config when valid")
    func validConfig() {
        let settings = SettingsViewModel()
        settings.proxyEnabled = true
        settings.proxyEndpoint = "https://proxy.example.com"
        let config = settings.resolvedProxyConfig
        #expect(config != nil)
        #expect(config?.endpoint == "https://proxy.example.com")
    }

    @Test("proxyEndpoint normalization strips trailing slashes")
    func endpointNormalization() {
        let settings = SettingsViewModel()
        settings.proxyEndpoint = "https://proxy.example.com///"
        #expect(settings.proxyEndpoint == "https://proxy.example.com")
    }

    @Test("proxyEndpoint normalization trims whitespace")
    func endpointWhitespaceTrim() {
        let settings = SettingsViewModel()
        settings.proxyEndpoint = "  https://proxy.example.com  "
        #expect(settings.proxyEndpoint == "https://proxy.example.com")
    }
}

// MARK: - StreamRecoveryService proxyEventId

@Suite("StreamRecovery Proxy EventId", .serialized)
struct StreamRecoveryProxyEventIdTests {

    private func tempFileURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("test_proxy_\(UUID().uuidString).json")
    }

    @Test("proxyEventId monotonic update")
    func monotonicEventId() async {
        let service = StreamRecoveryService(fileURL: tempFileURL())
        let record = StreamRecord(
            id: "r1", chatId: "c1", nodeId: "n1",
            bufferedText: "", status: .streaming,
            createdAt: Date(), updatedAt: Date(),
            proxySessionId: "c1:r1"
        )
        await service.save(record)

        // Forward update
        await service.replaceBufferedText(id: "r1", text: "a", seq: 1, proxyEventId: 5)
        var pending = await service.allPending()
        #expect(pending[0].lastProxyEventId == 5)

        // Higher eventId accepted
        await service.replaceBufferedText(id: "r1", text: "ab", seq: 2, proxyEventId: 10)
        pending = await service.allPending()
        #expect(pending[0].lastProxyEventId == 10)

        // Lower eventId rejected (monotonic)
        await service.replaceBufferedText(id: "r1", text: "abc", seq: 3, proxyEventId: 7)
        pending = await service.allPending()
        #expect(pending[0].lastProxyEventId == 10)
    }

    @Test("nil proxyEventId preserves existing value")
    func nilPreservesExisting() async {
        let service = StreamRecoveryService(fileURL: tempFileURL())
        let record = StreamRecord(
            id: "r1", chatId: "c1", nodeId: "n1",
            bufferedText: "", status: .streaming,
            createdAt: Date(), updatedAt: Date(),
            proxySessionId: "c1:r1",
            lastProxyEventId: 5
        )
        await service.save(record)

        // nil proxyEventId should not clear existing value
        await service.replaceBufferedText(id: "r1", text: "updated", seq: 1, proxyEventId: nil)
        let pending = await service.allPending()
        #expect(pending[0].lastProxyEventId == 5)
        #expect(pending[0].bufferedText == "updated")
    }
}
