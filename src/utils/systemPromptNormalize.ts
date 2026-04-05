/**
 * Normalize system prompt representation in a ChatInterface.
 *
 * Source of truth: `chat.config.systemPrompt`
 * The top system bubble (activePath[0]) is a synchronized view.
 *
 * This function:
 * 1. Collects text from all system-role nodes in the active path
 * 2. Merges them into config.systemPrompt (if not already set)
 * 3. Removes mid-conversation system nodes (index > 0) from activePath
 * 4. Ensures at most 1 system node at index 0, synced with config
 * 5. Re-materializes chat.messages
 */

import type { ChatInterface, ContentInterface, TextContentInterface } from '@type/chat';
import { isTextContent } from '@type/chat';
import { materializeActivePath } from '@utils/branchUtils';
import { addContent, resolveContent, type ContentStoreData } from '@utils/contentStore';

function extractTextFromContent(content: ContentInterface[]): string {
  return content
    .filter(isTextContent)
    .map((c) => c.text)
    .filter(Boolean)
    .join('\n');
}

/**
 * Normalize system prompts in a chat. Mutates `chat` and `contentStore` in-place.
 *
 * Handles:
 * - Flat messages (no branchTree): extracts system from messages array → config
 * - BranchTree: extracts system from activePath nodes → config, relinking parents
 */
export function normalizeSystemPrompt(
  chat: ChatInterface,
  contentStore: ContentStoreData
): void {
  if (chat.branchTree) {
    normalizeWithBranchTree(chat, contentStore);
  } else {
    normalizeFlat(chat);
  }
}

function normalizeFlat(chat: ChatInterface): void {
  const systemTexts: string[] = [];
  const nonSystemMessages: typeof chat.messages = [];

  for (const msg of chat.messages) {
    if (msg.role === 'system') {
      const text = extractTextFromContent(msg.content);
      if (text) systemTexts.push(text);
    } else {
      nonSystemMessages.push(msg);
    }
  }

  // Merge collected system texts into config.systemPrompt (deduplicated)
  if (systemTexts.length > 0) {
    const existing = chat.config.systemPrompt ?? '';
    const parts: string[] = existing ? [existing] : [];
    for (const text of systemTexts) {
      if (!existing.includes(text)) {
        parts.push(text);
      }
    }
    chat.config.systemPrompt = parts.join('\n\n');
  }

  // Remove system messages from the flat array
  chat.messages = nonSystemMessages;
}

/**
 * Collect children of a node in the tree.
 */
function getChildren(
  nodes: Record<string, import('@type/chat').BranchNode>,
  parentId: string
): string[] {
  return Object.keys(nodes).filter((id) => nodes[id].parentId === parentId);
}

function normalizeWithBranchTree(
  chat: ChatInterface,
  contentStore: ContentStoreData
): void {
  const tree = chat.branchTree!;
  const { nodes } = tree;

  // ── Phase 1: Collect ALL system texts from the entire tree (not just activePath) ──
  // Walk from root, collecting system texts in depth-first order.
  const collectedSystemTexts: string[] = [];
  const systemNodeIds = new Set<string>();

  for (const [id, node] of Object.entries(nodes)) {
    if (node.role === 'system') {
      systemNodeIds.add(id);
      const content = resolveContent(contentStore, node.contentHash);
      const text = extractTextFromContent(content);
      if (text) collectedSystemTexts.push(text);
    }
  }

  // ── Phase 2: Merge collected text into config.systemPrompt ──
  // Always merge — even if config already has a value — because mid-conversation
  // system nodes may contain additional instructions that should be preserved.
  if (collectedSystemTexts.length > 0) {
    const existingParts: string[] = [];
    if (chat.config.systemPrompt) existingParts.push(chat.config.systemPrompt);

    // Deduplicate: skip texts already present in existing config
    const existing = chat.config.systemPrompt ?? '';
    for (const text of collectedSystemTexts) {
      if (!existing.includes(text)) {
        existingParts.push(text);
      }
    }
    chat.config.systemPrompt = existingParts.join('\n\n');
  }

  // ── Phase 3: Remove mid-conversation system nodes from ALL branches ──
  // For each system node that is NOT a valid root system node, relink its children
  // to its parent (bypass the system node in the parent chain).

  // Determine which node is the allowed root system node (activePath[0] if system)
  const activeRootId = tree.activePath[0];
  const activeRootIsSystem = activeRootId && nodes[activeRootId]?.role === 'system';

  for (const sysId of systemNodeIds) {
    // Keep the root system node on the active path (will be synced below)
    if (sysId === activeRootId && activeRootIsSystem) continue;

    const sysNode = nodes[sysId];
    if (!sysNode) continue;

    // Relink all children of this system node to its parent
    for (const [id, node] of Object.entries(nodes)) {
      if (node.parentId === sysId) {
        nodes[id] = { ...node, parentId: sysNode.parentId };
      }
    }

    // Remove from activePath if present
    const apIdx = tree.activePath.indexOf(sysId);
    if (apIdx >= 0) {
      tree.activePath.splice(apIdx, 1);
    }

    // Remove the node from the tree entirely (children are already relinked)
    delete nodes[sysId];
  }

  // ── Phase 4: Handle top system node on activePath ──
  const topNodeId = tree.activePath[0];
  const topNode = topNodeId ? nodes[topNodeId] : undefined;

  if (chat.config.systemPrompt) {
    // Ensure top node is system with correct content
    const systemContent: ContentInterface[] = [
      { type: 'text', text: chat.config.systemPrompt } as TextContentInterface,
    ];

    if (topNode && topNode.role === 'system') {
      // Update existing top system node's content to match config
      const newHash = addContent(contentStore, systemContent);
      nodes[topNodeId] = { ...topNode, contentHash: newHash };
    }
    // If top node is NOT system, we don't forcibly inject one during migration.
    // The sync logic handles creation on-demand.
  } else {
    // No system prompt in config → remove top system node if present
    if (topNode && topNode.role === 'system') {
      const nextId = tree.activePath[1];
      if (nextId && nodes[nextId]) {
        nodes[nextId] = { ...nodes[nextId], parentId: null };
      }
      tree.activePath.splice(0, 1);
      delete nodes[topNodeId];
      if (tree.rootId === topNodeId && tree.activePath.length > 0) {
        tree.rootId = tree.activePath[0];
      }
    }
  }

  // ── Phase 5: Fix rootId if it was a removed system node ──
  if (!nodes[tree.rootId]) {
    // Find new root: a node with parentId === null
    const newRoot = Object.values(nodes).find((n) => n.parentId === null);
    if (newRoot) tree.rootId = newRoot.id;
    else if (tree.activePath.length > 0) tree.rootId = tree.activePath[0];
  }

  // Re-materialize messages from cleaned activePath
  if (tree.activePath.length > 0) {
    chat.messages = materializeActivePath(tree, contentStore);
  } else {
    chat.messages = [];
  }
}
