import SwiftUI
import WeaveletDomain
import WeaveletInfra

/// Root application state. Owns all ViewModels and is injected via `.environment()`.
@Observable
final class AppState {
    var chatList: ChatListViewModel
    var conversation: ConversationViewModel
    var settings: SettingsViewModel

    let repository: ChatRepository

    init() {
        let contentStore = ContentStore()
        let repo = ChatRepository()

        self.repository = repo
        self.chatList = ChatListViewModel(contentStore: contentStore)
        self.conversation = ConversationViewModel(contentStore: contentStore)
        self.settings = SettingsViewModel()

        // Load from disk
        let (chats, activeChatId) = repo.loadAll(contentStore: contentStore)
        if !chats.isEmpty {
            chatList.chats = chats
            if let activeId = activeChatId,
               let idx = chats.firstIndex(where: { $0.id == activeId }) {
                chatList.currentChatIndex = idx
            }
        }

        // Load settings from UserDefaults
        loadSettings()

        // Ensure at least one chat
        if chatList.chats.isEmpty {
            chatList.createNewChat(contentStore: contentStore, defaultSystemMessage: settings.defaultSystemMessage, defaultChatConfig: settings.defaultChatConfig)
        }
        if let first = chatList.currentChat ?? chatList.chats.first {
            conversation.setActiveChat(first, contentStore: contentStore)
        }
    }

    // MARK: - Persistence

    func saveAll() {
        // Sync current conversation back to list
        conversation.syncToList(chatList)

        do {
            try repository.saveAll(
                chats: chatList.chats,
                contentStore: conversation.contentStore,
                activeChatId: chatList.currentChat?.id
            )
        } catch {
            print("[AppState] Save failed: \(error)")
        }

        saveSettings()
    }

    // MARK: - Settings Persistence (UserDefaults)

    private func saveSettings() {
        let defaults = UserDefaults.standard
        defaults.set(settings.theme.rawValue, forKey: "theme")
        defaults.set(settings.enterToSubmit, forKey: "enterToSubmit")
        defaults.set(settings.autoTitle, forKey: "autoTitle")
        defaults.set(settings.advancedMode, forKey: "advancedMode")

        // Save providers (API keys go to Keychain ideally, UserDefaults for now)
        if let data = try? JSONEncoder().encode(settings.providers) {
            defaults.set(data, forKey: "providers")
        }
        if let data = try? JSONEncoder().encode(settings.favoriteModels) {
            defaults.set(data, forKey: "favoriteModels")
        }
        if let data = try? JSONEncoder().encode(settings.prompts) {
            defaults.set(data, forKey: "prompts")
        }
        if let data = try? JSONEncoder().encode(settings.defaultChatConfig) {
            defaults.set(data, forKey: "defaultChatConfig")
        }
        defaults.set(settings.defaultSystemMessage, forKey: "defaultSystemMessage")
        defaults.set(settings.proxyEnabled, forKey: "proxyEnabled")
        defaults.set(settings.proxyEndpoint, forKey: "proxyEndpoint")
    }

    private func loadSettings() {
        let defaults = UserDefaults.standard
        if let theme = defaults.string(forKey: "theme") {
            settings.theme = AppTheme(rawValue: theme) ?? .system
        }
        settings.enterToSubmit = defaults.object(forKey: "enterToSubmit") as? Bool ?? true
        settings.autoTitle = defaults.object(forKey: "autoTitle") as? Bool ?? true
        settings.advancedMode = defaults.object(forKey: "advancedMode") as? Bool ?? true

        if let data = defaults.data(forKey: "providers"),
           let providers = try? JSONDecoder().decode([ProviderId: ProviderConfig].self, from: data) {
            settings.providers = providers
        }
        if let data = defaults.data(forKey: "favoriteModels"),
           let fav = try? JSONDecoder().decode([FavoriteModel].self, from: data) {
            settings.favoriteModels = fav
        }
        if let data = defaults.data(forKey: "prompts"),
           let prompts = try? JSONDecoder().decode([Prompt].self, from: data) {
            settings.prompts = prompts
        }
        if let data = defaults.data(forKey: "defaultChatConfig"),
           let config = try? JSONDecoder().decode(ChatConfig.self, from: data) {
            settings.defaultChatConfig = config
        }
        if let savedSystemMessage = defaults.string(forKey: "defaultSystemMessage") {
            settings.defaultSystemMessage = savedSystemMessage
        }
        settings.proxyEnabled = defaults.bool(forKey: "proxyEnabled")
        settings.proxyEndpoint = defaults.string(forKey: "proxyEndpoint") ?? ""
    }
}
