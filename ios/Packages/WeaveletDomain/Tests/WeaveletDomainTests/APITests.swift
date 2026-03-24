import Testing
import Foundation
@testable import WeaveletDomain

// MARK: - SSE Parser Tests

@Test func parseSimpleSSEEvent() {
    let data = "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n"
    let (events, partial, done) = SSEParser.parse(data)

    #expect(events.count == 1)
    #expect(partial == "")
    #expect(!done)
}

@Test func parseDoneEvent() {
    let data = "data: [DONE]\n\n"
    let (events, _, done) = SSEParser.parse(data)

    #expect(events.isEmpty)
    #expect(done)
}

@Test func parseMultipleEvents() {
    let data = "data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\" there\"}}]}\n\ndata: [DONE]\n\n"
    let (events, _, done) = SSEParser.parse(data)

    #expect(events.count == 2)
    #expect(done)
}

@Test func parsePartialEvent() {
    let data = "data: {\"partial\":"
    let (events, partial, done) = SSEParser.parse(data)

    #expect(events.isEmpty)
    #expect(partial == "data: {\"partial\":")
    #expect(!done)
}

@Test func parseWithCRLF() {
    let data = "data: {\"choices\":[{\"delta\":{\"content\":\"test\"}}]}\r\n\r\n"
    let (events, _, _) = SSEParser.parse(data)
    #expect(events.count == 1)
}

@Test func parseMalformedJSONSkipped() {
    let data = "data: not-json\n\ndata: {\"valid\":true}\n\n"
    let (events, _, _) = SSEParser.parse(data)
    #expect(events.count == 1)
}

@Test func parseFlushMode() {
    let data = "data: {\"test\":true}"
    let (events, partial, _) = SSEParser.parse(data, flush: true)
    #expect(events.count == 1)
    #expect(partial == "")
}

@Test func parseSkipsCommentAndEventLines() {
    let data = ": this is a comment\nevent: message\ndata: {\"ok\":true}\n\n"
    let (events, _, _) = SSEParser.parse(data)
    #expect(events.count == 1)
}

@Test func extractDeltaText() {
    let json = "{\"choices\":[{\"delta\":{\"content\":\"Hello world\"}}]}"
    let data = json.data(using: .utf8)!
    let text = SSEParser.extractDeltaText(from: data)
    #expect(text == "Hello world")
}

@Test func extractDeltaTextMissing() {
    let json = "{\"choices\":[{\"delta\":{}}]}"
    let data = json.data(using: .utf8)!
    let text = SSEParser.extractDeltaText(from: data)
    #expect(text == nil)
}

@Test func extractReasoningText() {
    let json = "{\"choices\":[{\"delta\":{\"reasoning\":\"thinking...\"}}]}"
    let data = json.data(using: .utf8)!
    let text = SSEParser.extractReasoningText(from: data)
    #expect(text == "thinking...")
}

// MARK: - Request Builder Tests

@Test func buildRequestBasic() {
    let config = ChatConfig(model: "gpt-4o", maxTokens: 4096, temperature: 0.7)
    let messages = [Message(role: .user, text: "Hello")]

    let request = RequestBuilder.buildRequest(
        endpoint: "https://api.openai.com/v1/chat/completions",
        messages: messages,
        config: config,
        apiKey: "sk-test"
    )

    #expect(request != nil)
    #expect(request?.httpMethod == "POST")
    #expect(request?.value(forHTTPHeaderField: "Authorization") == "Bearer sk-test")
    #expect(request?.value(forHTTPHeaderField: "Content-Type") == "application/json")
}

@Test func buildRequestAzure() {
    let config = ChatConfig(model: "gpt-4o")
    let messages = [Message(role: .user, text: "Hello")]

    let request = RequestBuilder.buildRequest(
        endpoint: "https://myservice.openai.azure.com",
        messages: messages,
        config: config,
        apiKey: "azure-key"
    )

    #expect(request != nil)
    let urlString = request?.url?.absoluteString ?? ""
    #expect(urlString.contains("openai/deployments/gpt-4o/chat/completions"))
    #expect(urlString.contains("api-version="))
    #expect(request?.value(forHTTPHeaderField: "api-key") == "azure-key")
}

@Test func isAzureEndpoint() {
    #expect(RequestBuilder.isAzureEndpoint("https://myservice.openai.azure.com/v1"))
    #expect(!RequestBuilder.isAzureEndpoint("https://api.openai.com/v1"))
}

@Test func buildBodyIncludesStream() {
    let config = ChatConfig(model: "gpt-4o")
    let body = RequestBuilder.buildBody(messages: [], config: config, stream: true)

    #expect(body["stream"] as? Bool == true)
    #expect(body["model"] as? String == "gpt-4o")
}

@Test func buildBodyReasoningOpenRouter() {
    let config = ChatConfig(
        model: "deepseek/deepseek-r1",
        providerId: .openrouter,
        reasoningEffort: .high
    )
    let body = RequestBuilder.buildBody(messages: [], config: config, stream: true)

    let reasoning = body["reasoning"] as? [String: Any]
    #expect(reasoning?["effort"] as? String == "high")
}

@Test func buildBodyReasoningDirectProvider() {
    let config = ChatConfig(
        model: "o1-preview",
        providerId: .openai,
        reasoningEffort: .medium
    )
    let body = RequestBuilder.buildBody(messages: [], config: config, stream: true)

    #expect(body["reasoning_effort"] as? String == "medium")
}

@Test func buildBodyVerbosityOpenRouterOnly() {
    let config = ChatConfig(
        model: "gpt-4o",
        providerId: .openrouter,
        verbosity: .high
    )
    let body = RequestBuilder.buildBody(messages: [], config: config, stream: true)
    #expect(body["verbosity"] as? String == "high")

    let config2 = ChatConfig(model: "gpt-4o", providerId: .openai, verbosity: .high)
    let body2 = RequestBuilder.buildBody(messages: [], config: config2, stream: true)
    #expect(body2["verbosity"] == nil)
}

@Test func buildBodyMaxTokensZeroOmitted() {
    let config = ChatConfig(model: "gpt-4o", maxTokens: 0)
    let body = RequestBuilder.buildBody(messages: [], config: config, stream: true)
    #expect(body["max_tokens"] == nil)
}

@Test func buildBodyCustomHeaders() {
    let request = RequestBuilder.buildRequest(
        endpoint: "https://api.example.com/v1/chat",
        messages: [],
        config: ChatConfig(),
        customHeaders: ["X-Custom": "value123"]
    )
    #expect(request?.value(forHTTPHeaderField: "X-Custom") == "value123")
}
