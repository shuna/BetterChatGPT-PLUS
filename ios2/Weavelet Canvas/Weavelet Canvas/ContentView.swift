//
//  ContentView.swift
//  Weavelet Canvas
//
//  Created by suzuki on 2026/03/26.
//

import SwiftUI

struct ContentView: View {
    @State private var threeColumnState: ThreeColumnState = {
        let s = ThreeColumnState()
        s.showsDefaultInspectorButton = false
        return s
    }()
    @State private var sidebarState = SidebarState()
    var chatViewModel: ChatViewModel
    var settings: SettingsViewModel

    var body: some View {
        ThreePaneView(
            state: threeColumnState,
            Sidebar: {
                SidebarView(state: sidebarState, chatViewModel: chatViewModel, settings: settings)
            },
            Detail: {
                ChatDetailView(viewModel: chatViewModel)
            },
            sidebarToolbarCenter: { _, _ in
                EmptyView()
            },
            sidebarToolbarTrailing: { [sidebarState, chatViewModel] _, _ in
                SidebarToolbarTrailing(state: sidebarState, chatViewModel: chatViewModel, settings: settings)
            },
            detailToolbarLeading: { [chatViewModel] _, _ in
                DetailToolbarLeading(viewModel: chatViewModel)
            },
            detailToolbarCenter: { [chatViewModel] _, _ in
                DetailCenterToolbar(viewModel: chatViewModel, settings: settings)
            },
            detailToolbarTrailing: { [chatViewModel, threeColumnState] _, _ in
                DetailToolbarTrailing(viewModel: chatViewModel, threeColumnState: threeColumnState, settings: settings)
            },
            inspectorToolbarCenter: { [chatViewModel] _, _ in
                InspectorCenterToolbar(viewModel: chatViewModel, settings: settings)
            },
            inspectorToolbarTrailing: { [chatViewModel, threeColumnState] _, _ in
                InspectorToolbarTrailing(viewModel: chatViewModel, threeColumnState: threeColumnState, settings: settings)
            },
            inspectorContent: { [chatViewModel] in
                InspectorContentView(viewModel: chatViewModel)
            }
        )
        .threeColumnNavigationTitles(
            ThreeColumnNavigationTitles(
                sidebar: "Chats",
                detail: "Weavelet Canvas",
                inspector: ""
            )
        )
        .sheet(item: Binding(
            get: { chatViewModel.exportedFileURL.map { IdentifiableURL(url: $0) } },
            set: { chatViewModel.exportedFileURL = $0?.url }
        )) { item in
            ShareSheet(items: [item.url])
        }
        .environment(\.splitPanelSwapped, settings.splitPanelSwapped)
        .onChange(of: settings.splitPanelRatio) { _, newRatio in
            if !threeColumnState.inspectorWidthUserSet {
                // Will be applied on next geometry change via the auto-sizing logic
                // Store as a hint for ThreeColumnState
                threeColumnState.defaultRatio = newRatio
            }
        }
        .onAppear {
            threeColumnState.defaultRatio = settings.splitPanelRatio
            chatViewModel.loadFetchedModels()
        }
    }
}

private struct IdentifiableURL: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

private struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

private struct SidebarToolbarTrailing: View {
    @Bindable var state: SidebarState
    var chatViewModel: ChatViewModel
    var settings: SettingsViewModel

    var body: some View {
        HStack(spacing: 12) {
            if state.isEditing {
                // Edit mode: delete + done
                Button(role: .destructive) {
                    for id in state.selectedChatIDs {
                        chatViewModel.deleteChat(id)
                    }
                    state.selectedChatIDs.removeAll()
                } label: {
                    Image(systemName: "trash")
                }
                .disabled(state.selectedChatIDs.isEmpty)
                .accessibilityLabel("Delete Selected")

                Button("Done") {
                    state.toggleEditMode()
                }
                .fontWeight(.semibold)
            } else {
                // Normal mode: show folder + new chat + edit
                Button {
                    chatViewModel.createFolder()
                } label: {
                    Image(systemName: "folder.badge.plus")
                }
                .accessibilityLabel("New Folder")

                Button {
                    chatViewModel.createNewChat(
                        config: settings.defaultChatConfig,
                        systemMessage: settings.defaultSystemMessage
                    )
                } label: {
                    Image(systemName: "square.and.pencil")
                }
                .accessibilityLabel("New Chat")

                Button("Edit") {
                    state.toggleEditMode()
                }
            }
        }
    }
}

