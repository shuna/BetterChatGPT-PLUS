import Foundation
import os

// MARK: - Proxy SSE Event

/// A single parsed event from the proxy SSE stream.
nonisolated struct ProxySseEvent {
    /// Sequential event ID from the proxy.
    let id: Int?
    /// Event type: nil for data events, "done"/"error"/"interrupted" for control.
    let eventType: String?
    /// The raw text chunk from the LLM (for data events).
    let rawText: String?
    /// Metadata for done/error/interrupted events.
    let meta: [String: Any]?
}

// MARK: - Proxy SSE Parser (Incremental)

/// Incremental SSE parser: feed partial data, get complete events out.
///
/// Proxy SSE format:
/// ```
/// id: 1
/// data: "JSON-stringified raw text"
///
/// event: done
/// data: {"totalChunks":5,"complete":true}
/// ```
///
/// Events are separated by double newlines. This parser buffers incomplete
/// blocks across `feed()` calls and only emits fully received events.
nonisolated struct ProxySseParser: Sendable {
    private var buffer: String = ""

    /// Feed a chunk of raw SSE text. Returns all complete events parsed.
    mutating func feed(_ chunk: String) -> [ProxySseEvent] {
        buffer += chunk
        let normalized = buffer.replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")

        let rawBlocks = normalized.components(separatedBy: "\n\n")

        // Last element is potentially incomplete — keep in buffer
        buffer = rawBlocks.last ?? ""
        let completeBlocks = rawBlocks.dropLast()

        return parseBlocks(completeBlocks)
    }

    /// Flush any remaining buffered data as final event(s).
    mutating func flush() -> [ProxySseEvent] {
        guard !buffer.isEmpty else { return [] }
        let remaining = buffer
        buffer = ""
        // Treat the entire remaining buffer as a complete block
        let normalized = remaining.replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let blocks = normalized.components(separatedBy: "\n\n")
        return parseBlocks(blocks)
    }

    // MARK: - Private

    private func parseBlocks(_ blocks: some Sequence<String>) -> [ProxySseEvent] {
        var events: [ProxySseEvent] = []

        for block in blocks {
            let trimmed = block.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { continue }

            var id: Int?
            var eventType: String?
            var dataLine: String = ""

            for line in trimmed.components(separatedBy: "\n") {
                if line.hasPrefix("id: ") {
                    id = Int(String(line.dropFirst(4)))
                } else if line.hasPrefix("event: ") {
                    eventType = String(line.dropFirst(7))
                } else if line.hasPrefix("data: ") {
                    dataLine = String(line.dropFirst(6))
                } else if line == "data" {
                    dataLine = ""
                }
            }

            // Control events: done, error, interrupted, waiting
            if let et = eventType,
               ["done", "error", "interrupted", "waiting"].contains(et) {
                var meta: [String: Any]?
                if let data = dataLine.data(using: .utf8),
                   let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    meta = parsed
                }
                events.append(ProxySseEvent(id: id, eventType: et, rawText: nil, meta: meta))
            } else if !dataLine.isEmpty {
                // Data event: JSON-stringified raw text
                if let data = dataLine.data(using: .utf8),
                   let rawText = try? JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed) as? String {
                    events.append(ProxySseEvent(id: id, eventType: nil, rawText: rawText, meta: nil))
                }
                // Malformed data — skip
            }
        }

        return events
    }
}

// MARK: - Proxy Recovery Result

/// Structured result from proxy KV recovery.
struct ProxyRecoveryResult {
    /// Recovered accumulated text.
    let text: String
    /// Last event ID from the recovered stream.
    let lastEventId: Int?
    /// Terminal event type: "done" / "error" / "interrupted" / nil (still streaming).
    let terminalEvent: String?
}

// MARK: - Proxy Client

/// Static functions for communicating with the Weavelet Stream Proxy worker.
enum ProxyClient {

    private static let logger = Logger(subsystem: "org.sstcr.WeaveletCanvas", category: "ProxyClient")

    // MARK: - Stream via Proxy

