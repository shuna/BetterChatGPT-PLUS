import SwiftUI
import WeaveletDomain

/// Main conversation view: scrollable messages + input bar + top toolbar.
struct ConversationView: View {
    @Environment(AppState.self) private var appState
    @State private var scrollProxy: ScrollViewProxy?
    @State private var isAtBottom = true
    @State private var showScrollToBottom = false
    @State private var showConfigMenu = false
    @State private var showProviderMenu = false
    // conversation.showFindBar is now on ConversationViewModel

    private var conversation: ConversationViewModel { appState.conversation }

    var body: some View {
        VStack(spacing: 0) {
            // Top toolbar: model selector + view tabs
            conversationToolbar

            Divider()

            // Find bar
            if conversation.showFindBar {
                ChatFindBar(
                    isVisible: Bindable(conversation).showFindBar,
                    messages: conversation.chat.messages
                ) { messageIndex in
                    withAnimation {
                        scrollProxy?.scrollTo(messageIndex, anchor: .center)
                    }
                }
            }

            // Messages
            ZStack(alignment: .bottomTrailing) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(
                                Array(conversation.chat.messages.enumerated()),
                                id: \.offset
                            ) { index, message in
                                let nid = nodeId(at: index)
                                let tree = conversation.chat.branchTree
                                let siblings = tree?.getSiblings(of: nid)
                                    .sorted { $0.createdAt < $1.createdAt } ?? []
                                let siblingIdx = (siblings.firstIndex(where: { $0.id == nid }) ?? 0) + 1

                                // Insert message button before each message
                                insertMessageButton(at: index)

                                MessageBubbleView(
                                    message: message,
                                    index: index,
                                    nodeId: nid,
                                    isCollapsed: conversation.collapsedNodes[nid] ?? false,
                                    isOmitted: conversation.omittedNodes[nid] ?? false,
                                    isProtected: conversation.protectedNodes[nid] ?? false,
                                    siblingCount: siblings.count,
                                    siblingIndex: siblingIdx,
                                    totalMessages: conversation.chat.messages.count
                                )
                                .id(index)
                            }

                            // Insert button after last message
                            if !conversation.chat.messages.isEmpty {
                                insertMessageButton(at: conversation.chat.messages.count)
                            }

                            // Streaming indicator
                            if conversation.isStreaming {
                                HStack(spacing: 8) {
                                    ProgressView()
                                        .controlSize(.small)
                                    Text("Generating...")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    Spacer()
                                    Button("Stop") {
                                        conversation.stopStreaming()
                                    }
                                    .font(.caption)
                                    .buttonStyle(.bordered)
                                    .tint(.red)
                                }
                                .padding(.horizontal, 4)
                                .padding(.vertical, 8)
                            }

                            // Scroll anchor
                            Color.clear
                                .frame(height: 1)
                                .id("bottom")
                        }
                        .padding(.horizontal)
                    }
                    .onAppear { scrollProxy = proxy }
                    .onChange(of: conversation.chat.messages.count) {
                        if isAtBottom {
                            withAnimation(.easeOut(duration: 0.2)) {
                                proxy.scrollTo("bottom", anchor: .bottom)
                            }
                        }
                    }
                    .defaultScrollAnchor(.bottom)
                }

                // Scroll navigation buttons
                if !conversation.chat.messages.isEmpty {
                    VStack(spacing: 6) {
                        scrollNavButton(icon: "chevron.up.2") {
                            withAnimation { scrollProxy?.scrollTo(0, anchor: .top) }
                        }
                        scrollNavButton(icon: "chevron.up") {
                            // Scroll up one message
                        }
                        scrollNavButton(icon: "chevron.down") {
                            // Scroll down one message
                        }
                        scrollNavButton(icon: "chevron.down.2") {
                            withAnimation { scrollProxy?.scrollTo("bottom", anchor: .bottom) }
                        }
                    }
                    .padding(.trailing, 8)
                    .padding(.bottom, 8)
                }
            }

            // Streaming error banner
            if let error = conversation.streamError {
                HStack {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                    Spacer()
                    Button("Dismiss") {
                        conversation.streamError = nil
                    }
                    .font(.caption)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color.red.opacity(0.1))
            }

            // Footer: Token/cost bar (above input, matching Web layout)
            if appState.settings.displayChatSize {
                Divider()
                TokenCostBar(
                    messages: conversation.chat.messages,
                    config: conversation.chat.config,
                    settings: appState.settings
                )
            }

            Divider()

            // Input bar
            ChatInputView()
        }
        .sheet(isPresented: $showConfigMenu) {
            ConfigMenuSheet()
                .environment(appState)
        }
        .sheet(isPresented: $showProviderMenu) {
            NavigationStack {
                ProviderMenuView()
                    .environment(appState)
            }
        }
    }

    // MARK: - Top Toolbar

    @ViewBuilder
    private var conversationToolbar: some View {
        HStack(spacing: 8) {
            // Model selector dropdown (tap = quick select from favorites, long press = full picker)
            Menu {
                // Favorites
                let favorites = appState.settings.favoriteModels
                if !favorites.isEmpty {
                    Section("Favorites") {
                        ForEach(Array(favorites.enumerated()), id: \.offset) { _, fav in
                            Button {
                                conversation.chat.config.model = fav.modelId
                                conversation.chat.config.providerId = fav.providerId
                                conversation.syncToList(appState.chatList)
                            } label: {
                                HStack {
                                    Text(fav.modelId)
                                    if conversation.chat.config.model == fav.modelId {
                                        Image(systemName: "checkmark")
                                    }
                                }
                            }
                        }
                    }
                }
                Section {
                    Button {
                        showProviderMenu = true
                    } label: {
                        Label("Manage Providers & Models...", systemImage: "cpu")
                    }
                    Button {
                        showConfigMenu = true
                    } label: {
                        Label("Config Settings...", systemImage: "gear")
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(conversation.chat.config.model)
                        .font(.callout)
                        .lineLimit(1)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 10))
                }
                .foregroundStyle(.primary)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(.quaternary, in: Capsule())
            }

            // Streaming indicator (next to model name)
            if conversation.isStreaming {
                ProgressView()
                    .controlSize(.mini)
            }

            Spacer()

            // Config gear button (opens ConfigMenuSheet directly)
            Button {
                showConfigMenu = true
            } label: {
                Image(systemName: "slider.horizontal.3")
                    .font(.body)
                    .foregroundStyle(.secondary)
            }

            // Omit all toggle
            if appState.settings.advancedMode {
                Button {
                    toggleOmitAll()
                } label: {
                    Image(systemName: hasOmitted ? "eye.slash.fill" : "eye.slash")
                        .font(.body)
                        .foregroundStyle(hasOmitted ? .orange : .secondary)
                }
            }

            // Search button
            Button {
                withAnimation { conversation.showFindBar.toggle() }
            } label: {
                Image(systemName: "magnifyingglass")
                    .font(.body)
                    .foregroundStyle(conversation.showFindBar ? Color.accentColor : .secondary)
            }

            // View mode picker + panel swap
            Menu {
                Section("View Mode") {
                    Button { conversation.activeView = .chat } label: {
                        Label("Chat", systemImage: "bubble.left.and.bubble.right")
                    }
                    Button { conversation.activeView = .branchEditor } label: {
                        Label("Branch Editor", systemImage: "point.3.connected.trianglepath.dotted")
                    }
                    Button { conversation.activeView = .splitHorizontal } label: {
                        Label("Split Horizontal", systemImage: "rectangle.split.2x1")
                    }
                    Button { conversation.activeView = .splitVertical } label: {
                        Label("Split Vertical", systemImage: "rectangle.split.1x2")
                    }
                }

                if conversation.activeView.isSplit {
                    Section("Split Options") {
                        Button {
                            conversation.panelsSwapped.toggle()
                        } label: {
                            Label(
                                conversation.panelsSwapped ? "Swap Back" : "Swap Panels",
                                systemImage: "arrow.left.arrow.right"
                            )
                        }
                        Toggle("Sync Selection", isOn: Binding(
                            get: { conversation.syncMode },
                            set: { conversation.syncMode = $0 }
                        ))
                    }
                }
            } label: {
                Image(systemName: viewModeIcon)
                    .font(.body)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.bar)
    }

    // MARK: - Helpers

    private func nodeId(at index: Int) -> String {
        let path = conversation.chat.branchTree?.activePath ?? []
        return index < path.count ? path[index] : ""
    }

    private var hasOmitted: Bool {
        !conversation.omittedNodes.isEmpty
    }

    private func toggleOmitAll() {
        if hasOmitted {
            // Clear all omissions
            conversation.omittedNodes.removeAll()
        } else {
            // Omit all non-protected nodes
            guard let tree = conversation.chat.branchTree else { return }
            for nodeId in tree.activePath {
                if conversation.protectedNodes[nodeId] != true {
                    conversation.omittedNodes[nodeId] = true
                }
            }
        }
    }

    @ViewBuilder
    private func scrollNavButton(icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.secondary)
                .frame(width: 32, height: 32)
                .background(.regularMaterial, in: Circle())
                .shadow(color: .black.opacity(0.1), radius: 1)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func insertMessageButton(at index: Int) -> some View {
        HStack {
            Spacer()
            Button {
                let msg = Message(role: .user, text: "")
                conversation.insertMessage(at: index, message: msg)
                conversation.syncToList(appState.chatList)
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 28, height: 28)
                    .background(.quaternary, in: Circle())
            }
            .buttonStyle(.plain)
            Spacer()
        }
        .frame(height: 24)
    }

    private var viewModeIcon: String {
        switch conversation.activeView {
        case .chat: return "bubble.left.and.bubble.right"
        case .branchEditor: return "point.3.connected.trianglepath.dotted"
        case .splitHorizontal: return "rectangle.split.2x1"
        case .splitVertical: return "rectangle.split.1x2"
        }
    }
}