// MARK: - Model Selector (with capability icons)

// MARK: - Capability Icons

struct CapabilityIcons: View {
    let reasoning: Bool
    let vision: Bool
    let audio: Bool
    var size: CGFloat = 11

    var body: some View {
        HStack(spacing: 3) {
            capabilityIcon("brain", enabled: reasoning)
            capabilityIcon("photo", enabled: vision)
            capabilityIcon("mic", enabled: audio)
        }
        .font(.system(size: size))
    }

    private func capabilityIcon(_ name: String, enabled: Bool) -> some View {
        Image(systemName: name)
            .foregroundStyle(enabled ? .primary : .quaternary)
            .overlay {
                if !enabled {
                    // Diagonal strikethrough line
                    Image(systemName: "line.diagonal")
                        .font(.system(size: size * 0.9))
                        .foregroundStyle(.quaternary)
                }
            }
    }
}

private struct ModelSelectorButton: View {
    @Bindable var viewModel: ChatViewModel
    var settings: SettingsViewModel?
    var showModelSettingsEntry: Bool = false
    @State private var showPicker = false
    @State private var showProviderMenu = false
    @State private var showModelSettings = false

    var body: some View {
        Button {
            showPicker.toggle()
        } label: {
            HStack(spacing: 5) {
                Text(viewModel.selectedModelID.isEmpty ? "Select a model" : viewModel.selectedModelID)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.caption2.weight(.semibold))
            }
            .foregroundStyle(.primary)
        }
        .popover(isPresented: $showPicker, arrowEdge: .top) {
            ModelPickerList(viewModel: viewModel, showPicker: $showPicker, showProviderMenu: $showProviderMenu, showModelSettingsEntry: showModelSettingsEntry, showModelSettings: $showModelSettings)
                .presentationCompactAdaptation(.popover)
        }
        .sheet(isPresented: $showProviderMenu) {
            if let settings {
                ProviderMenuView(apiService: viewModel.apiService, settings: settings)
            }
        }
        .sheet(isPresented: $showModelSettings) {
            ModelSettingsSheet(viewModel: viewModel, settings: settings)
        }
    }
}

private struct ModelPickerList: View {
    var viewModel: ChatViewModel
    @Binding var showPicker: Bool
    @Binding var showProviderMenu: Bool
    var showModelSettingsEntry: Bool = false
    @Binding var showModelSettings: Bool

    private var favorites: [FavoriteModel] {
        viewModel.settings?.favoriteModelIDs ?? []
    }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(favorites.enumerated()), id: \.element) { index, fav in
                let model = viewModel.resolveModel(fav.modelId, providerId: fav.providerId)
                Button {
                    viewModel.setSelectedModel(fav.modelId, providerId: fav.providerId)
                    showPicker = false
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(viewModel.selectedModelID == fav.modelId && viewModel.selectedProviderId == fav.providerId ? Color.primary : .clear)
                            .frame(width: 16)
                        Text(model?.name ?? fav.modelId)
                            .foregroundStyle(.primary)
                        Spacer()
                        if let model {
                            CapabilityIcons(
                                reasoning: model.supportsReasoning ?? false,
                                vision: model.supportsVision ?? false,
                                audio: model.supportsAudio ?? false
                            )
                        }
                    }
                    .font(.subheadline)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                if index < favorites.count - 1 {
                    Divider().padding(.leading, 42)
                }
            }

            if !favorites.isEmpty {
                Divider()
            }

            Button {
                showPicker = false
                showProviderMenu = true
            } label: {
                HStack {
                    Image(systemName: "square.grid.2x2")
                        .frame(width: 16)
                    Text("Browse All Models")
                    Spacer()
                }
                .font(.subheadline)
                .foregroundStyle(Color.accentColor)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if showModelSettingsEntry {
                Divider()

                Button {
                    showPicker = false
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        showModelSettings = true
                    }
                } label: {
                    HStack {
                        Image(systemName: "slider.horizontal.3")
                            .frame(width: 16)
                        Text("Model Settings")
                        Spacer()
                    }
                    .font(.subheadline)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 4)
        .frame(minWidth: 320)
    }
}

// MARK: - Detail Toolbar Leading (back/forward + streaming indicator)

