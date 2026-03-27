import Foundation

// MARK: - Reasoning / Verbosity

enum ReasoningEffort: String, Codable, Hashable, CaseIterable {
    case none, minimal, low, medium, high, xhigh
}

enum Verbosity: String, Codable, Hashable, CaseIterable {
    case low, medium, high, max
}

// MARK: - ChatConfig

struct ChatConfig: Codable, Hashable {
    var model: String
    var maxTokens: Int
    var temperature: Double
    var presencePenalty: Double
    var topP: Double
    var frequencyPenalty: Double
    var stream: Bool?
    var providerId: ProviderId?
    var reasoningEffort: ReasoningEffort?
    var reasoningBudgetTokens: Int?
    var verbosity: Verbosity?

    // Web-compatible JSON keys
    enum CodingKeys: String, CodingKey {
        case model
        case maxTokens = "max_tokens"
        case temperature
        case presencePenalty = "presence_penalty"
        case topP = "top_p"
        case frequencyPenalty = "frequency_penalty"
        case stream
        case providerId
        case reasoningEffort = "reasoning_effort"
        case reasoningBudgetTokens = "reasoning_budget_tokens"
        case verbosity
    }

    static let `default` = ChatConfig(
        model: "",
        maxTokens: 4000,
        temperature: 1.0,
        presencePenalty: 0,
        topP: 1.0,
        frequencyPenalty: 0
    )
}

// MARK: - Chat

struct Chat: Codable, Hashable, Identifiable {
    let id: String
    var title: String
    var folder: String?
    var messages: [Message]
    var config: ChatConfig
    var titleSet: Bool
    var imageDetail: ImageDetail
    var branchTree: BranchTree?
    var collapsedNodes: [String: Bool]?
    var omittedNodes: [String: Bool]?
    var protectedNodes: [String: Bool]?

    init(
        id: String = UUID().uuidString,
        title: String = "New Chat",
        folder: String? = nil,
        messages: [Message] = [],
        config: ChatConfig = .default,
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

// MARK: - Folder

struct Folder: Codable, Hashable, Identifiable {
    let id: String
    var name: String
    var expanded: Bool
    var order: Int
    var color: String?

    init(
        id: String = UUID().uuidString,
        name: String = "New Folder",
        expanded: Bool = true,
        order: Int = 0,
        color: String? = nil
    ) {
        self.id = id
        self.name = name
        self.expanded = expanded
        self.order = order
        self.color = color
    }
}

/// Web-compatible: `Record<string, Folder>` → `[String: Folder]`
typealias FolderCollection = [String: Folder]

// MARK: - Detail View Mode (UI-only, not persisted)

enum DetailViewMode: String, CaseIterable {
    case chat
    case branchEditor

    var label: String {
        switch self {
        case .chat: "Chat"
        case .branchEditor: "Branch Editor"
        }
    }

    var icon: String {
        switch self {
        case .chat: "bubble.left.and.bubble.right"
        case .branchEditor: "arrow.triangle.branch"
        }
    }

    var opposite: DetailViewMode {
        switch self {
        case .chat: .branchEditor
        case .branchEditor: .chat
        }
    }
}
