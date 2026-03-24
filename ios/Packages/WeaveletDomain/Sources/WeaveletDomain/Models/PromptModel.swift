import Foundation

/// A reusable prompt template.
public struct Prompt: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var prompt: String

    public init(id: String = UUID().uuidString, name: String, prompt: String) {
        self.id = id
        self.name = name
        self.prompt = prompt
    }
}