private struct DetailToolbarLeading: View {
    @Bindable var viewModel: ChatViewModel
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        if horizontalSizeClass == .compact {
            // Compact: only streaming indicator, no back/forward (moved to branch editor)
            if viewModel.isGenerating {
                ProgressView()
                    .controlSize(.small)
            }
        } else {
            HStack(spacing: 8) {
                Button {
                    viewModel.goBack()
                } label: {
                    Image(systemName: "chevron.left")
                }
                .disabled(!viewModel.canGoBack)
                .accessibilityLabel("Back")

                Button {
                    viewModel.goForward()
                } label: {
                    Image(systemName: "chevron.right")
                }
                .disabled(!viewModel.canGoForward)
                .accessibilityLabel("Forward")

                if viewModel.isGenerating {
                    ProgressView()
                        .controlSize(.small)
                }
            }
        }
    }
}

// MARK: - Detail Center Toolbar

private struct DetailCenterToolbar: View {
    @Bindable var viewModel: ChatViewModel
    var settings: SettingsViewModel?
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        switch viewModel.viewMode {
        case .chat:
            ModelSelectorButton(viewModel: viewModel, settings: settings, showModelSettingsEntry: horizontalSizeClass == .compact)
        case .branchEditor:
            Text("Branch Editor")
                .font(.headline)
        }
    }
}

// MARK: - Detail Toolbar Trailing (search + unified view/inspector menu)

private struct DetailToolbarTrailing: View {
    @Bindable var viewModel: ChatViewModel
    @Bindable var threeColumnState: ThreeColumnState
    var settings: SettingsViewModel?
    @State private var showModelSettings = false
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        HStack(spacing: 8) {
            // Model settings (chat view only, hidden on compact — moved to model dropdown)
            if viewModel.viewMode == .chat && horizontalSizeClass != .compact {
                Button {
                    showModelSettings = true
                } label: {
                    Image(systemName: "slider.horizontal.3")
                }
                .accessibilityLabel("Model Settings")
            }

            // Search (always)
            Button {
                viewModel.isSearching.toggle()
            } label: {
                Image(systemName: "magnifyingglass")
            }
            .accessibilityLabel("Search")

            // Inspector toggle — always show on compact (sheets don't obscure toolbar)
            if horizontalSizeClass == .compact || !threeColumnState.inspectorPresented {
                Button {
                    withAnimation(.spring(duration: 0.3, bounce: 0.0)) {
                        threeColumnState.inspectorPresented = true
                    }
                } label: {
                    Image(systemName: "sidebar.trailing")
                        .font(.body)
                }
                .accessibilityLabel("Show \(viewModel.viewMode.opposite.label)")
            }
        }
        .sheet(isPresented: $showModelSettings) {
            ModelSettingsSheet(viewModel: viewModel, settings: settings)
        }
    }
}

// MARK: - Inspector Center Toolbar

// MARK: - Inspector Toolbar Trailing (hide + swap menu)

private struct InspectorToolbarTrailing: View {
    @Bindable var viewModel: ChatViewModel
    @Bindable var threeColumnState: ThreeColumnState
    var settings: SettingsViewModel?
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    /// The view shown in the inspector is the opposite of viewMode
    private var inspectorShowsChat: Bool { viewModel.viewMode == .branchEditor }

    @State private var showModelSettings = false

    var body: some View {
        HStack(spacing: 8) {
            if horizontalSizeClass != .compact {
                // Model settings (only when inspector shows chat, not on compact)
                if inspectorShowsChat {
                    Button {
                        showModelSettings = true
                    } label: {
                        Image(systemName: "slider.horizontal.3")
                    }
                    .accessibilityLabel("Model Settings")
                }

                // Search
                Button {
                    if inspectorShowsChat {
                        viewModel.isSearching.toggle()
                    } else {
                        viewModel.branchEditorSearchRequested.toggle()
                    }
                } label: {
                    Image(systemName: "magnifyingglass")
                }
                .accessibilityLabel("Search")
            } else {
                // Compact: branch editor search only
                Button {
                    viewModel.branchEditorSearchRequested.toggle()
                } label: {
                    Image(systemName: "magnifyingglass")
                }
                .accessibilityLabel("Search")
            }

            // Hide/Swap menu — on iPhone, no options button (branch editor is always inspector)
            if horizontalSizeClass == .compact {
                // No menu on compact — swap is disabled, inspector is always branch editor
                EmptyView()
            } else {
                Menu {
                    Button {
                        withAnimation(.spring(duration: 0.3, bounce: 0.0)) {
                            threeColumnState.inspectorPresented = false
                        }
                    } label: {
                        Label("Hide \(viewModel.viewMode.opposite.label)", systemImage: "sidebar.trailing")
                    }

                    Divider()

                    Button {
                        viewModel.viewMode = viewModel.viewMode.opposite
                    } label: {
                        Label("Swap Panels", systemImage: "arrow.left.arrow.right")
                    }
                } label: {
                    Image(systemName: "sidebar.trailing")
                        .font(.body)
                }
            }
        }
        .sheet(isPresented: $showModelSettings) {
            ModelSettingsSheet(viewModel: viewModel, settings: settings)
        }
    }
}

