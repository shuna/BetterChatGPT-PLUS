import SwiftUI
import WeaveletDomain
import WeaveletInfra

/// Full provider management modal matching the Web version's ProviderMenu.
/// Left: provider list. Right: Browse models / Custom models / Settings tabs.
struct ProviderMenuView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var selectedProvider: ProviderId = .openrouter
    @State private var activeTab: ProviderTab = .browse

    enum ProviderTab: String, CaseIterable {
        case browse = "Browse"
        case custom = "Custom"
        case settings = "Settings"
    }

    var body: some View {
        NavigationSplitView {
            // Provider sidebar
            List {
                ForEach(ProviderId.allCases, id: \.self) { pid in
                    Button {
                        selectedProvider = pid
                    } label: {
                        HStack {
                            Text(pid.displayName)
                                .foregroundStyle(.primary)
                            Spacer()
                            if appState.settings.providers[pid]?.apiKey != nil {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(.green)
                                    .font(.caption)
                            }
                            if selectedProvider == pid {
                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .listRowBackground(
                        selectedProvider == pid
                            ? RoundedRectangle(cornerRadius: 8).fill(.tint.opacity(0.15))
                            : nil
                    )
                }
            }
            .navigationTitle("Providers")
            .listStyle(.sidebar)
        } detail: {
            VStack(spacing: 0) {
                // Tab picker
                Picker("Tab", selection: $activeTab) {
                    ForEach(ProviderTab.allCases, id: \.self) { tab in
                        Text(tab.rawValue).tag(tab)
                    }
                }
                .pickerStyle(.segmented)
                .padding()

                // Tab content
                switch activeTab {
                case .browse:
                    ModelBrowseView(providerId: selectedProvider)
                case .custom:
                    CustomModelListView(providerId: selectedProvider)
                case .settings:
                    ProviderSettingsFormView(providerId: selectedProvider)
                }
            }
            .navigationTitle(selectedProvider.displayName)
            .navigationBarTitleDisplayMode(.inline)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") { dismiss() }
            }
        }
    }
}

// MARK: - Provider Display Name

extension ProviderId {
    var displayName: String {
        switch self {
        case .openrouter: return "OpenRouter"
        case .openai: return "OpenAI"
        case .mistral: return "Mistral"
        case .groq: return "Groq"
        case .together: return "Together"
        case .cohere: return "Cohere"
        case .perplexity: return "Perplexity"
        case .deepseek: return "DeepSeek"
        case .xai: return "xAI"
        case .fireworks: return "Fireworks"
        }
    }
}

// MARK: - Model Browse View

struct ModelBrowseView: View {
    let providerId: ProviderId
    @Environment(AppState.self) private var appState

    @State private var searchText = ""
    @State private var models: [ProviderModel] = []
    @State private var isLoading = false
    @State private var sortBy: ModelSort = .name
    @State private var sortAscending = true

    enum ModelSort: String, CaseIterable {
        case name = "Name"
        case cost = "Cost"
        case context = "Context"
    }

    var body: some View {
        VStack(spacing: 0) {
            // Search + Sort bar
            HStack {
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                    TextField("Search models...", text: $searchText)
                        .textFieldStyle(.plain)
                }
                .padding(8)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))

                Menu {
                    ForEach(ModelSort.allCases, id: \.self) { sort in
                        Button {
                            if sortBy == sort {
                                sortAscending.toggle()
                            } else {
                                sortBy = sort
                                sortAscending = true
                            }
                        } label: {
                            HStack {
                                Text(sort.rawValue)
                                if sortBy == sort {
                                    Image(systemName: sortAscending ? "chevron.up" : "chevron.down")
                                }
                            }
                        }
                    }
                } label: {
                    Image(systemName: "arrow.up.arrow.down")
                        .font(.body)
                }
            }
            .padding()

            // Model list
            if isLoading {
                ProgressView("Loading models...")
                    .frame(maxHeight: .infinity)
            } else if filteredModels.isEmpty {
                ContentUnavailableView(
                    "No Models",
                    systemImage: "cpu",
                    description: Text(models.isEmpty
                        ? "Set an API key in Settings to fetch models."
                        : "No models match your search.")
                )
            } else {
                List(filteredModels) { model in
                    ModelRowView(model: model, providerId: providerId)
                }
                .listStyle(.plain)
            }
        }
        .task { await fetchModels() }
        .refreshable {
            isLoading = true
            await appState.settings.fetchModels(for: providerId, force: true)
            models = appState.settings.allModels(for: providerId)
            isLoading = false
        }
    }

    private var filteredModels: [ProviderModel] {
        var result = models
        if !searchText.isEmpty {
            result = result.filter {
                $0.name.localizedCaseInsensitiveContains(searchText) ||
                $0.id.localizedCaseInsensitiveContains(searchText)
            }
        }
        switch sortBy {
        case .name:
            result.sort { sortAscending ? $0.name < $1.name : $0.name > $1.name }
        case .cost:
            result.sort {
                let a = $0.promptPrice ?? 0
                let b = $1.promptPrice ?? 0
                return sortAscending ? a < b : a > b
            }
        case .context:
            result.sort {
                let a = $0.contextLength ?? 0
                let b = $1.contextLength ?? 0
                return sortAscending ? a < b : a > b
            }
        }
        return result
    }

    private func fetchModels() async {
        isLoading = true
        await appState.settings.fetchModels(for: providerId, force: false)
        models = appState.settings.allModels(for: providerId)
        isLoading = false
    }
}

