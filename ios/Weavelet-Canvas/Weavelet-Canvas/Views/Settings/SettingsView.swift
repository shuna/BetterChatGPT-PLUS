import SwiftUI
import WeaveletDomain

/// Main settings screen with sections matching the Web version.
struct SettingsView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var showPromptLibrary = false
    @State private var showImportExport = false
    @State private var showDebugPanel = false

    var body: some View {
        @Bindable var settings = appState.settings

        NavigationStack {
            Form {
                appearanceSection(settings)
                behaviorSection(settings)
                defaultModelSection(settings)
                providersSection(settings)
                promptsSection
                dataSection
                proxySection(settings)
                aboutSection
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    // MARK: - Appearance

    @ViewBuilder
    private func appearanceSection(_ settings: SettingsViewModel) -> some View {
        Section("Appearance") {
            Picker("Theme", selection: Bindable(settings).theme) {
                ForEach(AppTheme.allCases, id: \.self) { theme in
                    Text(theme.rawValue.capitalized).tag(theme)
                }
            }

            Toggle("Animate Bubble Navigation", isOn: Bindable(settings).animateBubbleNavigation)
        }
    }

    // MARK: - Behavior

    @ViewBuilder
    private func behaviorSection(_ settings: SettingsViewModel) -> some View {
        Section("Behavior") {
            Toggle("Enter to Submit", isOn: Bindable(settings).enterToSubmit)
            Toggle("Auto-Generate Title", isOn: Bindable(settings).autoTitle)
            Toggle("Advanced Mode", isOn: Bindable(settings).advancedMode)
            Toggle("Display Chat Size", isOn: Bindable(settings).displayChatSize)

            Picker("Streaming Markdown", selection: Bindable(settings).streamingMarkdownPolicy) {
                Text("Auto").tag(StreamingMarkdownPolicy.auto)
                Text("Always").tag(StreamingMarkdownPolicy.always)
                Text("Never").tag(StreamingMarkdownPolicy.never)
            }
        }
    }

    // MARK: - Default Model

    @ViewBuilder
    private func defaultModelSection(_ settings: SettingsViewModel) -> some View {
        Section("Default Chat Config") {
            HStack {
                Text("Model")
                Spacer()
                TextField("Model ID", text: Bindable(settings).defaultChatConfig.model)
                    .multilineTextAlignment(.trailing)
                    .foregroundStyle(.secondary)
            }

            HStack {
                Text("Max Tokens")
                Spacer()
                TextField("", value: Bindable(settings).defaultChatConfig.maxTokens, format: .number)
                    .multilineTextAlignment(.trailing)
                    .keyboardType(.numberPad)
                    .frame(width: 100)
            }

            VStack(alignment: .leading) {
                HStack {
                    Text("Temperature")
                    Spacer()
                    Text(String(format: "%.2f", settings.defaultChatConfig.temperature))
                        .foregroundStyle(.secondary)
                }
                Slider(
                    value: Bindable(settings).defaultChatConfig.temperature,
                    in: 0...2,
                    step: 0.05
                )
            }

            VStack(alignment: .leading) {
                HStack {
                    Text("Top P")
                    Spacer()
                    Text(String(format: "%.2f", settings.defaultChatConfig.topP))
                        .foregroundStyle(.secondary)
                }
                Slider(
                    value: Bindable(settings).defaultChatConfig.topP,
                    in: 0...1,
                    step: 0.05
                )
            }

            VStack(alignment: .leading) {
                HStack {
                    Text("Frequency Penalty")
                    Spacer()
                    Text(String(format: "%.2f", settings.defaultChatConfig.frequencyPenalty))
                        .foregroundStyle(.secondary)
                }
                Slider(
                    value: Bindable(settings).defaultChatConfig.frequencyPenalty,
                    in: -2...2,
                    step: 0.1
                )
            }

            VStack(alignment: .leading) {
                HStack {
                    Text("Presence Penalty")
                    Spacer()
                    Text(String(format: "%.2f", settings.defaultChatConfig.presencePenalty))
                        .foregroundStyle(.secondary)
                }
                Slider(
                    value: Bindable(settings).defaultChatConfig.presencePenalty,
                    in: -2...2,
                    step: 0.1
                )
            }

            // Reasoning effort
            Picker("Reasoning Effort", selection: Binding(
                get: { settings.defaultChatConfig.reasoningEffort ?? .medium },
                set: { settings.defaultChatConfig.reasoningEffort = $0 }
            )) {
                Text("None").tag(ReasoningEffort.none)
                Text("Minimal").tag(ReasoningEffort.minimal)
                Text("Low").tag(ReasoningEffort.low)
                Text("Medium").tag(ReasoningEffort.medium)
                Text("High").tag(ReasoningEffort.high)
                Text("X-High").tag(ReasoningEffort.xhigh)
            }

            // Default system message
            VStack(alignment: .leading) {
                Text("Default System Message")
                TextEditor(text: Bindable(settings).defaultSystemMessage)
                    .frame(minHeight: 60)
                    .overlay(
                        RoundedRectangle(cornerRadius: 6)
                            .strokeBorder(Color(.separator), lineWidth: 0.5)
                    )
            }
        }
    }

    // MARK: - Providers

    @ViewBuilder
    private func providersSection(_ settings: SettingsViewModel) -> some View {
        Section("AI Providers") {
            // Each provider as a drilldown row
            ForEach(ProviderId.allCases, id: \.self) { pid in
                NavigationLink {
                    ProviderDetailPage(providerId: pid)
                        .environment(appState)
                } label: {
                    HStack {
                        // Connection indicator
                        Image(systemName: settings.providers[pid]?.apiKey != nil ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(settings.providers[pid]?.apiKey != nil ? .green : Color(.systemGray4))
                            .font(.caption)

                        Text(pid.displayName)
                            .font(.body)

                        Spacer()

                        // Model count badge
                        let modelCount = settings.providerModelCache[pid]?.count ?? 0
                        if modelCount > 0 {
                            Text("\(modelCount) models")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }

                        if settings.providers[pid]?.apiKey != nil {
                            Text(maskApiKey(settings.providers[pid]?.apiKey))
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }
                    }
                }
            }
        }
    }

    private func maskApiKey(_ key: String?) -> String {
        guard let key, key.count > 8 else { return "•••" }
        return String(key.prefix(4)) + "•••" + String(key.suffix(4))
    }

    // MARK: - Proxy

    @ViewBuilder
    private func proxySection(_ settings: SettingsViewModel) -> some View {
        Section("Proxy") {
            Toggle("Enable Proxy", isOn: Bindable(settings).proxyEnabled)

            if settings.proxyEnabled {
                HStack {
                    Text("Endpoint")
                    Spacer()
                    TextField("https://...", text: Bindable(settings).proxyEndpoint)
                        .multilineTextAlignment(.trailing)
                        .textContentType(.URL)
                        .autocapitalization(.none)
                }

                HStack {
                    Text("Auth Token")
                    Spacer()
                    SecureField("Token", text: Bindable(settings).proxyAuthToken)
                        .multilineTextAlignment(.trailing)
                }
            }
        }
    }

    // MARK: - Prompts

    @ViewBuilder
    private var promptsSection: some View {
        Section("Prompts") {
            Button {
                showPromptLibrary = true
            } label: {
                HStack {
                    Label("Prompt Library", systemImage: "text.quote")
                    Spacer()
                    Text("\(appState.settings.prompts.count)")
                        .foregroundStyle(.secondary)
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .sheet(isPresented: $showPromptLibrary) {
                PromptLibraryView()
                    .environment(appState)
            }
        }
    }

    // MARK: - Data

    @ViewBuilder
    private var dataSection: some View {
        Section("Data") {
            Button {
                showImportExport = true
            } label: {
                HStack {
                    Label("Import / Export", systemImage: "arrow.up.arrow.down")
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .sheet(isPresented: $showImportExport) {
                ImportExportView()
                    .environment(appState)
            }
        }
    }

    // MARK: - About

    @ViewBuilder
    private var aboutSection: some View {
        Section("About") {
            LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—")
            LabeledContent("Build", value: Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "—")
        }

        // Debug panel (hidden behind advanced mode or long-press)
        if appState.settings.advancedMode {
            Section("Developer") {
                Button {
                    showDebugPanel = true
                } label: {
                    Label("Debug Panel", systemImage: "ant")
                }
                .sheet(isPresented: $showDebugPanel) {
                    DebugPanelView()
                        .environment(appState)
                }
            }
        }
    }
}