private struct InspectorCenterToolbar: View {
    @Bindable var viewModel: ChatViewModel
    var settings: SettingsViewModel?
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        if horizontalSizeClass == .compact {
            // iPhone: inspector is always branch editor
            Text("Branch Editor")
                .font(.headline)
        } else {
            switch viewModel.viewMode {
            case .chat:
                Text("Branch Editor")
                    .font(.headline)
            case .branchEditor:
                ModelSelectorButton(viewModel: viewModel, settings: settings)
            }
        }
    }
}

// MARK: - Inspector Content

private struct InspectorContentView: View {
    @Bindable var viewModel: ChatViewModel
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        Group {
            if horizontalSizeClass == .compact {
                // iPhone: always show branch editor in inspector
                BranchEditorView(chatViewModel: viewModel, showNavButtons: true)
            } else {
                switch viewModel.viewMode {
                case .chat:
                    BranchEditorView(chatViewModel: viewModel)
                case .branchEditor:
                    ChatDetailView(viewModel: viewModel, forceChat: true)
                }
            }
        }
    }
}

// MARK: - Model Settings Sheet

private struct ModelSettingsSheet: View {
    @Bindable var viewModel: ChatViewModel
    var settings: SettingsViewModel?
    @Environment(\.dismiss) private var dismiss
    @State private var allModels: [ProviderId: [ProviderModel]] = [:]
    @State private var loading = false
    @State private var showProviderMenu = false

    private var configBinding: Binding<ChatConfig> {
        Binding(
            get: {
                guard let idx = viewModel.currentChatIndex else {
                    return ChatConfig(model: "", maxTokens: 4096, temperature: 1.0,
                                      presencePenalty: 0, topP: 1, frequencyPenalty: 0)
                }
                return viewModel.chats[idx].config
            },
            set: { newValue in
                guard let idx = viewModel.currentChatIndex else { return }
                viewModel.chats[idx].config = newValue
                viewModel.scheduleSave()
            }
        )
    }

    /// All favorite models resolved via Browse-first, custom-fallback.
    private var favoriteModels: [ProviderModel] {
        guard let settings else { return [] }
        return settings.favoriteModelIDs.compactMap { fav in
            viewModel.resolveModel(fav.modelId, providerId: fav.providerId)
        }
    }

    /// Favorite entries that couldn't be resolved from either fetched or custom models.
    private var unmatchedFavoriteIDs: [FavoriteModel] {
        guard let settings else { return [] }
        return settings.favoriteModelIDs.filter { viewModel.resolveModel($0.modelId, providerId: $0.providerId) == nil }
    }

    /// Whether the currently selected model supports reasoning.
    /// Browse (fetched) data takes priority over custom model metadata.
    private var reasoningSupported: Bool {
        let modelId = viewModel.selectedModelID
        let providerId = configBinding.wrappedValue.providerId
        // Check resolved model (Browse priority, custom fallback)
        if let model = viewModel.resolveModel(modelId, providerId: providerId) {
            return model.supportsReasoning == true
        }
        // Heuristic detection for models not in metadata (e.g. Opus)
        return Self.isReasoningModel(modelId, providerId: providerId)
    }

    private var isOpenRouter: Bool {
        configBinding.wrappedValue.providerId == .openrouter
    }

    private var verbositySupported: Bool {
        isOpenRouter && viewModel.selectedModelID.lowercased().contains("claude")
    }