    /// POST /api/stream — route an LLM request through the proxy.
    /// Returns the raw async bytes and HTTP response for SSE consumption.
    static func streamViaProxy(
        config: ProxyConfig,
        sessionId: String,
        targetEndpoint: String,
        targetHeaders: [String: String],
        body: Data
    ) async throws -> (URLSession.AsyncBytes, HTTPURLResponse) {
        let url = URL(string: "\(config.endpoint)/api/stream")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = config.authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.timeoutInterval = 120

        // Top-level fields matching the Worker contract
        let envelope: [String: Any] = [
            "sessionId": sessionId,
            "endpoint": targetEndpoint,
            "headers": targetHeaders,
            "body": (try? JSONSerialization.jsonObject(with: body)) as Any
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: envelope)

        let (asyncBytes, response) = try await URLSession.shared.bytes(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            var errorBody = ""
            for try await line in asyncBytes.lines {
                errorBody += line
                if errorBody.count > 2000 { break }
            }
            throw APIError.httpError(status: httpResponse.statusCode, body: errorBody)
        }

        return (asyncBytes, httpResponse)
    }

    // MARK: - Recover

    /// GET /api/recover/{sessionId}?lastEventId={id}
    /// Replays missed chunks from KV cache. Retries up to 3 times with 2s intervals.
    static func recover(
        config: ProxyConfig,
        sessionId: String,
        lastEventId: Int?
    ) async throws -> ProxyRecoveryResult {
        let maxRetries = 3
        let retryDelay: Duration = .seconds(2)
        var lastError: Error?

        for attempt in 0..<maxRetries {
            if attempt > 0 {
                try await Task.sleep(for: retryDelay)
            }
            do {
                return try await performRecover(config: config, sessionId: sessionId, lastEventId: lastEventId)
            } catch {
                lastError = error
                logger.warning("Proxy recover attempt \(attempt + 1)/\(maxRetries) failed: \(error.localizedDescription)")
            }
        }

        throw lastError ?? APIError.invalidResponse
    }

    private static func performRecover(
        config: ProxyConfig,
        sessionId: String,
        lastEventId: Int?
    ) async throws -> ProxyRecoveryResult {
        var urlString = "\(config.endpoint)/api/recover/\(sessionId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? sessionId)"
        if let lastEventId {
            urlString += "?lastEventId=\(lastEventId)"
        }

        var request = URLRequest(url: URL(string: urlString)!)
        request.httpMethod = "GET"
        if let token = config.authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.timeoutInterval = 30

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200..<300).contains(httpResponse.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw APIError.httpError(status: status, body: String(data: data, encoding: .utf8) ?? "")
        }

        // Parse the SSE response body
        let text = String(data: data, encoding: .utf8) ?? ""
        var parser = ProxySseParser()
        var events = parser.feed(text)
        events += parser.flush()

        var accumulated = ""
        var lastId: Int?
        var terminalEvent: String?

        for event in events {
            if let id = event.id { lastId = id }

            if let rawText = event.rawText {
                accumulated += rawText
            } else if let et = event.eventType {
                terminalEvent = et
            }
        }

        return ProxyRecoveryResult(text: accumulated, lastEventId: lastId, terminalEvent: terminalEvent)
    }

    // MARK: - ACK

    /// POST /api/ack/{sessionId} — notify proxy to delete KV cache.
    static func sendAck(config: ProxyConfig, sessionId: String) async throws {
        let urlString = "\(config.endpoint)/api/ack/\(sessionId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? sessionId)"
        var request = URLRequest(url: URL(string: urlString)!)
        request.httpMethod = "POST"
        if let token = config.authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.timeoutInterval = 10

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200..<300).contains(httpResponse.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw APIError.httpError(status: status, body: "ACK failed with status \(status)")
        }
    }

    // MARK: - Cancel (Fire-and-Forget)

    /// POST /api/cancel/{sessionId} — best-effort, does not block local cancel.
    static func sendCancel(config: ProxyConfig, sessionId: String) {
        Task {
            do {
                let urlString = "\(config.endpoint)/api/cancel/\(sessionId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? sessionId)"
                var request = URLRequest(url: URL(string: urlString)!)
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                if let token = config.authToken {
                    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                }
                request.timeoutInterval = 10

                _ = try await URLSession.shared.data(for: request)
            } catch {
                // Best-effort — KV TTL will clean up eventually
            }
        }
    }
}
