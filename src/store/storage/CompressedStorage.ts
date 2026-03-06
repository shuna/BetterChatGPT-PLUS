import { compressToUTF16, decompressFromUTF16 } from 'lz-string';
import { StateStorage } from 'zustand/middleware';

const DEBOUNCE_MS = 500;

const pending: Record<string, ReturnType<typeof setTimeout>> = {};
/** Pending values awaiting flush (needed for beforeunload). */
const pendingValues: Record<string, string> = {};
/** Cache the last JSON string per key to skip redundant compress+write. */
const lastValue: Record<string, string> = {};

/** Flush all pending debounced writes synchronously. */
function flushPending() {
  for (const name of Object.keys(pending)) {
    clearTimeout(pending[name]);
    delete pending[name];
    if (pendingValues[name] !== undefined) {
      localStorage.setItem(name, compressToUTF16(pendingValues[name]));
      delete pendingValues[name];
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
    if (lastValue[name] === value) return;
    lastValue[name] = value;
    pendingValues[name] = value;

    if (pending[name]) clearTimeout(pending[name]);
    pending[name] = setTimeout(() => {
      delete pending[name];
      delete pendingValues[name];
      localStorage.setItem(name, compressToUTF16(value));
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
