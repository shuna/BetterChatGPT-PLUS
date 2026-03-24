import Foundation

/// A node in the branch tree representing a single message version.
public struct BranchNode: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var parentId: String?
    public var role: Role
    public var contentHash: String
    public var createdAt: Double  // Unix timestamp (ms)
    public var label: String?
    public var starred: Bool?
    public var pinned: Bool?

    public init(
        id: String = UUID().uuidString,
        parentId: String? = nil,
        role: Role,
        contentHash: String,
        createdAt: Double = Date().timeIntervalSince1970 * 1000,
        label: String? = nil,
        starred: Bool? = nil,
        pinned: Bool? = nil
    ) {
        self.id = id
        self.parentId = parentId
        self.role = role
        self.contentHash = contentHash
        self.createdAt = createdAt
        self.label = label
        self.starred = starred
        self.pinned = pinned
    }
}
