import Testing
import Foundation
import SwiftUI
@testable import Weavelet_Canvas

@Suite("SettingsViewModel", .serialized)
struct SettingsViewModelTests {

    @Test("Default values are correct")
    func defaults() {
        // Clear relevant keys to test defaults
        let keys = ["themeMode", "onboardingCompleted", "showDebugPanel",
                     "displayChatSize", "animateBubbleNavigation",
                     "enterToSubmit", "markdownMode", "inlineLatex",
                     "defaultModel", "defaultMaxTokens", "defaultTemperature",
                     "defaultTopP", "defaultReasoningEffort",
                     "defaultSystemMessage", "splitPanelRatio", "splitPanelSwapped"]
        for key in keys { UserDefaults.standard.removeObject(forKey: key) }

        let vm = SettingsViewModel()
        #expect(vm.themeMode == .system)
        #expect(vm.onboardingCompleted == false)
        #expect(vm.showDebugPanel == false)
        #expect(vm.displayChatSize == true)
        #expect(vm.animateBubbleNavigation == true)
        #expect(vm.enterToSubmit == true)
        #expect(vm.markdownMode == false)
        #expect(vm.inlineLatex == false)
    }

    @Test("Setting theme persists to UserDefaults")
    func themePersistence() {
        UserDefaults.standard.removeObject(forKey: "themeMode")
        let vm = SettingsViewModel()
        vm.themeMode = .dark
        #expect(UserDefaults.standard.string(forKey: "themeMode") == "dark")

        let vm2 = SettingsViewModel()
        #expect(vm2.themeMode == .dark)

        // Cleanup
        UserDefaults.standard.removeObject(forKey: "themeMode")
    }

    @Test("Boolean settings persist to UserDefaults")
    func boolPersistence() {
        UserDefaults.standard.removeObject(forKey: "showDebugPanel")
        let vm = SettingsViewModel()
        vm.showDebugPanel = true
        #expect(UserDefaults.standard.bool(forKey: "showDebugPanel") == true)

        let vm2 = SettingsViewModel()
        #expect(vm2.showDebugPanel == true)

        UserDefaults.standard.removeObject(forKey: "showDebugPanel")
    }

    @Test("ThemeMode colorScheme mapping")
    func themeColorScheme() {
        #expect(ThemeMode.system.colorScheme == nil)
        #expect(ThemeMode.light.colorScheme == .light)
        #expect(ThemeMode.dark.colorScheme == .dark)
    }

    // MARK: - Epic 5: Default Chat Config

    @Test("Default chat config defaults")
    func defaultChatConfigDefaults() {
        let keys = ["defaultModel", "defaultMaxTokens", "defaultTemperature",
                     "defaultTopP", "defaultReasoningEffort"]
        for key in keys { UserDefaults.standard.removeObject(forKey: key) }

        let vm = SettingsViewModel()
        #expect(vm.defaultModel == "")
        #expect(vm.defaultMaxTokens == 4000)
        #expect(vm.defaultTemperature == 1.0)
        #expect(vm.defaultTopP == 1.0)
        #expect(vm.defaultReasoningEffort == nil)
    }

    @Test("defaultChatConfig builds correct ChatConfig")
    func defaultChatConfigComputed() {
        let keys = ["defaultModel", "defaultMaxTokens", "defaultTemperature",
                     "defaultTopP", "defaultReasoningEffort"]
        for key in keys { UserDefaults.standard.removeObject(forKey: key) }

        let vm = SettingsViewModel()
        vm.defaultModel = "gpt-4o"
        vm.defaultMaxTokens = 8000
        vm.defaultTemperature = 0.7
        vm.defaultTopP = 0.9
        vm.defaultReasoningEffort = .medium

        let config = vm.defaultChatConfig
        #expect(config.model == "gpt-4o")
        #expect(config.maxTokens == 8000)
        #expect(config.temperature == 0.7)
        #expect(config.topP == 0.9)
        #expect(config.reasoningEffort == .medium)
        #expect(config.presencePenalty == 0)
        #expect(config.frequencyPenalty == 0)

        // Cleanup
        for key in keys { UserDefaults.standard.removeObject(forKey: key) }
    }

