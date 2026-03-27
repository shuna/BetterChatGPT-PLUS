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
}
