import Testing
import Foundation
@testable import WeaveletDomain

// MARK: - FNV-1a Hash Tests

@Test func hashProducesConsistentResults() {
    let content: [ContentItem] = [.fromString("Hello, world!")]
    let hash1 = ContentStore.computeContentHash(content)
    let hash2 = ContentStore.computeContentHash(content)
    #expect(hash1 == hash2)
}

@Test func hashDiffersForDifferentContent() {
    let hash1 = ContentStore.computeContentHash([.fromString("Hello")])
    let hash2 = ContentStore.computeContentHash([.fromString("World")])
    #expect(hash1 != hash2)
}

@Test func hashIsBase36String() {
    let hash = ContentStore.computeContentHash([.fromString("test")])
    // base-36 contains only [0-9a-z]
    let validChars = CharacterSet(charactersIn: "0123456789abcdefghijklmnopqrstuvwxyz")
    #expect(hash.unicodeScalars.allSatisfy { validChars.contains($0) })
}

// MARK: - Add/Resolve Content Tests

@Test func addContentAndResolve() {
    let store = ContentStore()
    let content: [ContentItem] = [.fromString("Hello")]
    let hash = store.addContent(content)

    let resolved = store.resolveContent(hash)
    #expect(resolved.count == 1)
    #expect(resolved[0].textValue == "Hello")
}

@Test func addContentIncreasesRefCount() {
    let store = ContentStore()
    let content: [ContentItem] = [.fromString("Same")]

    let hash1 = store.addContent(content)
    let hash2 = store.addContent(content)

    #expect(hash1 == hash2)
    #expect(store.data[hash1]?.refCount == 2)
}

@Test func resolveContentForMissingHash() {
    let store = ContentStore()
    let resolved = store.resolveContent("nonexistent")
    #expect(resolved.isEmpty)
}

// MARK: - Reference Counting Tests

@Test func retainContentIncrementsRefCount() {
    let store = ContentStore()
    let content: [ContentItem] = [.fromString("Retain me")]
    let hash = store.addContent(content)
    #expect(store.data[hash]?.refCount == 1)

    store.retainContent(hash)
    #expect(store.data[hash]?.refCount == 2)
}

@Test func releaseContentDecrementsRefCount() {
    let store = ContentStore()
    let content: [ContentItem] = [.fromString("Release me")]
    let hash = store.addContent(content)
    store.retainContent(hash) // refCount = 2

    store.releaseContent(hash) // refCount = 1
    #expect(store.data[hash]?.refCount == 1)
    #expect(!store.pendingGCHashes.contains(hash))
}

@Test func releaseContentMarksForGCAtZero() {
    let store = ContentStore()
    let content: [ContentItem] = [.fromString("GC me")]
    let hash = store.addContent(content) // refCount = 1

    store.releaseContent(hash) // refCount = 0
    #expect(store.data[hash]?.refCount == 0)
    #expect(store.pendingGCHashes.contains(hash))

    // Entry still exists until flush
    #expect(store.data[hash] != nil)
}

@Test func flushPendingGCRemovesEntries() {
    let store = ContentStore()
    let content: [ContentItem] = [.fromString("GC me")]
    let hash = store.addContent(content)
    store.releaseContent(hash)

    let flushed = store.flushPendingGC()
    #expect(flushed.contains(hash))
    #expect(store.data[hash] == nil)
    #expect(store.pendingGCHashes.isEmpty)
}

@Test func flushDoesNotRemoveRetainedEntries() {
    let store = ContentStore()
    let content: [ContentItem] = [.fromString("Keep me")]
    let hash = store.addContent(content)
    store.releaseContent(hash) // pending GC
    store.retainContent(hash)  // re-retained (refCount = 1)

    let flushed = store.flushPendingGC()
    #expect(flushed.isEmpty)
    #expect(store.data[hash] != nil)
}

// MARK: - Hash Collision Handling

@Test func hashCollisionAppendsUnderscore() {
    let store = ContentStore()

    // Add first content
    let content1: [ContentItem] = [.fromString("A")]
    let hash1 = store.addContent(content1)

    // Manually insert a different content with the same hash to simulate collision
    let fakeContent: [ContentItem] = [.fromString("B")]
    store.data[hash1] = ContentEntry(content: fakeContent, refCount: 1)

    // Now add original content again - should get hash with underscore
    let hash2 = store.addContent(content1)
    #expect(hash2 == hash1 + "_")
}

