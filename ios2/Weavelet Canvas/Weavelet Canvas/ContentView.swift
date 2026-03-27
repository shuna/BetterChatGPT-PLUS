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

    var body: some View {
        ThreePaneView(
            state: threeColumnState,
            Sidebar: {
                SidebarView(state: sidebarState, chatViewModel: chatViewModel)
            },
            Detail: {
                ChatDetailView(viewModel: chatViewModel)
            },
            sidebarToolbarCenter: { _, _ in
                EmptyView()
            },
            sidebarToolbarTrailing: { [sidebarState, chatViewModel] _, _ in
                SidebarToolbarTrailing(state: sidebarState, chatViewModel: chatViewModel)
            },
            detailToolbarLeading: { [chatViewModel] _, _ in
                DetailToolbarLeading(viewModel: chatViewModel)
            },
            detailToolbarCenter: { [chatViewModel] _, _ in
                DetailCenterToolbar(viewModel: chatViewModel)
            },
            detailToolbarTrailing: { [chatViewModel, threeColumnState] _, _ in
                DetailToolbarTrailing(viewModel: chatViewModel, threeColumnState: threeColumnState)
            },
            detailToolbarBottomLeading: { _, _ in
                EmptyView()
            },
            detailToolbarBottomTrailing: { _, _ in
                EmptyView()
            },
            detailToolbarBottomStatus: { _, _ in
                EmptyView()
            },
            inspectorToolbarCenter: { [chatViewModel] _, _ in
                InspectorCenterToolbar(viewModel: chatViewModel)
            },
            inspectorToolbarTrailing: { [chatViewModel, threeColumnState] _, _ in
                InspectorToolbarTrailing(viewModel: chatViewModel, threeColumnState: threeColumnState)
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
                    chatViewModel.createNewChat()
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

private struct CapabilityIcons: View {
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
    @State private var showPicker = false

    var body: some View {
        Button {
            showPicker.toggle()
        } label: {
            HStack(spacing: 5) {
                Text(viewModel.selectedModel?.name ?? "Model")
                    .font(.subheadline.weight(.medium))
                if let model = viewModel.selectedModel {
                    CapabilityIcons(
                        reasoning: model.supportsReasoning,
                        vision: model.supportsVision,
                        audio: model.supportsAudio,
                        size: 10
                    )
                }
                Image(systemName: "chevron.down")
                    .font(.caption2.weight(.semibold))
            }
            .foregroundStyle(.primary)
        }
        .popover(isPresented: $showPicker, arrowEdge: .top) {
            ModelPickerList(viewModel: viewModel, showPicker: $showPicker)
        }
    }
}

private struct ModelPickerList: View {
    var viewModel: ChatViewModel
    @Binding var showPicker: Bool

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(viewModel.availableModels.enumerated()), id: \.element.id) { _, model in
                ModelPickerRow(
                    model: model,
                    isSelected: viewModel.selectedModelID == model.id,
                    onSelect: {
                        viewModel.selectedModelID = model.id
                        showPicker = false
                    }
                )

                if model.id != viewModel.availableModels.last?.id {
                    Divider().padding(.leading, 42)
                }
            }

            Divider()

            Button {
                showPicker = false
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
        }
        .padding(.vertical, 4)
        .frame(minWidth: 320)
    }
}

private struct ModelPickerRow: View {
    let model: AIModel
    let isSelected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 10) {
                Image(systemName: "checkmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(isSelected ? Color.primary : Color.clear)
                    .frame(width: 16)

                Text(model.name)
                    .foregroundStyle(.primary)

                Spacer()

                Text(model.provider)
                    .foregroundStyle(.secondary)

                CapabilityIcons(
                    reasoning: model.supportsReasoning,
                    vision: model.supportsVision,
                    audio: model.supportsAudio,
                    size: 13
                )
            }
            .font(.subheadline)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Detail Toolbar Leading (back/forward + streaming indicator)

private struct DetailToolbarLeading: View {
    @Bindable var viewModel: ChatViewModel

    var body: some View {
        HStack(spacing: 8) {
            // Back / Forward
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

            // Streaming indicator
            if viewModel.isGenerating {
                ProgressView()
                    .controlSize(.small)
            }
        }
    }
}

// MARK: - Detail Center Toolbar

private struct DetailCenterToolbar: View {
    @Bindable var viewModel: ChatViewModel

    var body: some View {
        switch viewModel.viewMode {
        case .chat:
            ModelSelectorButton(viewModel: viewModel)
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
    @State private var showModelSettings = false

    var body: some View {
        HStack(spacing: 8) {
            // Model settings (chat view only)
            if viewModel.viewMode == .chat {
                Button {
                    showModelSettings = true
                } label: {
                    Image(systemName: "slider.horizontal.3")
                }
                .accessibilityLabel("Model Settings")
                .sheet(isPresented: $showModelSettings) {
                    ModelSettingsSheet(viewModel: viewModel)
                }
            }

            // Search (always)
            Button {
                viewModel.isSearching.toggle()
            } label: {
                Image(systemName: "magnifyingglass")
            }
            .accessibilityLabel("Search")

            // Inspector toggle
            if !threeColumnState.inspectorPresented {
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
    }
}

// MARK: - Inspector Center Toolbar

// MARK: - Inspector Toolbar Trailing (hide + swap menu)

private struct InspectorToolbarTrailing: View {
    @Bindable var viewModel: ChatViewModel
    @Bindable var threeColumnState: ThreeColumnState

    /// The view shown in the inspector is the opposite of viewMode
    private var inspectorShowsChat: Bool { viewModel.viewMode == .branchEditor }

    @State private var showModelSettings = false

    var body: some View {
        HStack(spacing: 8) {
            // Model settings (only when inspector shows chat)
            if inspectorShowsChat {
                Button {
                    showModelSettings = true
                } label: {
                    Image(systemName: "slider.horizontal.3")
                }
                .accessibilityLabel("Model Settings")
                .sheet(isPresented: $showModelSettings) {
                    ModelSettingsSheet(viewModel: viewModel)
                }
            }

            // Search (always)
            Button {
                if inspectorShowsChat {
                    viewModel.isSearching.toggle()
                }
                // Branch editor search is handled by its own toolbar
            } label: {
                Image(systemName: "magnifyingglass")
            }
            .accessibilityLabel("Search")

            // Hide/Swap menu
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
}

private struct InspectorCenterToolbar: View {
    @Bindable var viewModel: ChatViewModel

    var body: some View {
        switch viewModel.viewMode {
        case .chat:
            Text("Branch Editor")
                .font(.headline)
        case .branchEditor:
            ModelSelectorButton(viewModel: viewModel)
        }
    }
}

// MARK: - Inspector Content

private struct InspectorContentView: View {
    @Bindable var viewModel: ChatViewModel

    var body: some View {
        Group {
            switch viewModel.viewMode {
            case .chat:
                BranchEditorView(chatViewModel: viewModel)
            case .branchEditor:
                ChatDetailView(viewModel: viewModel, forceChat: true)
            }
        }
    }
}

// MARK: - Model Settings Sheet

private struct ModelSettingsSheet: View {
    @Bindable var viewModel: ChatViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var apiKeyInputs: [ProviderId: String] = [:]
    @State private var showingKeyFor: ProviderId?

    private var configBinding: Binding<ChatConfig> {
        Binding(
            get: {
                guard let idx = viewModel.currentChatIndex else {
                    return ChatConfig(model: "claude-3.5-sonnet", maxTokens: 4096, temperature: 1.0,
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

    var body: some View {
        NavigationStack {
            Form {
                Section("Provider") {
                    Picker("Provider", selection: Binding(
                        get: { configBinding.wrappedValue.providerId ?? .openai },
                        set: { configBinding.wrappedValue.providerId = $0 }
                    )) {
                        ForEach(ProviderId.allCases, id: \.self) { provider in
                            Text(provider.rawValue.capitalized).tag(provider)
                        }
                    }
                }

                Section("Model") {
                    TextField("Model ID", text: Binding(
                        get: { viewModel.selectedModelID },
                        set: { viewModel.selectedModelID = $0 }
                    ))
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                }

                Section("API Key") {
                    let provider = configBinding.wrappedValue.providerId ?? .openai
                    HStack {
                        if showingKeyFor == provider {
                            TextField("API Key", text: apiKeyBinding(for: provider))
                                .autocorrectionDisabled()
                                .textInputAutocapitalization(.never)
                                .font(.system(.body, design: .monospaced))
                        } else {
                            let hasKey = !(apiKeyInputs[provider]?.isEmpty ?? true)
                            Text(hasKey ? "••••••••" : "Not set")
                                .foregroundStyle(hasKey ? .primary : .secondary)
                            Spacer()
                            Button(hasKey ? "Edit" : "Set") {
                                showingKeyFor = provider
                            }
                        }
                    }

                    if showingKeyFor == provider {
                        Button("Save Key") {
                            let key = apiKeyInputs[provider] ?? ""
                            if !key.isEmpty {
                                Task {
                                    await viewModel.apiService.setAPIKey(key, for: provider)
                                }
                            }
                            showingKeyFor = nil
                        }
                        .disabled(apiKeyInputs[provider]?.isEmpty ?? true)
                    }
                }

                Section("Parameters") {
                    HStack {
                        Text("Max Tokens")
                        Spacer()
                        TextField("", value: configBinding.maxTokens, format: .number)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 80)
                    }

                    VStack(alignment: .leading) {
                        HStack {
                            Text("Temperature")
                            Spacer()
                            Text(String(format: "%.2f", configBinding.wrappedValue.temperature))
                                .foregroundStyle(.secondary)
                        }
                        Slider(value: configBinding.temperature, in: 0...2, step: 0.01)
                    }

                    VStack(alignment: .leading) {
                        HStack {
                            Text("Top P")
                            Spacer()
                            Text(String(format: "%.2f", configBinding.wrappedValue.topP))
                                .foregroundStyle(.secondary)
                        }
                        Slider(value: configBinding.topP, in: 0...1, step: 0.01)
                    }

                    VStack(alignment: .leading) {
                        HStack {
                            Text("Presence Penalty")
                            Spacer()
                            Text(String(format: "%.2f", configBinding.wrappedValue.presencePenalty))
                                .foregroundStyle(.secondary)
                        }
                        Slider(value: configBinding.presencePenalty, in: -2...2, step: 0.01)
                    }

                    VStack(alignment: .leading) {
                        HStack {
                            Text("Frequency Penalty")
                            Spacer()
                            Text(String(format: "%.2f", configBinding.wrappedValue.frequencyPenalty))
                                .foregroundStyle(.secondary)
                        }
                        Slider(value: configBinding.frequencyPenalty, in: -2...2, step: 0.01)
                    }
                }
            }
            .navigationTitle("Model Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task {
                // Load existing keys on appear
                for provider in ProviderId.allCases {
                    if let key = await viewModel.apiService.getAPIKey(for: provider) {
                        apiKeyInputs[provider] = key
                    }
                }
            }
        }
    }

    private func apiKeyBinding(for provider: ProviderId) -> Binding<String> {
        Binding(
            get: { apiKeyInputs[provider] ?? "" },
            set: { apiKeyInputs[provider] = $0 }
        )
    }
}

#Preview("iPhone") {
    ContentView(chatViewModel: ChatViewModel())
}

#Preview("iPad") {
    ContentView(chatViewModel: ChatViewModel())
}
