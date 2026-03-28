import SwiftUI

struct ChatInputBar: View {
    @Binding var text: String
    let isGenerating: Bool
    var enterToSubmit: Bool = true
    var prompts: [Prompt] = []
    let onSend: () -> Void
    let onStop: () -> Void

    @State private var isFocused = false
    @State private var showPromptPopup = false
    @State private var editorHeight: CGFloat = 38

    var body: some View {
        VStack(spacing: 0) {
            if showPromptPopup {
                CommandPromptPopup(
                    prompts: prompts,
                    onSelect: { prompt in
                        text += prompt.prompt
                        showPromptPopup = false
                        isFocused = true
                    },
                    onDismiss: { showPromptPopup = false }
                )
                .padding(.horizontal, 12)
                .padding(.bottom, 4)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            HStack(alignment: .center, spacing: 10) {
                Button {
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 26))
                        .foregroundStyle(.secondary)
                }
                .frame(height: editorHeight)

                if !prompts.isEmpty {
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            showPromptPopup.toggle()
                        }
                    } label: {
                        Text("/")
                            .font(.system(size: 18, weight: .semibold, design: .monospaced))
                            .foregroundStyle(showPromptPopup ? Color.accentColor : .secondary)
                            .frame(width: 28, height: 28)
                            .background(
                                showPromptPopup ? Color.accentColor.opacity(0.15) : Color.clear,
                                in: RoundedRectangle(cornerRadius: 6)
                            )
                    }
                    .frame(height: editorHeight)
                }

                AutoSizingTextEditor(
                    text: $text,
                    calculatedHeight: $editorHeight,
                    isFocused: $isFocused,
                    placeholder: "Message",
                    enterToSubmit: enterToSubmit,
                    minVisibleLines: 1,
                    maxVisibleLines: 3,
                    onSubmit: {
                        if canSend { onSend() }
                    }
                )
                .frame(height: editorHeight)
                .padding(.horizontal, 4)
                .background(AppColors.inputBackground.opacity(0.5), in: RoundedRectangle(cornerRadius: 16))

                if isGenerating {
                    Button {
                        onStop()
                    } label: {
                        Image(systemName: "stop.circle.fill")
                            .font(.system(size: 30))
                            .foregroundStyle(.red)
                            .symbolEffect(.pulse, options: .repeating)
                    }
                    .frame(height: editorHeight)
                } else {
                    Button {
                        onSend()
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 30))
                            .foregroundStyle(canSend ? Color.accentColor : Color(.tertiaryLabel))
                    }
                    .disabled(!canSend)
                    .frame(height: editorHeight)
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 6)
            .padding(.bottom, 6)
        }
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 22))
        .overlay {
            RoundedRectangle(cornerRadius: 22)
                .strokeBorder(Color.white.opacity(0.08))
        }
        .shadow(color: .black.opacity(0.16), radius: 10, y: 2)
    }

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
