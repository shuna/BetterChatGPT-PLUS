import SwiftUI
import WeaveletDomain
import WeaveletInfra

/// Manages app-wide settings. Replaces Zustand config-slice + provider-slice.
@Observable
final class SettingsViewModel {
    // Appearance
    var theme: AppTheme = .system
    var animateBubbleNavigation: Bool = true

    // Behavior
    var enterToSubmit: Bool = true
    var autoTitle: Bool = true
    var advancedMode: Bool = true
    var inlineLatex: Bool = true
    var streamingMarkdownPolicy: StreamingMarkdownPolicy = .auto
    var displayChatSize: Bool = true

    // Layout (persisted per-device)
    var menuWidth: CGFloat = 260
    var splitPanelRatio: CGFloat = 0.5
    var inspectorVisible: Bool = true

    // Default chat config
    var defaultChatConfig: ChatConfig = ChatConfig()
    var defaultSystemMessage: String = "You are a large language model assistant.\nCarefully heed the user's instructions.\nRespond using Markdown."

    // Proxy
    var proxyEnabled: Bool = false
    var proxyEndpoint: String = ""
    var proxyAuthToken: String = ""

    // Provider
    var providers: [ProviderId: ProviderConfig] = [:]
    var favoriteModels: [FavoriteModel] = []
    var customModels: [ProviderId: [CustomProviderModel]] = [:]

    // Model cache (fetched from APIs)
    var providerModelCache: [ProviderId: [ProviderModel]] = [:]
    var modelFetchInProgress: Set<ProviderId> = []

    // Prompts
    var prompts: [Prompt] = []

    // MARK: - Model Fetching

    /// Fetch models for a provider. Caches results.
    func fetchModels(for providerId: ProviderId, force: Bool = false) async {
        if !force && providerModelCache[providerId] != nil { return }
        if modelFetchInProgress.contains(providerId) { return }

        modelFetchInProgress.insert(providerId)

        let config = resolvedConfig(for: providerId)
        let models = await ModelFetchService.shared.fetchModels(for: config)

        await MainActor.run {
            providerModelCache[providerId] = models
            modelFetchInProgress.remove(providerId)

            // Backfill favorites with fresh data
            backfillFavorites(from: models, providerId: providerId)
        }
    }

    /// Get resolved provider config (user overrides + defaults).
    func resolvedConfig(for providerId: ProviderId) -> ProviderConfig {
        var config = DefaultProviders.configs[providerId] ?? ProviderConfig(
            id: providerId, name: providerId.rawValue, endpoint: ""
        )
        if let userConfig = providers[providerId] {
            config.apiKey = userConfig.apiKey
            if !userConfig.endpoint.isEmpty { config.endpoint = userConfig.endpoint }
        }
        return config
    }

    /// Backfill favorite models with fresh API data.
    private func backfillFavorites(from models: [ProviderModel], providerId: ProviderId) {
        for i in favoriteModels.indices where favoriteModels[i].providerId == providerId {
            if let model = models.first(where: { $0.id == favoriteModels[i].modelId }) {
                favoriteModels[i].contextLength = model.contextLength ?? favoriteModels[i].contextLength
                favoriteModels[i].promptPrice = model.promptPrice ?? favoriteModels[i].promptPrice
                favoriteModels[i].completionPrice = model.completionPrice ?? favoriteModels[i].completionPrice
                favoriteModels[i].supportsReasoning = model.supportsReasoning ?? favoriteModels[i].supportsReasoning
                favoriteModels[i].supportsVision = model.supportsVision ?? favoriteModels[i].supportsVision
                favoriteModels[i].supportsAudio = model.supportsAudio ?? favoriteModels[i].supportsAudio
            }
        }
    }

    /// All models for a provider (cached + custom).
    func allModels(for providerId: ProviderId) -> [ProviderModel] {
        let cached = providerModelCache[providerId] ?? []
        let custom = (customModels[providerId] ?? []).map { cm in
            ProviderModel(
                id: cm.modelId,
                name: cm.name ?? cm.modelId,
                providerId: cm.providerId,
                contextLength: cm.contextLength,
                promptPrice: cm.promptPrice,
                completionPrice: cm.completionPrice,
                modelType: cm.modelType,
                streamSupport: cm.streamSupport,
                supportsReasoning: cm.supportsReasoning,
                supportsVision: cm.supportsVision,
                supportsAudio: cm.supportsAudio
            )
        }
        return cached + custom
    }
}

enum AppTheme: String, CaseIterable {
    case system
    case light
    case dark

    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}