// MARK: - Model Row

struct ModelRowView: View {
    let model: ProviderModel
    let providerId: ProviderId
    @Environment(AppState.self) private var appState

    private var isFavorite: Bool {
        appState.settings.favoriteModels.contains { $0.modelId == model.id && $0.providerId == providerId }
    }

    var body: some View {
        HStack(spacing: 8) {
            // Favorite checkbox (left)
            Button {
                toggleFavorite()
            } label: {
                Image(systemName: isFavorite ? "checkmark.square.fill" : "square")
                    .foregroundStyle(isFavorite ? Color.accentColor : .secondary)
                    .font(.body)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(model.id)
                        .font(.body)
                        .lineLimit(1)

                    // Capability badges
                    if model.supportsReasoning == true {
                        capabilityBadge("brain", color: .purple)
                    }
                    if model.supportsVision == true {
                        capabilityBadge("eye", color: .blue)
                    }
                    if model.supportsAudio == true {
                        capabilityBadge("waveform", color: .green)
                    }
                }

                HStack(spacing: 8) {
                    if let ctx = model.contextLength {
                        let formatted = ctx >= 1_000_000 ? "\(ctx / 1_000_000)M ctx" : "\(ctx / 1000)K ctx"
                        Text(formatted)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    if let price = model.promptPrice {
                        Text("$\(price, specifier: "%.2f")/M in")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    if let price = model.completionPrice {
                        Text("$\(price, specifier: "%.2f")/M out")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    if let created = model.created {
                        Text(formatDate(created))
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
            }

            Spacer()
        }
        .padding(.vertical, 2)
    }

    private func formatDate(_ timestamp: Int) -> String {
        let date = Date(timeIntervalSince1970: Double(timestamp))
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    @ViewBuilder
    private func capabilityBadge(_ icon: String, color: Color) -> some View {
        Image(systemName: icon)
            .font(.system(size: 9))
            .foregroundStyle(color)
            .frame(width: 16, height: 16)
            .background(color.opacity(0.1), in: Circle())
    }

    private func toggleFavorite() {
        if let idx = appState.settings.favoriteModels.firstIndex(where: {
            $0.modelId == model.id && $0.providerId == providerId
        }) {
            appState.settings.favoriteModels.remove(at: idx)
        } else {
            appState.settings.favoriteModels.append(FavoriteModel(
                modelId: model.id,
                providerId: providerId,
                promptPrice: model.promptPrice,
                completionPrice: model.completionPrice,
                contextLength: model.contextLength,
                modelType: model.modelType,
                streamSupport: model.streamSupport,
                supportsReasoning: model.supportsReasoning,
                supportsVision: model.supportsVision,
                supportsAudio: model.supportsAudio
            ))
        }
    }
}

// MARK: - Custom Model List

struct CustomModelListView: View {
    let providerId: ProviderId
    @Environment(AppState.self) private var appState

    @State private var showAddForm = false
    @State private var newModelId = ""
    @State private var newModelName = ""
    @State private var newContextLength = ""

    var body: some View {
        VStack {
            // Add button
            HStack {
                Spacer()
                Button {
                    showAddForm = true
                } label: {
                    Label("Add Custom Model", systemImage: "plus")
                }
                .buttonStyle(.bordered)
            }
            .padding()

            if appState.settings.favoriteModels.filter({ $0.providerId == providerId }).isEmpty {
                ContentUnavailableView(
                    "No Custom Models",
                    systemImage: "cpu.fill",
                    description: Text("Add a custom model with a known model ID.")
                )
            } else {
                List {
                    ForEach(
                        appState.settings.favoriteModels.filter { $0.providerId == providerId },
                        id: \.modelId
                    ) { model in
                        VStack(alignment: .leading) {
                            Text(model.modelId)
                                .font(.body)
                            if let ctx = model.contextLength {
                                Text("\(ctx / 1000)K context")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .onDelete { offsets in
                        let filtered = appState.settings.favoriteModels.filter { $0.providerId == providerId }
                        for offset in offsets {
                            let modelId = filtered[offset].modelId
                            appState.settings.favoriteModels.removeAll {
                                $0.modelId == modelId && $0.providerId == providerId
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .alert("Add Custom Model", isPresented: $showAddForm) {
            TextField("Model ID (e.g. gpt-4o)", text: $newModelId)
            TextField("Display Name (optional)", text: $newModelName)
            TextField("Context Length", text: $newContextLength)
                .keyboardType(.numberPad)
            Button("Add") {
                if !newModelId.isEmpty {
                    appState.settings.favoriteModels.append(FavoriteModel(
                        modelId: newModelId,
                        providerId: providerId,
                        contextLength: Int(newContextLength)
                    ))
                }
                newModelId = ""
                newModelName = ""
                newContextLength = ""
            }
            Button("Cancel", role: .cancel) {
                newModelId = ""
                newModelName = ""
                newContextLength = ""
            }
        }
    }
}

// MARK: - Provider Settings Form

struct ProviderSettingsFormView: View {
    let providerId: ProviderId
    @Environment(AppState.self) private var appState
    @State private var testResult: String?

    var body: some View {
        Form {
            Section("API Key") {
                SecureField("sk-...", text: apiKeyBinding)
            }

            Section("Endpoint") {
                TextField("https://...", text: endpointBinding)
                    .textContentType(.URL)
                    .autocapitalization(.none)
            }

            Section {
                if appState.settings.providers[providerId]?.apiKey != nil {
                    Button("Fetch Models (Test Connection)") {
                        Task {
                            await appState.settings.fetchModels(for: providerId, force: true)
                            let count = appState.settings.providerModelCache[providerId]?.count ?? 0
                            testResult = count > 0 ? "✅ Found \(count) models" : "❌ No models returned"
                        }
                    }

                    if let result = testResult {
                        Text(result)
                            .font(.caption)
                            .foregroundStyle(result.hasPrefix("✅") ? .green : .red)
                    }

                    Button("Clear API Key", role: .destructive) {
                        appState.settings.providers[providerId]?.apiKey = nil
                    }
                }
            }
        }
    }

    private var apiKeyBinding: Binding<String> {
        Binding(
            get: { appState.settings.providers[providerId]?.apiKey ?? "" },
            set: { newValue in
                ensureConfig()
                appState.settings.providers[providerId]?.apiKey = newValue.isEmpty ? nil : newValue
            }
        )
    }

    private var endpointBinding: Binding<String> {
        Binding(
            get: { appState.settings.providers[providerId]?.endpoint ?? defaultEndpoint },
            set: { newValue in
                ensureConfig()
                appState.settings.providers[providerId]?.endpoint = newValue
            }
        )
    }

    private func ensureConfig() {
        if appState.settings.providers[providerId] == nil {
            appState.settings.providers[providerId] = ProviderConfig(
                id: providerId,
                name: providerId.displayName,
                endpoint: defaultEndpoint
            )
        }
    }

    private var defaultEndpoint: String {
        switch providerId {
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
}
