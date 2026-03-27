import SwiftUI

struct SettingsView: View {
    @Bindable var settings: SettingsViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                // MARK: - Theme
                Section("Appearance") {
                    Picker("Theme", selection: $settings.themeMode) {
                        ForEach(ThemeMode.allCases) { mode in
                            Text(mode.label).tag(mode)
                        }
                    }
                }

                // MARK: - Display
                Section("Display") {
                    Toggle("Show chat size", isOn: $settings.displayChatSize)
                    Toggle("Animate bubble navigation", isOn: $settings.animateBubbleNavigation)
                    Toggle("Show debug panel", isOn: $settings.showDebugPanel)
                }

                // MARK: - Input
                Section("Input") {
                    Toggle("Enter to submit", isOn: $settings.enterToSubmit)
                    Toggle("Markdown mode", isOn: $settings.markdownMode)
                    Toggle("Inline LaTeX", isOn: $settings.inlineLatex)
                }

                // MARK: - Streaming / Send
                Section("Streaming") {
                    Picker("Markdown rendering", selection: $settings.streamingMarkdownPolicy) {
                        ForEach(StreamingMarkdownPolicy.allCases) { policy in
                            Text(policy.label).tag(policy)
                        }
                    }
                }

                Section("Token Tracking") {
                    Toggle("Count total tokens", isOn: $settings.countTotalTokens)
                    if settings.countTotalTokens {
                        LabeledContent("Total tokens used", value: "\(settings.totalTokensUsed)")
                        Button("Reset counter") {
                            settings.totalTokensUsed = 0
                        }
                    }
                }

                Section("Title Generation") {
                    Toggle("Auto-generate titles", isOn: $settings.autoTitle)
                    if settings.autoTitle {
                        TextField("Title model (blank = chat model)", text: $settings.titleModel)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                    }
                }

                Section("Image") {
                    Picker("Default image detail", selection: $settings.defaultImageDetail) {
                        ForEach(ImageDetail.allCases, id: \.self) { detail in
                            Text(detail.rawValue.capitalized).tag(detail)
                        }
                    }
                }

                // MARK: - Default Chat Config
                Section("Default Chat Config") {
                    TextField("Default model (blank = first available)", text: $settings.defaultModel)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    Stepper("Max tokens: \(settings.defaultMaxTokens)", value: $settings.defaultMaxTokens, in: 1...128000, step: 500)
                    HStack {
                        Text("Temperature")
                        Slider(value: $settings.defaultTemperature, in: 0...2, step: 0.1)
                        Text(String(format: "%.1f", settings.defaultTemperature))
                            .monospacedDigit()
                            .frame(width: 32)
                    }
                    HStack {
                        Text("Top-P")
                        Slider(value: $settings.defaultTopP, in: 0...1, step: 0.05)
                        Text(String(format: "%.2f", settings.defaultTopP))
                            .monospacedDigit()
                            .frame(width: 40)
                    }
                    Picker("Reasoning effort", selection: Binding(
                        get: { settings.defaultReasoningEffort ?? .none },
                        set: { settings.defaultReasoningEffort = $0 == .none ? nil : $0 }
                    )) {
                        ForEach(ReasoningEffort.allCases, id: \.self) { effort in
                            Text(effort.rawValue.capitalized).tag(effort)
                        }
                    }
                }

                // MARK: - Default System Message
                Section("Default System Message") {
                    TextEditor(text: $settings.defaultSystemMessage)
                        .frame(minHeight: 80)
                        .font(.body)
                }

                // MARK: - Split Panel
                Section("Split Panel") {
                    HStack {
                        Text("Panel ratio")
                        Slider(value: $settings.splitPanelRatio, in: 0.2...0.8, step: 0.05)
                        Text(String(format: "%.0f%%", settings.splitPanelRatio * 100))
                            .monospacedDigit()
                            .frame(width: 40)
                    }
                    Toggle("Swap panels", isOn: $settings.splitPanelSwapped)
                }

                // MARK: - About
                Section("About") {
                    LabeledContent("Version", value: "1.0.0")
                    Toggle("Onboarding completed", isOn: $settings.onboardingCompleted)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
