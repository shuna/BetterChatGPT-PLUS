import SwiftUI
import WeaveletDomain
import WeaveletInfra

/// Debug panel for developer inspection, matching Web's debug capabilities.
/// Shows: state inspector, async operations, content store stats, performance.
struct DebugPanelView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var activeTab: DebugTab = .state
    @State private var logs: [DebugLog] = []

    enum DebugTab: String, CaseIterable {
        case state = "State"
        case contentStore = "Content Store"
        case network = "Network"
        case performance = "Performance"
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Tab", selection: $activeTab) {
                    ForEach(DebugTab.allCases, id: \.self) { tab in
                        Text(tab.rawValue).tag(tab)
                    }
                }
                .pickerStyle(.segmented)
                .padding()

                switch activeTab {
                case .state:
                    stateInspector
                case .contentStore:
                    contentStoreInspector
                case .network:
                    networkInspector
                case .performance:
                    performanceInspector
                }
            }
            .navigationTitle("Debug Panel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    // MARK: - State Inspector

    @ViewBuilder
    private var stateInspector: some View {
        List {
            Section("Chat List") {
                debugRow("Total Chats", "\(appState.chatList.chats.count)")
                debugRow("Current Index", "\(appState.chatList.currentChatIndex)")
                debugRow("Folders", "\(appState.chatList.folders.count)")
                debugRow("Search Text", appState.chatList.searchText.isEmpty ? "(empty)" : appState.chatList.searchText)
                debugRow("Edit Mode", "\(appState.chatList.isEditing)")
                debugRow("Sort Order", appState.chatList.sortOrder.rawValue)
            }

            Section("Active Chat") {
                let chat = appState.conversation.chat
                debugRow("ID", String(chat.id.prefix(12)) + "...")
                debugRow("Title", chat.title)
                debugRow("Title Set", "\(chat.titleSet)")
                debugRow("Messages", "\(chat.messages.count)")
                debugRow("Model", chat.config.model)
                debugRow("Provider", (chat.config.providerId ?? .openrouter).rawValue)
                debugRow("Has Branch Tree", "\(chat.branchTree != nil)")
                if let tree = chat.branchTree {
                    debugRow("  Nodes", "\(tree.nodes.count)")
                    debugRow("  Active Path", "\(tree.activePath.count) nodes")
                    debugRow("  Root ID", String(tree.rootId.prefix(12)))
                }
                debugRow("Collapsed Nodes", "\(appState.conversation.collapsedNodes.count)")
                debugRow("Omitted Nodes", "\(appState.conversation.omittedNodes.count)")
                debugRow("Protected Nodes", "\(appState.conversation.protectedNodes.count)")
            }

            Section("Conversation") {
                debugRow("View Mode", appState.conversation.activeView.rawValue)
                debugRow("Is Streaming", "\(appState.conversation.isStreaming)")
                debugRow("Panels Swapped", "\(appState.conversation.panelsSwapped)")
                debugRow("Sync Mode", "\(appState.conversation.syncMode)")
                debugRow("Can Undo", "\(appState.conversation.canUndo)")
                debugRow("Can Redo", "\(appState.conversation.canRedo)")
                if let err = appState.conversation.streamError {
                    debugRow("Stream Error", err)
                        .foregroundStyle(.red)
                }
            }

            Section("Settings") {
                debugRow("Theme", appState.settings.theme.rawValue)
                debugRow("Advanced Mode", "\(appState.settings.advancedMode)")
                debugRow("Enter to Submit", "\(appState.settings.enterToSubmit)")
                debugRow("Auto Title", "\(appState.settings.autoTitle)")
                debugRow("Favorite Models", "\(appState.settings.favoriteModels.count)")
                debugRow("Prompts", "\(appState.settings.prompts.count)")
                debugRow("Providers Configured", "\(appState.settings.providers.values.filter { $0.apiKey != nil }.count)")
            }
        }
        .listStyle(.insetGrouped)
        .font(.system(.caption, design: .monospaced))
    }

    // MARK: - Content Store Inspector

    @ViewBuilder
    private var contentStoreInspector: some View {
        let store = appState.conversation.contentStore
        let data = store.data

        List {
            Section("Overview") {
                debugRow("Total Entries", "\(data.count)")
                let totalSize = data.values.reduce(0) { sum, entry in
                    sum + entry.content.reduce(0) { $0 + ($1.textValue?.count ?? 0) }
                }
                debugRow("Total Text Chars", "\(totalSize)")
                debugRow("Est. Memory", formatBytes(totalSize * 2)) // UTF-16

                let deltaCount = data.values.filter { $0.delta != nil }.count
                debugRow("Delta Entries", "\(deltaCount)")
                debugRow("Full Entries", "\(data.count - deltaCount)")
            }

            Section("Ref Counts") {
                let orphans = data.filter { $0.value.refCount <= 0 }
                debugRow("Orphaned (refCount ≤ 0)", "\(orphans.count)")

                let highRef = data.filter { $0.value.refCount > 5 }
                debugRow("High Ref (> 5)", "\(highRef.count)")
            }

            Section("Actions") {
                Button("Flush Pending GC") {
                    let removed = store.flushPendingGC()
                    addLog("GC flushed: \(removed.count) entries removed")
                }

                Button("Validate Delta Integrity") {
                    let broken = store.validateDeltaIntegrity()
                    addLog("Integrity check: \(broken.count) broken chains")
                }

                Button("Build Export Store") {
                    let export = store.buildExportContentStore()
                    addLog("Export store: \(export.count) entries")
                }
            }

            if !logs.isEmpty {
                Section("Log") {
                    ForEach(logs) { log in
                        VStack(alignment: .leading) {
                            Text(log.message)
                                .font(.system(.caption, design: .monospaced))
                            Text(log.timestamp, style: .time)
                                .font(.system(.caption2))
                                .foregroundStyle(.tertiary)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .font(.system(.caption, design: .monospaced))
    }

    // MARK: - Network Inspector

    @ViewBuilder
    private var networkInspector: some View {
        List {
            Section("Model Cache") {
                ForEach(ProviderId.allCases, id: \.self) { pid in
                    let count = appState.settings.providerModelCache[pid]?.count ?? 0
                    let fetching = appState.settings.modelFetchInProgress.contains(pid)
                    HStack {
                        Text(pid.displayName)
                        Spacer()
                        if fetching {
                            ProgressView()
                                .controlSize(.mini)
                        }
                        Text("\(count) models")
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Section("Provider Endpoints") {
                ForEach(ProviderId.allCases, id: \.self) { pid in
                    let config = appState.settings.resolvedConfig(for: pid)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(pid.displayName)
                            .font(.caption.bold())
                        Text(config.endpoint)
                            .font(.system(.caption2, design: .monospaced))
                            .foregroundStyle(.secondary)
                        if let models = config.modelsEndpoint {
                            Text(models)
                                .font(.system(.caption2, design: .monospaced))
                                .foregroundStyle(.tertiary)
                        }
                        HStack(spacing: 8) {
                            Text("Auth: \(config.modelsRequireAuth ? "Required" : "None")")
                            Text("Key: \(config.apiKey != nil ? "Set" : "None")")
                        }
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                    }
                }
            }

            Section("Actions") {
                Button("Refresh All Model Caches") {
                    Task {
                        for pid in ProviderId.allCases {
                            await appState.settings.fetchModels(for: pid, force: true)
                        }
                        addLog("All model caches refreshed")
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .font(.system(.caption, design: .monospaced))
    }

    // MARK: - Performance Inspector

    @ViewBuilder
    private var performanceInspector: some View {
        List {
            Section("Memory") {
                debugRow("Chat Count", "\(appState.chatList.chats.count)")

                let totalNodes = appState.chatList.chats.reduce(0) {
                    $0 + ($1.branchTree?.nodes.count ?? 0)
                }
                debugRow("Total Branch Nodes", "\(totalNodes)")

                let totalMessages = appState.chatList.chats.reduce(0) { $0 + $1.messages.count }
                debugRow("Total Messages", "\(totalMessages)")

                debugRow("Content Store Entries", "\(appState.conversation.contentStore.data.count)")
                debugRow("Favorite Models", "\(appState.settings.favoriteModels.count)")
            }

            Section("Persistence") {
                let docsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
                let weaveletDir = docsURL?.appendingPathComponent("weavelet")
                if let dir = weaveletDir {
                    let size = directorySize(url: dir)
                    debugRow("Weavelet Dir Size", formatBytes(size))
                    debugRow("Path", dir.path)
                }

                Button("Force Save Now") {
                    appState.saveAll()
                    addLog("Forced save complete")
                }
            }

            Section("Bundle") {
                debugRow("App Version",
                    Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?")
                debugRow("Build",
                    Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?")
                debugRow("Bundle ID",
                    Bundle.main.bundleIdentifier ?? "?")
            }

            if !logs.isEmpty {
                Section("Log") {
                    ForEach(logs) { log in
                        Text(log.message)
                            .font(.system(.caption2, design: .monospaced))
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .font(.system(.caption, design: .monospaced))
    }

    // MARK: - Helpers

    @ViewBuilder
    private func debugRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .foregroundStyle(.primary)
                .lineLimit(1)
        }
    }

    private func addLog(_ message: String) {
        logs.insert(DebugLog(message: message), at: 0)
        if logs.count > 50 { logs.removeLast() }
    }

    private func formatBytes(_ bytes: Int) -> String {
        if bytes < 1024 { return "\(bytes) B" }
        if bytes < 1024 * 1024 { return String(format: "%.1f KB", Double(bytes) / 1024) }
        return String(format: "%.1f MB", Double(bytes) / (1024 * 1024))
    }

    private func directorySize(url: URL) -> Int {
        let fm = FileManager.default
        guard let enumerator = fm.enumerator(at: url, includingPropertiesForKeys: [.fileSizeKey]) else { return 0 }
        var total = 0
        for case let fileURL as URL in enumerator {
            if let size = try? fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize {
                total += size
            }
        }
        return total
    }
}

// MARK: - Debug Log Entry

struct DebugLog: Identifiable {
    let id = UUID()
    let message: String
    let timestamp = Date()
}
