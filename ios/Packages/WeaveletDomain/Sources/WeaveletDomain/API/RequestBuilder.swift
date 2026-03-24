import Foundation

/// Builds API-ready HTTP requests for LLM chat completion endpoints.
///
/// Handles provider-specific parameter formatting (Azure, OpenRouter, etc.)
/// and strips client-only fields from the configuration.
public enum RequestBuilder {

    /// Effort values only supported by OpenRouter's unified reasoning API.
    private static let openRouterOnlyEfforts: Set<ReasoningEffort> = [.none, .minimal, .xhigh]

    /// Map effort level to default max_tokens for models that don't support effort.
    private static let effortToMaxTokens: [ReasoningEffort: Int] = [
        .none: 0,
        .minimal: 1024,
        .low: 2048,
        .medium: 8192,
        .high: 16384,
        .xhigh: 32768,
    ]

    // MARK: - Build Request

    /// Build a URLRequest for a chat completion API call.
    ///
    /// - Parameters:
    ///   - endpoint: The API endpoint URL string.
    ///   - messages: Messages to send.
    ///   - config: Chat configuration.
    ///   - apiKey: Optional API key for authentication.
    ///   - customHeaders: Optional additional headers.
    ///   - apiVersion: Azure API version (default: "2024-02-01").
    ///   - stream: Whether to request streaming response.
    /// - Returns: A configured URLRequest, or nil if the URL is invalid.
    public static func buildRequest(
        endpoint: String,
        messages: [Message],
        config: ChatConfig,
        apiKey: String? = nil,
        customHeaders: [String: String]? = nil,
        apiVersion: String = "2024-02-01",
        stream: Bool = true
    ) -> URLRequest? {
        let resolvedEndpoint: String
        if isAzureEndpoint(endpoint) {
            resolvedEndpoint = buildAzureEndpoint(endpoint, model: config.model, apiVersion: apiVersion)
        } else {
            resolvedEndpoint = endpoint
        }

        guard let url = URL(string: resolvedEndpoint) else { return nil }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Auth headers
        if let apiKey {
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
            if isAzureEndpoint(endpoint) {
                request.setValue(apiKey, forHTTPHeaderField: "api-key")
            }
        }

        // Custom headers
        if let customHeaders {
            for (key, value) in customHeaders {
                request.setValue(value, forHTTPHeaderField: key)
            }
        }

        // Build body
        let body = buildBody(messages: messages, config: config, stream: stream)
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        return request
    }

    // MARK: - Body Building

    /// Build the JSON body dictionary.
    static func buildBody(
        messages: [Message],
        config: ChatConfig,
        stream: Bool
    ) -> [String: Any] {
        // Encode messages as JSON-compatible array
        let encoder = JSONEncoder()
        let messagesArray: [[String: Any]]
        if let data = try? encoder.encode(messages),
           let decoded = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            messagesArray = decoded
        } else {
            messagesArray = []
        }

        var body: [String: Any] = [
            "messages": messagesArray,
            "model": config.model,
            "temperature": config.temperature,
            "top_p": config.topP,
            "presence_penalty": config.presencePenalty,
            "frequency_penalty": config.frequencyPenalty,
            "stream": stream,
        ]

        if config.maxTokens > 0 {
            body["max_tokens"] = config.maxTokens
        }

        // Reasoning parameters
        addReasoningParams(to: &body, config: config)

        // Verbosity (OpenRouter only)
        if config.providerId == .openrouter, let verbosity = config.verbosity {
            body["verbosity"] = verbosity.rawValue
        }

        return body
    }

    private static func addReasoningParams(to body: inout [String: Any], config: ChatConfig) {
        guard let effort = config.reasoningEffort else {
            // No effort set — check for explicit budget tokens
            if let budget = config.reasoningBudgetTokens, budget > 0 {
                if config.providerId == .openrouter {
                    body["reasoning"] = ["max_tokens": budget]
                } else {
                    body["reasoning_budget_tokens"] = budget
                }
            }
            return
        }

        if config.providerId == .openrouter {
            var reasoning: [String: Any] = [:]
            if let budget = config.reasoningBudgetTokens, budget > 0 {
                reasoning["max_tokens"] = budget
            } else if needsMaxTokensOnly(config.model) {
                let mapped = effortToMaxTokens[effort] ?? 0
                if mapped > 0 { reasoning["max_tokens"] = mapped }
            } else {
                reasoning["effort"] = effort.rawValue
            }
            if !reasoning.isEmpty {
                body["reasoning"] = reasoning
            }
        } else {
            if !openRouterOnlyEfforts.contains(effort) {
                body["reasoning_effort"] = effort.rawValue
            }
            if let budget = config.reasoningBudgetTokens, budget > 0 {
                body["reasoning_budget_tokens"] = budget
            }
        }
    }

    // MARK: - Azure Support

    /// Check if an endpoint is an Azure OpenAI endpoint.
    public static func isAzureEndpoint(_ endpoint: String) -> Bool {
        endpoint.contains("openai.azure.com")
    }

    /// Build the Azure-specific endpoint URL.
    static func buildAzureEndpoint(_ base: String, model: String, apiVersion: String) -> String {
        var endpoint = base
        if endpoint.hasSuffix("/") { endpoint = String(endpoint.dropLast()) }
        return "\(endpoint)/openai/deployments/\(model)/chat/completions?api-version=\(apiVersion)"
    }

    /// Check if a model only supports reasoning.max_tokens (not effort).
    private static func needsMaxTokensOnly(_ model: String) -> Bool {
        model.lowercased().contains("claude")
    }
}