    @Test("Empty default model resolves to empty string")
    func emptyModelFallback() {
        UserDefaults.standard.removeObject(forKey: "defaultModel")
        let vm = SettingsViewModel()
        #expect(vm.defaultModel == "")
        #expect(vm.resolvedDefaultModel == "")
        #expect(vm.defaultChatConfig.model == "")

        vm.defaultModel = "  "
        #expect(vm.resolvedDefaultModel == "")

        vm.defaultModel = "custom-model"
        #expect(vm.resolvedDefaultModel == "custom-model")

        UserDefaults.standard.removeObject(forKey: "defaultModel")
    }

    @Test("Default chat config persists")
    func defaultChatConfigPersistence() {
        UserDefaults.standard.removeObject(forKey: "defaultMaxTokens")
        let vm = SettingsViewModel()
        vm.defaultMaxTokens = 16000
        #expect(UserDefaults.standard.integer(forKey: "defaultMaxTokens") == 16000)

        let vm2 = SettingsViewModel()
        #expect(vm2.defaultMaxTokens == 16000)

        UserDefaults.standard.removeObject(forKey: "defaultMaxTokens")
    }

    // MARK: - Epic 5: Default System Message

    @Test("Default system message defaults to empty")
    func defaultSystemMessageDefaults() {
        UserDefaults.standard.removeObject(forKey: "defaultSystemMessage")
        let vm = SettingsViewModel()
        #expect(vm.defaultSystemMessage == "")
    }

    @Test("Default system message persists")
    func defaultSystemMessagePersistence() {
        UserDefaults.standard.removeObject(forKey: "defaultSystemMessage")
        let vm = SettingsViewModel()
        vm.defaultSystemMessage = "You are a helpful assistant."
        #expect(UserDefaults.standard.string(forKey: "defaultSystemMessage") == "You are a helpful assistant.")

        let vm2 = SettingsViewModel()
        #expect(vm2.defaultSystemMessage == "You are a helpful assistant.")

        UserDefaults.standard.removeObject(forKey: "defaultSystemMessage")
    }

    // MARK: - Epic 5: Split Panel

    @Test("Split panel defaults")
    func splitPanelDefaults() {
        let keys = ["splitPanelRatio", "splitPanelSwapped"]
        for key in keys { UserDefaults.standard.removeObject(forKey: key) }

        let vm = SettingsViewModel()
        #expect(vm.splitPanelRatio == 0.5)
        #expect(vm.splitPanelSwapped == false)
    }

    @Test("Split panel persists")
    func splitPanelPersistence() {
        let keys = ["splitPanelRatio", "splitPanelSwapped"]
        for key in keys { UserDefaults.standard.removeObject(forKey: key) }

        let vm = SettingsViewModel()
        vm.splitPanelRatio = 0.65
        vm.splitPanelSwapped = true

        let vm2 = SettingsViewModel()
        #expect(vm2.splitPanelRatio == 0.65)
        #expect(vm2.splitPanelSwapped == true)

        for key in keys { UserDefaults.standard.removeObject(forKey: key) }
    }

    // MARK: - Epic 5: createNewChat with defaults

    @Test("createNewChat applies config and system message")
    func createNewChatWithDefaults() {
        let chatVM = ChatViewModel()
        let config = ChatConfig(
            model: "claude-3",
            maxTokens: 8000,
            temperature: 0.5,
            presencePenalty: 0,
            topP: 0.95,
            frequencyPenalty: 0
        )
        chatVM.createNewChat(config: config, systemMessage: "Be concise.")

        let chat = chatVM.chats.first!
        #expect(chat.config.model == "claude-3")
        #expect(chat.config.maxTokens == 8000)
        #expect(chat.config.temperature == 0.5)
        #expect(chat.messages.count == 1)
        #expect(chat.messages[0].role == .system)
        if case .text(let t) = chat.messages[0].content.first {
            #expect(t == "Be concise.")
        } else {
            Issue.record("Expected text content")
        }
    }

