import SwiftUI
import WeaveletDomain
import WeaveletInfra

/// Export format options matching Web version's full export capabilities.
struct ExportFormatsView: View {
    let chat: Chat
    let contentStore: ContentStore
    let folders: [String: Folder]
    @Environment(\.dismiss) private var dismiss

    @State private var exportFormat: ExportFormat = .v3json
    @State private var branchScope: BranchScope = .activePath
    @State private var useGzip = false
    @State private var exportURL: URL?

    enum ExportFormat: String, CaseIterable {
        case v3json = "V3 JSON (Native)"
        case openai = "OpenAI Format"
        case openrouter = "OpenRouter Format"
        case markdown = "Markdown"
        case png = "PNG Screenshot"
    }

    enum BranchScope: String, CaseIterable {
        case activePath = "Active Path Only"
        case allBranches = "All Branches"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Format") {
                    Picker("Export Format", selection: $exportFormat) {
                        ForEach(ExportFormat.allCases, id: \.self) { format in
                            Text(format.rawValue).tag(format)
                        }
                    }
                    .pickerStyle(.inline)
                }

                Section("Scope") {
                    Picker("Branch Scope", selection: $branchScope) {
                        ForEach(BranchScope.allCases, id: \.self) { scope in
                            Text(scope.rawValue).tag(scope)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                if exportFormat == .v3json {
                    Section("Compression") {
                        Toggle("gzip Compress", isOn: $useGzip)
                    }
                }

                Section {
                    Button {
                        generateExport()
                    } label: {
                        Label("Generate Export", systemImage: "doc.text")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)

                    if let url = exportURL {
                        ShareLink(item: url) {
                            Label("Share File", systemImage: "square.and.arrow.up")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                    }
                }

                Section("Preview") {
                    Text(previewDescription)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Export \"\(chat.title)\"")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private var previewDescription: String {
        let msgCount = branchScope == .activePath
            ? chat.messages.count
            : (chat.branchTree?.nodes.count ?? chat.messages.count)
        return "\(msgCount) messages • \(exportFormat.rawValue)"
    }

    // MARK: - Export Generation

    private func generateExport() {
        let data: Data?
        let ext: String

        switch exportFormat {
        case .v3json:
            data = generateV3JSON()
            ext = useGzip ? "json.gz" : "json"
        case .openai:
            data = generateOpenAIFormat()
            ext = "json"
        case .openrouter:
            data = generateOpenRouterFormat()
            ext = "json"
        case .markdown:
            data = generateMarkdown()
            ext = "md"
        case .png:
            data = generatePNG()
            ext = "png"
        }

        guard let exportData = data else { return }
        let safeName = chat.title.replacingOccurrences(of: "/", with: "_")
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(safeName).\(ext)")
        try? exportData.write(to: url)
        exportURL = url
    }

    private func generateV3JSON() -> Data? {
        let persisted = PersistedChat(from: chat)
        let export = ExportV3(
            chats: [persisted],
            contentStore: contentStore.data,
            folders: folders
        )
        guard let jsonData = try? JSONEncoder().encode(export) else { return nil }
        if useGzip {
            return try? (jsonData as NSData).compressed(using: .zlib) as Data
        }
        return jsonData
    }

    private func generateOpenAIFormat() -> Data? {
        // OpenAI JSONL format: one message per line
        let messages = resolveMessages()
        let formatted = messages.map { msg -> [String: Any] in
            [
                "role": msg.role.rawValue,
                "content": msg.content.compactMap(\.textValue).joined()
            ]
        }
        let wrapper: [String: Any] = ["messages": formatted]
        return try? JSONSerialization.data(withJSONObject: wrapper, options: .prettyPrinted)
    }

    private func generateOpenRouterFormat() -> Data? {
        // Same as OpenAI but with model metadata
        let messages = resolveMessages()
        let formatted = messages.map { msg -> [String: Any] in
            [
                "role": msg.role.rawValue,
                "content": msg.content.compactMap(\.textValue).joined()
            ]
        }
        let wrapper: [String: Any] = [
            "model": chat.config.model,
            "messages": formatted
        ]
        return try? JSONSerialization.data(withJSONObject: wrapper, options: .prettyPrinted)
    }

    private func generateMarkdown() -> Data? {
        let messages = resolveMessages()
        var md = "# \(chat.title)\n\n"
        for msg in messages {
            let roleLabel = msg.role.rawValue.capitalized
            md += "## \(roleLabel)\n\n"
            for item in msg.content {
                switch item {
                case .text(let content):
                    md += content.text + "\n\n"
                case .reasoning(let content):
                    md += "> **Reasoning:** \(content.text)\n\n"
                case .imageURL(let content):
                    md += "![Image](\(content.imageURL.url))\n\n"
                default:
                    break
                }
            }
            md += "---\n\n"
        }
        return md.data(using: .utf8)
    }

    @MainActor
    private func generatePNG() -> Data? {
        // Render messages to a SwiftUI view, then snapshot to image
        let messages = resolveMessages()
        var text = "# \(chat.title)\n\n"
        for msg in messages {
            text += "[\(msg.role.rawValue.capitalized)]\n"
            text += msg.content.compactMap(\.textValue).joined() + "\n\n"
        }

        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 800, height: max(400, messages.count * 80)))
        let image = renderer.image { context in
            let rect = renderer.format.bounds
            UIColor.systemBackground.setFill()
            context.fill(rect)

            let paragraphStyle = NSMutableParagraphStyle()
            paragraphStyle.lineBreakMode = .byWordWrapping

            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 14),
                .foregroundColor: UIColor.label,
                .paragraphStyle: paragraphStyle
            ]

            let titleAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.boldSystemFont(ofSize: 18),
                .foregroundColor: UIColor.label
            ]

            var y: CGFloat = 16
            (chat.title as NSString).draw(
                in: CGRect(x: 16, y: y, width: rect.width - 32, height: 30),
                withAttributes: titleAttrs
            )
            y += 36

            for msg in messages {
                // Role header
                let roleColor: UIColor = msg.role == .user ? .systemBlue : msg.role == .assistant ? .systemGreen : .systemOrange
                let roleAttrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.boldSystemFont(ofSize: 12),
                    .foregroundColor: roleColor
                ]
                (msg.role.rawValue.capitalized as NSString).draw(
                    in: CGRect(x: 16, y: y, width: rect.width - 32, height: 20),
                    withAttributes: roleAttrs
                )
                y += 22

                // Content
                let content = msg.content.compactMap(\.textValue).joined()
                let textRect = CGRect(x: 16, y: y, width: rect.width - 32, height: rect.height - y - 16)
                let boundingRect = (content as NSString).boundingRect(
                    with: CGSize(width: rect.width - 32, height: .greatestFiniteMagnitude),
                    options: [.usesLineFragmentOrigin, .usesFontLeading],
                    attributes: attrs,
                    context: nil
                )
                (content as NSString).draw(in: textRect, withAttributes: attrs)
                y += boundingRect.height + 16

                if y > rect.height - 30 { break }
            }
        }
        return image.pngData()
    }

    private func resolveMessages() -> [Message] {
        if branchScope == .activePath {
            return chat.messages
        }
        // All branches — collect all nodes' content
        guard let tree = chat.branchTree else { return chat.messages }
        var messages: [Message] = []
        // Walk tree in DFS order
        func walk(_ nodeId: String, depth: Int) {
            guard let node = tree.nodes[nodeId] else { return }
            let content = contentStore.resolveContent(node.contentHash)
            messages.append(Message(role: node.role, content: content))
            let children = tree.nodes.values
                .filter { $0.parentId == nodeId }
                .sorted { $0.createdAt < $1.createdAt }
            for child in children {
                walk(child.id, depth: depth + 1)
            }
        }
        if !tree.rootId.isEmpty {
            let rootId = tree.rootId
            walk(rootId, depth: 0)
        }
        return messages
    }
}
