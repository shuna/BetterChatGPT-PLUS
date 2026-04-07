/**
 * Persists local-model search state to sessionStorage so it survives page reloads
 * within the same browser session. Cleared automatically when the tab/window closes.
 */

export interface SearchSessionState {
  query: string;
  engine: 'all' | 'wllama' | 'transformers.js';
  sort: 'downloads' | 'lastModified' | 'size';
  sortDir: 'asc' | 'desc';
  /** Number of pages loaded (1 = initial search only, 2+ = loadMore was used) */
  pagesLoaded: number;
}

const KEY = 'localModelSearchSession';

export function saveSearchSession(state: SearchSessionState): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // sessionStorage full or unavailable — silently ignore
  }
}

export function loadSearchSession(): SearchSessionState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SearchSessionState;
    // Basic validation
    if (!parsed.query || typeof parsed.query !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSearchSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
