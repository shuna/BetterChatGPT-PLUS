import { compressToUTF16, decompressFromUTF16 } from 'lz-string';
import { StateStorage } from 'zustand/middleware';

const DEBOUNCE_MS = 500;
const PERF_LOG_PREFIX = '[perf][storage]';

const pending: Record<string, ReturnType<typeof setTimeout>> = {};
/** Pending values awaiting flush (needed for beforeunload). */
const pendingValues: Record<string, string> = {};
/** Cache the last JSON string per key to skip redundant compress+write. */
const lastValue: Record<string, string> = {};
const pendingScheduleAt: Record<string, number> = {};
const writeSeq: Record<string, number> = {};

function logStoragePerf(message: string) {
  console.log(`${PERF_LOG_PREFIX} ${message}`);
}

/** Flush all pending debounced writes synchronously. */
function flushPending() {
  for (const name of Object.keys(pending)) {
    clearTimeout(pending[name]);
    delete pending[name];
    if (pendingValues[name] !== undefined) {
      const value = pendingValues[name];
      const seq = (writeSeq[name] ?? 0) + 1;
      writeSeq[name] = seq;
      const compressStart = performance.now();
      const compressed = compressToUTF16(value);
      const compressMs = performance.now() - compressStart;
      const storageStart = performance.now();
      localStorage.setItem(name, compressed);
      const storageMs = performance.now() - storageStart;
      const totalMs = compressMs + storageMs;
      logStoragePerf(
        `${name}#${seq} flushPending total=${totalMs.toFixed(2)}ms ` +
          `(compress=${compressMs.toFixed(2)}ms, localStorage=${storageMs.toFixed(2)}ms, json=${value.length}, compressed=${compressed.length})`
      );
      delete pendingValues[name];
      delete pendingScheduleAt[name];
    }
  }
}

// Ensure pending writes are saved before the page unloads
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPending);
}

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
    const decompressed = decompressFromUTF16(raw);
    // Seed the cache so the first setItem can detect no-change
    if (decompressed) lastValue[name] = decompressed;
    return decompressed;
  },

  setItem: (name: string, value: string): void => {
    // Skip if the serialized state hasn't changed
    if (lastValue[name] === value) {
      logStoragePerf(`${name} skip unchanged json=${value.length}`);
      return;
    }

    const scheduleStart = performance.now();
    lastValue[name] = value;
    pendingValues[name] = value;

    if (pending[name]) clearTimeout(pending[name]);
    pendingScheduleAt[name] = scheduleStart;
    const seq = (writeSeq[name] ?? 0) + 1;
    writeSeq[name] = seq;
    logStoragePerf(`${name}#${seq} scheduled debounce=${DEBOUNCE_MS}ms json=${value.length}`);
    pending[name] = setTimeout(() => {
      const scheduledAt = pendingScheduleAt[name] ?? performance.now();
      const waitMs = performance.now() - scheduledAt;
      delete pending[name];
      delete pendingScheduleAt[name];
      const compressStart = performance.now();
      const compressed = compressToUTF16(value);
      const compressMs = performance.now() - compressStart;
      const storageStart = performance.now();
      localStorage.setItem(name, compressed);
      const storageMs = performance.now() - storageStart;
      const totalMs = compressMs + storageMs;
      logStoragePerf(
        `${name}#${seq} committed after ${waitMs.toFixed(2)}ms total=${totalMs.toFixed(2)}ms ` +
          `(compress=${compressMs.toFixed(2)}ms, localStorage=${storageMs.toFixed(2)}ms, json=${value.length}, compressed=${compressed.length})`
      );
      delete pendingValues[name];
    }, DEBOUNCE_MS);
  },

  removeItem: (name: string): void => {
    delete lastValue[name];
    delete pendingValues[name];
    if (pending[name]) {
      clearTimeout(pending[name]);
      delete pending[name];
    }
    localStorage.removeItem(name);
  },
};

export default compressedStorage;
