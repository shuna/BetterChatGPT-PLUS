import Foundation

/// Status of a streaming request for recovery purposes.
enum StreamStatus: String, Codable {
    case streaming
    case completed
    case interrupted
    case failed
}

/// A record tracking an in-progress or recently-completed streaming request.
/// Persisted to disk so partial responses can be recovered after crashes.
struct StreamRecord: Codable, Identifiable {
    /// Unique request ID (UUID string).
    let id: String
    /// The chat this stream belongs to.
    let chatId: String
    /// The assistant branch node being streamed into.
    let nodeId: String
    /// Accumulated response text (replaced on each chunk, not appended).
    var bufferedText: String
    /// Current status of the stream.
    var status: StreamStatus
    /// When the stream request was created.
    var createdAt: Date
    /// When the buffered text was last updated (used for stale detection).
    var updatedAt: Date

    // MARK: - Proxy (Epic 7, Ticket 26)

    /// Proxy session ID for KV recovery (nil if not using proxy).
    var proxySessionId: String?
    /// Last proxy event ID received (for recovery resume point).
    var lastProxyEventId: Int?

    init(
        id: String, chatId: String, nodeId: String,
        bufferedText: String, status: StreamStatus,
        createdAt: Date, updatedAt: Date,
        proxySessionId: String? = nil, lastProxyEventId: Int? = nil
    ) {
        self.id = id
        self.chatId = chatId
        self.nodeId = nodeId
        self.bufferedText = bufferedText
        self.status = status
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.proxySessionId = proxySessionId
        self.lastProxyEventId = lastProxyEventId
    }
}
