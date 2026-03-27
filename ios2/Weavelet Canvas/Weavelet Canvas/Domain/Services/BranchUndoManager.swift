import Foundation
import os

// MARK: - Branch Snapshot

/// Stores the target chat + the exact content store entries it references.
/// Undo/redo replaces the chat and overlays these entries onto the store,
/// ensuring a self-sufficient snapshot that restores correctly from any state.
struct BranchSnapshot {
    let currentChatID: String
    let chat: Chat
    /// Full content entries referenced by the chat's branch tree.
    /// On apply, these are set as-is (not merged), and unreferenced entries are removed.
    let referencedContent: ContentStoreData

    var estimatedSize: Int {
        let chatSize = chat.messages.count * 200
        let storeSize = referencedContent.count * 500
        return chatSize + storeSize
    }
}

// MARK: - BranchUndoManager

/// Manages undo/redo with self-sufficient snapshots.
/// Each snapshot captures the chat + all content entries it references,
/// so undo/redo always restores exact state regardless of intervening mutations.
/// Limit: 50 snapshots per stack.
class BranchUndoManager {

    private(set) var past: [BranchSnapshot] = []
    private(set) var future: [BranchSnapshot] = []

    static let historyLimit = 50

    private let logger = Logger(subsystem: "org.sstcr.WeaveletCanvas", category: "Undo")

    var canUndo: Bool { !past.isEmpty }
    var canRedo: Bool { !future.isEmpty }

    // MARK: - Push

    /// Push a snapshot before a mutation. Clears redo stack.
    /// Call this BEFORE applying the mutation to capture the "before" state.
    func push(
        currentChatID: String,
        chat: Chat,
        contentStore: ContentStoreData
    ) {
        let snapshot = BranchSnapshot(
            currentChatID: currentChatID,
            chat: chat,
            referencedContent: Self.extractReferencedContent(chat: chat, store: contentStore)
        )

        past.append(snapshot)
        if past.count > Self.historyLimit {
            past.removeFirst()
        }
        future.removeAll()

        logger.debug("Push: past=\(self.past.count), snapshot=\(snapshot.estimatedSize)B")
    }

    // MARK: - Undo

    /// Undo: restore the last snapshot.
    /// Returns the snapshot to apply, or nil if nothing to undo.
    func undo(
        currentChatID: String,
        currentChat: Chat,
        currentContentStore: ContentStoreData
    ) -> BranchSnapshot? {
        guard let snapshot = past.popLast() else { return nil }

        // Push current state to future (redo)
        future.append(BranchSnapshot(
            currentChatID: currentChatID,
            chat: currentChat,
            referencedContent: Self.extractReferencedContent(chat: currentChat, store: currentContentStore)
        ))

        logger.debug("Undo: past=\(self.past.count), future=\(self.future.count)")
        return snapshot
    }

    // MARK: - Redo

    /// Redo: restore the last undone snapshot.
    func redo(
        currentChatID: String,
        currentChat: Chat,
        currentContentStore: ContentStoreData
    ) -> BranchSnapshot? {
        guard let snapshot = future.popLast() else { return nil }

        // Push current state to past (undo)
        past.append(BranchSnapshot(
            currentChatID: currentChatID,
            chat: currentChat,
            referencedContent: Self.extractReferencedContent(chat: currentChat, store: currentContentStore)
        ))

        logger.debug("Redo: past=\(self.past.count), future=\(self.future.count)")
        return snapshot
    }

    // MARK: - Apply Snapshot

    /// Apply a snapshot to the current state.
    /// Replaces the target chat and restores exactly the content entries it references.
    static func applySnapshot(
        _ snapshot: BranchSnapshot,
        chats: [Chat],
        contentStore: ContentStoreData
    ) -> (chats: [Chat], contentStore: ContentStoreData) {
        var updatedChats = chats
        var updatedStore = contentStore

        // Collect hashes referenced by the old version of this chat (to clean up)
        let oldHashes: Set<String>
        if let idx = updatedChats.firstIndex(where: { $0.id == snapshot.currentChatID }),
           let tree = updatedChats[idx].branchTree {
            oldHashes = Set(tree.nodes.values.map(\.contentHash))
        } else {
            oldHashes = []
        }

        // Replace the target chat
        if let idx = updatedChats.firstIndex(where: { $0.id == snapshot.currentChatID }) {
            updatedChats[idx] = snapshot.chat
        }

        // Collect hashes referenced by the restored chat
        let newHashes: Set<String>
        if let tree = snapshot.chat.branchTree {
            newHashes = Set(tree.nodes.values.map(\.contentHash))
        } else {
            newHashes = []
        }

        // Remove old entries no longer referenced (by any chat)
        let removedHashes = oldHashes.subtracting(newHashes)
        for hash in removedHashes {
            // Only remove if no other chat references this hash
            let referencedElsewhere = updatedChats.contains { chat in
                guard chat.id != snapshot.currentChatID, let tree = chat.branchTree else { return false }
                return tree.nodes.values.contains { $0.contentHash == hash }
            }
            if !referencedElsewhere {
                updatedStore.removeValue(forKey: hash)
            }
        }

        // Restore referenced content entries exactly
        for (hash, entry) in snapshot.referencedContent {
            updatedStore[hash] = entry
        }

        return (updatedChats, updatedStore)
    }

    // MARK: - Clear

    func clear() {
        past.removeAll()
        future.removeAll()
    }

    // MARK: - Private

    /// Extract the content store entries referenced by a chat's branch tree.
    private static func extractReferencedContent(chat: Chat, store: ContentStoreData) -> ContentStoreData {
        guard let tree = chat.branchTree else { return [:] }
        var referenced: ContentStoreData = [:]
        for node in tree.nodes.values {
            if let entry = store[node.contentHash] {
                referenced[node.contentHash] = entry
            }
        }
        return referenced
    }
}
