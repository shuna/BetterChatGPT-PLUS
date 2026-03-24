import Testing
import Foundation
@testable import WeaveletDomain

// MARK: - ContentItem Codable Round-Trip Tests

@Test func textContentRoundTrip() throws {
    let item = ContentItem.text(TextContent(text: "Hello, world!"))
    let data = try JSONEncoder().encode(item)
    let decoded = try JSONDecoder().decode(ContentItem.self, from: data)
    #expect(decoded == item)
}

@Test func imageContentRoundTrip() throws {
    let item = ContentItem.imageURL(ImageContent(url: "https://example.com/img.png", detail: .high))
    let data = try JSONEncoder().encode(item)
    let decoded = try JSONDecoder().decode(ContentItem.self, from: data)
    #expect(decoded == item)
}

@Test func reasoningContentRoundTrip() throws {
    let item = ContentItem.reasoning(ReasoningContent(text: "Let me think..."))
    let data = try JSONEncoder().encode(item)
    let decoded = try JSONDecoder().decode(ContentItem.self, from: data)
    #expect(decoded == item)
}

@Test func toolCallContentRoundTrip() throws {
    let item = ContentItem.toolCall(ToolCallContent(id: "call_123", name: "get_weather", arguments: "{\"city\":\"Tokyo\"}"))
    let data = try JSONEncoder().encode(item)
    let decoded = try JSONDecoder().decode(ContentItem.self, from: data)
    #expect(decoded == item)
}

@Test func toolResultContentRoundTrip() throws {
    let item = ContentItem.toolResult(ToolResultContent(toolCallId: "call_123", content: "25°C, sunny"))
    let data = try JSONEncoder().encode(item)
    let decoded = try JSONDecoder().decode(ContentItem.self, from: data)
    #expect(decoded == item)
}

// MARK: - Web Compatibility JSON Tests

@Test func textContentWebJSON() throws {
    // Simulate JSON from web app
    let webJSON = """
    {"type":"text","text":"Hello from web"}
    """.data(using: .utf8)!
    let decoded = try JSONDecoder().decode(ContentItem.self, from: webJSON)
    #expect(decoded.textValue == "Hello from web")
}

@Test func imageContentWebJSON() throws {
    let webJSON = """
    {"type":"image_url","image_url":{"url":"data:image/png;base64,abc","detail":"low"}}
    """.data(using: .utf8)!
    let decoded = try JSONDecoder().decode(ContentItem.self, from: webJSON)
    #expect(decoded.isImage)
}

@Test func toolResultWebJSON() throws {
    let webJSON = """
    {"type":"tool_result","tool_call_id":"call_abc","content":"result data"}
    """.data(using: .utf8)!
    let decoded = try JSONDecoder().decode(ContentItem.self, from: webJSON)
    if case .toolResult(let content) = decoded {
        #expect(content.toolCallId == "call_abc")
        #expect(content.content == "result data")
    } else {
        Issue.record("Expected toolResult")
    }
}

// MARK: - Message Tests

@Test func messageRoundTrip() throws {
    let msg = Message(role: .assistant, content: [
        .fromString("Here is the answer:"),
        .reasoning(ReasoningContent(text: "I need to think about this"))
    ])
    let data = try JSONEncoder().encode(msg)
    let decoded = try JSONDecoder().decode(Message.self, from: data)
    #expect(decoded == msg)
}

@Test func messageConvenienceInit() {
    let msg = Message(role: .user, text: "Hello")
    #expect(msg.role == .user)
    #expect(msg.content.count == 1)
    #expect(msg.content[0].textValue == "Hello")
}

// MARK: - ContentItem Convenience

@Test func contentItemConvenience() {
    let text = ContentItem.fromString("test")
    #expect(text.isText)
    #expect(!text.isImage)
    #expect(!text.isReasoning)
    #expect(text.textValue == "test")

    let img = ContentItem.imageURL(ImageContent(url: "url", detail: .auto))
    #expect(img.isImage)
    #expect(img.textValue == nil)
}

// MARK: - ChatConfig Web Compatibility

