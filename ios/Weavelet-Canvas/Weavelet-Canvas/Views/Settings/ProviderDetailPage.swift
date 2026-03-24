import SwiftUI
import WeaveletDomain
import WeaveletInfra

/// Per-provider detail page with API key, model browse, custom models tabs.
/// Navigated to from Settings → AI Providers → [Provider Name].
struct ProviderDetailPage: View {
    let providerId: ProviderId
    @Environment(AppState.self) private var appState
    @State private var activeTab: Tab = .models

    enum Tab: String, CaseIterable {
        case models = "Models"
        case custom = "Custom"
        case settings = "Settings"
    }

    var body: some View {
        VStack(spacing: 0) {
            // API key quick entry (if not set)
            if appState.settings.providers[providerId]?.apiKey == nil {
                apiKeyBanner
            }

            // Tab picker
            Picker("Tab", selection: $activeTab) {
                ForEach(Tab.allCases, id: \.self) { tab in
                    Text(tab.rawValue).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.vertical, 8)

            // Tab content
            switch activeTab {
            case .models:
                ModelBrowseView(providerId: providerId)
            case .custom:
                CustomModelListView(providerId: providerId)
            case .settings:
                ProviderSettingsFormView(providerId: providerId)
            }
        }
        .navigationTitle(providerId.displayName)
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private var apiKeyBanner: some View {
        VStack(spacing: 8) {
            HStack {
                Image(systemName: "key.fill")
                    .foregroundStyle(.orange)
                Text("API key required to browse models")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            SecureField("Enter API key...", text: Binding(
                get: { appState.settings.providers[providerId]?.apiKey ?? "" },
                set: { newValue in
                    ensureConfig()
                    appState.settings.providers[providerId]?.apiKey = newValue.isEmpty ? nil : newValue
                }
            ))
            .textFieldStyle(.roundedBorder)
            .font(.caption)
        }
        .padding()
        .background(Color.orange.opacity(0.05))
    }

    private func ensureConfig() {
        if appState.settings.providers[providerId] == nil {
            let defaults = DefaultProviders.configs[providerId]
            appState.settings.providers[providerId] = defaults ?? ProviderConfig(
                id: providerId, name: providerId.displayName,
                endpoint: ""
            )
        }
    }
}
