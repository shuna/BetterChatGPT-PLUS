import SwiftUI
import WeaveletDomain

/// Detail screen for configuring a single API provider.
struct ProviderDetailView: View {
    let providerId: ProviderId
    @Environment(AppState.self) private var appState

    var body: some View {
        @Bindable var settings = appState.settings

        let config = settings.providers[providerId] ?? defaultConfig

        Form {
            Section("Connection") {
                HStack {
                    Text("Endpoint")
                    Spacer()
                    TextField("https://...", text: binding(for: \.endpoint, config: config))
                        .multilineTextAlignment(.trailing)
                        .textContentType(.URL)
                        .autocapitalization(.none)
                }

                HStack {
                    Text("API Key")
                    Spacer()
                    SecureField("sk-...", text: binding(for: \.apiKey, config: config))
                        .multilineTextAlignment(.trailing)
                }
            }

            Section("Models") {
                if let modelsEndpoint = config.modelsEndpoint, !modelsEndpoint.isEmpty {
                    LabeledContent("Models Endpoint", value: modelsEndpoint)
                }
                Toggle("Models Require Auth", isOn: binding(for: \.modelsRequireAuth, config: config))
            }

            Section {
                Button("Test Connection") {
                    // TODO: Phase 12 — implement connection test
                }

                if settings.providers[providerId]?.apiKey != nil {
                    Button("Clear API Key", role: .destructive) {
                        settings.providers[providerId]?.apiKey = nil
                    }
                }
            }
        }
        .navigationTitle(providerId.rawValue.capitalized)
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Helpers

    private var defaultConfig: ProviderConfig {
        ProviderConfig(
            id: providerId,
            name: providerId.rawValue.capitalized,
            endpoint: defaultEndpoint(for: providerId)
        )
    }

    private func defaultEndpoint(for provider: ProviderId) -> String {
        switch provider {
        case .openai: return "https://api.openai.com/v1/chat/completions"
        case .openrouter: return "https://openrouter.ai/api/v1/chat/completions"
        case .mistral: return "https://api.mistral.ai/v1/chat/completions"
        case .groq: return "https://api.groq.com/openai/v1/chat/completions"
        case .together: return "https://api.together.xyz/v1/chat/completions"
        case .cohere: return "https://api.cohere.ai/v1/chat/completions"
        case .perplexity: return "https://api.perplexity.ai/chat/completions"
        case .deepseek: return "https://api.deepseek.com/v1/chat/completions"
        case .xai: return "https://api.x.ai/v1/chat/completions"
        case .fireworks: return "https://api.fireworks.ai/inference/v1/chat/completions"
        }
    }

    // Binding helpers that create/update the provider config on mutation
    private func binding(for keyPath: WritableKeyPath<ProviderConfig, String>, config: ProviderConfig) -> Binding<String> {
        Binding(
            get: { appState.settings.providers[providerId]?[keyPath: keyPath] ?? config[keyPath: keyPath] },
            set: { newValue in
                if appState.settings.providers[providerId] == nil {
                    appState.settings.providers[providerId] = config
                }
                appState.settings.providers[providerId]?[keyPath: keyPath] = newValue
            }
        )
    }

    private func binding(for keyPath: WritableKeyPath<ProviderConfig, String?>, config: ProviderConfig) -> Binding<String> {
        Binding(
            get: { appState.settings.providers[providerId]?[keyPath: keyPath] ?? config[keyPath: keyPath] ?? "" },
            set: { newValue in
                if appState.settings.providers[providerId] == nil {
                    appState.settings.providers[providerId] = config
                }
                appState.settings.providers[providerId]?[keyPath: keyPath] = newValue.isEmpty ? nil : newValue
            }
        )
    }

    private func binding(for keyPath: WritableKeyPath<ProviderConfig, Bool>, config: ProviderConfig) -> Binding<Bool> {
        Binding(
            get: { appState.settings.providers[providerId]?[keyPath: keyPath] ?? config[keyPath: keyPath] },
            set: { newValue in
                if appState.settings.providers[providerId] == nil {
                    appState.settings.providers[providerId] = config
                }
                appState.settings.providers[providerId]?[keyPath: keyPath] = newValue
            }
        )
    }
}
