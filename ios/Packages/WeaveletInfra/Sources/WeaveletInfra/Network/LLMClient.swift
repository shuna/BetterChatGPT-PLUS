import Foundation
import WeaveletDomain

/// Real LLM streaming client using URLSession.bytes + SSEParser.
///
/// Sends chat completion requests and yields parsed SSE events via AsyncSequence.
public final class LLMClient: @unchecked Sendable {

    public static let shared = LLMClient()

    /// Currently running stream task (for cancellation).
    private var currentTask: Task<Void, Never>?

    private init() {}

    // MARK: - Streaming

    /// Stream a chat completion request.
    /// Returns an AsyncThrowingStream of SSEEvent.
    /// Call `cancelStream()` to stop.
    public func streamCompletion(
        config: ProviderConfig,
        chatConfig: ChatConfig,
        messages: [Message]
    ) async throws -> AsyncThrowingStream<SSEEvent, Error> {
        guard let request = RequestBuilder.buildRequest(
            endpoint: config.endpoint,
            messages: messages,
            config: chatConfig,
            apiKey: config.apiKey,
            stream: true
        ) else {
            throw LLMError.invalidEndpoint(config.endpoint)
        }

        let (bytes, response) = try await URLSession.shared.bytes(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw LLMError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            var errorBody = ""
            for try await line in bytes.lines {
                errorBody += line
                if errorBody.count > 2000 { break }
            }
            throw LLMError.httpError(status: httpResponse.statusCode, body: errorBody)
        }

        let stream = AsyncThrowingStream<SSEEvent, Error> { continuation in
            let task = Task {
                var buffer = ""
                do {
                    for try await line in bytes.lines {
                        if Task.isCancelled {
                            continuation.finish()
                            return
                        }
                        // Accumulate lines and parse SSE events
                        buffer += line + "\n\n"  // lines iterator strips newlines; SSE needs double-newline as boundary
                        let (events, partial, done) = SSEParser.parse(buffer)
                        buffer = partial
                        for eventData in events {
                            continuation.yield(SSEEvent(data: eventData))
                        }
                        if done {
                            continuation.yield(SSEEvent(done: true))
                            continuation.finish()
                            return
                        }
                    }
                    // Flush remaining
                    if !buffer.isEmpty {
                        let (events, _, done) = SSEParser.parse(buffer, flush: true)
                        for eventData in events {
                            continuation.yield(SSEEvent(data: eventData))
                        }
                        if done {
                            continuation.yield(SSEEvent(done: true))
                        }
                    }
                    continuation.finish()
                } catch {
                    if !Task.isCancelled {
                        continuation.finish(throwing: error)
                    } else {
                        continuation.finish()
                    }
                }
            }
            self.currentTask = task
            continuation.onTermination = { _ in
                task.cancel()
            }
        }

        return stream
    }

    /// Cancel the current stream.
    public func cancelStream() {
        currentTask?.cancel()
        currentTask = nil
    }

    // MARK: - Non-Streaming

    /// Non-streaming completion (for title generation, etc.)
    public func completion(
        config: ProviderConfig,
        chatConfig: ChatConfig,
        messages: [Message]
    ) async throws -> String {
        var nonStreamConfig = chatConfig
        nonStreamConfig.stream = false

        guard let request = RequestBuilder.buildRequest(
            endpoint: config.endpoint,
            messages: messages,
            config: nonStreamConfig,
            apiKey: config.apiKey,
            stream: false
        ) else {
            throw LLMError.invalidEndpoint(config.endpoint)
        }

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw LLMError.invalidResponse
        }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]],
              let first = choices.first,
              let message = first["message"] as? [String: Any],
              let content = message["content"] as? String else {
            throw LLMError.parseError("Could not parse completion response")
        }

        return content
    }
}

// MARK: - Errors

public enum LLMError: Error, LocalizedError {
    case invalidEndpoint(String)
    case noApiKey(String)
    case invalidResponse
    case httpError(status: Int, body: String)
    case parseError(String)
    case cancelled

    public var errorDescription: String? {
        switch self {
        case .invalidEndpoint(let ep): return "Invalid endpoint: \(ep)"
        case .noApiKey(let name): return "No API key for \(name)"
        case .invalidResponse: return "Invalid response from server"
        case .httpError(let status, let body): return "HTTP \(status): \(String(body.prefix(200)))"
        case .parseError(let msg): return "Parse error: \(msg)"
        case .cancelled: return "Request cancelled"
        }
    }
}
