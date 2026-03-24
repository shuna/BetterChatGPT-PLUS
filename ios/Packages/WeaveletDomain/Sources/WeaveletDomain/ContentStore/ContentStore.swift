import Foundation

// MARK: - Content Entry

/// A single entry in the content-addressable store.
public struct ContentEntry: Codable, Sendable, Equatable {
    public var content: [ContentItem]
    public var refCount: Int
    public var delta: DeltaInfo?

    public init(content: [ContentItem], refCount: Int, delta: DeltaInfo? = nil) {
        self.content = content
        self.refCount = refCount
        self.delta = delta
    }

    public struct DeltaInfo: Codable, Sendable, Equatable {
        public var baseHash: String
        public var patches: String

        public init(baseHash: String, patches: String) {
            self.baseHash = baseHash
            self.patches = patches
        }
    }
}

/// The full content store data type.
public typealias ContentStoreData = [String: ContentEntry]

// MARK: - Content Store

/// Content-addressable storage for message content.
///
/// Maps `contentHash → ContentEntry`. Used to deduplicate identical message
/// bodies across conversations and branches.
///
/// Supports:
/// - FNV-1a hashing for fast content addressing
/// - Reference counting for lifecycle management
/// - Deferred garbage collection for crash safety
/// - Delta compression (requires DiffMatchPatch — currently full-storage only)
public final class ContentStore: @unchecked Sendable {

    /// Maximum delta chain depth before forcing full storage.
    public static let maxChainDepth = 5

    /// If patch size / original text size > this, store full content instead.
    public static let deltaSizeThreshold = 0.7

    /// The underlying store data.
    public var data: ContentStoreData

    /// Hashes with refCount <= 0 pending GC after successful commit.
    public private(set) var pendingGCHashes: Set<String> = []

    public init(data: ContentStoreData = [:]) {
        self.data = data
    }

    // MARK: - FNV-1a Hashing