    /// Port of web's reasoning model detection heuristics
    static func isReasoningModel(_ modelId: String, providerId: ProviderId?) -> Bool {
        let id = modelId.lowercased()
        // OpenAI o-series
        if id.range(of: #"(?:^|[-/])o[134](?:$|[-/])"#, options: .regularExpression) != nil { return true }
        // DeepSeek reasoning
        if id.contains("deepseek-r1") || id.contains("deepseek-reasoner") || id.contains("qwq") { return true }
        // Claude thinking models
        if id.contains("claude") && id.contains("thinking") { return true }
        // Claude 3.7+ and Claude 4+
        if id.range(of: #"claude-(?:3\.7|4(?:\.\d+)?)(?:$|[-/:])"#, options: .regularExpression) != nil { return true }
        if id.range(of: #"claude-(?:sonnet|opus)-4(?:\.\d+)?(?:$|[-/:])"#, options: .regularExpression) != nil { return true }
        return false
    }

    var body: some View {
        NavigationStack {
            Form {
                // Model Selection
                Section {
                    if loading {
                        HStack {
                            Spacer()
                            ProgressView()
                            Spacer()
                        }
                    } else if favoriteModels.isEmpty && unmatchedFavoriteIDs.isEmpty {
                        Text("No favorites yet.\nAdd favorites from Browse All Models.")
                            .foregroundStyle(.secondary)
                            .font(.subheadline)
                    } else {
                        ForEach(favoriteModels, id: \.self) { model in
                            Button {
                                viewModel.setSelectedModel(model.id, providerId: model.providerId)
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 12, weight: .semibold))
                                        .foregroundStyle(viewModel.selectedModelID == model.id && viewModel.selectedProviderId == model.providerId ? Color.accentColor : .clear)
                                        .frame(width: 16)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(model.name)
                                            .font(.subheadline)
                                            .foregroundStyle(.primary)
                                        Text(model.providerId.rawValue.capitalized)
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    CapabilityIcons(
                                        reasoning: (model.supportsReasoning ?? false) || Self.isReasoningModel(model.id, providerId: model.providerId),
                                        vision: model.supportsVision ?? false,
                                        audio: model.supportsAudio ?? false,
                                        size: 13
                                    )
                                }
                            }
                            .swipeActions {
                                Button(role: .destructive) {
                                    settings?.toggleFavorite(model.id, providerId: model.providerId)
                                } label: {
                                    Label("Unfavorite", systemImage: "star.slash")
                                }
                            }
                        }

                        ForEach(unmatchedFavoriteIDs, id: \.self) { fav in
                            Button {
                                viewModel.setSelectedModel(fav.modelId, providerId: fav.providerId)
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 12, weight: .semibold))
                                        .foregroundStyle(viewModel.selectedModelID == fav.modelId && viewModel.selectedProviderId == fav.providerId ? Color.accentColor : .clear)
                                        .frame(width: 16)
                                    Text(fav.modelId)
                                        .font(.subheadline)
                                        .foregroundStyle(.primary)
                                    Spacer()
                                }
                            }
                            .swipeActions {
                                Button(role: .destructive) {
                                    settings?.toggleFavorite(fav.modelId, providerId: fav.providerId)
                                } label: {
                                    Label("Unfavorite", systemImage: "star.slash")
                                }
                            }
                        }
                    }
                } header: {
                    HStack {
                        Text("Model")
                        Spacer()
                        Button {
                            showProviderMenu = true
                        } label: {
                            Text("Browse All Models")
                                .font(.caption)
                        }
                    }
                }

                // Parameters
                Section("Parameters") {
                    sliderWithTextField(label: "Max Tokens", value: configBinding.maxTokens,
                                        range: 0...128000, step: 1, intOnly: true)
                    sliderWithTextField(label: "Temperature", value: configBinding.temperature,
                                        range: 0...2, step: 0.1, format: "%.2f")
                    sliderWithTextField(label: "Top P", value: configBinding.topP,
                                        range: 0...1, step: 0.05, format: "%.2f")
                    sliderWithTextField(label: "Presence Penalty", value: configBinding.presencePenalty,
                                        range: -2...2, step: 0.1, format: "%.2f")
                    sliderWithTextField(label: "Frequency Penalty", value: configBinding.frequencyPenalty,
                                        range: -2...2, step: 0.1, format: "%.2f")
                }
                .disabled(viewModel.selectedModelID.isEmpty)

