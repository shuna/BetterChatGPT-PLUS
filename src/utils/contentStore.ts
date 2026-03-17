import { ContentInterface } from '@type/chat';
import {
  getStreamingNodeIdFromHash,
  isStreamingContentHash,
  peekBufferedContent,
} from './streamingBuffer';
import { diff_match_patch } from 'diff-match-patch';

const dmp = new diff_match_patch();

/**
 * ContentStore: content-addressable storage for message content.
 * Maps contentHash → { content, refCount }.
 * Used to deduplicate identical message bodies across conversations and branches.
 *
 * Supports delta compression: when a new entry is similar to an existing one,
 * only the diff (patch) is stored instead of the full content.
 */

export interface ContentEntry {
  content: ContentInterface[];
  refCount: number;
  delta?: {
    baseHash: string;          // contentHash of the delta base
    patches: string;           // diff-match-patch patch_toText format
  };
  // content and delta are exclusive:
  //   - no delta → content has full data
  //   - delta present → content is empty array, resolve via baseHash + patches
}

export type ContentStoreData = Record<string, ContentEntry>;

/** Maximum delta chain depth before forcing full storage */
const MAX_CHAIN_DEPTH = 5;

/**
 * Pending GC: hashes with refCount <= 0 that have been promoted but not yet
 * deleted from the store. Actual deletion is deferred to saveChatData so that
 * buildSupersetForCommit can include them in the superset for crash safety.
 *
 * Entries remain in the store (with refCount <= 0) until flushPendingGC is called.
 */
const pendingGCHashes = new Set<string>();

export function getPendingGCHashes(): ReadonlySet<string> {
  return pendingGCHashes;
}

/**
 * Actually remove pending GC entries from the in-memory store.
 * Called after the commit protocol completes successfully.
 */
export function flushPendingGC(store: ContentStoreData): string[] {
  const flushed: string[] = [];
  for (const hash of pendingGCHashes) {
    if (store[hash] && store[hash].refCount <= 0) {
      delete store[hash];
      flushed.push(hash);
    }
  }
  pendingGCHashes.clear();
  return flushed;
}

/** If patch size / original text size > this, store full content instead */
const DELTA_SIZE_THRESHOLD = 0.7;

/**
 * Check if content is eligible for delta compression (text-only, no images).
 */
export function isDeltaEligible(content: ContentInterface[]): boolean {
  return content.length > 0 && content.every((c) => c.type === 'text');
}

/**
 * Compute a fast hash of ContentInterface[].
 * Uses FNV-1a for speed; collisions are acceptable because we verify on lookup.
 */
