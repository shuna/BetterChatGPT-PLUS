import SwiftUI
import UniformTypeIdentifiers
import WeaveletDomain

/// Import/Export modal for chat data.
struct ImportExportView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var showImportPicker = false
    @State private var importResult: ImportResult?
    @State private var showExportShare = false
    @State private var exportURL: URL?
    @State private var showClearConfirm = false

    enum ImportResult {
        case success(count: Int)
        case error(String)
    }

    var body: some View {
        NavigationStack {
            Form {
                importSection
                exportSection
                dangerSection
            }
            .navigationTitle("Import / Export")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .fileImporter(
                isPresented: $showImportPicker,
                allowedContentTypes: [.json],
                allowsMultipleSelection: false
            ) { result in
                handleImport(result)
            }
            .alert(
                importResultTitle,
                isPresented: .init(
                    get: { importResult != nil },
                    set: { if !$0 { importResult = nil } }
                )
            ) {
                Button("OK") { importResult = nil }
            } message: {
                Text(importResultMessage)
            }
        }
    }

    // MARK: - Import

    @ViewBuilder
    private var importSection: some View {
        Section {
            Button {
                showImportPicker = true
            } label: {
                Label("Import from JSON File", systemImage: "square.and.arrow.down")
            }

            Text("Import chats from a Weavelet Canvas JSON export file (V3 format).")
                .font(.caption)
                .foregroundStyle(.secondary)
        } header: {
            Text("Import")
        }
    }

    // MARK: - Export

    @ViewBuilder
    private var exportSection: some View {
        Section {
            if let url = exportURL {
                ShareLink(item: url) {
                    Label("Share Export File", systemImage: "square.and.arrow.up")
                }
            }

            Button {
                exportAllChats()
            } label: {
                Label("Export All Chats (JSON)", systemImage: "doc.text")
            }

            Text("Exports all \(appState.chatList.chats.count) chat(s) in V3 format compatible with the web app.")
                .font(.caption)
                .foregroundStyle(.secondary)
        } header: {
            Text("Export")
        }
    }

    // MARK: - Danger Zone

    @ViewBuilder
    private var dangerSection: some View {
        Section {
            Button(role: .destructive) {
                showClearConfirm = true
            } label: {
                Label("Clear All Conversations (\(appState.chatList.chats.count))", systemImage: "trash")
            }
            .confirmationDialog(
                "Delete all \(appState.chatList.chats.count) conversation(s)?",
                isPresented: $showClearConfirm,
                titleVisibility: .visible
            ) {
                Button("Delete All", role: .destructive) {
                    // Release all content
                    for chat in appState.chatList.chats {
                        if let tree = chat.branchTree {
                            for node in tree.nodes.values {
                                appState.conversation.contentStore.releaseContent(node.contentHash)
                            }
                        }
                    }
                    appState.chatList.chats.removeAll()
                    appState.chatList.folders.removeAll()
                    appState.chatList.currentChatIndex = 0
                    // Create a fresh chat
                    appState.chatList.createNewChat(contentStore: appState.conversation.contentStore, defaultSystemMessage: appState.settings.defaultSystemMessage, defaultChatConfig: appState.settings.defaultChatConfig)
                    if let first = appState.chatList.currentChat {
                        appState.conversation.setActiveChat(first, contentStore: appState.conversation.contentStore)
                    }
                    appState.saveAll()
                }
            } message: {
                Text("This action cannot be undone. All chats, branches, and folders will be permanently deleted.")
            }
        } header: {
            Text("Danger Zone")
        } footer: {
            Text("This action cannot be undone.")
        }
    }

    // MARK: - Actions

    private func handleImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let url = urls.first else { return }
            guard url.startAccessingSecurityScopedResource() else {
                importResult = .error("Cannot access file.")
                return
            }
            defer { url.stopAccessingSecurityScopedResource() }

            do {
                let data = try Data(contentsOf: url)
                let export = try JSONDecoder().decode(ExportV3.self, from: data)

                // Merge content store
                let contentStore = appState.conversation.contentStore
                for (hash, entry) in export.contentStore {
                    if contentStore.data[hash] == nil {
                        contentStore.data[hash] = entry
                    }
                }

                // Import chats
                var count = 0
                for persisted in export.chats ?? [] {
                    let chat = persisted.toChat(contentStore: contentStore)
                    // Avoid duplicates
                    if !appState.chatList.chats.contains(where: { $0.id == chat.id }) {
                        appState.chatList.chats.insert(chat, at: 0)
                        count += 1
                    }
                }

                // Import folders
                for (id, folder) in export.folders {
                    if appState.chatList.folders[id] == nil {
                        appState.chatList.folders[id] = folder
                    }
                }

                importResult = .success(count: count)
            } catch {
                importResult = .error(error.localizedDescription)
            }

        case .failure(let error):
            importResult = .error(error.localizedDescription)
        }
    }

    private func exportAllChats() {
        let persistedChats = appState.chatList.chats.map { PersistedChat(from: $0) }
        let export = ExportV3(
            chats: persistedChats,
            contentStore: appState.conversation.contentStore.data,
            folders: appState.chatList.folders
        )
        guard let data = try? JSONEncoder().encode(export) else { return }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("weavelet-canvas-export.json")
        try? data.write(to: url)
        exportURL = url
    }

    private var importResultTitle: String {
        switch importResult {
        case .success: return "Import Successful"
        case .error: return "Import Failed"
        case .none: return ""
        }
    }

    private var importResultMessage: String {
        switch importResult {
        case .success(let count): return "Imported \(count) chat(s)."
        case .error(let msg): return msg
        case .none: return ""
        }
    }
}
