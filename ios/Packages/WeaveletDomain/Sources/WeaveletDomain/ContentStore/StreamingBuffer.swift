import Foundation

/// Manages in-flight streaming content for active LLM generation sessions.
///
/// During streaming, content is stored in a temporary buffer indexed by node ID.
/// The streaming hash format `__streaming:{nodeId}` is used to reference buffered
/// content without polluting the content store.
public final class StreamingBuffer: @unchecked Sendable {

    /// Prefix for streaming content hashes.
    public static let streamingPrefix = "__streaming:"

    /// Interval for periodic snapshot flushes (in seconds).
    public static let snapshotFlushInterval: TimeInterval = 5.0

    // MARK: - Buffer Entry

    public struct Entry: Sendable {
        public var content: [ContentItem]
        public var reasoning: String

        public init(content: [ContentItem] = [], reasoning: String = "") {
            self.content = content
            self.reasoning = reasoning
        }
    }

    // MARK: - State

    private var buffers: [String: Entry] = [:]  // nodeId -> Entry
    private var chatIdMap: [String: String] = [:] // nodeId -> chatId

    public init() {}

    // MARK: - Hash Utilities

    /// Create a streaming content hash for a node ID.
    public static func createStreamingContentHash(_ nodeId: String) -> String {
        "\(streamingPrefix)\(nodeId)"
    }

    /// Check if a hash is a streaming content hash.
    public static func isStreamingContentHash(_ hash: String) -> Bool {
        hash.hasPrefix(streamingPrefix)
    }

    /// Extract the node ID from a streaming content hash.
    public static func getStreamingNodeIdFromHash(_ hash: String) -> String? {
        guard hash.hasPrefix(streamingPrefix) else { return nil }
        return String(hash.dropFirst(streamingPrefix.count))
    }

    // MARK: - Buffer Operations

    /// Initialize a streaming buffer for a node.
    public func initializeBuffer(nodeId: String, chatId: String) {
        buffers[nodeId] = Entry()
        chatIdMap[nodeId] = chatId
    }

    /// Append text to the streaming buffer for a node.
    public func appendText(nodeId: String, text: String) {
        guard buffers[nodeId] != nil else { return }

        if let lastIndex = buffers[nodeId]!.content.indices.last,
           case .text(var textContent) = buffers[nodeId]!.content[lastIndex] {
            textContent.text += text
            buffers[nodeId]!.content[lastIndex] = .text(textContent)
        } else {
            buffers[nodeId]!.content.append(.fromString(text))
        }
    }

    /// Append reasoning text to the streaming buffer.
    public func appendReasoning(nodeId: String, text: String) {
        buffers[nodeId]?.reasoning += text
    }

    /// Get a clone of the buffered content (safe for mutation).
    public func getBufferedContent(_ nodeId: String) -> [ContentItem]? {
        buffers[nodeId]?.content
    }

    /// Get a reference to the buffered content (read-only).
    public func peekBufferedContent(_ nodeId: String) -> [ContentItem]? {
        buffers[nodeId]?.content
    }

    /// Get the buffered reasoning text.
    public func peekBufferedReasoning(_ nodeId: String) -> String? {
        buffers[nodeId]?.reasoning
    }

    /// Finalize the streaming buffer: prepend reasoning as a content item,
    /// then return the final content and remove from buffer.
    public func finalizeBuffer(nodeId: String) -> [ContentItem]? {
        guard var entry = buffers[nodeId] else { return nil }

        // Prepend reasoning as a reasoning content item
        if !entry.reasoning.isEmpty {
            entry.content.insert(
                .reasoning(ReasoningContent(text: entry.reasoning)),
                at: 0
            )
        }

        buffers.removeValue(forKey: nodeId)
        chatIdMap.removeValue(forKey: nodeId)
        return entry.content
    }

    /// Check if any streaming buffers are active.
    public var hasActiveBuffers: Bool {
        !buffers.isEmpty
    }

    /// Get the set of chat IDs with active streaming buffers.
    public var streamingChatIds: Set<String> {
        Set(chatIdMap.values)
    }

    /// Check if a specific node is currently buffering.
    public func isBufferingNode(_ nodeId: String) -> Bool {
        buffers[nodeId] != nil
    }

    /// Remove all buffers (e.g. on app reset).
    public func clear() {
        buffers.removeAll()
        chatIdMap.removeAll()
    }
}