export function computeContentHash(content: ContentInterface[]): string {
  const str = JSON.stringify(content);
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Get the delta chain depth for a given hash.
 * Returns 0 for full entries, 1+ for delta entries.
 */
export function getChainDepth(store: ContentStoreData, hash: string): number {
  let depth = 0;
  let current = hash;
  const visited = new Set<string>();
  while (store[current]?.delta) {
    if (visited.has(current)) return MAX_CHAIN_DEPTH + 1; // circular
    visited.add(current);
    depth++;
    current = store[current].delta!.baseHash;
  }
  return depth;
}

/**
 * Concatenate all text content into a single string for diffing.
 */
function contentToText(content: ContentInterface[]): string {
  return JSON.stringify(content);
}

/**
 * Add content to the store. Returns the hash.
 * If content with same hash already exists, increments refCount.
 */
export function addContent(
  store: ContentStoreData,
  content: ContentInterface[]
): string {
  let hash = computeContentHash(content);
  const serialized = JSON.stringify(content);
  // Handle hash collisions: if the stored content differs, append a suffix
  while (store[hash] && !isContentMatch(store, hash, serialized)) {
    hash += '_';
  }
  if (store[hash]) {
    store[hash].refCount++;
  } else {
    store[hash] = { content, refCount: 1 };
  }
  return hash;
}

/**
 * Check if a stored entry (possibly delta) matches the given serialized content.
 */
function isContentMatch(
  store: ContentStoreData,
  hash: string,
  serialized: string
): boolean {
  const entry = store[hash];
  if (!entry) return false;
  if (entry.delta) {
    // Resolve delta to compare
    const resolved = resolveContent(store, hash);
    return JSON.stringify(resolved) === serialized;
  }
  return JSON.stringify(entry.content) === serialized;
}

/**
 * Add content as a delta against baseHash if beneficial.
 * Falls back to full storage when delta is not worthwhile.
 * Returns the hash.
 */
export function addContentDelta(
  store: ContentStoreData,
  content: ContentInterface[],
  baseHash: string
): string {
  // Pre-checks: base must exist and content must be delta-eligible
  const baseEntry = store[baseHash];
  if (!baseEntry) return addContent(store, content);

  // Both must be text-only
  if (!isDeltaEligible(content)) return addContent(store, content);

  const baseContent = resolveContent(store, baseHash);
  if (!isDeltaEligible(baseContent)) return addContent(store, content);

  // Check chain depth
  if (getChainDepth(store, baseHash) >= MAX_CHAIN_DEPTH - 1) {
    return addContent(store, content);
  }

  // Compute hash first to check for duplicates
  let hash = computeContentHash(content);
  const serialized = JSON.stringify(content);

  while (store[hash] && !isContentMatch(store, hash, serialized)) {
    hash += '_';
  }
  if (store[hash]) {
    store[hash].refCount++;
    return hash;
  }

  // Compute diff
  const baseText = contentToText(baseContent);
  const newText = contentToText(content);
  const patches = dmp.patch_make(baseText, newText);
  const patchText = dmp.patch_toText(patches);

  // Check if delta is worthwhile: patch must be smaller than full content
  if (patchText.length >= newText.length * DELTA_SIZE_THRESHOLD) {
    store[hash] = { content, refCount: 1 };
    return hash;
  }

  // Store as delta
  store[hash] = {
    content: [],
    refCount: 1,
    delta: {
      baseHash,
      patches: patchText,
    },
  };
  return hash;
}

/**
 * Increment the reference count for a given hash.
 */
export function retainContent(store: ContentStoreData, hash: string): void {
  if (isStreamingContentHash(hash)) return;
  if (store[hash]) {
    store[hash].refCount++;
  }
}

/**
 * Promote a delta entry to full content.
 */
export function promoteToFull(store: ContentStoreData, hash: string): void {
  const entry = store[hash];
  if (!entry?.delta) return;
  const resolved = resolveContent(store, hash);
  entry.content = resolved;
  delete entry.delta;
}

/**
 * Promote all entries that depend on baseHash to full content.
 * Called when baseHash is about to be deleted.
 */
export function promoteDependents(
  store: ContentStoreData,
  baseHash: string
): void {
  for (const [hash, entry] of Object.entries(store)) {
    if (entry.delta?.baseHash === baseHash) {
      // Resolve before the base is gone
      const resolved = resolveContent(store, hash);
      entry.content = resolved;
      delete entry.delta;
    }
  }
}

/**
 * Decrement refCount. If it reaches 0, promote dependents and mark for
 * deferred GC. The entry is NOT deleted from the store immediately —
 * it remains available so that buildSupersetForCommit can include it
 * in the superset for crash safety. Actual deletion happens when
 * flushPendingGC is called after a successful commit.
 */
export function releaseContent(store: ContentStoreData, hash: string): void {
  if (isStreamingContentHash(hash)) return;
  if (!store[hash]) return;
  store[hash].refCount--;
  if (store[hash].refCount <= 0) {
    promoteDependents(store, hash);
    pendingGCHashes.add(hash);
    // Entry stays in store until flushPendingGC
  }
}

/**
 * Resolve a contentHash to actual content.
 * Follows delta chains up to MAX_CHAIN_DEPTH.
 */
export function resolveContent(
  store: ContentStoreData,
  hash: string
): ContentInterface[] {
  if (isStreamingContentHash(hash)) {
    const nodeId = getStreamingNodeIdFromHash(hash);
    return nodeId ? peekBufferedContent(nodeId) ?? [] : [];
  }
  const entry = store[hash];
  if (!entry) return [];

  if (!entry.delta) {
    return entry.content;
  }

  // Delta resolution
  const visited = new Set<string>();
  let current = hash;
  const deltaChain: Array<{ hash: string; patches: string }> = [];

  // Walk to the base
  while (store[current]?.delta) {
    if (visited.has(current)) {
      // Circular reference detected
      console.error(`[ContentStore] Circular delta chain detected at ${current}`);
      return [];
    }
    visited.add(current);
    deltaChain.push({
      hash: current,
      patches: store[current].delta!.patches,
    });
    current = store[current].delta!.baseHash;
  }

  const baseEntry = store[current];
  if (!baseEntry) {
    console.error(`[ContentStore] Missing delta base: ${current}`);
    return [];
  }

  // Apply patches from base to target
  let text = contentToText(baseEntry.content);
  for (const { patches: patchText } of deltaChain.reverse()) {
    const patches = dmp.patch_fromText(patchText);
    const [result, applied] = dmp.patch_apply(patches, text);
    if (applied.some((ok: boolean) => !ok)) {
      console.error(`[ContentStore] Patch apply failed for delta chain`);
      return [];
    }
    text = result;
  }

  try {
    return JSON.parse(text) as ContentInterface[];
  } catch {
    console.error(`[ContentStore] Failed to parse resolved delta content`);
    return [];
  }
}

/**
 * Build an export-safe content store with all deltas resolved to full content.
 * Ensures V3 format compatibility.
 */
export function buildExportContentStore(
  store: ContentStoreData
): ContentStoreData {
  const exported: ContentStoreData = {};
  for (const [hash, entry] of Object.entries(store)) {
    if (entry.delta) {
      exported[hash] = {
        content: resolveContent(store, hash),
        refCount: entry.refCount,
      };
    } else {
      exported[hash] = { content: entry.content, refCount: entry.refCount };
    }
  }
  return exported;
}

/**
 * Validate all delta entries at startup. Logs warnings for corruption but does
 * NOT erase or overwrite entries — resolveContent already handles unresolvable
 * deltas gracefully (returns []), so destructive repair at boot is unnecessary
 * and would cause permanent data loss if the corruption is transient.
 *
 * Checks: missing base, circular chains, patch parse/apply failures.
 * Returns the set of corrupt hashes for diagnostic purposes.
 */
export function validateDeltaIntegrity(store: ContentStoreData): Set<string> {
  const corrupt = new Set<string>();

  for (const [hash, entry] of Object.entries(store)) {
    if (!entry.delta) continue;

    // 1. Missing base
    if (!store[entry.delta.baseHash]) {
      console.warn(
        `[ContentStore] Broken delta: ${hash} references missing base ${entry.delta.baseHash}`
      );
      corrupt.add(hash);
      continue;
    }

    // 2. Circular chain detection
    const visited = new Set<string>();
    let cur = hash;
    let isCircular = false;
    while (store[cur]?.delta) {
      if (visited.has(cur)) {
        isCircular = true;
        break;
      }
      visited.add(cur);
      cur = store[cur].delta!.baseHash;
    }
    if (isCircular) {
      console.warn(`[ContentStore] Circular delta chain detected at ${hash}`);
      corrupt.add(hash);
      continue;
    }

    // 3. Patch parse/apply validation
    try {
      const patches = dmp.patch_fromText(entry.delta.patches);
      // Walk to base and try full resolution
      const baseContent = store[cur]?.content;
      if (baseContent) {
        let text = contentToText(baseContent);
        // Apply patches in reverse chain order (from base toward this entry)
        const chain: string[] = [];
        let walk = hash;
        while (store[walk]?.delta) {
          chain.push(walk);
          walk = store[walk].delta!.baseHash;
        }
        let patchFailed = false;
        for (const chainHash of chain.reverse()) {
          const p = dmp.patch_fromText(store[chainHash].delta!.patches);
          const [result, applied] = dmp.patch_apply(p, text);
          if (applied.some((ok: boolean) => !ok)) {
            patchFailed = true;
            break;
          }
          text = result;
        }
        if (patchFailed) {
          console.warn(`[ContentStore] Patch apply failed for delta ${hash}`);
          corrupt.add(hash);
          continue;
        }
        // 4. Verify JSON parse
        JSON.parse(text);
      }
    } catch (e) {
      console.warn(`[ContentStore] Delta validation error for ${hash}:`, e);
      corrupt.add(hash);
    }
  }

  if (corrupt.size > 0) {
    console.warn(
      `[ContentStore] ${corrupt.size} corrupt delta(s) detected at startup. ` +
      `Affected hashes will return empty content on read.`
    );
  }

  return corrupt;
}
