import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import { SearchResult, searchBranchNodes } from '@utils/branchSearch';
import { buildPathToLeaf } from '@utils/branchUtils';

interface ChatFindBarProps {
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

const MARK_CLASS = 'chat-find-highlight';
const MARK_ACTIVE_CLASS = 'chat-find-highlight-active';

type SearchTarget = {
  node: Text;
  text: string;
  positions: number[];
};

/**
 * Scroll a mark element into view within the given scroller only,
 * without affecting any ancestor scroll containers (prevents the
 * Mobile Safari keyboard from pushing the header off-screen).
 */
function scrollMarkIntoView(
  mark: HTMLElement,
  scroller: HTMLElement | null
) {
  if (!scroller) {
    mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }

  const scrollerRect = scroller.getBoundingClientRect();
  const markRect = mark.getBoundingClientRect();

  const markCenterInScroller =
    markRect.top - scrollerRect.top + scroller.scrollTop + markRect.height / 2;
  const desiredScrollTop = markCenterInScroller - scrollerRect.height / 2;

  scroller.scrollTo({
    top: Math.max(0, desiredScrollTop),
    behavior: 'smooth',
  });
}

type FindScope = 'visible' | 'allNodes';

/**
 * Find-in-page search bar for chat content.
 *
 * Two scopes:
 * - "visible" (表示中): walks DOM text nodes in the current view (original behaviour)
 * - "allNodes" (全ノード): searches all branch nodes via searchBranchNodes,
 *   including nodes on non-active paths, and switches path when navigating.
 */
const ChatFindBar = ({ scrollerRef, onClose }: ChatFindBarProps) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<FindScope>('visible');
  const [matchCount, setMatchCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const marksRef = useRef<HTMLElement[]>([]);

  // "allNodes" mode state
  const [nodeResults, setNodeResults] = useState<SearchResult[]>([]);

  // Store access
  const chatFindHistory = useStore((s) => s.chatFindHistory);
  const saveChatFindHistory = useStore((s) => s.saveChatFindHistory);
  const clearChatFindHistory = useStore((s) => s.clearChatFindHistory);
  const currentChatIndex = useStore((s) => s.currentChatIndex);
  const currentChatId = useStore((s) => s.chats?.[s.currentChatIndex]?.id ?? '');
  const branchTree = useStore((s) => s.chats?.[s.currentChatIndex]?.branchTree);
  const contentStore = useStore((s) => s.contentStore);
  const switchActivePathSilent = useStore((s) => s.switchActivePathSilent);
  const pushNavigationEntry = useStore((s) => s.pushNavigationEntry);

  const hasQuery = query.trim().length > 0;

  // Focus on mount (preventScroll avoids Safari page-level scroll)
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // ---- Mobile Safari: prevent window scroll while the find-bar input
  //      is focused (keyboard visible).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let prevHeight = vv.height;

    const onResize = () => {
      const delta = vv.height - prevHeight;
      prevHeight = vv.height;

      if (delta < -50) {
        const active = document.activeElement;
        if (
          active instanceof HTMLElement &&
          active.closest('[data-chat-find-bar]')
        ) {
          requestAnimationFrame(() => {
            if (window.scrollY !== 1) {
              window.scrollTo(0, 1);
            }
          });
        }
      }
    };

    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  // ---------- DOM-based search ("visible" scope) ----------

  const clearHighlights = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const marks = scroller.querySelectorAll(`mark.${MARK_CLASS}`);
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(mark.textContent ?? ''), mark);
      parent.normalize();
    });
    marksRef.current = [];
  }, [scrollerRef]);

  const doDomSearch = useCallback(
    (q: string) => {
      clearHighlights();
      const scroller = scrollerRef.current;
      if (!scroller || !q.trim()) {
        setMatchCount(0);
        setCurrentIndex(-1);
        return;
      }

      const lowerQ = q.toLowerCase();
      const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          if ((node.parentElement as HTMLElement)?.closest('[data-chat-find-bar]')) {
            return NodeFilter.FILTER_REJECT;
          }
          const tag = node.parentElement?.tagName;
          if (tag === 'TEXTAREA' || tag === 'INPUT') {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      const marks: HTMLElement[] = [];
      const searchTargets: SearchTarget[] = [];

      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = node.textContent ?? '';
        const lower = text.toLowerCase();
        let idx = lower.indexOf(lowerQ);
        if (idx === -1) continue;

        const positions: number[] = [];
        while (idx !== -1) {
          positions.push(idx);
          idx = lower.indexOf(lowerQ, idx + 1);
        }

        searchTargets.push({ node: node as Text, text, positions });
      }

      for (const { node: textNode, text, positions } of searchTargets) {
        const parent = textNode.parentNode;
        if (!parent) continue;
        const frag = document.createDocumentFragment();
        let lastEnd = 0;
        for (const pos of positions) {
          if (pos > lastEnd) {
            frag.appendChild(document.createTextNode(text.slice(lastEnd, pos)));
          }
          const mark = document.createElement('mark');
          mark.className = MARK_CLASS;
          mark.textContent = text.slice(pos, pos + q.length);
          frag.appendChild(mark);
          marks.push(mark);
          lastEnd = pos + q.length;
        }
        if (lastEnd < text.length) {
          frag.appendChild(document.createTextNode(text.slice(lastEnd)));
        }
        parent.replaceChild(frag, textNode);
      }

      marksRef.current = marks;
      setMatchCount(marks.length);
      if (marks.length > 0) {
        setCurrentIndex(0);
        marks[0].classList.add(MARK_ACTIVE_CLASS);
        scrollMarkIntoView(marks[0], scrollerRef.current);
      } else {
        setCurrentIndex(-1);
      }
    },
    [scrollerRef, clearHighlights]
  );

  // ---------- Data-level search ("allNodes" scope) ----------

  const entries = useMemo(() => {
    if (!branchTree) return [];
    return [{ tree: branchTree, chatIndex: currentChatIndex }];
  }, [branchTree, currentChatIndex]);

  const doNodeSearch = useCallback(
    (q: string) => {
      clearHighlights();
      if (!q.trim() || entries.length === 0) {
        setNodeResults([]);
        setMatchCount(0);
        setCurrentIndex(-1);
        return;
      }
      const results = searchBranchNodes(q, entries, contentStore, 'all');
      setNodeResults(results);
      setMatchCount(results.length);
      if (results.length > 0) {
        setCurrentIndex(0);
        navigateToNodeResult(results[0], q);
      } else {
        setCurrentIndex(-1);
      }
    },
    [entries, contentStore, clearHighlights]
  );

  const navigateToNodeResult = useCallback(
    (result: SearchResult, q: string) => {
      if (!branchTree) return;
      const newPath = buildPathToLeaf(branchTree, result.nodeId);

      pushNavigationEntry({
        chatId: currentChatId,
        activePath: newPath,
        focusedNodeId: result.nodeId,
        source: 'search',
      });

      if (!result.isOnActivePath) {
        switchActivePathSilent(currentChatIndex, newPath);
      }
      // After path switch, highlight in DOM with a short delay for re-render
      setTimeout(() => {
        applyDomHighlightAndScroll(q);
      }, 200);
    },
    [branchTree, currentChatIndex, currentChatId, switchActivePathSilent, pushNavigationEntry]
  );

  /** Apply DOM highlights and scroll to the first match after a path switch. */
  const applyDomHighlightAndScroll = useCallback(
    (q: string) => {
      clearHighlights();
      const scroller = scrollerRef.current;
      if (!scroller || !q.trim()) return;

      const lowerQ = q.toLowerCase();
      const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          if ((node.parentElement as HTMLElement)?.closest('[data-chat-find-bar]')) {
            return NodeFilter.FILTER_REJECT;
          }
          const tag = node.parentElement?.tagName;
          if (tag === 'TEXTAREA' || tag === 'INPUT') return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      const marks: HTMLElement[] = [];
      const targets: SearchTarget[] = [];
      let nd: Node | null;
      while ((nd = walker.nextNode())) {
        const text = nd.textContent ?? '';
        const lower = text.toLowerCase();
        let idx = lower.indexOf(lowerQ);
        if (idx === -1) continue;
        const positions: number[] = [];
        while (idx !== -1) { positions.push(idx); idx = lower.indexOf(lowerQ, idx + 1); }
        targets.push({ node: nd as Text, text, positions });
      }
      for (const { node: textNode, text, positions } of targets) {
        const parent = textNode.parentNode;
        if (!parent) continue;
        const frag = document.createDocumentFragment();
        let lastEnd = 0;
        for (const pos of positions) {
          if (pos > lastEnd) frag.appendChild(document.createTextNode(text.slice(lastEnd, pos)));
          const mark = document.createElement('mark');
          mark.className = MARK_CLASS;
          mark.textContent = text.slice(pos, pos + q.length);
          frag.appendChild(mark);
          marks.push(mark);
          lastEnd = pos + q.length;
        }
        if (lastEnd < text.length) frag.appendChild(document.createTextNode(text.slice(lastEnd)));
        parent.replaceChild(frag, textNode);
      }
      marksRef.current = marks;

      if (marks.length > 0) {
        marks[0].classList.add(MARK_ACTIVE_CLASS);
        scrollMarkIntoView(marks[0], scrollerRef.current);
      }
    },
    [scrollerRef, clearHighlights]
  );

  // ---------- Debounced search dispatch ----------

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (scope === 'visible') {
        doDomSearch(query);
      } else {
        doNodeSearch(query);
      }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query, scope, doDomSearch, doNodeSearch]);

  // Clean up highlights on unmount
  useEffect(() => {
    return () => clearHighlights();
  }, [clearHighlights]);

  // ---------- Navigation ----------

  const goTo = useCallback(
    (newIndex: number) => {
      if (scope === 'visible') {
        const marks = marksRef.current;
        if (marks.length === 0) return;
        if (currentIndex >= 0 && currentIndex < marks.length) {
          marks[currentIndex].classList.remove(MARK_ACTIVE_CLASS);
        }
        marks[newIndex].classList.add(MARK_ACTIVE_CLASS);
        scrollMarkIntoView(marks[newIndex], scrollerRef.current);
        setCurrentIndex(newIndex);
      } else {
        // allNodes mode: navigate to the target node
        const result = nodeResults[newIndex];
        if (!result) return;
        setCurrentIndex(newIndex);
        navigateToNodeResult(result, query);
      }
    },
    [scope, currentIndex, scrollerRef, nodeResults, query, navigateToNodeResult]
  );

  const goNext = useCallback(() => {
    if (matchCount === 0) return;
    goTo((currentIndex + 1) % matchCount);
  }, [currentIndex, matchCount, goTo]);

  const goPrev = useCallback(() => {
    if (matchCount === 0) return;
    goTo((currentIndex - 1 + matchCount) % matchCount);
  }, [currentIndex, matchCount, goTo]);

  // ---------- Scope switch ----------

  const switchScope = useCallback(
    (newScope: FindScope) => {
      if (newScope === scope) return;
      clearHighlights();
      setMatchCount(0);
      setCurrentIndex(-1);
      setNodeResults([]);
      setScope(newScope);
      // Re-search will be triggered by the useEffect on [query, scope]
    },
    [scope, clearHighlights]
  );

  // ---------- Clear / Close ----------

  const handleClear = useCallback(() => {
    clearHighlights();
    setQuery('');
    setMatchCount(0);
    setCurrentIndex(-1);
    setNodeResults([]);
    inputRef.current?.focus();
  }, [clearHighlights]);

  const handleClose = useCallback(() => {
    if (hasQuery) {
      saveChatFindHistory(query);
    }
    clearHighlights();
    onClose();
  }, [hasQuery, query, saveChatFindHistory, clearHighlights, onClose]);

  // ---------- Keyboard ----------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsHistoryOpen(false);
        if (hasQuery) {
          saveChatFindHistory(query);
          handleClear();
        } else {
          handleClose();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        setIsHistoryOpen(false);
        if (hasQuery) saveChatFindHistory(query);
        if (e.shiftKey) goPrev();
        else goNext();
      } else if (e.key === 'ArrowDown') {
        if (isHistoryOpen) return; // let history handle
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowUp') {
        if (isHistoryOpen) return;
        e.preventDefault();
        goPrev();
      }
    },
    [hasQuery, query, isHistoryOpen, saveChatFindHistory, handleClear, handleClose, goNext, goPrev]
  );

  // ---------- History selection ----------

  const handleHistorySelect = useCallback(
    (entry: string) => {
      setQuery(entry);
      setIsHistoryOpen(false);
      inputRef.current?.focus();
    },
    []
  );

  // Show history: focused + empty query + has history
  const showHistory = isHistoryOpen && !hasQuery && chatFindHistory.length > 0;

  return (
    <div
      data-chat-find-bar
      className='fixed md:absolute top-0 left-0 right-0 z-50 md:z-40 flex flex-col bg-white dark:bg-gray-800 border-b border-gray-300 dark:border-gray-600 shadow-md px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:pt-2'
    >
      <div className='flex items-center gap-1.5'>
        {/* Scope toggle */}
        <div className='flex shrink-0 overflow-hidden rounded border border-gray-300 dark:border-gray-600'>
          <button
            onClick={() => switchScope('visible')}
            className={`px-1.5 py-1 text-[10px] leading-none transition-colors ${
              scope === 'visible'
                ? 'bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-white'
                : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
            }`}
            title={t('findScopeVisible') as string}
          >
            {t('findScopeVisibleShort') || '表示中'}
          </button>
          <button
            onClick={() => switchScope('allNodes')}
            className={`px-1.5 py-1 text-[10px] leading-none transition-colors ${
              scope === 'allNodes'
                ? 'bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-white'
                : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
            }`}
            title={t('findScopeAllNodes') as string}
          >
            {t('findScopeAllNodesShort') || '全ノード'}
          </button>
        </div>

        {/* Search input */}
        <div className='relative min-w-0 flex-1'>
          <input
            ref={inputRef}
            type='text'
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsHistoryOpen(true);
            }}
            onFocus={() => setIsHistoryOpen(true)}
            onBlur={() => {
              setTimeout(() => setIsHistoryOpen(false), 150);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('search') as string}
            className={`h-8 w-full text-base bg-transparent outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 ${
              hasQuery ? 'pr-7' : ''
            }`}
          />
          {hasQuery && (
            <button
              onClick={handleClear}
              className='absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
              title={t('clearSearch') as string}
            >
              <svg className='h-3.5 w-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2.5'>
                <path d='M6 18L18 6M6 6l12 12' />
              </svg>
            </button>
          )}
        </div>

        {/* Result count */}
        <span className='text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap min-w-[3rem] text-center'>
          {matchCount > 0
            ? `${currentIndex + 1}/${matchCount}`
            : hasQuery
              ? '0件'
              : ''}
        </span>

        {/* Prev */}
        <button
          onClick={goPrev}
          disabled={matchCount === 0}
          className='p-0.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30'
          title={t('previousResult') as string}
        >
          <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2.5'>
            <path d='M5 15l7-7 7 7' />
          </svg>
        </button>

        {/* Next */}
        <button
          onClick={goNext}
          disabled={matchCount === 0}
          className='p-0.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30'
          title={t('nextResult') as string}
        >
          <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2.5'>
            <path d='M19 9l-7 7-7-7' />
          </svg>
        </button>

        {/* Close */}
        <button
          onClick={handleClose}
          className='p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          title={t('close') as string}
        >
          <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2.5'>
            <path d='M6 18L18 6M6 6l12 12' />
          </svg>
        </button>
      </div>

      {/* Search history dropdown */}
      {showHistory && (
        <div className='mt-1 max-h-48 overflow-y-auto rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'>
          <div className='px-3 py-1 text-[10px] text-gray-400'>
            {t('recentSearches') || '最近の検索'}
          </div>
          {chatFindHistory.map((entry) => (
            <button
              key={entry}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleHistorySelect(entry)}
              className='flex w-full items-center gap-2 truncate px-3 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
              title={entry}
            >
              <svg className='h-3 w-3 shrink-0 text-gray-400' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2'>
                <circle cx='12' cy='12' r='10' />
                <polyline points='12 6 12 12 16 14' />
              </svg>
              <span className='truncate'>{entry}</span>
            </button>
          ))}
          <button
            className='w-full px-3 py-1.5 text-left text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            onMouseDown={(e) => e.preventDefault()}
            onClick={clearChatFindHistory}
          >
            {t('clearHistory') || '履歴をクリア'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ChatFindBar;
