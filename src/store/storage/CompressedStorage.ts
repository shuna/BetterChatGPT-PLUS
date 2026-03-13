import { compressToUTF16, decompressFromUTF16 } from 'lz-string';
import { StateStorage } from 'zustand/middleware';
import type { CompressResponse } from './compress.worker';
import { perfStart, perfEnd } from '@utils/perfTrace';
import { setLocalStorageItem } from './storageErrors';

const DEBOUNCE_MS = 500;

const pending: Record<string, ReturnType<typeof setTimeout>> = {};
/** Pending values awaiting flush (needed for beforeunload). */
const pendingValues: Record<string, string> = {};
/** Cache the last JSON string per key to skip redundant compress+write. */
const lastValue: Record<string, string> = {};
/** Latest request ID per key – used to discard stale worker results. */
const latestRequestId: Record<string, number> = {};
/** Map from worker request ID to its perf mark label. */
const perfPendingLabels: Record<number, string> = {};

// ---------------------------------------------------------------------------
// Worker setup with permanent fallback
// ---------------------------------------------------------------------------
let worker: Worker | null = null;
let workerAvailable = false;

if (typeof window !== 'undefined') {
  try {
    worker = new Worker(
      new URL('./compress.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerAvailable = true;

    worker.onmessage = (e: MessageEvent<CompressResponse>) => {
      const { id, name, compressed } = e.data;
      const perfLabel = perfPendingLabels[id];
      if (perfLabel) {
        delete perfPendingLabels[id];
        perfEnd(perfLabel);
      }
      // Only apply if this is still the latest request for this key
      if (latestRequestId[name] === id) {
        setLocalStorageItem(name, compressed);
      }
    };

    worker.onerror = () => {
      workerAvailable = false;
      worker?.terminate();
      worker = null;
    };
  } catch {
    workerAvailable = false;
    worker = null;
  }
}

// ---------------------------------------------------------------------------
// Sync compression (beforeunload & fallback)
// ---------------------------------------------------------------------------

/** Flush all pending debounced writes synchronously. */
function flushPending() {
  // 1. Flush keys still waiting on debounce timers
  for (const name of Object.keys(pending)) {
    clearTimeout(pending[name]);
    delete pending[name];
    if (pendingValues[name] !== undefined) {
      const value = pendingValues[name];
      setLocalStorageItem(name, compressToUTF16(value));
      delete pendingValues[name];
    }
  }
  // 2. Invalidate ALL in-flight worker results, not just keys in pending.
  //    After debounce fires, the key is removed from pending but the worker
  //    request is still outstanding. We must invalidate those too.
  for (const name of Object.keys(latestRequestId)) {
    latestRequestId[name]++;
  }
}

// Ensure pending writes are saved before the page unloads
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPending);
}

// ---------------------------------------------------------------------------
// Storage interface
// ---------------------------------------------------------------------------

let nextRequestId = 1;

const compressedStorage: StateStorage = {
  getItem: (name: string): string | null => {
    const raw = localStorage.getItem(name);
    if (raw === null) return null;

    // Backward compatibility: detect uncompressed JSON
    const firstChar = raw.charAt(0);
    if (firstChar === '{' || firstChar === '"') {
      lastValue[name] = raw;
      return raw;
    }

    // Compressed data
    perfStart('persist-decompress');
    const decompressed = decompressFromUTF16(raw);
    perfEnd('persist-decompress');
    // Seed the cache so the first setItem can detect no-change
    if (decompressed) lastValue[name] = decompressed;
    return decompressed;
  },

  setItem: (name: string, value: string): void => {
    // Skip if the serialized state hasn't changed
    if (lastValue[name] === value) return;
    lastValue[name] = value;
    pendingValues[name] = value;

    if (pending[name]) clearTimeout(pending[name]);
    pending[name] = setTimeout(() => {
      delete pending[name];
      const latest = pendingValues[name];
      if (latest === undefined) return;
      delete pendingValues[name];

      if (workerAvailable && worker) {
        const id = nextRequestId++;
        latestRequestId[name] = id;
        const label = `persist-compress-${id}`;
        perfStart(label);
        perfPendingLabels[id] = label;
        worker.postMessage({ id, name, value: latest });
      } else {
        // Synchronous fallback
        perfStart('persist-compress');
        setLocalStorageItem(name, compressToUTF16(latest));
        perfEnd('persist-compress');
      }
    }, DEBOUNCE_MS);
  },

  removeItem: (name: string): void => {
    delete lastValue[name];
    delete pendingValues[name];
    if (pending[name]) {
      clearTimeout(pending[name]);
      delete pending[name];
    }
    // Invalidate any in-flight worker results to prevent resurrection
    latestRequestId[name] = (latestRequestId[name] ?? 0) + 1;
    localStorage.removeItem(name);
  },
};

export default compressedStorage;
