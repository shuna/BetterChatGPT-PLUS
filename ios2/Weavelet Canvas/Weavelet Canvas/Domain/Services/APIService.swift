import Foundation
import os

// MARK: - APIService

/// Handles LLM API calls using OpenAI-compatible chat/completions endpoint.
/// Supports streaming (SSE) and non-streaming modes.
/// Works with OpenAI, OpenRouter, Groq, Together, Mistral, DeepSeek, etc.
actor APIService {

    private let logger = Logger(subsystem: "org.sstcr.WeaveletCanvas", category: "API")

    // MARK: - Provider Configuration

    /// Stored provider configs keyed by ProviderId
    private var providerConfigs: [ProviderId: ProviderConfig] = APIService.defaultProviders

    static let defaultProviders: [ProviderId: ProviderConfig] = [
        .openai: ProviderConfig(
            id: .openai, name: "OpenAI", endpoint: "https://api.openai.com/v1/chat/completions",
            modelsEndpoint: "https://api.openai.com/v1/models", modelsRequireAuth: true
        ),
        .openrouter: ProviderConfig(
            id: .openrouter, name: "OpenRouter", endpoint: "https://openrouter.ai/api/v1/chat/completions",
            modelsEndpoint: "https://openrouter.ai/api/v1/models", modelsRequireAuth: false
        ),
        .groq: ProviderConfig(
            id: .groq, name: "Groq", endpoint: "https://api.groq.com/openai/v1/chat/completions",
            modelsEndpoint: "https://api.groq.com/openai/v1/models", modelsRequireAuth: true
        ),
        .together: ProviderConfig(
            id: .together, name: "Together", endpoint: "https://api.together.xyz/v1/chat/completions",
            modelsEndpoint: "https://api.together.xyz/v1/models", modelsRequireAuth: true
        ),
        .mistral: ProviderConfig(
            id: .mistral, name: "Mistral", endpoint: "https://api.mistral.ai/v1/chat/completions",
            modelsEndpoint: "https://api.mistral.ai/v1/models", modelsRequireAuth: true
        ),
        .deepseek: ProviderConfig(
            id: .deepseek, name: "DeepSeek", endpoint: "https://api.deepseek.com/chat/completions",
            modelsEndpoint: nil, modelsRequireAuth: true
        ),
        .xai: ProviderConfig(
            id: .xai, name: "xAI", endpoint: "https://api.x.ai/v1/chat/completions",
            modelsEndpoint: nil, modelsRequireAuth: true
        ),
        .cohere: ProviderConfig(
            id: .cohere, name: "Cohere", endpoint: "https://api.cohere.ai/v1/chat/completions",
            modelsEndpoint: nil, modelsRequireAuth: true
        ),
        .perplexity: ProviderConfig(
            id: .perplexity, name: "Perplexity", endpoint: "https://api.perplexity.ai/chat/completions",
            modelsEndpoint: nil, modelsRequireAuth: true
        ),
        .fireworks: ProviderConfig(
            id: .fireworks, name: "Fireworks", endpoint: "https://api.fireworks.ai/inference/v1/chat/completions",
            modelsEndpoint: nil, modelsRequireAuth: true
        ),
    ]

    func updateProvider(_ config: ProviderConfig) {
        providerConfigs[config.id] = config
    }

    func getProvider(_ id: ProviderId) -> ProviderConfig? {
        providerConfigs[id]
    }

    // MARK: - API Key Storage (Keychain-backed)

    func setAPIKey(_ key: String, for provider: ProviderId) {
        providerConfigs[provider]?.apiKey = key
        KeychainHelper.save(key: "api_key_\(provider.rawValue)", value: key)
    }

    func getAPIKey(for provider: ProviderId) -> String? {
        if let cached = providerConfigs[provider]?.apiKey, !cached.isEmpty {
            return cached
        }
        let stored = KeychainHelper.load(key: "api_key_\(provider.rawValue)")
        if let stored {
            providerConfigs[provider]?.apiKey = stored
        }
        return stored
    }

    // MARK: - Chat Completion (Streaming)

    /// Send a chat completion request with streaming.
    /// Calls `onChunk` for each text delta on the main actor.
    /// Returns the full accumulated response text.
    ///
    /// When `proxyConfig` is provided, the request is routed through the Weavelet
    /// Stream Proxy worker. The `onChunk` callback receives `proxyEventId` (non-nil
    /// only for proxy-routed streams).
    func streamChatCompletion(
        messages: [[String: Any]],
        config: ChatConfig,
        providerId: ProviderId,
        proxyConfig: ProxyConfig? = nil,
        proxySessionId: String? = nil,
        onChunk: @MainActor @Sendable (_ accumulated: String, _ proxyEventId: Int?) -> Void
    ) async throws -> String {
        let provider = providerConfigs[providerId]
            ?? Self.defaultProviders[providerId]
            ?? Self.defaultProviders[.openai]!

        guard let apiKey = getAPIKey(for: providerId), !apiKey.isEmpty else {
            throw APIError.noAPIKey(provider: provider.name)
        }

        // Build request body (shared between direct and proxy paths)
        var body: [String: Any] = [
            "model": config.model,
            "messages": messages,
            "stream": true,
        ]
        if config.maxTokens > 0 { body["max_tokens"] = config.maxTokens }
        body["temperature"] = config.temperature
        if config.topP != 1.0 { body["top_p"] = config.topP }
        if config.presencePenalty != 0 { body["presence_penalty"] = config.presencePenalty }
        if config.frequencyPenalty != 0 { body["frequency_penalty"] = config.frequencyPenalty }

        let bodyData = try JSONSerialization.data(withJSONObject: body)

        logger.info("API request: \(config.model) via \(provider.name)\(proxyConfig != nil ? " (proxy)" : "")")

        // MARK: Proxy path
        if let proxyConfig, let proxySessionId {
            return try await streamViaProxy(
                proxyConfig: proxyConfig,
                proxySessionId: proxySessionId,
                provider: provider,
                providerId: providerId,
                apiKey: apiKey,
                bodyData: bodyData,
                onChunk: onChunk
            )
        }

        // MARK: Direct path (existing)
        let url = URL(string: provider.endpoint)!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 120

        // OpenRouter-specific headers
        if providerId == .openrouter {
            request.setValue("Weavelet Canvas iOS", forHTTPHeaderField: "X-Title")
        }

        request.httpBody = bodyData

        // Stream via URLSession bytes
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
            throw APIError.httpError(
                status: httpResponse.statusCode,
                body: errorBody
            )
        }

        // Parse SSE stream with real per-chunk timeout (45s).
        var accumulated = ""
        let chunkTimeout: Duration = .seconds(45)

        let lineStream = AsyncStream<String> { cont in
            let task = Task {
                do {
                    for try await line in asyncBytes.lines {
                        cont.yield(line)
                    }
                    cont.finish()
                } catch {
                    cont.finish()
                }
            }
            cont.onTermination = { _ in task.cancel() }
        }
        var lineIterator = lineStream.makeAsyncIterator()

        while true {
            try Task.checkCancellation()

            let line: String? = try await withThrowingTaskGroup(of: String?.self) { group in
                group.addTask {
                    await lineIterator.next()
                }
                group.addTask {
                    try await Task.sleep(for: chunkTimeout)
                    throw APIError.chunkTimeout
                }
                let result = try await group.next()!
                group.cancelAll()
                return result
            }

            guard let line else { break }

            if line.hasPrefix("data: ") {
                let data = String(line.dropFirst(6))
                if data == "[DONE]" { break }

                if let chunk = parseSSEChunk(data) {
                    accumulated += chunk
                    await onChunk(accumulated, nil)
                }
            } else if !line.isEmpty {
                if let chunk = parseSSEChunk(line) {
                    accumulated += chunk
                    await onChunk(accumulated, nil)
                }
            }
        }

        logger.info("API response complete: \(accumulated.count) chars")
        return accumulated
    }

    // MARK: - Proxy Streaming

    /// Stream via Weavelet Stream Proxy, parsing proxy SSE events incrementally.
    private func streamViaProxy(
        proxyConfig: ProxyConfig,
        proxySessionId: String,
        provider: ProviderConfig,
        providerId: ProviderId,
        apiKey: String,
        bodyData: Data,
        onChunk: @MainActor @Sendable (_ accumulated: String, _ proxyEventId: Int?) -> Void
    ) async throws -> String {
        var targetHeaders: [String: String] = [
            "Content-Type": "application/json",
            "Authorization": "Bearer \(apiKey)"
        ]
        if providerId == .openrouter {
            targetHeaders["X-Title"] = "Weavelet Canvas iOS"
        }

        let (asyncBytes, _) = try await ProxyClient.streamViaProxy(
            config: proxyConfig,
            sessionId: proxySessionId,
            targetEndpoint: provider.endpoint,
            targetHeaders: targetHeaders,
            body: bodyData
        )

        var accumulated = ""
        var parser = ProxySseParser()
        let chunkTimeout: Duration = .seconds(45)

        // Bridge bytes into lines via AsyncStream
        let lineStream = AsyncStream<String> { cont in
            let task = Task {
                do {
                    for try await line in asyncBytes.lines {
                        cont.yield(line)
                    }
                    cont.finish()
                } catch {
                    cont.finish()
                }
            }
            cont.onTermination = { _ in task.cancel() }
        }

        // Proxy SSE comes as raw bytes; we read lines and reconstruct blocks.
        // Feed each line + "\n" back to the incremental parser.
        var lineIterator = lineStream.makeAsyncIterator()

        while true {
            try Task.checkCancellation()

            let line: String? = try await withThrowingTaskGroup(of: String?.self) { group in
                group.addTask {
                    await lineIterator.next()
                }
                group.addTask {
                    try await Task.sleep(for: chunkTimeout)
                    throw APIError.chunkTimeout
                }
                let result = try await group.next()!
                group.cancelAll()
                return result
            }

            guard let line else { break }

            // Reconstruct SSE blocks: empty line = block separator ("\n\n")
            let events = parser.feed(line + "\n" + (line.isEmpty ? "\n" : ""))

            for event in events {
                if let rawText = event.rawText {
                    accumulated += rawText
                    await onChunk(accumulated, event.id)
                } else if event.eventType == "done" {
                    // Stream complete
                    logger.info("Proxy stream done: \(accumulated.count) chars")
                    return accumulated
                } else if event.eventType == "error" {
                    let errorMsg = (event.meta?["error"] as? String) ?? "Proxy stream error"
                    throw APIError.httpError(status: 0, body: errorMsg)
                }
                // "interrupted" / "waiting" — continue reading
            }
        }

        // Stream ended without done event — flush parser
        let remaining = parser.flush()
        for event in remaining {
            if let rawText = event.rawText {
                accumulated += rawText
                await onChunk(accumulated, event.id)
            }
        }

        logger.info("Proxy stream complete: \(accumulated.count) chars")
        return accumulated
    }

    // MARK: - Chat Completion (Non-streaming)

    func chatCompletion(
        messages: [[String: Any]],
        config: ChatConfig,
        providerId: ProviderId
    ) async throws -> String {
        let provider = providerConfigs[providerId]
            ?? Self.defaultProviders[providerId]
            ?? Self.defaultProviders[.openai]!

        guard let apiKey = getAPIKey(for: providerId), !apiKey.isEmpty else {
            throw APIError.noAPIKey(provider: provider.name)
        }

        var body: [String: Any] = [
            "model": config.model,
            "messages": messages,
        ]
        if config.maxTokens > 0 { body["max_tokens"] = config.maxTokens }
        body["temperature"] = config.temperature

        var request = URLRequest(url: URL(string: provider.endpoint)!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 120
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200..<300).contains(httpResponse.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw APIError.httpError(status: status, body: String(data: data, encoding: .utf8) ?? "")
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]],
              let first = choices.first,
              let message = first["message"] as? [String: Any],
              let content = message["content"] as? String else {
            throw APIError.invalidResponse
        }

        return content
    }

    // MARK: - SSE Parsing

    private func parseSSEChunk(_ jsonString: String) -> String? {
        guard let data = jsonString.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]],
              let first = choices.first,
              let delta = first["delta"] as? [String: Any] else {
            return nil
        }

        // Standard content delta
        if let content = delta["content"] as? String {
            return content
        }

        // Reasoning content (DeepSeek style)
        if let reasoning = delta["reasoning_content"] as? String {
            return reasoning
        }

        // Reasoning (OpenRouter style)
        if let reasoning = delta["reasoning"] as? String {
            return reasoning
        }

        return nil
    }

    // MARK: - Message Building

    /// Build the messages array for the API call from a chat's active path.
    static func buildMessagesForAPI(
        chat: Chat,
        contentStore: ContentStoreData
    ) -> [[String: Any]] {
        guard let tree = chat.branchTree else { return [] }

        var messages: [[String: Any]] = []

        for nodeId in tree.activePath {
            guard let node = tree.nodes[nodeId] else { continue }

            // Skip omitted nodes
            if chat.omittedNodes?[nodeId] == true { continue }

            let text = ContentStore.resolveContentText(contentStore, hash: node.contentHash)
            guard !text.isEmpty else { continue }

            messages.append([
                "role": node.role.rawValue,
                "content": text
            ])
        }

        return messages
    }
}

// MARK: - API Errors

enum APIError: LocalizedError {
    case noAPIKey(provider: String)
    case httpError(status: Int, body: String)
    case invalidResponse
    case cancelled
    case chunkTimeout

    var errorDescription: String? {
        switch self {
        case .noAPIKey(let provider):
            return "No API key configured for \(provider). Set your API key in Settings."
        case .httpError(let status, let body):
            // Try to extract error message from JSON body
            if let data = body.data(using: .utf8),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let error = json["error"] as? [String: Any],
               let message = error["message"] as? String {
                return "API error (\(status)): \(message)"
            }
            return "API error (\(status)): \(body.prefix(200))"
        case .invalidResponse:
            return "Invalid response from API"
        case .cancelled:
            return "Request cancelled"
        case .chunkTimeout:
            return "Stream timed out (no data received for 45 seconds)"
        }
    }
}

// MARK: - Keychain Helper

enum KeychainHelper {
    static func save(key: String, value: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: "org.sstcr.WeaveletCanvas",
        ]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = data
        SecItemAdd(add as CFDictionary, nil)
    }

    static func load(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: "org.sstcr.WeaveletCanvas",
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: "org.sstcr.WeaveletCanvas",
        ]
        SecItemDelete(query as CFDictionary)
    }
}
