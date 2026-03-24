import SwiftUI
import WeaveletDomain
import PhotosUI

/// Chat input bar with model selector, role selector (advanced), image attach, and send button.
struct ChatInputView: View {
    @Environment(AppState.self) private var appState
    @State private var inputText = ""
    @State private var inputRole: Role = .user
    @State private var attachedImages: [AttachedImage] = []
    @State private var showPhotoPicker = false
    @State private var showImageURLInput = false
    @State private var imageURLText = ""
    @State private var selectedPhotoItems: [PhotosPickerItem] = []
    @FocusState private var isFocused: Bool
    @State private var showPromptPalette = false

    private var conversation: ConversationViewModel { appState.conversation }

    /// Filtered prompts matching current slash input.
    private var matchingPrompts: [Prompt] {
        guard inputText.hasPrefix("/") else { return [] }
        let query = String(inputText.dropFirst()).lowercased()
        if query.isEmpty { return appState.settings.prompts }
        return appState.settings.prompts.filter {
            $0.name.lowercased().contains(query)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Prompt palette (slash command)
            if inputText.hasPrefix("/") && !matchingPrompts.isEmpty {
                promptPalette
            }

            // Attached images preview
            if !attachedImages.isEmpty {
                attachedImagesBar
            }

            HStack(alignment: .bottom, spacing: 8) {
                // Left buttons: attach + role
                leftButtons

                // Text input
                TextField("Message", text: $inputText, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...8)
                    .focused($isFocused)
                    .padding(10)
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 16))
                    .onSubmit {
                        if appState.settings.enterToSubmit {
                            sendMessage()
                        }
                    }

                // Save button (add message without sending to LLM)
                if appState.settings.advancedMode {
                    Button {
                        saveWithoutSending()
                    } label: {
                        Image(systemName: "square.and.arrow.down")
                            .font(.system(size: 16))
                            .foregroundStyle(canSend ? Color.secondary : Color.gray)
                            .frame(width: 32, height: 32)
                    }
                    .disabled(!canSend)
                }

                // Send / Stop button
                sendButton
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.bar)
        }
        .photosPicker(
            isPresented: $showPhotoPicker,
            selection: $selectedPhotoItems,
            maxSelectionCount: 4,
            matching: .images
        )
        .onChange(of: selectedPhotoItems) {
            Task { await loadSelectedPhotos() }
        }
        .alert("Add Image URL", isPresented: $showImageURLInput) {
            TextField("https://...", text: $imageURLText)
            Button("Add") {
                if !imageURLText.isEmpty {
                    attachedImages.append(AttachedImage(url: imageURLText))
                    imageURLText = ""
                }
            }
            Button("Cancel", role: .cancel) { imageURLText = "" }
        }
    }

    // MARK: - Prompt Palette

    @ViewBuilder
    private var promptPalette: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(matchingPrompts) { prompt in
                    Button {
                        inputText = prompt.prompt
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("/" + prompt.name)
                                .font(.callout.bold())
                                .foregroundStyle(.primary)
                            Text(prompt.prompt.prefix(80))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    Divider()
                }
            }
        }
        .frame(maxHeight: 180)
        .background(.regularMaterial)
    }

    // MARK: - Left Buttons

    @ViewBuilder
    private var leftButtons: some View {
        HStack(spacing: 4) {
            // Attach image
            Menu {
                Button {
                    showPhotoPicker = true
                } label: {
                    Label("Photo Library", systemImage: "photo")
                }
                Button {
                    showImageURLInput = true
                } label: {
                    Label("Image URL", systemImage: "link")
                }
            } label: {
                Image(systemName: "paperclip")
                    .font(.system(size: 18))
                    .foregroundStyle(.secondary)
                    .frame(width: 32, height: 32)
            }

            // Role selector (advanced mode only)
            if appState.settings.advancedMode {
                Menu {
                    ForEach([Role.user, .assistant, .system], id: \.self) { role in
                        Button {
                            inputRole = role
                        } label: {
                            HStack {
                                Text(role.rawValue.capitalized)
                                if inputRole == role {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                } label: {
                    Text(inputRole.rawValue.prefix(1).uppercased())
                        .font(.caption.bold())
                        .foregroundStyle(.white)
                        .frame(width: 24, height: 24)
                        .background(roleColor, in: Circle())
                }
            }
        }
    }

    // MARK: - Send Button

    @ViewBuilder
    private var sendButton: some View {
        if conversation.isStreaming {
            // Stop button
            Button {
                conversation.stopStreaming()
            } label: {
                Image(systemName: "stop.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(.red, in: Circle())
            }
        } else {
            Button {
                sendMessage()
            } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 20))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(canSend ? AnyShapeStyle(.tint) : AnyShapeStyle(.gray), in: Circle())
            }
            .disabled(!canSend)
        }
    }

    // MARK: - Attached Images Bar

    @ViewBuilder
    private var attachedImagesBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(attachedImages) { img in
                    ZStack(alignment: .topTrailing) {
                        if let uiImage = img.uiImage {
                            Image(uiImage: uiImage)
                                .resizable()
                                .scaledToFill()
                                .frame(width: 60, height: 60)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        } else {
                            RoundedRectangle(cornerRadius: 8)
                                .fill(.quaternary)
                                .frame(width: 60, height: 60)
                                .overlay {
                                    Image(systemName: "photo")
                                        .foregroundStyle(.secondary)
                                }
                        }

                        Button {
                            attachedImages.removeAll { $0.id == img.id }
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.caption)
                                .foregroundStyle(.white)
                                .background(Color.black.opacity(0.6), in: Circle())
                        }
                        .offset(x: 4, y: -4)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
        }
    }

    // MARK: - Actions

    private var canSend: Bool {
        let hasText = !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let hasImages = !attachedImages.isEmpty
        return (hasText || hasImages) && !conversation.isStreaming
    }

    private var roleColor: Color {
        switch inputRole {
        case .user: return .blue
        case .assistant: return .green
        case .system: return .orange
        }
    }

    private func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !attachedImages.isEmpty else { return }

        var content: [ContentItem] = []

        // Add text
        if !text.isEmpty {
            content.append(.fromString(text))
        }

        // Add images
        for img in attachedImages {
            if let url = img.url {
                content.append(.imageURL(ImageContent(url: url, detail: .auto)))
            }
        }

        conversation.appendMessage(role: inputRole, content: content)
        inputText = ""
        attachedImages.removeAll()
        selectedPhotoItems.removeAll()

        conversation.syncToList(appState.chatList)

        // Trigger LLM API call (only for user role messages)
        if inputRole == .user {
            conversation.sendAndStream(settings: appState.settings)
        }
    }

    /// Save message without sending to LLM (advanced mode).
    private func saveWithoutSending() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !attachedImages.isEmpty else { return }

        var content: [ContentItem] = []
        if !text.isEmpty {
            content.append(.fromString(text))
        }
        for img in attachedImages {
            if let url = img.url {
                content.append(.imageURL(ImageContent(url: url, detail: .auto)))
            }
        }

        conversation.appendMessage(role: inputRole, content: content)
        inputText = ""
        attachedImages.removeAll()
        selectedPhotoItems.removeAll()
        conversation.syncToList(appState.chatList)
        // No LLM call — just saves the message
    }

    private func loadSelectedPhotos() async {
        for item in selectedPhotoItems {
            if let data = try? await item.loadTransferable(type: Data.self),
               let uiImage = UIImage(data: data) {
                // For now, store as local image. Phase I will handle upload.
                let img = AttachedImage(uiImage: uiImage)
                await MainActor.run {
                    attachedImages.append(img)
                }
            }
        }
        await MainActor.run {
            selectedPhotoItems.removeAll()
        }
    }
}

// MARK: - Attached Image Model

struct AttachedImage: Identifiable {
    let id = UUID()
    var url: String?
    var uiImage: UIImage?

    init(url: String) {
        self.url = url
    }

    init(uiImage: UIImage) {
        self.uiImage = uiImage
        // TODO: Phase I — upload and get URL
    }
}
