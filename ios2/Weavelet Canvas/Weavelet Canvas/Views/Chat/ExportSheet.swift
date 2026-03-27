import SwiftUI

/// Sheet for choosing export format and options for a single chat.
struct ExportSheet: View {
    let chatId: String
    let chatViewModel: ChatViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var format: ExportImportService.ExportFormat = .json
    @State private var visibleBranchOnly = false
    @State private var gzipCompress = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Format") {
                    Picker("Format", selection: $format) {
                        ForEach(ExportImportService.ExportFormat.allCases) { fmt in
                            Text(fmt.label).tag(fmt)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }

                Section("Options") {
                    Toggle("Visible branch only", isOn: $visibleBranchOnly)
                        .disabled(format == .openAI || format == .openRouter)

                    Toggle("Gzip compression", isOn: $gzipCompress)
                        .disabled(format == .markdown)
                }

                Section {
                    Button {
                        chatViewModel.exportChatToShare(
                            chatId,
                            format: format,
                            visibleBranchOnly: visibleBranchOnly,
                            gzipCompress: gzipCompress
                        )
                        dismiss()
                    } label: {
                        Label("Export", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                    }
                }
            }
            .navigationTitle("Export Chat")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
    }
}