                // Reasoning (conditional)
                if reasoningSupported {
                    Section("Reasoning") {
                        // Reasoning Effort
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Reasoning Effort")
                                .font(.subheadline)
                            let efforts: [ReasoningEffort] = isOpenRouter
                                ? [.none, .minimal, .low, .medium, .high, .xhigh]
                                : [.low, .medium, .high]
                            Picker("Reasoning Effort", selection: Binding(
                                get: { configBinding.wrappedValue.reasoningEffort ?? .medium },
                                set: { configBinding.wrappedValue.reasoningEffort = $0 }
                            )) {
                                ForEach(efforts, id: \.self) { effort in
                                    Text(effort.rawValue.capitalized).tag(effort)
                                }
                            }
                            .pickerStyle(.segmented)
                        }

                        // Reasoning Budget Tokens
                        sliderWithTextField(label: "Budget Tokens", value: Binding(
                            get: { Double(configBinding.wrappedValue.reasoningBudgetTokens ?? 0) },
                            set: { configBinding.wrappedValue.reasoningBudgetTokens = Int($0) > 0 ? Int($0) : nil }
                        ), range: 0...65536, step: 1024, intOnly: true)

                        // Verbosity (OpenRouter + Claude only)
                        if verbositySupported {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Verbosity")
                                    .font(.subheadline)
                                let verbosities: [Verbosity] = isOpenRouterAdaptiveReasoning
                                    ? [.low, .medium, .high, .max]
                                    : [.low, .medium, .high]
                                Picker("Verbosity", selection: Binding(
                                    get: { configBinding.wrappedValue.verbosity ?? .medium },
                                    set: { configBinding.wrappedValue.verbosity = $0 }
                                )) {
                                    ForEach(verbosities, id: \.self) { v in
                                        Text(v.rawValue.capitalized).tag(v)
                                    }
                                }
                                .pickerStyle(.segmented)
                            }
                        }
                    }
                    .disabled(viewModel.selectedModelID.isEmpty)
                }
            }
            .navigationTitle("Model Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(isPresented: $showProviderMenu) {
                if let settings {
                    ProviderMenuView(apiService: viewModel.apiService, settings: settings)
                }
            }
            .task {
                await loadAllFavoriteModels()
            }
        }
    }

    private var isOpenRouterAdaptiveReasoning: Bool {
        let id = viewModel.selectedModelID.lowercased()
        return isOpenRouter &&
            ((id.contains("claude") && id.contains("4.6") && id.contains("opus")) ||
             (id.contains("claude") && id.contains("4.6") && id.contains("sonnet")))
    }

    // MARK: - Slider + TextField

    @ViewBuilder
    private func sliderWithTextField(label: String, value: Binding<Int>,
                                      range: ClosedRange<Int>, step: Int, intOnly: Bool = false) -> some View {
        sliderWithTextField(label: label,
                            value: Binding(get: { Double(value.wrappedValue) }, set: { value.wrappedValue = Int($0) }),
                            range: Double(range.lowerBound)...Double(range.upperBound),
                            step: Double(step), intOnly: true)
    }

    @ViewBuilder
    private func sliderWithTextField(label: String, value: Binding<Double>,
                                      range: ClosedRange<Double>, step: Double,
                                      format: String = "%.0f", intOnly: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                    .font(.subheadline)
                Spacer()
                if intOnly {
                    TextField("", value: value, format: .number)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 72)
                        .font(.system(.subheadline, design: .monospaced))
                        .foregroundStyle(.secondary)
                } else {
                    TextField("", text: Binding(
                        get: { String(format: format, value.wrappedValue) },
                        set: { if let v = Double($0), range.contains(v) { value.wrappedValue = v } }
                    ))
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 56)
                    .font(.system(.subheadline, design: .monospaced))
                    .foregroundStyle(.secondary)
                }
            }
            Slider(value: value, in: range, step: step)
        }
    }

    // MARK: - Loading

    private func loadAllFavoriteModels() async {
        loading = true
        // Reuse cached data if available, otherwise fetch fresh
        if !viewModel.fetchedModels.isEmpty {
            allModels = viewModel.fetchedModels
            loading = false
            return
        }
        var result: [ProviderId: [ProviderModel]] = [:]
        await withTaskGroup(of: (ProviderId, [ProviderModel]).self) { group in
            for provider in ProviderId.allCases {
                group.addTask {
                    let models = (try? await viewModel.apiService.fetchModels(for: provider)) ?? []
                    return (provider, models)
                }
            }
            for await (provider, models) in group {
                result[provider] = models
            }
        }
        await MainActor.run {
            allModels = result
            viewModel.fetchedModels = result
            loading = false
        }
    }
}

#Preview("iPhone") {
    ContentView(chatViewModel: ChatViewModel(), settings: SettingsViewModel())
}

#Preview("iPad") {
    ContentView(chatViewModel: ChatViewModel(), settings: SettingsViewModel())
}