@Test func chatConfigWebJSON() throws {
    let webJSON = """
    {
        "model": "gpt-4o",
        "max_tokens": 4096,
        "temperature": 0.7,
        "presence_penalty": 0,
        "top_p": 1,
        "frequency_penalty": 0,
        "reasoning_effort": "high"
    }
    """.data(using: .utf8)!
    let config = try JSONDecoder().decode(ChatConfig.self, from: webJSON)
    #expect(config.model == "gpt-4o")
    #expect(config.maxTokens == 4096)
    #expect(config.temperature == 0.7)
    #expect(config.reasoningEffort == .high)
}

@Test func chatConfigEncodeSnakeCase() throws {
    let config = ChatConfig(model: "o1", maxTokens: 2048, temperature: 0.5)
    let data = try JSONEncoder().encode(config)
    let json = String(data: data, encoding: .utf8)!
    #expect(json.contains("max_tokens"))
    #expect(json.contains("top_p"))
    #expect(json.contains("frequency_penalty"))
    #expect(json.contains("presence_penalty"))
}

// MARK: - BranchNode Tests

@Test func branchNodeRoundTrip() throws {
    let node = BranchNode(
        id: "node-1",
        parentId: "node-0",
        role: .assistant,
        contentHash: "abc123",
        createdAt: 1700000000000,
        label: "Test",
        starred: true,
        pinned: false
    )
    let data = try JSONEncoder().encode(node)
    let decoded = try JSONDecoder().decode(BranchNode.self, from: data)
    #expect(decoded == node)
}

@Test func branchNodeNullParent() throws {
    let node = BranchNode(parentId: nil, role: .user, contentHash: "hash1")
    let data = try JSONEncoder().encode(node)
    let decoded = try JSONDecoder().decode(BranchNode.self, from: data)
    #expect(decoded.parentId == nil)
}

// MARK: - BranchTree Tests

@Test func branchTreeRoundTrip() throws {
    let root = BranchNode(id: "root", parentId: nil, role: .system, contentHash: "h1")
    let child = BranchNode(id: "child", parentId: "root", role: .user, contentHash: "h2")
    let tree = BranchTree(
        nodes: ["root": root, "child": child],
        rootId: "root",
        activePath: ["root", "child"]
    )
    let data = try JSONEncoder().encode(tree)
    let decoded = try JSONDecoder().decode(BranchTree.self, from: data)
    #expect(decoded == tree)
}

// MARK: - Chat Tests

@Test func chatRoundTrip() throws {
    let chat = Chat(
        id: "chat-1",
        title: "Test Chat",
        config: ChatConfig(model: "gpt-4o"),
        titleSet: true
    )
    let data = try JSONEncoder().encode(chat)
    let decoded = try JSONDecoder().decode(Chat.self, from: data)
    #expect(decoded.id == "chat-1")
    #expect(decoded.title == "Test Chat")
    #expect(decoded.titleSet == true)
}

// MARK: - Provider Types Tests

@Test func providerIdAllCases() {
    #expect(ProviderId.allCases.count == 10)
}

@Test func providerConfigRoundTrip() throws {
    let config = ProviderConfig(
        id: .openai,
        name: "OpenAI",
        apiKey: "sk-test",
        endpoint: "https://api.openai.com/v1"
    )
    let data = try JSONEncoder().encode(config)
    let decoded = try JSONDecoder().decode(ProviderConfig.self, from: data)
    #expect(decoded == config)
}

// MARK: - GeneratingSession Tests

@Test func generatingSessionRoundTrip() throws {
    let session = GeneratingSession(
        sessionId: "sess-1",
        chatId: "chat-1",
        chatIndex: 0,
        messageIndex: 3,
        targetNodeId: "node-3",
        mode: .append
    )
    let data = try JSONEncoder().encode(session)
    let decoded = try JSONDecoder().decode(GeneratingSession.self, from: data)
    #expect(decoded.sessionId == "sess-1")
    #expect(decoded.mode == .append)
}

// MARK: - ChatView Tests

@Test func chatViewSplitDetection() {
    #expect(!ChatView.chat.isSplit)
    #expect(!ChatView.branchEditor.isSplit)
    #expect(ChatView.splitHorizontal.isSplit)
    #expect(ChatView.splitVertical.isSplit)
}

@Test func chatViewBranchEditorVisible() {
    #expect(!ChatView.chat.isBranchEditorVisible)
    #expect(ChatView.branchEditor.isBranchEditorVisible)
    #expect(ChatView.splitHorizontal.isBranchEditorVisible)
}
