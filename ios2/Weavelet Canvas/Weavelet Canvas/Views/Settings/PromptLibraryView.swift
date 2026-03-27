import SwiftUI

/// Full prompt library editor (accessible from Settings).
struct PromptLibraryView: View {
    var settings: SettingsViewModel
    @State private var editingPrompt: Prompt?
    @State private var isAdding = false

    var body: some View {
        List {
            Section("My Prompts") {
                if settings.prompts.isEmpty {
                    Text("No custom prompts yet")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(settings.prompts) { prompt in
                        promptRow(prompt, isDefault: false)
                    }
                    .onDelete { indexSet in
                        let ids = indexSet.map { settings.prompts[$0].id }
                        for id in ids { settings.removePrompt(id: id) }
                    }
                }
            }

            Section("Default Prompts") {
                ForEach(DefaultPrompts.all) { prompt in
                    promptRow(prompt, isDefault: true)
                }
            }
        }
        .navigationTitle("Prompt Library")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    isAdding = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $isAdding) {
            PromptEditorSheet(settings: settings, existing: nil) { name, prompt in
                settings.addPrompt(name: name, prompt: prompt)
            }
        }
        .sheet(item: $editingPrompt) { prompt in
            PromptEditorSheet(settings: settings, existing: prompt) { name, text in
                settings.updatePrompt(id: prompt.id, name: name, prompt: text)
            }
        }
    }

    private func promptRow(_ prompt: Prompt, isDefault: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(prompt.name)
                .font(.headline)
            Text(prompt.prompt)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if !isDefault { editingPrompt = prompt }
        }
    }
}

/// Sheet for adding or editing a prompt.
struct PromptEditorSheet: View {
    let settings: SettingsViewModel
    let existing: Prompt?
    let onSave: (String, String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name: String = ""
    @State private var promptText: String = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("Prompt name", text: $name)
                }
                Section("Prompt") {
                    TextEditor(text: $promptText)
                        .frame(minHeight: 120)
                }
            }
            .navigationTitle(existing == nil ? "New Prompt" : "Edit Prompt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(name, promptText)
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear {
                if let existing {
                    name = existing.name
                    promptText = existing.prompt
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
