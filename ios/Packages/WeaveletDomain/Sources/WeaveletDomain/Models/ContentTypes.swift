import Foundation

// MARK: - Basic Enums

public enum Role: String, Codable, Sendable, CaseIterable {
    case user
    case assistant
    case system
}

public enum ImageDetail: String, Codable, Sendable, CaseIterable {
    case low
    case high
    case auto
}

public enum StreamingMarkdownPolicy: String, Codable, Sendable {
    case auto
    case always
    case never
}

// MARK: - Content Types

public struct TextContent: Codable, Sendable, Equatable {
    public var text: String

    public init(text: String) {
        self.text = text
    }
}

public struct ImageContent: Codable, Sendable, Equatable {
    public var imageURL: ImageURLPayload

    public init(url: String, detail: ImageDetail) {
        self.imageURL = ImageURLPayload(url: url, detail: detail)
    }

    enum CodingKeys: String, CodingKey {
        case imageURL = "image_url"
    }

    public struct ImageURLPayload: Codable, Sendable, Equatable {
        public var url: String
        public var detail: ImageDetail
    }
}

public struct ReasoningContent: Codable, Sendable, Equatable {
    public var text: String

    public init(text: String) {
        self.text = text
    }
}

public struct ToolCallContent: Codable, Sendable, Equatable {
    public var id: String
    public var name: String
    public var arguments: String

    public init(id: String, name: String, arguments: String) {
        self.id = id
        self.name = name
        self.arguments = arguments
    }
}

public struct ToolResultContent: Codable, Sendable, Equatable {
    public var toolCallId: String
    public var content: String

    public init(toolCallId: String, content: String) {
        self.toolCallId = toolCallId
        self.content = content
    }

    enum CodingKeys: String, CodingKey {
        case toolCallId = "tool_call_id"
        case content
    }
}

// MARK: - ContentItem (Discriminated Union)

/// Represents a single content item in a message.
/// JSON-encoded with a `type` discriminator field for web compatibility.
public enum ContentItem: Sendable, Equatable {
    case text(TextContent)
    case imageURL(ImageContent)
    case reasoning(ReasoningContent)
    case toolCall(ToolCallContent)
    case toolResult(ToolResultContent)
}

extension ContentItem: Codable {
    private enum TypeDiscriminator: String, Codable {
        case text
        case imageURL = "image_url"
        case reasoning
        case toolCall = "tool_call"
        case toolResult = "tool_result"
    }

    private enum CodingKeys: String, CodingKey {
        case type
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(TypeDiscriminator.self, forKey: .type)

        switch type {
        case .text:
            self = .text(try TextContent(from: decoder))
        case .imageURL:
            self = .imageURL(try ImageContent(from: decoder))
        case .reasoning:
            self = .reasoning(try ReasoningContent(from: decoder))
        case .toolCall:
            self = .toolCall(try ToolCallContent(from: decoder))
        case .toolResult:
            self = .toolResult(try ToolResultContent(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        switch self {
        case .text(let content):
            try container.encode(TypeDiscriminator.text, forKey: .type)
            try content.encode(to: encoder)
        case .imageURL(let content):
            try container.encode(TypeDiscriminator.imageURL, forKey: .type)
            try content.encode(to: encoder)
        case .reasoning(let content):
            try container.encode(TypeDiscriminator.reasoning, forKey: .type)
            try content.encode(to: encoder)
        case .toolCall(let content):
            try container.encode(TypeDiscriminator.toolCall, forKey: .type)
            try content.encode(to: encoder)
        case .toolResult(let content):
            try container.encode(TypeDiscriminator.toolResult, forKey: .type)
            try content.encode(to: encoder)
        }
    }
}

// MARK: - Convenience

extension ContentItem {
    /// The text content if this is a `.text` item.
    public var textValue: String? {
        if case .text(let c) = self { return c.text }
        return nil
    }

    /// Whether this item is text content.
    public var isText: Bool {
        if case .text = self { return true }
        return false
    }

    /// Whether this item is image content.
    public var isImage: Bool {
        if case .imageURL = self { return true }
        return false
    }

    /// Whether this item is reasoning content.
    public var isReasoning: Bool {
        if case .reasoning = self { return true }
        return false
    }

    /// Create a text content item from a string.
    public static func fromString(_ text: String) -> ContentItem {
        .text(TextContent(text: text))
    }
}

// MARK: - Message

public struct Message: Codable, Sendable, Equatable {
    public var role: Role
    public var content: [ContentItem]

    public init(role: Role, content: [ContentItem]) {
        self.role = role
        self.content = content
    }

    public init(role: Role, text: String) {
        self.role = role
        self.content = [.fromString(text)]
    }
}