// MARK: - Config Menu Sheet (Full)

struct ConfigMenuSheet: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var showProviderMenu = false

    var body: some View {
        @Bindable var conv = appState.conversation

        NavigationStack {
            Form {
                // Model selector
                modelSection

                // Parameters
                parametersSection

                // Reasoning (if supported)
                reasoningSection

                // System message
                Section("System Message") {
                    Toggle("Include Default System Message", isOn: Binding(
                        get: { conv.chat.config.includeDefaultSystemPrompt },
                        set: { conv.chat.config.includeDefaultSystemPrompt = $0 }
                    ))

                    if !appState.settings.defaultSystemMessage.isEmpty {
                        Text("Default: \"\(String(appState.settings.defaultSystemMessage.prefix(60)))...\"")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                // Stream toggle
                Section("Streaming") {
                    Toggle("Stream Responses", isOn: Binding(
                        get: { conv.chat.config.stream ?? true },
                        set: { conv.chat.config.stream = $0 }
                    ))
                }

                // Image detail
                Section("Vision") {
                    Picker("Image Detail", selection: Bindable(conv).chat.imageDetail) {
                        Text("Auto").tag(ImageDetail.auto)
                        Text("Low").tag(ImageDetail.low)
                        Text("High").tag(ImageDetail.high)
                    }
                }
            }
            .navigationTitle("Chat Config")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        appState.conversation.syncToList(appState.chatList)
                        dismiss()
                    }
                }
            }
            .sheet(isPresented: $showProviderMenu) {
                NavigationStack {
                    ProviderMenuView()
                        .environment(appState)
                }
            }
        }
    }

    // MARK: - Model Section

    @ViewBuilder
    private var modelSection: some View {
        Section("Model") {
            // Current model display
            if appState.conversation.chat.config.model.isEmpty {
                Text("No model selected")
                    .foregroundStyle(.secondary)
                    .italic()
            } else {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(appState.conversation.chat.config.model)
                            .font(.body)
                        Text(currentProviderName)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    capabilityBadges(for: appState.conversation.chat.config.model)
                }
            }

            // Favorites list — select from here
            let favorites = appState.settings.favoriteModels
            if favorites.isEmpty {
                Text("No favorite models. Add models in Settings → Providers.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(Array(favorites.enumerated()), id: \.offset) { _, fav in
                    Button {
                        appState.conversation.chat.config.model = fav.modelId
                        appState.conversation.chat.config.providerId = fav.providerId
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 4) {
                                    Text(fav.modelId)
                                        .font(.callout)
                                        .foregroundStyle(.primary)
                                        .lineLimit(1)
                                    capabilityBadgesForFav(fav)
                                }
                                HStack(spacing: 4) {
                                    Text(fav.providerId.displayName)
                                        .font(.caption2)
                                    if let ctx = fav.contextLength {
                                        let formatted = ctx >= 1_000_000 ? "\(ctx / 1_000_000)M" : "\(ctx / 1000)K"
                                        Text("• \(formatted) ctx")
                                            .font(.caption2)
                                    }
                                    if let price = fav.promptPrice {
                                        Text("• $\(String(format: "%.2f", price))/M")
                                            .font(.caption2)
                                    }
                                }
                                .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if appState.conversation.chat.config.model == fav.modelId
                                && appState.conversation.chat.config.providerId == fav.providerId {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(Color.accentColor)
                                    .font(.caption)
                            }
                        }
                    }
                }
            }

            // Manage models → opens ProviderMenuView
            Button {
                showProviderMenu = true
            } label: {
                Label("Manage Models...", systemImage: "star.circle")
                    .foregroundStyle(Color.accentColor)
            }
        }
    }

    private var currentProviderName: String {
        (appState.conversation.chat.config.providerId ?? .openrouter).displayName
    }

    @ViewBuilder
    private func capabilityBadges(for modelId: String) -> some View {
        HStack(spacing: 2) {
            // Look up from favorites or cache
            let fav = appState.settings.favoriteModels.first { $0.modelId == modelId }
            if fav?.supportsReasoning == true {
                Image(systemName: "brain").font(.system(size: 10)).foregroundStyle(.purple)
            }
            if fav?.supportsVision == true {
                Image(systemName: "eye").font(.system(size: 10)).foregroundStyle(.blue)
            }
            if fav?.supportsAudio == true {
                Image(systemName: "waveform").font(.system(size: 10)).foregroundStyle(.green)
            }
        }
    }

    @ViewBuilder
    private func capabilityBadgesForFav(_ fav: FavoriteModel) -> some View {
        HStack(spacing: 2) {
            if fav.supportsReasoning == true {
                Image(systemName: "brain").font(.system(size: 10)).foregroundStyle(.purple)
            }
            if fav.supportsVision == true {
                Image(systemName: "eye").font(.system(size: 10)).foregroundStyle(.blue)
            }
            if fav.supportsAudio == true {
                Image(systemName: "waveform").font(.system(size: 10)).foregroundStyle(.green)
            }
        }
    }

    // MARK: - Parameters Section

    @ViewBuilder
    private var parametersSection: some View {
        @Bindable var conv = appState.conversation

        Section("Parameters") {
            HStack {
                Text("Max Tokens")
                Spacer()
                TextField("", value: Bindable(conv).chat.config.maxTokens, format: .number)
                    .multilineTextAlignment(.trailing)
                    .keyboardType(.numberPad)
                    .frame(width: 80)
            }

            parameterSlider(
                "Temperature",
                value: Bindable(conv).chat.config.temperature,
                range: 0...2, step: 0.05
            )
            parameterSlider(
                "Top P",
                value: Bindable(conv).chat.config.topP,
                range: 0...1, step: 0.05
            )
            parameterSlider(
                "Frequency Penalty",
                value: Bindable(conv).chat.config.frequencyPenalty,
                range: -2...2, step: 0.1
            )
            parameterSlider(
                "Presence Penalty",
                value: Bindable(conv).chat.config.presencePenalty,
                range: -2...2, step: 0.1
            )
        }
    }

    @ViewBuilder
    private func parameterSlider(
        _ label: String,
        value: Binding<Double>,
        range: ClosedRange<Double>,
        step: Double
    ) -> some View {
        VStack(alignment: .leading) {
            HStack {
                Text(label)
                Spacer()
                Text(String(format: "%.2f", value.wrappedValue))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            Slider(value: value, in: range, step: step)
        }
    }

    // MARK: - Reasoning Section

    @ViewBuilder
    private var reasoningSection: some View {
        Section("Reasoning") {
            Picker("Reasoning Effort", selection: Binding(
                get: { appState.conversation.chat.config.reasoningEffort ?? .medium },
                set: { appState.conversation.chat.config.reasoningEffort = $0 }
            )) {
                Text("None").tag(ReasoningEffort.none)
                Text("Minimal").tag(ReasoningEffort.minimal)
                Text("Low").tag(ReasoningEffort.low)
                Text("Medium").tag(ReasoningEffort.medium)
                Text("High").tag(ReasoningEffort.high)
                Text("X-High").tag(ReasoningEffort.xhigh)
            }

            HStack {
                Text("Budget Tokens")
                Spacer()
                TextField("", value: Binding(
                    get: { appState.conversation.chat.config.reasoningBudgetTokens ?? 0 },
                    set: { appState.conversation.chat.config.reasoningBudgetTokens = $0 > 0 ? $0 : nil }
                ), format: .number)
                .multilineTextAlignment(.trailing)
                .keyboardType(.numberPad)
                .frame(width: 80)
            }

            Picker("Verbosity", selection: Binding(
                get: { appState.conversation.chat.config.verbosity ?? .medium },
                set: { appState.conversation.chat.config.verbosity = $0 }
            )) {
                Text("Low").tag(Verbosity.low)
                Text("Medium").tag(Verbosity.medium)
                Text("High").tag(Verbosity.high)
                Text("Max").tag(Verbosity.max)
            }
        }
    }
}
