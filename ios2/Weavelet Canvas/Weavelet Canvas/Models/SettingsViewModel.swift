import SwiftUI

// MARK: - Streaming Markdown Policy

enum StreamingMarkdownPolicy: String, CaseIterable, Identifiable {
    case always     // Always render markdown during streaming
    case never      // Show raw text during streaming, render on completion
    case auto       // Render after a delay / when stable

    var id: String { rawValue }

    var label: String {
        switch self {
        case .always: "Always"
        case .never: "Never"
        case .auto: "Auto"
        }
    }
}

// MARK: - Theme Mode

enum ThemeMode: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

// MARK: - Settings View Model

@Observable
final class SettingsViewModel {

    // MARK: - Theme (Epic 2, Ticket 10)

    var themeMode: ThemeMode {
        didSet { save("themeMode", themeMode.rawValue) }
    }

    // MARK: - Display / Debug (Epic 2, Ticket 11)

    var onboardingCompleted: Bool {
        didSet { save("onboardingCompleted", onboardingCompleted) }
    }

    var showDebugPanel: Bool {
        didSet { save("showDebugPanel", showDebugPanel) }
    }

    var displayChatSize: Bool {
        didSet { save("displayChatSize", displayChatSize) }
    }

    var animateBubbleNavigation: Bool {
        didSet { save("animateBubbleNavigation", animateBubbleNavigation) }
    }

    // MARK: - Input (Epic 2, Ticket 12)

    var enterToSubmit: Bool {
        didSet { save("enterToSubmit", enterToSubmit) }
    }

    var markdownMode: Bool {
        didSet { save("markdownMode", markdownMode) }
    }

    var inlineLatex: Bool {
        didSet { save("inlineLatex", inlineLatex) }
    }

    // MARK: - Streaming / Send Behavior (Epic 4)

    /// Streaming markdown rendering policy.
    var streamingMarkdownPolicy: StreamingMarkdownPolicy {
        didSet { save("streamingMarkdownPolicy", streamingMarkdownPolicy.rawValue) }
    }

    /// Track total token usage across all chats.
    var countTotalTokens: Bool {
        didSet { save("countTotalTokens", countTotalTokens) }
    }

    /// Accumulated total token usage (persisted).
    var totalTokensUsed: Int {
        didSet { save("totalTokensUsed", totalTokensUsed) }
    }

    /// Auto-generate chat titles on first message or update.
    var autoTitle: Bool {
        didSet { save("autoTitle", autoTitle) }
    }

    /// Model to use for title generation (empty = same as chat model).
    var titleModel: String {
        didSet { save("titleModel", titleModel) }
    }

    /// Default image detail level for new chats.
    var defaultImageDetail: ImageDetail {
        didSet { save("defaultImageDetail", defaultImageDetail.rawValue) }
    }

    // MARK: - Default Chat Config (Epic 5, Ticket 20)

    /// Default model for new chats (empty = use first available).
    var defaultModel: String {
        didSet { save("defaultModel", defaultModel) }
    }

    /// Default max tokens for new chats.
    var defaultMaxTokens: Int {
        didSet { save("defaultMaxTokens", defaultMaxTokens) }
    }

    /// Default temperature for new chats.
    var defaultTemperature: Double {
        didSet { save("defaultTemperature", defaultTemperature) }
    }

    /// Default top-p for new chats.
    var defaultTopP: Double {
        didSet { save("defaultTopP", defaultTopP) }
    }

    /// Default reasoning effort for new chats.
    var defaultReasoningEffort: ReasoningEffort? {
        didSet { save("defaultReasoningEffort", defaultReasoningEffort?.rawValue ?? "") }
    }

    /// Build a ChatConfig from current default settings.
    var defaultChatConfig: ChatConfig {
        ChatConfig(
            model: defaultModel,
            maxTokens: defaultMaxTokens,
            temperature: defaultTemperature,
            presencePenalty: 0,
            topP: defaultTopP,
            frequencyPenalty: 0,
            reasoningEffort: defaultReasoningEffort
        )
    }

    // MARK: - Default System Message (Epic 5, Ticket 21)

    /// Default system message injected into new chats (empty = none).
    var defaultSystemMessage: String {
        didSet { save("defaultSystemMessage", defaultSystemMessage) }
    }

    // MARK: - Split Panel (Epic 5, Ticket 22)

    /// Split panel ratio (0.0–1.0, fraction of width for the detail pane).
    var splitPanelRatio: Double {
        didSet { save("splitPanelRatio", splitPanelRatio) }
    }

    /// Whether left/right panes are swapped.
    var splitPanelSwapped: Bool {
        didSet { save("splitPanelSwapped", splitPanelSwapped) }
    }

    // MARK: - Model Management (Epic 3)

    /// Favorite model IDs, ordered.
    var favoriteModelIDs: [String] {
        didSet { saveStringArray("favoriteModelIDs", favoriteModelIDs) }
    }

