import Foundation

/// A single chat conversation with its configuration and branch tree.
///
/// **Persistence rule**: When `branchTree` is present, `messages` is redundant
/// (it can be materialized from the tree + contentStore). The web app omits
/// `messages` from the persisted form when `branchTree` exists. We handle this
/// via `PersistedChat` for serialization and keep `messages` always populated
/// in memory for convenience.
public struct Chat: Codable, Sendable, Equatable {
    public var id: String
    public var title: String
    public var folder: String?
    public var messages: [Message]
    public var config: ChatConfig
    public var titleSet: Bool
    public var imageDetail: ImageDetail
    public var branchTree: BranchTree?
    public var collapsedNodes: [String: Bool]?
    public var omittedNodes: [String: Bool]?
    public var protectedNodes: [String: Bool]?

    public init(
        id: String = UUID().uuidString,
        title: String = "New Chat",
        folder: String? = nil,
        messages: [Message] = [],
        config: ChatConfig = ChatConfig(),
        titleSet: Bool = false,
        imageDetail: ImageDetail = .auto,
        branchTree: BranchTree? = nil,
        collapsedNodes: [String: Bool]? = nil,
        omittedNodes: [String: Bool]? = nil,
        protectedNodes: [String: Bool]? = nil
    ) {
        self.id = id
        self.title = title
        self.folder = folder
        self.messages = messages
        self.config = config
        self.titleSet = titleSet
        self.imageDetail = imageDetail
        self.branchTree = branchTree
        self.collapsedNodes = collapsedNodes
        self.omittedNodes = omittedNodes
        self.protectedNodes = protectedNodes
    }
}

// MARK: - Persisted Chat (Web-Compatible Serialization)

/// Web-compatible persisted form of a Chat.
/// When `branchTree` is present, `messages` is omitted (Web convention).
/// On load, `messages` is re-materialized from branchTree + contentStore.
public struct PersistedChat: Codable, Sendable {
    public var id: String
    public var title: String
    public var folder: String?
    public var messages: [Message]?  // nil when branchTree present
    public var config: ChatConfig
    public var titleSet: Bool
    public var imageDetail: ImageDetail
    public var branchTree: BranchTree?
    public var collapsedNodes: [String: Bool]?
    public var omittedNodes: [String: Bool]?
    public var protectedNodes: [String: Bool]?

    /// Convert from in-memory Chat to persisted form.
    public init(from chat: Chat) {
        self.id = chat.id
        self.title = chat.title
        self.folder = chat.folder
        // Omit messages when branchTree is present (Web convention)
        self.messages = chat.branchTree != nil ? nil : chat.messages
        self.config = chat.config
        self.titleSet = chat.titleSet
        self.imageDetail = chat.imageDetail
        self.branchTree = chat.branchTree
        self.collapsedNodes = chat.collapsedNodes
        self.omittedNodes = chat.omittedNodes
        self.protectedNodes = chat.protectedNodes
    }

    /// Convert to in-memory Chat, re-materializing messages if needed.
    public func toChat(contentStore: ContentStore) -> Chat {
        var chat = Chat(
            id: id,
            title: title,
            folder: folder,
            messages: messages ?? [],
            config: config,
            titleSet: titleSet,
            imageDetail: imageDetail,
            branchTree: branchTree,
            collapsedNodes: collapsedNodes,
            omittedNodes: omittedNodes,
            protectedNodes: protectedNodes
        )
        // Re-materialize messages from branchTree if messages were omitted
        if messages == nil, let tree = branchTree {
            chat.messages = tree.materializeActivePath(contentStore: contentStore)
        }
        return chat
    }
}

// MARK: - Export Formats (Web-Compatible)

/// Export V3 format — the latest web app export format.
public struct ExportV3: Codable, Sendable {
    public var version: Int = 3
    public var chats: [PersistedChat]?
    public var contentStore: ContentStoreData
    public var folders: [String: Folder]

    public init(chats: [PersistedChat]?, contentStore: ContentStoreData, folders: [String: Folder]) {
        self.chats = chats
        self.contentStore = contentStore
        self.folders = folders
    }
}

/// Snapshot format for iCloud/Google Drive sync.
/// Wraps the full persisted state in a versioned envelope.
public struct SyncSnapshot: Codable, Sendable {
    public var state: PersistedState
    public var version: Int

    public init(state: PersistedState, version: Int = 17) {
        self.state = state
        self.version = version
    }
}

/// The subset of application state that gets synced to cloud.
public struct PersistedState: Codable, Sendable {
    public var chats: [PersistedChat]?
    public var contentStore: ContentStoreData
    public var folders: [String: Folder]
    // Settings fields omitted for now — added as needed

    public init(
        chats: [PersistedChat]? = nil,
        contentStore: ContentStoreData = [:],
        folders: [String: Folder] = [:]
    ) {
        self.chats = chats
        self.contentStore = contentStore
        self.folders = folders
    }
}

/// Folder for organizing chats.
public struct Folder: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var expanded: Bool
    public var order: Int
    public var color: String?

    public init(id: String = UUID().uuidString, name: String, expanded: Bool = true, order: Int = 0, color: String? = nil) {
        self.id = id
        self.name = name
        self.expanded = expanded
        self.order = order
        self.color = color
    }
}

/// Represents an active generation session (streaming).
public struct GeneratingSession: Codable, Sendable, Equatable {
    public enum Mode: String, Codable, Sendable {
        case append
        case midchat
    }

    public enum RequestPath: String, Codable, Sendable {
        case sw
        case fetch
    }

    public var sessionId: String
    public var chatId: String
    public var chatIndex: Int
    public var messageIndex: Int
    public var targetNodeId: String
    public var mode: Mode
    public var insertIndex: Int?
    public var requestPath: RequestPath
    public var startedAt: Double

    public init(
        sessionId: String,
        chatId: String,
        chatIndex: Int,
        messageIndex: Int,
        targetNodeId: String,
        mode: Mode,
        insertIndex: Int? = nil,
        requestPath: RequestPath = .fetch,
        startedAt: Double = Date().timeIntervalSince1970 * 1000
    ) {
        self.sessionId = sessionId
        self.chatId = chatId
        self.chatIndex = chatIndex
        self.messageIndex = messageIndex
        self.targetNodeId = targetNodeId
        self.mode = mode
        self.insertIndex = insertIndex
        self.requestPath = requestPath
        self.startedAt = startedAt
    }
}

/// Chat view mode.
public enum ChatView: String, Codable, Sendable {
    case chat
    case branchEditor = "branch-editor"
    case splitHorizontal = "split-horizontal"
    case splitVertical = "split-vertical"

    public var isSplit: Bool {
        self == .splitHorizontal || self == .splitVertical
    }

    public var isBranchEditorVisible: Bool {
        self == .branchEditor || isSplit
    }
}
