import SwiftUI

// MARK: - ProviderMenuView

struct ProviderMenuView: View {
    var apiService: APIService
    @Bindable var settings: SettingsViewModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var sizeClass

    @State private var selectedProvider: ProviderId = .openrouter
    @State private var viewMode: ViewMode = .browse
    @State private var models: [ProviderModel] = []
    @State private var loading = false
    @State private var searchText = ""
    @State private var sortField: SortField = .alpha
    @State private var sortAscending = true

    // Provider settings
    @State private var apiKeyInput = ""
    @State private var endpointInput = ""
    @State private var showingKeyField = false

    enum ViewMode: String, CaseIterable {
        case browse = "Browse"
        case custom = "Custom"
    }

    enum SortField: String, CaseIterable {
        case alpha = "Name"
        case created = "Date"
        case context = "Context"
        case price = "Price"
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Provider picker
                providerPicker

                // Browse / Custom toggle
                Picker("Mode", selection: $viewMode) {
                    ForEach(ViewMode.allCases, id: \.self) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.vertical, 8)

                switch viewMode {
                case .browse:
                    browseView
                case .custom:
                    customModelsView
                }

                // Footer: provider settings
                Divider()
                providerSettingsBar
            }
            .navigationTitle("AI Providers")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .onChange(of: selectedProvider) {
                loadModels()
                loadProviderSettings()
            }
            .task {
                loadProviderSettings()
                loadModels()
            }
        }
    }

    // MARK: - Provider Picker

    private var providerPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(ProviderId.allCases, id: \.self) { provider in
                    Button {
                        selectedProvider = provider
                    } label: {
                        Text(provider.rawValue.capitalized)
                            .font(.subheadline.weight(selectedProvider == provider ? .semibold : .regular))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(
                                selectedProvider == provider
                                    ? Color.accentColor.opacity(0.15)
                                    : Color(.secondarySystemFill)
                            )
                            .foregroundStyle(selectedProvider == provider ? Color.accentColor : .primary)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
    }

    // MARK: - Browse View

    private var browseView: some View {
        VStack(spacing: 0) {
            // Search bar
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Search models…", text: $searchText)
                    .textFieldStyle(.plain)
                    .autocorrectionDisabled()
                if !searchText.isEmpty {
                    Button { searchText = "" } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
                Button {
                    loadModels()
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.subheadline)
                }
                .disabled(loading)
            }
            .padding(.horizontal)
            .padding(.vertical, 8)

            // Sort bar
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(SortField.allCases, id: \.self) { field in
                        Button {
                            if sortField == field {
                                sortAscending.toggle()
                            } else {
                                sortField = field
                                sortAscending = field == .alpha
                            }
                        } label: {
                            HStack(spacing: 2) {
                                Text(field.rawValue)
                                if sortField == field {
                                    Image(systemName: sortAscending ? "chevron.up" : "chevron.down")
                                        .font(.caption2)
                                }
                            }
                            .font(.caption.weight(sortField == field ? .semibold : .regular))
                            .foregroundStyle(sortField == field ? Color.accentColor : .secondary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal)
            }
            .padding(.bottom, 4)

            Divider()

            // Model list
            if loading {
                Spacer()
                ProgressView("Loading models…")
                Spacer()
            } else if filteredModels.isEmpty {
                Spacer()
                Text("No models found")
                    .foregroundStyle(.secondary)
                Spacer()
            } else {
                List {
                    ForEach(filteredModels) { model in
                        modelRow(model)
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
    }

    // MARK: - Custom Models View

    private var customModelsView: some View {
        List {
            let customIds = settings.customModelsFor(selectedProvider)
            if customIds.isEmpty {
                Text("No custom models for \(selectedProvider.rawValue.capitalized)")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(customIds, id: \.self) { modelId in
                    HStack {
                        Text(modelId)
                        Spacer()
                        if settings.isFavorite(modelId) {
                            Image(systemName: "star.fill")
                                .foregroundStyle(.yellow)
                                .font(.caption)
                        }
                    }
                    .swipeActions {
                        Button(role: .destructive) {
                            settings.removeCustomModel(modelId, for: selectedProvider)
                        } label: {
                            Label("Remove", systemImage: "trash")
                        }
                    }
                }
            }

            Section("Add Custom Model") {
                addCustomModelRow
            }
        }
        .listStyle(.insetGrouped)
    }

    @State private var newCustomModelId = ""

    private var addCustomModelRow: some View {
        HStack {
            TextField("Model ID", text: $newCustomModelId)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            Button {
                guard !newCustomModelId.isEmpty else { return }
                settings.addCustomModel(newCustomModelId, for: selectedProvider)
                newCustomModelId = ""
            } label: {
                Image(systemName: "plus.circle.fill")
            }
            .disabled(newCustomModelId.isEmpty)
        }
    }

    // MARK: - Model Row

    private func modelRow(_ model: ProviderModel) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(model.name)
                    .font(.subheadline)
                    .lineLimit(1)
                HStack(spacing: 8) {
                    if let ctx = model.contextLength {
                        Text("\(formatContextLength(ctx))")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    if let price = model.promptPrice {
                        Text("$\(formatPrice(price))/1K")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Spacer()
            CapabilityIcons(
                reasoning: model.supportsReasoning ?? false,
                vision: model.supportsVision ?? false,
                audio: model.supportsAudio ?? false,
                size: 13
            )
            // Favorite toggle
            Button {
                settings.toggleFavorite(model.id)
            } label: {
                Image(systemName: settings.isFavorite(model.id) ? "star.fill" : "star")
                    .foregroundStyle(settings.isFavorite(model.id) ? .yellow : .secondary)
                    .font(.subheadline)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Provider Settings Bar (fixed below toggle)

    private var providerSettingsBar: some View {
        VStack(spacing: 6) {
            HStack {
                Text("Endpoint")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                TextField("Endpoint URL", text: $endpointInput)
                    .multilineTextAlignment(.trailing)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            HStack {
                Text("API Key")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                if showingKeyField {
                    SecureField("API Key", text: $apiKeyInput)
                        .multilineTextAlignment(.trailing)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .font(.system(.caption, design: .monospaced))
                    Button("Save") {
                        if !apiKeyInput.isEmpty {
                            Task {
                                await apiService.setAPIKey(apiKeyInput, for: selectedProvider)
                            }
                        }
                        showingKeyField = false
                    }
                    .font(.caption)
                } else {
                    Text(apiKeyInput.isEmpty ? "Not set" : "••••••••")
                        .foregroundStyle(.secondary)
                        .font(.caption)
                    Button(apiKeyInput.isEmpty ? "Set" : "Edit") {
                        showingKeyField = true
                    }
                    .font(.caption)
                }
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
        .background(Color(.secondarySystemBackground))
    }

    // MARK: - Helpers

    private var filteredModels: [ProviderModel] {
        var result = models
        if !searchText.isEmpty {
            let query = searchText.lowercased()
            result = result.filter { $0.name.lowercased().contains(query) || $0.id.lowercased().contains(query) }
        }
        result.sort { a, b in
            let cmp: Bool
            switch sortField {
            case .alpha:
                cmp = a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
            case .created:
                cmp = (a.created ?? 0) < (b.created ?? 0)
            case .context:
                cmp = (a.contextLength ?? 0) < (b.contextLength ?? 0)
            case .price:
                cmp = (a.promptPrice ?? 0) < (b.promptPrice ?? 0)
            }
            return sortAscending ? cmp : !cmp
        }
        return result
    }

    private func loadModels() {
        loading = true
        Task {
            do {
                let fetched = try await apiService.fetchModels(for: selectedProvider)
                await MainActor.run {
                    models = fetched
                    loading = false
                }
            } catch {
                await MainActor.run {
                    models = []
                    loading = false
                }
            }
        }
    }

    private func loadProviderSettings() {
        showingKeyField = false
        Task {
            let config = await apiService.getProvider(selectedProvider)
            let key = await apiService.getAPIKey(for: selectedProvider)
            await MainActor.run {
                endpointInput = config?.endpoint ?? ""
                apiKeyInput = key ?? ""
            }
        }
    }

    private func formatContextLength(_ length: Int) -> String {
        if length >= 1_000_000 { return "\(length / 1_000_000)M ctx" }
        if length >= 1_000 { return "\(length / 1_000)K ctx" }
        return "\(length) ctx"
    }

    private func formatPrice(_ price: Double) -> String {
        if price < 0.0001 { return String(format: "%.6f", price) }
        return String(format: "%.4f", price)
    }
}