    /// Custom models per provider: [providerId.rawValue: [modelId]]
    var customModels: [String: [String]] {
        didSet { saveDict("customModels", customModels) }
    }

    func toggleFavorite(_ modelId: String) {
        if let idx = favoriteModelIDs.firstIndex(of: modelId) {
            favoriteModelIDs.remove(at: idx)
        } else {
            favoriteModelIDs.append(modelId)
        }
    }

    func isFavorite(_ modelId: String) -> Bool {
        favoriteModelIDs.contains(modelId)
    }

    func addCustomModel(_ modelId: String, for provider: ProviderId) {
        var models = customModels[provider.rawValue] ?? []
        guard !models.contains(modelId) else { return }
        models.append(modelId)
        customModels[provider.rawValue] = models
    }

    func removeCustomModel(_ modelId: String, for provider: ProviderId) {
        customModels[provider.rawValue]?.removeAll { $0 == modelId }
    }

    func customModelsFor(_ provider: ProviderId) -> [String] {
        customModels[provider.rawValue] ?? []
    }

    // MARK: - Init

    private let defaults = UserDefaults.standard

    init() {
        self.themeMode = ThemeMode(rawValue: UserDefaults.standard.string(forKey: "themeMode") ?? "") ?? .system
        self.onboardingCompleted = UserDefaults.standard.bool(forKey: "onboardingCompleted")
        self.showDebugPanel = UserDefaults.standard.bool(forKey: "showDebugPanel")
        self.displayChatSize = Self.boolWithDefault("displayChatSize", default: true)
        self.animateBubbleNavigation = Self.boolWithDefault("animateBubbleNavigation", default: true)
        self.enterToSubmit = Self.boolWithDefault("enterToSubmit", default: true)
        self.markdownMode = UserDefaults.standard.bool(forKey: "markdownMode")
        self.inlineLatex = UserDefaults.standard.bool(forKey: "inlineLatex")
        self.streamingMarkdownPolicy = StreamingMarkdownPolicy(rawValue: UserDefaults.standard.string(forKey: "streamingMarkdownPolicy") ?? "") ?? .auto
        self.countTotalTokens = Self.boolWithDefault("countTotalTokens", default: true)
        self.totalTokensUsed = UserDefaults.standard.integer(forKey: "totalTokensUsed")
        self.autoTitle = Self.boolWithDefault("autoTitle", default: true)
        self.titleModel = UserDefaults.standard.string(forKey: "titleModel") ?? ""
        self.defaultImageDetail = ImageDetail(rawValue: UserDefaults.standard.string(forKey: "defaultImageDetail") ?? "") ?? .auto
        self.favoriteModelIDs = UserDefaults.standard.stringArray(forKey: "favoriteModelIDs") ?? []
        self.customModels = (UserDefaults.standard.dictionary(forKey: "customModels") as? [String: [String]]) ?? [:]

        // Epic 5
        self.defaultModel = UserDefaults.standard.string(forKey: "defaultModel") ?? ""
        self.defaultMaxTokens = Self.intWithDefault("defaultMaxTokens", default: 4000)
        self.defaultTemperature = Self.doubleWithDefault("defaultTemperature", default: 1.0)
        self.defaultTopP = Self.doubleWithDefault("defaultTopP", default: 1.0)
        let reStr = UserDefaults.standard.string(forKey: "defaultReasoningEffort") ?? ""
        self.defaultReasoningEffort = reStr.isEmpty ? nil : ReasoningEffort(rawValue: reStr)
        self.defaultSystemMessage = UserDefaults.standard.string(forKey: "defaultSystemMessage") ?? ""
        self.splitPanelRatio = Self.doubleWithDefault("splitPanelRatio", default: 0.5)
        self.splitPanelSwapped = UserDefaults.standard.bool(forKey: "splitPanelSwapped")
    }

    // MARK: - Persistence Helpers

    private func save(_ key: String, _ value: Any) {
        defaults.set(value, forKey: key)
    }

    private func saveStringArray(_ key: String, _ value: [String]) {
        defaults.set(value, forKey: key)
    }

    private func saveDict(_ key: String, _ value: [String: [String]]) {
        defaults.set(value, forKey: key)
    }

    private static func boolWithDefault(_ key: String, default defaultValue: Bool) -> Bool {
        if UserDefaults.standard.object(forKey: key) == nil {
            return defaultValue
        }
        return UserDefaults.standard.bool(forKey: key)
    }

    private static func intWithDefault(_ key: String, default defaultValue: Int) -> Int {
        if UserDefaults.standard.object(forKey: key) == nil {
            return defaultValue
        }
        return UserDefaults.standard.integer(forKey: key)
    }

    private static func doubleWithDefault(_ key: String, default defaultValue: Double) -> Double {
        if UserDefaults.standard.object(forKey: key) == nil {
            return defaultValue
        }
        return UserDefaults.standard.double(forKey: key)
    }
}
