import { ContentInterface } from '@type/chat';
import {
  getStreamingNodeIdFromHash,
  isStreamingContentHash,
  peekBufferedContent,
} from './streamingBuffer';

/**
 * ContentStore: content-addressable storage for message content.
 * Maps contentHash → { content, refCount }.
 * Used to deduplicate identical message bodies across conversations and branches.
 */

export interface ContentEntry {
  content: ContentInterface[];
  refCount: number;
}

export type ContentStoreData = Record<string, ContentEntry>;

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
  while (store[hash] && JSON.stringify(store[hash].content) !== serialized) {
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
 * Increment the reference count for a given hash.
 */
export function retainContent(store: ContentStoreData, hash: string): void {
  if (isStreamingContentHash(hash)) return;
  if (store[hash]) {
    store[hash].refCount++;
  }
}

/**
 * Decrement refCount. If it reaches 0, delete the entry (GC).
 */
export function releaseContent(store: ContentStoreData, hash: string): void {
  if (isStreamingContentHash(hash)) return;
  if (!store[hash]) return;
  store[hash].refCount--;
  if (store[hash].refCount <= 0) {
    delete store[hash];
  }
}

/**
 * Resolve a contentHash to actual content.
 */
export function resolveContent(
  store: ContentStoreData,
  hash: string
): ContentInterface[] {
  if (isStreamingContentHash(hash)) {
    const nodeId = getStreamingNodeIdFromHash(hash);
    return nodeId ? peekBufferedContent(nodeId) ?? [] : [];
  }
  return store[hash]?.content ?? [];
}