    @Test("createNewChat with empty system message has no messages")
    func createNewChatNoSystemMessage() {
        let chatVM = ChatViewModel()
        chatVM.createNewChat(systemMessage: "")
        #expect(chatVM.chats.first!.messages.isEmpty)

        let chatVM2 = ChatViewModel()
        chatVM2.createNewChat(systemMessage: nil)
        #expect(chatVM2.chats.first!.messages.isEmpty)
    }

    @Test("createNewChat infers OpenRouter provider for Claude models")
    func createNewChatInfersOpenRouterProvider() {
        let chatVM = ChatViewModel()
        let config = ChatConfig(
            model: "anthropic/claude-sonnet-4",
            maxTokens: 8000,
            temperature: 1.0,
            presencePenalty: 0,
            topP: 1.0,
            frequencyPenalty: 0
        )

        chatVM.createNewChat(config: config)

        #expect(chatVM.chats.first?.config.providerId == .openrouter)
    }

    @Test("setSelectedModel stores explicit provider")
    func setSelectedModelStoresProvider() {
        let chatVM = ChatViewModel()
        chatVM.createNewChat()

        chatVM.setSelectedModel("anthropic/claude-sonnet-4", providerId: .openrouter)

        #expect(chatVM.chats.first?.config.model == "anthropic/claude-sonnet-4")
        #expect(chatVM.chats.first?.config.providerId == .openrouter)
    }

    // MARK: - Epic 6: Prompt Library

    @Test("Prompt library defaults to empty")
    func promptLibraryDefaults() {
        UserDefaults.standard.removeObject(forKey: "prompts")
        let vm = SettingsViewModel()
        #expect(vm.prompts.isEmpty)
        #expect(!vm.allPrompts.isEmpty) // defaults exist
        #expect(vm.allPrompts.count == DefaultPrompts.all.count)
        UserDefaults.standard.removeObject(forKey: "prompts")
    }

    @Test("Add, update, remove prompts with persistence")
    func promptCRUD() {
        UserDefaults.standard.removeObject(forKey: "prompts")
        let vm = SettingsViewModel()

        vm.addPrompt(name: "Test", prompt: "Do something")
        #expect(vm.prompts.count == 1)
        #expect(vm.prompts[0].name == "Test")
        #expect(vm.prompts[0].prompt == "Do something")

        // Verify persistence
        let vm2 = SettingsViewModel()
        #expect(vm2.prompts.count == 1)
        #expect(vm2.prompts[0].name == "Test")

        // Update
        let id = vm.prompts[0].id
        vm.updatePrompt(id: id, name: "Updated", prompt: "New text")
        #expect(vm.prompts[0].name == "Updated")
        #expect(vm.prompts[0].prompt == "New text")

        // Remove
        vm.removePrompt(id: id)
        #expect(vm.prompts.isEmpty)

        UserDefaults.standard.removeObject(forKey: "prompts")
    }

    @Test("Search prompts filters by name")
    func promptSearch() {
        UserDefaults.standard.removeObject(forKey: "prompts")
        let vm = SettingsViewModel()
        vm.addPrompt(name: "Alpha", prompt: "a")
        vm.addPrompt(name: "Beta", prompt: "b")

        let all = vm.searchPrompts("")
        #expect(all.count == 2 + DefaultPrompts.all.count)

        let filtered = vm.searchPrompts("alpha")
        #expect(filtered.count == 1)
        #expect(filtered[0].name == "Alpha")

        let noMatch = vm.searchPrompts("zzz")
        #expect(noMatch.isEmpty)

        UserDefaults.standard.removeObject(forKey: "prompts")
    }

    @Test("allPrompts includes user then defaults")
    func allPromptsOrder() {
        UserDefaults.standard.removeObject(forKey: "prompts")
        let vm = SettingsViewModel()
        vm.addPrompt(name: "Custom", prompt: "custom")

        let all = vm.allPrompts
        #expect(all.first?.name == "Custom")
        #expect(all.last?.name == DefaultPrompts.all.last?.name)

        UserDefaults.standard.removeObject(forKey: "prompts")
    }
}
