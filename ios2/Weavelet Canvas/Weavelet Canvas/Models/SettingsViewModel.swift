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

    /// The resolved model ID; empty when the user hasn't chosen one yet.
    var resolvedDefaultModel: String {
        defaultModel.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Build a ChatConfig from current default settings.
    var defaultChatConfig: ChatConfig {
        ChatConfig(
            model: resolvedDefaultModel,
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

    /// Favorite model IDs, ordered. Each entry includes provider for unambiguous resolution.
    var favoriteModelIDs: [FavoriteModel] {
        didSet { saveFavorites() }
    }

    private func saveFavorites() {
        guard let data = try? JSONEncoder().encode(favoriteModelIDs) else { return }
        defaults.set(data, forKey: "favoriteModelsData")
    }

    private static func loadFavorites() -> [FavoriteModel] {
        // New format
        if let data = UserDefaults.standard.data(forKey: "favoriteModelsData"),
           let favs = try? JSONDecoder().decode([FavoriteModel].self, from: data) {
            return favs
        }
        // Migrate from old [String] format
        if let old = UserDefaults.standard.stringArray(forKey: "favoriteModelIDs") {
            let migrated = old.map { FavoriteModel(modelId: $0, providerId: .openrouter) }
            if let data = try? JSONEncoder().encode(migrated) {
                UserDefaults.standard.set(data, forKey: "favoriteModelsData")
            }
            UserDefaults.standard.removeObject(forKey: "favoriteModelIDs")
            return migrated
        }
        return []
    }

    /// Custom models per provider: [providerId.rawValue: [ProviderModel]]
    var customModels: [String: [ProviderModel]] {
        didSet { saveCustomModels() }
    }

    func toggleFavorite(_ modelId: String, providerId: ProviderId) {
        if let idx = favoriteModelIDs.firstIndex(where: { $0.modelId == modelId && $0.providerId == providerId }) {
            favoriteModelIDs.remove(at: idx)
        } else {
            favoriteModelIDs.append(FavoriteModel(modelId: modelId, providerId: providerId))
        }
    }

    func isFavorite(_ modelId: String, providerId: ProviderId) -> Bool {
        favoriteModelIDs.contains(where: { $0.modelId == modelId && $0.providerId == providerId })
    }

    func addCustomModel(_ model: ProviderModel, for provider: ProviderId) {
        var models = customModels[provider.rawValue] ?? []
        if let idx = models.firstIndex(where: { $0.id == model.id }) {
            models[idx] = model // replace existing
        } else {
            models.append(model)
        }
        customModels[provider.rawValue] = models
    }

    func removeCustomModel(_ modelId: String, for provider: ProviderId) {
        customModels[provider.rawValue]?.removeAll { $0.id == modelId }
    }

    func customModelsFor(_ provider: ProviderId) -> [ProviderModel] {
        customModels[provider.rawValue] ?? []
    }

    /// Find a custom model by ID across all providers (searches ProviderId.allCases order).
    func findCustomModel(_ modelId: String) -> ProviderModel? {
        for provider in ProviderId.allCases {
            if let model = customModels[provider.rawValue]?.first(where: { $0.id == modelId }) {
                return model
            }
        }
        return nil
    }

    private func saveCustomModels() {
        guard let data = try? JSONEncoder().encode(customModels) else { return }
        defaults.set(data, forKey: "customModelsData")
    }

    private static func loadCustomModels() -> [String: [ProviderModel]] {
        // Try new format first
        if let data = UserDefaults.standard.data(forKey: "customModelsData"),
           let models = try? JSONDecoder().decode([String: [ProviderModel]].self, from: data) {
            return models
        }
        // Migrate from old format [String: [String]]
        if let old = UserDefaults.standard.dictionary(forKey: "customModels") as? [String: [String]] {
            var migrated: [String: [ProviderModel]] = [:]
            for (providerKey, ids) in old {
                let providerId = ProviderId(rawValue: providerKey) ?? .openai
                migrated[providerKey] = ids.map { id in
                    ProviderModel(id: id, name: id, providerId: providerId, contextLength: 4096)
                }
            }
            // Save migrated and remove old key
            if let data = try? JSONEncoder().encode(migrated) {
                UserDefaults.standard.set(data, forKey: "customModelsData")
            }
            UserDefaults.standard.removeObject(forKey: "customModels")
            return migrated
        }
        return [:]
    }

    // MARK: - Proxy (Epic 7, Ticket 26)

    /// Whether the proxy worker is enabled.
    var proxyEnabled: Bool {
        didSet { save("proxyEnabled", proxyEnabled) }
    }

    /// Proxy worker endpoint URL (normalized on set).
    var proxyEndpoint: String {
        didSet {
            let normalized = proxyEndpoint
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .replacingOccurrences(of: "/+$", with: "", options: .regularExpression)
            if normalized != proxyEndpoint {
                proxyEndpoint = normalized
                return  // didSet will re-fire with normalized value
            }
            save("proxyEndpoint", proxyEndpoint)
        }
    }

    /// Proxy auth token (stored in Keychain, not UserDefaults).
    var proxyAuthToken: String {
        didSet {
            if proxyAuthToken.isEmpty {
                KeychainHelper.delete(key: "proxyAuthToken")
            } else {
                KeychainHelper.save(key: "proxyAuthToken", value: proxyAuthToken)
            }
        }
    }

    /// Resolved proxy configuration, or nil if proxy is disabled/unconfigured.
    var resolvedProxyConfig: ProxyConfig? {
        guard proxyEnabled else { return nil }
        let ep = proxyEndpoint.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !ep.isEmpty else { return nil }
        return ProxyConfig(
            endpoint: ep,
            authToken: proxyAuthToken.isEmpty ? nil : proxyAuthToken
        )
    }

    // MARK: - Cloud Sync (Epic 7, Ticket 27)

    /// Whether cloud sync is enabled.
    var cloudSyncEnabled: Bool {
        didSet { save("cloudSyncEnabled", cloudSyncEnabled) }
    }

    /// Active cloud sync provider type.
    var cloudSyncProviderType: CloudSyncProviderType {
        didSet { save("cloudSyncProviderType", cloudSyncProviderType.rawValue) }
    }

    /// Timestamp of the last successful sync (persisted).
    var lastSyncTimestamp: Date? {
        didSet {
            if let ts = lastSyncTimestamp {
                save("lastSyncTimestamp", ts.timeIntervalSince1970)
            } else {
                defaults.removeObject(forKey: "lastSyncTimestamp")
            }
        }
    }

    /// The updatedAt value from the last uploaded SyncSnapshot (Unix ms).
    /// Used as the comparison key when pulling remote state.
    var lastLocalUpdatedAt: Int64 {
        didSet { save("lastLocalUpdatedAt", lastLocalUpdatedAt) }
    }

    // MARK: - Prompt Library (Epic 6, Ticket 23)

    /// User-created prompts (persisted as JSON in UserDefaults).
    var prompts: [Prompt] {
        didSet { savePrompts() }
    }

    func addPrompt(name: String, prompt: String) {
        prompts.append(Prompt(name: name, prompt: prompt))
    }

    func removePrompt(id: String) {
        prompts.removeAll { $0.id == id }
    }

    func updatePrompt(id: String, name: String, prompt: String) {
        guard let idx = prompts.firstIndex(where: { $0.id == id }) else { return }
        prompts[idx].name = name
        prompts[idx].prompt = prompt
    }

    /// All available prompts: user prompts first, then defaults.
    var allPrompts: [Prompt] {
        prompts + DefaultPrompts.all
    }

    /// Filter prompts by query (name match).
    func searchPrompts(_ query: String) -> [Prompt] {
        let q = query.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return allPrompts }
        return allPrompts.filter { $0.name.lowercased().contains(q) }
    }

    private func savePrompts() {
        guard let data = try? JSONEncoder().encode(prompts) else { return }
        defaults.set(data, forKey: "prompts")
    }

    private static func loadPrompts() -> [Prompt] {
        guard let data = UserDefaults.standard.data(forKey: "prompts"),
              let prompts = try? JSONDecoder().decode([Prompt].self, from: data) else { return [] }
        return prompts
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
        self.markdownMode = Self.boolWithDefault("markdownMode", default: true)
        self.inlineLatex = UserDefaults.standard.bool(forKey: "inlineLatex")
        self.streamingMarkdownPolicy = StreamingMarkdownPolicy(rawValue: UserDefaults.standard.string(forKey: "streamingMarkdownPolicy") ?? "") ?? .auto
        self.countTotalTokens = Self.boolWithDefault("countTotalTokens", default: true)
        self.totalTokensUsed = UserDefaults.standard.integer(forKey: "totalTokensUsed")
        self.autoTitle = Self.boolWithDefault("autoTitle", default: true)
        self.titleModel = UserDefaults.standard.string(forKey: "titleModel") ?? ""
        self.defaultImageDetail = ImageDetail(rawValue: UserDefaults.standard.string(forKey: "defaultImageDetail") ?? "") ?? .auto
        self.favoriteModelIDs = Self.loadFavorites()
        self.customModels = Self.loadCustomModels()

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

        // Epic 6
        self.prompts = Self.loadPrompts()

        // Epic 7 - Cloud Sync
        self.cloudSyncEnabled = UserDefaults.standard.bool(forKey: "cloudSyncEnabled")
        let providerRaw = UserDefaults.standard.string(forKey: "cloudSyncProviderType") ?? ""
        self.cloudSyncProviderType = CloudSyncProviderType(rawValue: providerRaw) ?? .icloud
        let tsVal = UserDefaults.standard.double(forKey: "lastSyncTimestamp")
        self.lastSyncTimestamp = tsVal > 0 ? Date(timeIntervalSince1970: tsVal) : nil
        self.lastLocalUpdatedAt = Int64(UserDefaults.standard.integer(forKey: "lastLocalUpdatedAt"))

        // Epic 7 - Proxy
        self.proxyEnabled = UserDefaults.standard.bool(forKey: "proxyEnabled")
        self.proxyEndpoint = UserDefaults.standard.string(forKey: "proxyEndpoint") ?? ""
        self.proxyAuthToken = KeychainHelper.load(key: "proxyAuthToken") ?? ""
    }

    // MARK: - Persistence Helpers

    private func save(_ key: String, _ value: Any) {
        defaults.set(value, forKey: key)
    }

    private func saveStringArray(_ key: String, _ value: [String]) {
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
