import Foundation

// MARK: - Content Entry

struct ContentEntry: Codable, Hashable {
    var content: [ContentItem]
    var refCount: Int
    // v1: delta compression excluded (delta, baseHash, patches ignored)
}

/// Web-compatible: `Record<string, ContentEntry>` → `[String: ContentEntry]`
typealias ContentStoreData = [String: ContentEntry]

// MARK: - ContentStore (pure functions, matching Web's contentStore.ts)

nonisolated enum ContentStore {

    // MARK: - FNV-1a Hash (Web-compatible)

    /// Compute FNV-1a 32-bit hash of ContentItem array, matching Web's computeContentHash.
    /// Web version: JSON.stringify → FNV-1a → .toString(36)
    static func computeContentHash(_ content: [ContentItem]) -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        // Match Web's JSON.stringify output for content items
        let str = contentToJSONString(content)
        var hash: UInt32 = 0x811c9dc5
        for byte in str.utf8 {
            hash ^= UInt32(byte)
            hash = hash &* 0x01000193
        }
        return String(hash, radix: 36)
    }

    /// Serialize content to JSON string matching Web's JSON.stringify format.
    private static func contentToJSONString(_ content: [ContentItem]) -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [] // compact, no sorting (match JS behavior)
        guard let data = try? encoder.encode(content),
              let str = String(data: data, encoding: .utf8) else {
            return "[]"
        }
        return str
    }

    // MARK: - Add Content

    /// Add content to the store. Returns the hash.
    /// If content with same hash already exists, increments refCount.
    /// Handles hash collisions by appending '_' suffix.
    static func addContent(
        _ store: inout ContentStoreData,
        content: [ContentItem]
    ) -> String {
        var hash = computeContentHash(content)
        let serialized = contentToJSONString(content)

        // Handle hash collisions
        while let existing = store[hash], !isContentMatch(existing, serialized) {
            hash += "_"
        }

        if store[hash] != nil {
            store[hash]!.refCount += 1
        } else {
            store[hash] = ContentEntry(content: content, refCount: 1)
        }
        return hash
    }

    /// Check if a stored entry matches the given serialized content.
    private static func isContentMatch(_ entry: ContentEntry, _ serialized: String) -> Bool {
        let stored = contentToJSONString(entry.content)
        return stored == serialized
    }

    // MARK: - Retain / Release

    /// Increment reference count for a given hash.
    static func retainContent(_ store: inout ContentStoreData, hash: String) {
        guard store[hash] != nil else { return }
        store[hash]!.refCount += 1
    }

    /// Decrement reference count. Removes entry when refCount reaches 0.
    /// v1: no deferred GC, no delta promotion — immediate removal.
    static func releaseContent(_ store: inout ContentStoreData, hash: String) {
        guard store[hash] != nil else { return }
        store[hash]!.refCount -= 1
        if store[hash]!.refCount <= 0 {
            store.removeValue(forKey: hash)
        }
    }

    // MARK: - Resolve

    /// Resolve a contentHash to actual content.
    /// v1: no delta chains, direct lookup only.
    static func resolveContent(_ store: ContentStoreData, hash: String) -> [ContentItem] {
        store[hash]?.content ?? []
    }

    /// Resolve a contentHash to plain text (all text content joined).
    static func resolveContentText(_ store: ContentStoreData, hash: String) -> String {
        resolveContent(store, hash: hash)
            .compactMap(\.textValue)
            .joined(separator: " ")
    }

    // MARK: - Comparison

    /// Check if stored content at the given hash equals the provided content.
    static func isContentEqual(
        _ store: ContentStoreData,
        hash: String,
        content: [ContentItem]
    ) -> Bool {
        let resolved = resolveContent(store, hash: hash)
        return contentToJSONString(resolved) == contentToJSONString(content)
    }

    // MARK: - Export

    /// Build an export-safe content store (v1: same as input since no deltas).
    static func buildExportContentStore(_ store: ContentStoreData) -> ContentStoreData {
        store
    }
}
