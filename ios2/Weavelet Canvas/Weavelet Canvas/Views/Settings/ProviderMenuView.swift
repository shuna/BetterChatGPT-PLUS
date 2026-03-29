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
    @State private var loadError: Error?
    @State private var searchText = ""
    @State private var sortField: SortField = .alpha
    @State private var sortAscending = true
    @State private var filterReasoning = false
    @State private var filterVision = false
    @State private var filterAudio = false
    @State private var filterFree = false
    @State private var filterProviderName = ""
    @State private var filterSeriesName = ""

    // Provider settings
    @State private var apiKeyInput = ""
    @State private var endpointInput = ""
    @State private var savedEndpoint = ""
    @State private var savedAPIKey = ""
    @State private var hasSavedAPIKey = false
    @State private var endpointJustSaved = false
    @State private var apiKeyJustSaved = false
    @FocusState private var focusedField: ProviderSettingsField?

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

    enum ProviderSettingsField: Hashable {
        case endpoint
        case apiKey
    }

    var body: some View {
        NavigationStack {
            ZStack {
                AppColors.background.ignoresSafeArea()

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
            }
            .navigationTitle("AI Providers")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(AppColors.background, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .onChange(of: selectedProvider) {
                loadModels()
                loadProviderSettings()
            }
            .onChange(of: filterProviderName) {
                if !filterSeriesName.isEmpty && !availableSeriesNames.contains(filterSeriesName) {
                    filterSeriesName = ""
                }
            }
            .task {
                loadProviderSettings()
                loadModels()
            }
        }
        .presentationDetents([.large])
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

    /// Distinct provider prefixes extracted from loaded model IDs (e.g. "anthropic", "openai").
    private var availableProviderNames: [String] {
        let prefixes = Set(models.compactMap { model -> String? in
            let parts = model.id.split(separator: "/")
            return parts.count >= 2 ? String(parts[0]).lowercased() : nil
        })
        return prefixes.sorted()
    }

    /// Known model series keywords for filtering.
    private static let knownSeries = [
        "sonnet", "opus", "haiku", "claude",
        "gpt", "o1", "o3", "o4",
        "gemini", "gemma",
        "llama", "codellama",
        "mistral", "mixtral", "codestral",
        "nova", "titan",
        "codex", "command",
        "deepseek", "qwen", "phi",
        "dbrx", "jamba",
    ]

    /// Series names actually present in the current model list, filtered by selected provider.
    private var availableSeriesNames: [String] {
        let pool = filterProviderName.isEmpty
            ? models
            : models.filter { $0.id.lowercased().hasPrefix(filterProviderName + "/") }
        let names = Self.knownSeries.filter { series in
            pool.contains { $0.id.lowercased().contains(series) || $0.name.lowercased().contains(series) }
        }
        return names.sorted()
    }

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
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color(.systemBackground))
            .clipShape(Capsule())
            .padding(.horizontal)
            .padding(.top, 12)
            .padding(.bottom, 10)

            // Filter chips (wraps when narrow)
            ViewThatFits(in: .horizontal) {
                filterChipsContent
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        filterChip("dollarsign.circle", label: "Free", isOn: $filterFree)
                        filterChip("brain", label: "Reasoning", isOn: $filterReasoning)
                        filterChip("photo", label: "Vision", isOn: $filterVision)
                        filterChip("mic", label: "Audio", isOn: $filterAudio)
                    }
                    HStack(spacing: 6) {
                        if !availableProviderNames.isEmpty {
                            filterDropdown(
                                icon: "building.2",
                                label: "Provider",
                                selection: filterProviderName,
                                options: availableProviderNames
                            ) { name in
                                filterProviderName = filterProviderName == name ? "" : name
                            } clear: {
                                filterProviderName = ""
                            }
                        }
                        if !availableSeriesNames.isEmpty {
                            filterDropdown(
                                icon: "cpu",
                                label: "Series",
                                selection: filterSeriesName,
                                options: availableSeriesNames
                            ) { name in
                                filterSeriesName = filterSeriesName == name ? "" : name
                            } clear: {
                                filterSeriesName = ""
                            }
                        }
                    }
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 12)
            // Model list header (always visible)
            modelListHeader
                .padding(.horizontal)
                .padding(.vertical, 8)
                .background(AppColors.background)

            Divider()

            // Model list
            if loading {
                Spacer()
                ProgressView("Loading models…")
                Spacer()
            } else if models.isEmpty, let error = loadError {
                Spacer()
                if error is APIError, case .noAPIKey = error as! APIError {
                    VStack(spacing: 8) {
                        Image(systemName: "key")
                            .font(.title2)
                            .foregroundStyle(.secondary)
                        Text("Enter an API key below to load\navailable models from \(selectedProvider.rawValue.capitalized)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                } else {
                    Text("Failed to load models")
                        .foregroundStyle(.secondary)
                }
                Spacer()
            } else if filteredModels.isEmpty {
                Spacer()
                Text("No models found")
                    .foregroundStyle(.secondary)
                Spacer()
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(filteredModels) { model in
                            modelRow(model)
                                .padding(.horizontal)
                                .padding(.vertical, 8)
                            Divider()
                                .padding(.leading)
                        }
                    }
                }
            }
        }
    }

    private var modelListHeader: some View {
        ZStack {
            // Center: model count
            Text("\(filteredModels.count) models")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            HStack {
                // Sort (left)
                sortPicker

                Spacer()

                // Refresh (right)
                Button {
                    loadModels()
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.subheadline)
                }
                .disabled(loading)
            }
        }
    }

    private var sortPicker: some View {
        Menu {
            ForEach(SortField.allCases, id: \.self) { field in
                Button {
                    if sortField == field {
                        sortAscending.toggle()
                    } else {
                        sortField = field
                        sortAscending = true
                    }
                } label: {
                    Label {
                        Text(field.rawValue)
                    } icon: {
                        if sortField == field {
                            Image(systemName: sortAscending ? "chevron.up" : "chevron.down")
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "arrow.up.arrow.down")
                Text(sortField.rawValue)
                Image(systemName: sortAscending ? "chevron.up" : "chevron.down")
                    .font(.system(size: 10, weight: .semibold))
            }
            .font(.subheadline)
        }
    }

    private func filterDropdown(icon: String, label: String, selection: String, options: [String], select: @escaping (String) -> Void, clear: @escaping () -> Void) -> some View {
        Menu {
            Button {
                clear()
            } label: {
                HStack {
                    Text("All")
                    if selection.isEmpty {
                        Image(systemName: "checkmark")
                    }
                }
            }
            Divider()
            ForEach(options, id: \.self) { name in
                Button {
                    select(name)
                } label: {
                    HStack {
                        Text(name.capitalized)
                        if selection == name {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.caption2)
                Text(selection.isEmpty ? label : selection.capitalized)
                    .font(.caption)
                Image(systemName: "chevron.down")
                    .font(.system(size: 8, weight: .semibold))
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(!selection.isEmpty ? Color.accentColor.opacity(0.15) : Color(.tertiarySystemFill))
            .foregroundStyle(!selection.isEmpty ? Color.accentColor : .secondary)
            .clipShape(Capsule())
        }
    }

    private var filterChipsContent: some View {
        HStack(spacing: 6) {
            filterChip("dollarsign.circle", label: "Free", isOn: $filterFree)
            filterChip("brain", label: "Reasoning", isOn: $filterReasoning)
            filterChip("photo", label: "Vision", isOn: $filterVision)
            filterChip("mic", label: "Audio", isOn: $filterAudio)

            if !availableProviderNames.isEmpty {
                filterDropdown(
                    icon: "building.2",
                    label: "Provider",
                    selection: filterProviderName,
                    options: availableProviderNames
                ) { name in
                    filterProviderName = filterProviderName == name ? "" : name
                } clear: {
                    filterProviderName = ""
                }
            }

            if !availableSeriesNames.isEmpty {
                filterDropdown(
                    icon: "cpu",
                    label: "Series",
                    selection: filterSeriesName,
                    options: availableSeriesNames
                ) { name in
                    filterSeriesName = filterSeriesName == name ? "" : name
                } clear: {
                    filterSeriesName = ""
                }
            }
        }
    }

    private func filterChip(_ icon: String, label: String, isOn: Binding<Bool>) -> some View {
        Button {
            isOn.wrappedValue.toggle()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.caption2)
                Text(label)
                    .font(.caption)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(isOn.wrappedValue ? Color.accentColor.opacity(0.15) : Color(.tertiarySystemFill))
            .foregroundStyle(isOn.wrappedValue ? Color.accentColor : .secondary)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Custom Models View

    @State private var isEditingCustomModels = false

    private var customModelsView: some View {
        List {
            Section {
                let customModels = settings.customModelsFor(selectedProvider)
                if customModels.isEmpty {
                    Text("No custom models for \(selectedProvider.rawValue.capitalized)")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(customModels) { model in
                        modelRow(model)
                            .swipeActions {
                                Button(role: .destructive) {
                                    settings.removeCustomModel(model.id, for: selectedProvider)
                                } label: {
                                    Label("Remove", systemImage: "trash")
                                }
                            }
                    }
                    .onDelete { indexSet in
                        let customModels = settings.customModelsFor(selectedProvider)
                        for index in indexSet {
                            settings.removeCustomModel(customModels[index].id, for: selectedProvider)
                        }
                    }
                }
            } header: {
                HStack {
                    Text("Custom Models")
                    Spacer()
                    if !settings.customModelsFor(selectedProvider).isEmpty {
                        Button(isEditingCustomModels ? "Done" : "Edit") {
                            withAnimation {
                                isEditingCustomModels.toggle()
                            }
                        }
                        .font(.subheadline)
                        .textCase(nil)
                    }
                }
            }

            Section("Add Custom Model") {
                addCustomModelSection
            }
        }
        .listStyle(.insetGrouped)
        .environment(\.editMode, .constant(isEditingCustomModels ? .active : .inactive))
    }

    // MARK: - Add Custom Model Form

    @State private var newCustomModelId = ""
    @State private var newCustomModelName = ""
    @State private var newCustomContextLength = "4096"
    @State private var newCustomPromptPrice = ""
    @State private var newCustomCompletionPrice = ""
    @State private var newCustomReasoning = false
    @State private var newCustomVision = false
    @State private var newCustomAudio = false
    @State private var capabilitiesManuallyEdited = false

    private var addCustomModelSection: some View {
        Group {
            HStack {
                TextField("Model ID", text: $newCustomModelId)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .onChange(of: newCustomModelId) {
                        guard !capabilitiesManuallyEdited else { return }
                        let id = newCustomModelId.trimmingCharacters(in: .whitespacesAndNewlines)
                        newCustomReasoning = APIService.isReasoningModel(id)
                        newCustomVision = APIService.isVisionModel(id)
                        newCustomAudio = APIService.isAudioModel(id)
                    }
                Button {
                    addCustomModel()
                } label: {
                    Image(systemName: "plus.circle.fill")
                }
                .disabled(newCustomModelId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            TextField("Display Name", text: $newCustomModelName)
                .autocorrectionDisabled()
            HStack {
                Text("Context")
                    .foregroundStyle(.secondary)
                    .font(.subheadline)
                Spacer()
                TextField("4096", text: $newCustomContextLength)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 80)
                Text("tokens")
                    .foregroundStyle(.secondary)
                    .font(.subheadline)
            }
            HStack {
                Text("$/1K in")
                    .foregroundStyle(.secondary)
                    .font(.subheadline)
                Spacer()
                TextField("0", text: $newCustomPromptPrice)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 100)
            }
            HStack {
                Text("$/1K out")
                    .foregroundStyle(.secondary)
                    .font(.subheadline)
                Spacer()
                TextField("0", text: $newCustomCompletionPrice)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 100)
            }
            HStack(spacing: 16) {
                capabilityToggle("brain", label: "Reasoning", isOn: $newCustomReasoning)
                capabilityToggle("photo", label: "Vision", isOn: $newCustomVision)
                capabilityToggle("mic", label: "Audio", isOn: $newCustomAudio)
            }
        }
    }

    private func capabilityToggle(_ icon: String, label: String, isOn: Binding<Bool>) -> some View {
        Button {
            isOn.wrappedValue.toggle()
            capabilitiesManuallyEdited = true
        } label: {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.caption)
                Text(label)
                    .font(.caption)
            }
            .foregroundStyle(isOn.wrappedValue ? Color.accentColor : .secondary)
        }
        .buttonStyle(.plain)
    }

    private func addCustomModel() {
        let id = newCustomModelId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty else { return }
        let name = newCustomModelName.trimmingCharacters(in: .whitespacesAndNewlines)

        let model = ProviderModel(
            id: id,
            name: name.isEmpty ? id : name,
            providerId: selectedProvider,
            contextLength: Int(newCustomContextLength) ?? 4096,
            promptPrice: Double(newCustomPromptPrice) ?? 0,
            completionPrice: Double(newCustomCompletionPrice) ?? 0,
            supportsReasoning: newCustomReasoning,
            supportsVision: newCustomVision,
            supportsAudio: newCustomAudio
        )
        settings.addCustomModel(model, for: selectedProvider)

        // Reset form
        newCustomModelId = ""
        newCustomModelName = ""
        newCustomContextLength = "4096"
        newCustomPromptPrice = ""
        newCustomCompletionPrice = ""
        newCustomReasoning = false
        newCustomVision = false
        newCustomAudio = false
        capabilitiesManuallyEdited = false
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
                settings.toggleFavorite(model.id, providerId: model.providerId)
            } label: {
                Image(systemName: settings.isFavorite(model.id, providerId: model.providerId) ? "star.fill" : "star")
                    .foregroundStyle(settings.isFavorite(model.id, providerId: model.providerId) ? .yellow : .secondary)
                    .font(.subheadline)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Provider Settings Bar (fixed below toggle)

    private var providerSettingsBar: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("PROVIDER API ENDPOINT & API KEY")
                .font(.footnote)
                .foregroundStyle(.secondary)

            VStack(spacing: 0) {
                // Endpoint row
                HStack {
                    TextField("Provider API Endpoint...", text: $endpointInput)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .focused($focusedField, equals: .endpoint)
                        .onSubmit {
                            persistEndpointIfNeeded()
                        }
                    Button {
                        persistEndpointIfNeeded()
                    } label: {
                        if endpointJustSaved {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        } else {
                            Image(systemName: "plus.circle.fill")
                                .foregroundStyle(isEndpointDirty ? Color.accentColor : Color.secondary)
                        }
                    }
                    .disabled(!isEndpointDirty && !endpointJustSaved)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .onChange(of: endpointInput) {
                    endpointJustSaved = trimmedEndpointInput == savedEndpoint && !savedEndpoint.isEmpty
                }

                Divider()
                    .padding(.leading, 14)

                // API Key row
                HStack {
                    SecureField("API Key...", text: $apiKeyInput)
                        .font(.body)
                        .focused($focusedField, equals: .apiKey)
                        .onSubmit {
                            persistAPIKeyIfNeeded()
                        }
                    Button {
                        persistAPIKeyIfNeeded()
                    } label: {
                        if apiKeyJustSaved {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        } else {
                            Image(systemName: "plus.circle.fill")
                                .foregroundStyle(isAPIKeyDirty ? Color.accentColor : Color.secondary)
                        }
                    }
                    .disabled(!isAPIKeyDirty && !apiKeyJustSaved)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .onChange(of: apiKeyInput) {
                    apiKeyJustSaved = trimmedAPIKeyInput == savedAPIKey && !savedAPIKey.isEmpty
                }
            }
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
        .background(AppColors.background)
        .onChange(of: focusedField) { _, newValue in
            if newValue != .endpoint {
                persistEndpointIfNeeded()
            }
            if newValue != .apiKey {
                persistAPIKeyIfNeeded()
            }
        }
    }

    // MARK: - Helpers

    private var filteredModels: [ProviderModel] {
        var result = models

        // Text search
        if !searchText.isEmpty {
            let query = searchText.lowercased().trimmingCharacters(in: .whitespaces)
            result = result.filter { $0.name.lowercased().contains(query) || $0.id.lowercased().contains(query) }
        }

        // Free filter
        if filterFree {
            result = result.filter { ($0.promptPrice ?? 1) == 0 || $0.name.lowercased().contains("free") || $0.id.lowercased().contains("free") }
        }

        // Provider name filter (e.g. "anthropic" matches "anthropic/claude-3.5-sonnet")
        if !filterProviderName.isEmpty {
            result = result.filter { $0.id.lowercased().hasPrefix(filterProviderName + "/") }
        }

        // Series name filter
        if !filterSeriesName.isEmpty {
            result = result.filter { $0.id.lowercased().contains(filterSeriesName) || $0.name.lowercased().contains(filterSeriesName) }
        }

        // Capability filters
        if filterReasoning {
            result = result.filter { $0.supportsReasoning == true }
        }
        if filterVision {
            result = result.filter { $0.supportsVision == true }
        }
        if filterAudio {
            result = result.filter { $0.supportsAudio == true }
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
        loadError = nil
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
                    loadError = error
                    loading = false
                }
            }
        }
    }

    private func loadProviderSettings() {
        Task {
            let config = await apiService.getProvider(selectedProvider)
            let key = await apiService.getAPIKey(for: selectedProvider)
            await MainActor.run {
                endpointInput = config?.endpoint ?? ""
                savedEndpoint = endpointInput
                apiKeyInput = key ?? ""
                savedAPIKey = key ?? ""
                hasSavedAPIKey = !(key ?? "").isEmpty
                endpointJustSaved = false
                apiKeyJustSaved = false
                focusedField = nil
            }
        }
    }

    private var trimmedEndpointInput: String {
        endpointInput.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var trimmedAPIKeyInput: String {
        apiKeyInput.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var isEndpointDirty: Bool {
        !trimmedEndpointInput.isEmpty && trimmedEndpointInput != savedEndpoint
    }

    private var isAPIKeyDirty: Bool {
        !trimmedAPIKeyInput.isEmpty && (!hasSavedAPIKey || trimmedAPIKeyInput != savedAPIKey)
    }

    private func persistEndpointIfNeeded() {
        let endpoint = trimmedEndpointInput
        guard !endpoint.isEmpty, endpoint != savedEndpoint else { return }

        Task {
            guard var config = await apiService.getProvider(selectedProvider) else { return }
            config.endpoint = endpoint
            await apiService.updateProvider(config)
            await MainActor.run {
                endpointInput = endpoint
                savedEndpoint = endpoint
                endpointJustSaved = true
            }
        }
    }

    private func persistAPIKeyIfNeeded() {
        let key = trimmedAPIKeyInput
        guard !key.isEmpty, key != savedAPIKey else { return }

        Task {
            await apiService.setAPIKey(key, for: selectedProvider)
            await MainActor.run {
                apiKeyInput = key
                savedAPIKey = key
                hasSavedAPIKey = true
                apiKeyJustSaved = true
            }
        }
    }

    private func formatContextLength(_ length: Int) -> String {
        if length >= 1_000_000 { return "\(length / 1_000_000)M ctx" }
        if length >= 1_000 { return "\(length / 1_000)K ctx" }
        return "\(length) ctx"
    }

    private func formatPrice(_ price: Double) -> String {
        if price == 0 { return "0" }
        if price < 0.0001 { return String(format: "%.6f", price) }
        return String(format: "%.4f", price)
    }
}


