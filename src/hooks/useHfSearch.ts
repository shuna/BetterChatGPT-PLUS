import { useCallback, useEffect, useRef, useState } from 'react';
import useStore from '@store/store';
import type {
  HfSearchResult,
  GgufVariant,
  GgufRepoResolution,
  HfSearchQuery,
} from '@src/local-llm/types';
import {
  searchHfModels,
  resolveGgufFiles,
} from '@src/local-llm/hfSearch';
import {
  saveSearchSession,
  loadSearchSession,
  clearSearchSession,
} from '@src/components/SettingsMenu/localModelSearchSession';
import { CURATED_MODELS } from '@src/local-llm/catalog';

export function useHfSearch(rehydrated: boolean) {
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchEngine, setSearchEngine] = useState<HfSearchQuery['engine']>('all');
  const [searchSort, setSearchSort] = useState<'downloads' | 'lastModified' | 'size'>('lastModified');
  const [searchSortDir, setSearchSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchResults, setSearchResults] = useState<HfSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [variantMap, setVariantMap] = useState<Record<string, GgufRepoResolution>>({});
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [variantLoading, setVariantLoading] = useState<Record<string, boolean>>({});
  const [hasSearchedOnce, setHasSearchedOnce] = useState(false);
  const [activeSearchDownloads, setActiveSearchDownloads] = useState<Record<string, {
    result: HfSearchResult;
    variant: GgufVariant;
    modelId: string;
  }>>({});
  const [searchNextUrl, setSearchNextUrl] = useState<string | null>(null);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Session persistence helpers
  const pagesLoadedRef = useRef(1);
  const pendingRestoreRef = useRef<number | null>(null);
  const restoredRef = useRef(false);

  // Infinite scroll sentinel
  const searchSentinelRef = useRef<HTMLDivElement>(null);

  // Resolve variants for a batch of search results
  const resolveVariantsForResults = useCallback((results: HfSearchResult[]) => {
    for (const r of results) {
      if (r.supportStatus === 'supported' && (r.engine === 'wllama' || r.tags.includes('gguf'))) {
        setVariantLoading((prev) => ({ ...prev, [r.repoId]: true }));
        resolveGgufFiles(r.repoId).then((resolution) => {
          setVariantLoading((prev) => ({ ...prev, [r.repoId]: false }));
          if (resolution) {
            setVariantMap((prev) => ({ ...prev, [r.repoId]: resolution }));
            if (resolution.recommendedFile) {
              setSelectedVariants((prev) => ({ ...prev, [r.repoId]: resolution.recommendedFile! }));
            }
            const bestVariant = resolution.recommendedFile
              ? resolution.variants.find((v) => v.fileName === resolution.recommendedFile)
              : resolution.variants.find((v) => v.size > 0);
            setSearchResults((prev) =>
              prev.map((sr) =>
                sr.repoId === r.repoId ? {
                  ...sr,
                  bestCandidateSize: bestVariant?.size && bestVariant.size > 0 ? bestVariant.size : sr.bestCandidateSize,
                  lastModified: resolution.lastModified ?? sr.lastModified,
                } : sr,
              ),
            );
          } else {
            setSearchResults((prev) =>
              prev.map((sr) =>
                sr.repoId === r.repoId
                  ? { ...sr, supportStatus: 'needs-manual-review' as const, supportReason: 'Could not resolve GGUF files from repository' }
                  : sr,
              ),
            );
          }
        });
      }
    }
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setHasSearchedOnce(true);
    setSearchResults([]);
    setVariantMap({});
    setSelectedVariants({});
    setSearchNextUrl(null);
    setSearchHasMore(false);
    pagesLoadedRef.current = 1;

    try {
      const apiSort = searchSort === 'size' ? 'downloads' : searchSort;
      const { results, nextPageUrl } = await searchHfModels({
        query: searchQuery,
        engine: searchEngine,
        sort: apiSort,
        sortDir: searchSort === 'size' ? 'desc' : searchSortDir,
        limit: 20,
      });
      const sorted = searchSort === 'size'
        ? [...results].sort((a, b) => {
            const sa = a.bestCandidateSize ?? 0;
            const sb = b.bestCandidateSize ?? 0;
            return searchSortDir === 'asc' ? sa - sb : sb - sa;
          })
        : results;
      setSearchResults(sorted);
      setSearchNextUrl(nextPageUrl);
      setSearchHasMore(nextPageUrl !== null);
      resolveVariantsForResults(sorted);
    } catch {
      // Search failed silently
    } finally {
      setSearching(false);
    }
  }, [searchQuery, searchEngine, searchSort, searchSortDir, resolveVariantsForResults]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !searchHasMore || !searchNextUrl) return;
    setLoadingMore(true);

    try {
      const apiSort = searchSort === 'size' ? 'downloads' : searchSort;
      const { results, nextPageUrl } = await searchHfModels({
        query: searchQuery,
        engine: searchEngine,
        sort: apiSort,
        sortDir: searchSort === 'size' ? 'desc' : searchSortDir,
        nextUrl: searchNextUrl,
      });
      setSearchNextUrl(nextPageUrl);
      setSearchHasMore(nextPageUrl !== null);
      if (results.length > 0) {
        setSearchResults((prev) => {
          const existing = new Set(prev.map((r) => r.repoId));
          const newResults = results.filter((r) => !existing.has(r.repoId));
          return [...prev, ...newResults];
        });
        resolveVariantsForResults(results);
      }
      pagesLoadedRef.current += 1;
      saveSearchSession({
        query: searchQuery, engine: searchEngine,
        sort: searchSort, sortDir: searchSortDir,
        pagesLoaded: pagesLoadedRef.current,
      });
    } catch {
      setSearchHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [searchQuery, searchEngine, searchSort, searchSortDir, searchNextUrl, searchHasMore, loadingMore, resolveVariantsForResults]);

  // Auto-load more when sentinel scrolls into view
  useEffect(() => {
    if (!searchHasMore || loadingMore) return;
    const sentinel = searchSentinelRef.current;
    if (!sentinel) return;

    let root: HTMLElement | null = sentinel.parentElement;
    while (root && root.scrollHeight <= root.clientHeight + 1) {
      root = root.parentElement;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          handleLoadMore();
        }
      },
      { root: root ?? undefined, rootMargin: '400px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [searchHasMore, loadingMore, handleLoadMore, searchResults.length]);

  // Debounced incremental search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      if (searchResults.length > 0 && !searchQuery.trim()) {
        setSearchResults([]);
      }
      return;
    }
    const timer = setTimeout(() => {
      handleSearch();
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, searchEngine, searchSort, searchSortDir]);

  // Persist search params to sessionStorage
  useEffect(() => {
    if (!searchQuery.trim()) {
      clearSearchSession();
      return;
    }
    saveSearchSession({
      query: searchQuery,
      engine: searchEngine,
      sort: searchSort,
      sortDir: searchSortDir,
      pagesLoaded: pagesLoadedRef.current,
    });
  }, [searchQuery, searchEngine, searchSort, searchSortDir]);

  // Restore search state from sessionStorage on mount
  useEffect(() => {
    if (!rehydrated || restoredRef.current) return;
    restoredRef.current = true;
    const saved = loadSearchSession();
    if (!saved) return;
    setSearchQuery(saved.query);
    setSearchEngine(saved.engine);
    setSearchSort(saved.sort);
    setSearchSortDir(saved.sortDir);
    if (saved.pagesLoaded > 1) {
      pendingRestoreRef.current = saved.pagesLoaded;
    }
  }, [rehydrated]);

  // Auto-load additional pages to restore pagination depth
  useEffect(() => {
    if (pendingRestoreRef.current === null) return;
    if (searching || loadingMore) return;
    if (pagesLoadedRef.current >= pendingRestoreRef.current || !searchHasMore) {
      pendingRestoreRef.current = null;
      return;
    }
    handleLoadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchResults.length, searching, loadingMore, searchHasMore]);

  const handleSelectVariant = useCallback((repoId: string, fileName: string) => {
    setSelectedVariants((prev) => ({ ...prev, [repoId]: fileName }));
  }, []);

  const findExistingModelForVariant = useCallback((repoId: string, fileName: string): string | null => {
    for (const cm of CURATED_MODELS) {
      if (cm.huggingFaceRepo === repoId && cm.downloadFiles.includes(fileName)) {
        return cm.id;
      }
    }
    const store = useStore.getState();
    for (const m of store.localModels) {
      if (m.origin === repoId && m.manifest.kind === 'single-file' && m.manifest.entrypoint === fileName) {
        return m.id;
      }
    }
    return null;
  }, []);

  return {
    searchQuery, setSearchQuery,
    searchEngine, setSearchEngine,
    searchSort, setSearchSort,
    searchSortDir, setSearchSortDir,
    searchResults,
    searching,
    hasSearchedOnce,
    searchHasMore,
    loadingMore,
    variantMap,
    selectedVariants,
    variantLoading,
    activeSearchDownloads, setActiveSearchDownloads,
    searchSentinelRef,
    handleSelectVariant,
    findExistingModelForVariant,
  };
}
