import SwiftUI
import WeaveletDomain

/// Prompt library for managing reusable prompt templates.
struct PromptLibraryView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var searchText = ""
    @State private var editingPrompt: Prompt?
    @State private var showAddPrompt = false
    @State private var newName = ""
    @State private var newPromptText = ""
    @State private var showImportExport = false

    var body: some View {
        NavigationStack {
            List {
                ForEach(filteredPrompts) { prompt in
                    promptRow(prompt)
                }
                .onDelete(perform: deletePrompts)
            }
            .listStyle(.plain)
            .searchable(text: $searchText, prompt: "Search prompts")
            .overlay {
                if filteredPrompts.isEmpty {
                    ContentUnavailableView(
                        "No Prompts",
                        systemImage: "text.quote",
                        description: Text(searchText.isEmpty
                            ? "Add a prompt template to get started."
                            : "No prompts match your search.")
                    )
                }
            }
            .navigationTitle("Prompt Library")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        showAddPrompt = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    Menu {
                        Button {
                            exportPrompts()
                        } label: {
                            Label("Export Prompts", systemImage: "square.and.arrow.up")
                        }
                        Button {
                            // TODO: implement file picker for import
                        } label: {
                            Label("Import Prompts", systemImage: "square.and.arrow.down")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .sheet(item: $editingPrompt) { prompt in
                PromptEditSheet(prompt: prompt) { updated in
                    if let idx = appState.settings.prompts.firstIndex(where: { $0.id == updated.id }) {
                        appState.settings.prompts[idx] = updated
                    }
                }
            }
            .alert("New Prompt", isPresented: $showAddPrompt) {
                TextField("Name", text: $newName)
                TextField("Prompt text", text: $newPromptText)
                Button("Add") {
                    if !newName.isEmpty {
                        appState.settings.prompts.append(
                            Prompt(name: newName, prompt: newPromptText)
                        )
                    }
                    newName = ""
                    newPromptText = ""
                }
                Button("Cancel", role: .cancel) {
                    newName = ""
                    newPromptText = ""
                }
            }
        }
    }

    private var filteredPrompts: [Prompt] {
        if searchText.isEmpty { return appState.settings.prompts }
        return appState.settings.prompts.filter {
            $0.name.localizedCaseInsensitiveContains(searchText) ||
            $0.prompt.localizedCaseInsensitiveContains(searchText)
        }
    }

    @ViewBuilder
    private func promptRow(_ prompt: Prompt) -> some View {
        Button {
            editingPrompt = prompt
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(prompt.name)
                    .font(.body)
                    .foregroundStyle(.primary)
                Text(prompt.prompt)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            .padding(.vertical, 2)
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) {
                appState.settings.prompts.removeAll { $0.id == prompt.id }
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    private func deletePrompts(at offsets: IndexSet) {
        appState.settings.prompts.remove(atOffsets: offsets)
    }

    private func exportPrompts() {
        guard let data = try? JSONEncoder().encode(appState.settings.prompts) else { return }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("prompts.json")
        try? data.write(to: url)
        // Share via UIActivityViewController
        // TODO: use ShareLink or UIKit share sheet
    }
}

// MARK: - Prompt Edit Sheet

struct PromptEditSheet: View {
    @State var prompt: Prompt
    let onSave: (Prompt) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("Prompt name", text: $prompt.name)
                }
                Section("Prompt") {
                    TextEditor(text: $prompt.prompt)
                        .frame(minHeight: 150)
                }
            }
            .navigationTitle("Edit Prompt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        onSave(prompt)
                        dismiss()
                    }
                }
            }
        }
    }
}
