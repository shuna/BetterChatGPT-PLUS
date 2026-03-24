import SwiftUI
import WeaveletDomain
import WeaveletInfra

/// Full model picker starting from provider list, with favorites at top.
/// Flow: Favorites → Provider List → Model List → Select
struct ModelPickerSheet: View {
    let onSelect: (String, ProviderId) -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                // Favorites section (quick select)
                if !appState.settings.favoriteModels.isEmpty {
                    Section("Favorites") {
                        let favorites = appState.settings.favoriteModels
                        ForEach(Array(favorites.enumerated()), id: \.offset) { _, fav in
                            Button {
                                onSelect(fav.modelId, fav.providerId)
                                dismiss()
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        HStack(spacing: 4) {
                                            Text(fav.modelId)
                                                .font(.body)
                                                .foregroundStyle(.primary)
                                                .lineLimit(1)
                                            capabilityIcons(
                                                reasoning: fav.supportsReasoning,
                                                vision: fav.supportsVision,
                                                audio: fav.supportsAudio
                                            )
                                        }
                                        HStack(spacing: 6) {
                                            Text(fav.providerId.displayName)
                                                .font(.caption)
                                            if let ctx = fav.contextLength {
                                                Text("• \(formatContext(ctx))")
                                                    .font(.caption)
                                            }
                                        }
                                        .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if appState.conversation.chat.config.model == fav.modelId {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(Color.accentColor)
                                            .font(.caption)
                                    }
                                }
                            }
                        }
                    }
                }

                // Provider list (drill down to models)
                Section("Providers") {
                    ForEach(ProviderId.allCases, id: \.self) { pid in
                        let hasKey = appState.settings.providers[pid]?.apiKey != nil
                        let noAuth = DefaultProviders.configs[pid]?.modelsRequireAuth == false
                        let modelCount = appState.settings.providerModelCache[pid]?.count ?? 0

                        NavigationLink {
                            ProviderModelListPage(providerId: pid, onSelect: { modelId in
                                onSelect(modelId, pid)
                                dismiss()
                            })
                            .environment(appState)
                        } label: {
                            HStack {
                                Image(systemName: hasKey ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(hasKey ? .green : Color(.systemGray4))
                                    .font(.caption)

                                Text(pid.displayName)

                                Spacer()

                                if modelCount > 0 {
                                    Text("\(modelCount)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Color(.systemGray5), in: Capsule())
                                } else if !hasKey && !noAuth {
                                    Text("No key")
                                        .font(.caption)
                                        .foregroundStyle(.tertiary)
                                }
                            }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Select Model")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
            .task { await preloadModels() }
        }
    }

    // MARK: - Helpers

    @ViewBuilder
    private func capabilityIcons(reasoning: Bool?, vision: Bool?, audio: Bool?) -> some View {
        HStack(spacing: 2) {
            if reasoning == true {
                Image(systemName: "brain").font(.system(size: 9)).foregroundStyle(.purple)
            }
            if vision == true {
                Image(systemName: "eye").font(.system(size: 9)).foregroundStyle(.blue)
            }
            if audio == true {
                Image(systemName: "waveform").font(.system(size: 9)).foregroundStyle(.green)
            }
        }
    }

    private func formatContext(_ tokens: Int) -> String {
        tokens >= 1_000_000 ? "\(tokens / 1_000_000)M ctx" : "\(tokens / 1000)K ctx"
    }

    private func preloadModels() async {
        await withTaskGroup(of: Void.self) { group in
            for pid in ProviderId.allCases {
                let hasKey = appState.settings.providers[pid]?.apiKey != nil
                let noAuth = DefaultProviders.configs[pid]?.modelsRequireAuth == false
                if hasKey || noAuth {
                    group.addTask { await appState.settings.fetchModels(for: pid) }
                }
            }
        }
    }
}

// MARK: - Provider Model List Page

/// Model list for a single provider, with search/sort/favorite toggle.
struct ProviderModelListPage: View {
    let providerId: ProviderId
    let onSelect: (String) -> Void

    @Environment(AppState.self) private var appState
    @State private var searchText = ""
    @State private var sortBy: SortField = .name
    @State private var isLoading = false

    enum SortField: String, CaseIterable {
        case name = "Name"
        case context = "Context"
        case cost = "Cost"
    }

    private var models: [ProviderModel] {
        var result = appState.settings.allModels(for: providerId)
        if !searchText.isEmpty {
            let q = searchText.lowercased()
            result = result.filter { $0.id.lowercased().contains(q) || $0.name.lowercased().contains(q) }
        }
        switch sortBy {
        case .name: result.sort { $0.id < $1.id }
        case .context: result.sort { ($0.contextLength ?? 0) > ($1.contextLength ?? 0) }
        case .cost: result.sort { ($0.promptPrice ?? 0) < ($1.promptPrice ?? 0) }
        }
        return result
    }

    var body: some View {
        VStack(spacing: 0) {
            // Sort picker
            Picker("Sort", selection: $sortBy) {
                ForEach(SortField.allCases, id: \.self) { f in Text(f.rawValue).tag(f) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.vertical, 6)

            if isLoading {
                ProgressView("Loading models...")
                    .frame(maxHeight: .infinity)
            } else if models.isEmpty {
                ContentUnavailableView(
                    searchText.isEmpty ? "No Models" : "No Results",
                    systemImage: "cpu",
                    description: Text(searchText.isEmpty
                        ? "Set an API key for \(providerId.displayName) to fetch models."
                        : "No models match \"\(searchText)\"")
                )
            } else {
                List(models) { model in
                    Button {
                        onSelect(model.id)
                    } label: {
                        HStack(spacing: 8) {
                            // Favorite checkbox
                            Button {
                                toggleFavorite(model)
                            } label: {
                                Image(systemName: isFavorite(model) ? "star.fill" : "star")
                                    .foregroundStyle(isFavorite(model) ? .yellow : .secondary)
                                    .font(.caption)
                            }
                            .buttonStyle(.plain)

                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 4) {
                                    Text(model.id)
                                        .font(.body)
                                        .foregroundStyle(.primary)
                                        .lineLimit(1)
                                    if model.supportsReasoning == true {
                                        Image(systemName: "brain").font(.system(size: 9)).foregroundStyle(.purple)
                                    }
                                    if model.supportsVision == true {
                                        Image(systemName: "eye").font(.system(size: 9)).foregroundStyle(.blue)
                                    }
                                }
                                HStack(spacing: 6) {
                                    if let ctx = model.contextLength {
                                        Text(ctx >= 1_000_000 ? "\(ctx / 1_000_000)M" : "\(ctx / 1000)K")
                                            .font(.caption)
                                    }
                                    if let p = model.promptPrice {
                                        Text("$\(String(format: "%.2f", p))/M in")
                                            .font(.caption)
                                    }
                                    if let p = model.completionPrice {
                                        Text("$\(String(format: "%.2f", p))/M out")
                                            .font(.caption)
                                    }
                                }
                                .foregroundStyle(.secondary)
                            }
                            Spacer()

                            if appState.conversation.chat.config.model == model.id {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(Color.accentColor)
                                    .font(.caption)
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .searchable(text: $searchText, prompt: "Search models...")
        .navigationTitle("\(providerId.displayName) Models")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task {
                        isLoading = true
                        await appState.settings.fetchModels(for: providerId, force: true)
                        isLoading = false
                    }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
            }
        }
        .task {
            isLoading = true
            await appState.settings.fetchModels(for: providerId)
            isLoading = false
        }
    }

    private func isFavorite(_ model: ProviderModel) -> Bool {
        appState.settings.favoriteModels.contains { $0.modelId == model.id && $0.providerId == providerId }
    }

    private func toggleFavorite(_ model: ProviderModel) {
        if let idx = appState.settings.favoriteModels.firstIndex(where: {
            $0.modelId == model.id && $0.providerId == providerId
        }) {
            appState.settings.favoriteModels.remove(at: idx)
        } else {
            appState.settings.favoriteModels.append(FavoriteModel(
                modelId: model.id, providerId: providerId,
                promptPrice: model.promptPrice,
                completionPrice: model.completionPrice,
                contextLength: model.contextLength,
                supportsReasoning: model.supportsReasoning,
                supportsVision: model.supportsVision,
                supportsAudio: model.supportsAudio
            ))
        }
    }
}
