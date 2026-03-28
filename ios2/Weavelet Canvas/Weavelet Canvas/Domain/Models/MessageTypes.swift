import Foundation

// MARK: - Role

enum Role: String, Codable, Hashable, CaseIterable {
    case user
    case assistant
    case system

    var label: String {
        switch self {
        case .user: "User"
        case .assistant: "Assistant"
        case .system: "System"
        }
    }

    var icon: String {
        switch self {
        case .user: "person.fill"
        case .assistant: "sparkles"
        case .system: "gearshape.fill"
        }
    }
}

// MARK: - ImageDetail

enum ImageDetail: String, Codable, Hashable, CaseIterable {
    case low
    case high
    case auto
}

// MARK: - Content Item

/// Matches Web ContentInterface union type.
/// Internal representation uses Swift enums with associated values;
/// JSON compatibility is handled via custom Codable conformance.
nonisolated enum ContentItem: Codable, Hashable {
    case text(String)
    case imageURL(url: String, detail: ImageDetail)
    case reasoning(String)
    case toolCall(id: String, name: String, arguments: String)
    case toolResult(toolCallId: String, content: String)

    // MARK: Codable

    private enum CodingKeys: String, CodingKey {
        case type
        case text
        case imageURL = "image_url"
        case id, name, arguments
        case toolCallId = "tool_call_id"
        case content
    }

    private struct ImageURLPayload: Codable, Hashable {
        let url: String
        let detail: ImageDetail
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)

        switch type {
        case "text":
            let text = try container.decode(String.self, forKey: .text)
            self = .text(text)
        case "image_url":
            let payload = try container.decode(ImageURLPayload.self, forKey: .imageURL)
            self = .imageURL(url: payload.url, detail: payload.detail)
        case "reasoning":
            let text = try container.decode(String.self, forKey: .text)
            self = .reasoning(text)
        case "tool_call":
            let id = try container.decode(String.self, forKey: .id)
            let name = try container.decode(String.self, forKey: .name)
            let arguments = try container.decode(String.self, forKey: .arguments)
            self = .toolCall(id: id, name: name, arguments: arguments)
        case "tool_result":
            let toolCallId = try container.decode(String.self, forKey: .toolCallId)
            let content = try container.decode(String.self, forKey: .content)
            self = .toolResult(toolCallId: toolCallId, content: content)
        default:
            // Forward-compatible: treat unknown types as text with empty content
            self = .text("")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        switch self {
        case .text(let text):
            try container.encode("text", forKey: .type)
            try container.encode(text, forKey: .text)
        case .imageURL(let url, let detail):
            try container.encode("image_url", forKey: .type)
            try container.encode(ImageURLPayload(url: url, detail: detail), forKey: .imageURL)
        case .reasoning(let text):
            try container.encode("reasoning", forKey: .type)
            try container.encode(text, forKey: .text)
        case .toolCall(let id, let name, let arguments):
            try container.encode("tool_call", forKey: .type)
            try container.encode(id, forKey: .id)
            try container.encode(name, forKey: .name)
            try container.encode(arguments, forKey: .arguments)
        case .toolResult(let toolCallId, let content):
            try container.encode("tool_result", forKey: .type)
            try container.encode(toolCallId, forKey: .toolCallId)
            try container.encode(content, forKey: .content)
        }
    }
}

// MARK: - ContentItem Helpers

extension ContentItem {
    var isText: Bool {
        if case .text = self { return true }
        return false
    }

    var textValue: String? {
        switch self {
        case .text(let t): return t
        case .reasoning(let t): return t
        default: return nil
        }
    }
}

extension Array where Element == ContentItem {
    /// Concatenate all text parts into a single string.
    func toText() -> String {
        compactMap(\.textValue).joined()
    }
}

// MARK: - Message

struct Message: Codable, Hashable, Identifiable {
    var id: String { "\(role.rawValue)-\(content.hashValue)" }
    let role: Role
    let content: [ContentItem]
}