    /// Compute FNV-1a 32-bit hash of content, output as base-36 string.
    ///
    /// Note: This uses Swift's JSONEncoder which may produce different key ordering
    /// than JavaScript's JSON.stringify. For cross-platform compatibility, always
    /// resolve content fully before cloud sync rather than comparing hashes.
    public static func computeContentHash(_ content: [ContentItem]) -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        guard let jsonData = try? encoder.encode(content),
              let str = String(data: jsonData, encoding: .utf8)
        else {
            return "0"
        }
        return fnv1a32(str)
    }

    /// FNV-1a 32-bit hash, returned as base-36 string.
    static func fnv1a32(_ string: String) -> String {
        var hash: UInt32 = 0x811c9dc5
        for scalar in string.unicodeScalars {
            hash ^= UInt32(scalar.value)
            hash = hash &* 0x01000193
        }
        return String(hash, radix: 36)
    }

    // MARK: - Add Content

    /// Add content to the store. Returns the hash.
    /// If content with the same hash already exists, increments refCount.
    public func addContent(_ content: [ContentItem]) -> String {
        var hash = Self.computeContentHash(content)
        let serialized = serializeContent(content)

        // Handle hash collisions
        while data[hash] != nil, !isContentMatch(hash, serialized: serialized) {
            hash += "_"
        }

        if data[hash] != nil {
            data[hash]!.refCount += 1
        } else {
            data[hash] = ContentEntry(content: content, refCount: 1)
        }
        return hash
    }

    // MARK: - Delta Compression

    /// Check if content is eligible for delta compression (text-only, no images).
    public static func isDeltaEligible(_ content: [ContentItem]) -> Bool {
        !content.isEmpty && content.allSatisfy(\.isText)
    }

    /// Get the delta chain depth for a given hash.
    public func getChainDepth(_ hash: String) -> Int {
        var depth = 0
        var current = hash
        var visited = Set<String>()
        while let entry = data[current], entry.delta != nil {
            if visited.contains(current) { return Self.maxChainDepth + 1 }
            visited.insert(current)
            depth += 1
            current = entry.delta!.baseHash
        }
        return depth
    }

    /// Add content as a delta against baseHash if beneficial.
    /// Currently falls back to full storage (delta compression requires DiffMatchPatch SPM).
    public func addContentDelta(_ content: [ContentItem], baseHash: String) -> String {
        // TODO: Implement delta compression when DiffMatchPatch SPM is added
        // For now, always store full content
        return addContent(content)
    }

    // MARK: - Reference Counting

    /// Increment the reference count for a given hash.
    public func retainContent(_ hash: String) {
        guard !StreamingBuffer.isStreamingContentHash(hash) else { return }
        data[hash]?.refCount += 1
    }

    /// Decrement refCount. If it reaches 0, promote dependents and mark for deferred GC.
    public func releaseContent(_ hash: String) {
        guard !StreamingBuffer.isStreamingContentHash(hash) else { return }
        guard data[hash] != nil else { return }

        data[hash]!.refCount -= 1
        if data[hash]!.refCount <= 0 {
            promoteDependents(hash)
            pendingGCHashes.insert(hash)
        }
    }

    // MARK: - Resolve Content

    /// Resolve a contentHash to actual content.
    /// Follows delta chains up to maxChainDepth.
    public func resolveContent(_ hash: String) -> [ContentItem] {
        if StreamingBuffer.isStreamingContentHash(hash) {
            // Streaming content is handled by StreamingBuffer
            return []
        }

        guard let entry = data[hash] else { return [] }

        if entry.delta == nil {
            return entry.content
        }

        // Delta resolution: walk to base
        var visited = Set<String>()
        var current = hash
        var deltaChain: [(hash: String, patches: String)] = []

        while let e = data[current], let delta = e.delta {
            if visited.contains(current) {
                // Circular reference
                return []
            }
            visited.insert(current)
            deltaChain.append((hash: current, patches: delta.patches))
            current = delta.baseHash
        }

        guard let baseEntry = data[current] else {
            // Missing base
            return []
        }

        // TODO: Apply patches when DiffMatchPatch is available
        // For now, if we encounter a delta entry, return base content as fallback
        return baseEntry.content
    }

    /// Resolve a contentHash to plain text (all text content joined).
    public func resolveContentText(_ hash: String) -> String {
        let content = resolveContent(hash)
        return content.compactMap(\.textValue).joined(separator: " ")
    }

    // MARK: - Content Comparison

    /// Check if stored content at the given hash equals the provided content.
    public func isContentEqual(_ hash: String, content: [ContentItem]) -> Bool {
        let resolved = resolveContent(hash)
        return serializeContent(resolved) == serializeContent(content)
    }

    // MARK: - Promotion

    /// Promote a delta entry to full content.
    public func promoteToFull(_ hash: String) {
        guard let entry = data[hash], entry.delta != nil else { return }
        let resolved = resolveContent(hash)
        data[hash]!.content = resolved
        data[hash]!.delta = nil
    }

    /// Promote all entries that depend on baseHash to full content.
    public func promoteDependents(_ baseHash: String) {
        for (hash, entry) in data {
            if entry.delta?.baseHash == baseHash {
                let resolved = resolveContent(hash)
                data[hash]!.content = resolved
                data[hash]!.delta = nil
            }
        }
    }

    // MARK: - Garbage Collection

    /// Actually remove pending GC entries from the store.
    /// Called after the commit protocol completes successfully.
    @discardableResult
    public func flushPendingGC() -> [String] {
        var flushed: [String] = []
        for hash in pendingGCHashes {
            if let entry = data[hash], entry.refCount <= 0 {
                data.removeValue(forKey: hash)
                flushed.append(hash)
            }
        }
        pendingGCHashes.removeAll()
        return flushed
    }

    // MARK: - Export

    /// Build an export-safe content store with all deltas resolved to full content.
    public func buildExportContentStore() -> ContentStoreData {
        var exported = ContentStoreData()
        for (hash, entry) in data {
            if entry.delta != nil {
                exported[hash] = ContentEntry(content: resolveContent(hash), refCount: entry.refCount)
            } else {
                exported[hash] = ContentEntry(content: entry.content, refCount: entry.refCount)
            }
        }
        return exported
    }

    // MARK: - Validation

    /// Validate all delta entries. Returns set of corrupt hashes.
    public func validateDeltaIntegrity() -> Set<String> {
        var corrupt = Set<String>()

        for (hash, entry) in data {
            guard let delta = entry.delta else { continue }

            // Missing base
            guard data[delta.baseHash] != nil else {
                corrupt.insert(hash)
                continue
            }

            // Circular chain detection
            var visited = Set<String>()
            var cur = hash
            var isCircular = false
            while let e = data[cur], e.delta != nil {
                if visited.contains(cur) {
                    isCircular = true
                    break
                }
                visited.insert(cur)
                cur = e.delta!.baseHash
            }
            if isCircular {
                corrupt.insert(hash)
            }
        }

        return corrupt
    }

    // MARK: - Private Helpers

    private func isContentMatch(_ hash: String, serialized: String) -> Bool {
        guard let entry = data[hash] else { return false }
        if entry.delta != nil {
            let resolved = resolveContent(hash)
            return serializeContent(resolved) == serialized
        }
        return serializeContent(entry.content) == serialized
    }

    private func serializeContent(_ content: [ContentItem]) -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        guard let data = try? encoder.encode(content) else { return "" }
        return String(data: data, encoding: .utf8) ?? ""
    }
}