// MARK: - Content Equality

@Test func isContentEqualTrue() {
    let store = ContentStore()
    let content: [ContentItem] = [.fromString("Match")]
    let hash = store.addContent(content)

    #expect(store.isContentEqual(hash, content: content))
}

@Test func isContentEqualFalse() {
    let store = ContentStore()
    let content: [ContentItem] = [.fromString("Original")]
    let hash = store.addContent(content)

    let different: [ContentItem] = [.fromString("Different")]
    #expect(!store.isContentEqual(hash, content: different))
}

// MARK: - Resolve Content Text

@Test func resolveContentTextJoinsTextItems() {
    let store = ContentStore()
    let content: [ContentItem] = [
        .fromString("Hello"),
        .reasoning(ReasoningContent(text: "thinking...")),
        .fromString("World")
    ]
    let hash = store.addContent(content)

    let text = store.resolveContentText(hash)
    #expect(text == "Hello World")
}

// MARK: - Delta Eligibility

@Test func deltaEligibleForTextOnly() {
    let textOnly: [ContentItem] = [.fromString("A"), .fromString("B")]
    #expect(ContentStore.isDeltaEligible(textOnly))
}

@Test func deltaNotEligibleForImages() {
    let withImage: [ContentItem] = [
        .fromString("text"),
        .imageURL(ImageContent(url: "http://img", detail: .auto))
    ]
    #expect(!ContentStore.isDeltaEligible(withImage))
}

@Test func deltaNotEligibleForEmpty() {
    let empty: [ContentItem] = []
    #expect(!ContentStore.isDeltaEligible(empty))
}

// MARK: - Export

@Test func buildExportContentStoreResolvesAll() {
    let store = ContentStore()
    let content: [ContentItem] = [.fromString("Export me")]
    let hash = store.addContent(content)

    let exported = store.buildExportContentStore()
    #expect(exported[hash]?.content.count == 1)
    #expect(exported[hash]?.delta == nil)
}

// MARK: - Streaming Hash Detection

@Test func streamingContentHashDetection() {
    #expect(!StreamingBuffer.isStreamingContentHash("abc123"))
    #expect(StreamingBuffer.isStreamingContentHash("__streaming:node-1"))

    let hash = StreamingBuffer.createStreamingContentHash("node-42")
    #expect(hash == "__streaming:node-42")
    #expect(StreamingBuffer.isStreamingContentHash(hash))
    #expect(StreamingBuffer.getStreamingNodeIdFromHash(hash) == "node-42")
}

@Test func retainAndReleaseIgnoreStreamingHashes() {
    let store = ContentStore()
    let hash = StreamingBuffer.createStreamingContentHash("node-1")

    // Should not crash or create entries
    store.retainContent(hash)
    store.releaseContent(hash)
    #expect(store.data.isEmpty)
}

// MARK: - Validation

@Test func validateDeltaIntegrityEmpty() {
    let store = ContentStore()
    let corrupt = store.validateDeltaIntegrity()
    #expect(corrupt.isEmpty)
}

@Test func validateDeltaIntegrityMissingBase() {
    let store = ContentStore()
    store.data["broken"] = ContentEntry(
        content: [],
        refCount: 1,
        delta: ContentEntry.DeltaInfo(baseHash: "nonexistent", patches: "")
    )

    let corrupt = store.validateDeltaIntegrity()
    #expect(corrupt.contains("broken"))
}

@Test func validateDeltaIntegrityCircularChain() {
    let store = ContentStore()
    store.data["a"] = ContentEntry(
        content: [],
        refCount: 1,
        delta: ContentEntry.DeltaInfo(baseHash: "b", patches: "")
    )
    store.data["b"] = ContentEntry(
        content: [],
        refCount: 1,
        delta: ContentEntry.DeltaInfo(baseHash: "a", patches: "")
    )

    let corrupt = store.validateDeltaIntegrity()
    #expect(!corrupt.isEmpty)
}
