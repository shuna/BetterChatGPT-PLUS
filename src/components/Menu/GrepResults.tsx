import React, { useState } from 'react';
import useStore from '@store/store';
import { GrepResult } from '@store/grep-slice';

const MAX_VISIBLE = 5;

const MARK_CLASS = 'chat-find-highlight';
const MARK_ACTIVE_CLASS = 'chat-find-highlight-active';

function cleanHighlights() {
  document.querySelectorAll(`mark.${MARK_CLASS}`).forEach((m) => {
    const p = m.parentNode;
    if (!p) return;
    p.replaceChild(document.createTextNode(m.textContent ?? ''), m);
    p.normalize();
  });
}

function applyHighlights(query: string) {
  const scroller = document.querySelector<HTMLElement>('[data-chat-scroller]');
  if (!scroller) return false;
  const lowerQ = query.toLowerCase();
  if (!scroller.textContent?.toLowerCase().includes(lowerQ)) return false;

  const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const tag = (node as Text).parentElement?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'MARK') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const targets: { node: Text; text: string; positions: number[] }[] = [];
  let textNode: Node | null;
  while ((textNode = walker.nextNode())) {
    const text = textNode.textContent ?? '';
    const lower = text.toLowerCase();
    let idx = lower.indexOf(lowerQ);
    if (idx === -1) continue;
    const positions: number[] = [];
    while (idx !== -1) { positions.push(idx); idx = lower.indexOf(lowerQ, idx + 1); }
    targets.push({ node: textNode as Text, text, positions });
  }

  for (const { node, text, positions } of targets) {
    const parent = node.parentNode;
    if (!parent) continue;
    const frag = document.createDocumentFragment();
    let lastEnd = 0;
    for (const pos of positions) {
      if (pos > lastEnd) frag.appendChild(document.createTextNode(text.slice(lastEnd, pos)));
      const mark = document.createElement('mark');
      mark.className = MARK_CLASS;
      mark.textContent = text.slice(pos, pos + query.length);
      frag.appendChild(mark);
      lastEnd = pos + query.length;
    }
    if (lastEnd < text.length) frag.appendChild(document.createTextNode(text.slice(lastEnd)));
    parent.replaceChild(frag, node);
  }

  const firstMark = document.querySelector<HTMLElement>(`mark.${MARK_CLASS}`);
  if (firstMark) {
    firstMark.classList.add(MARK_ACTIVE_CLASS);
    firstMark.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  return targets.length > 0;
}

let hlTimer: ReturnType<typeof setTimeout> | null = null;
let cleanTimer: ReturnType<typeof setTimeout> | null = null;
let hlObserver: MutationObserver | null = null;

function triggerHighlight(query: string, waitForChatSwitch: boolean) {
  if (hlTimer) clearTimeout(hlTimer);
  if (cleanTimer) clearTimeout(cleanTimer);
  if (hlObserver) { hlObserver.disconnect(); hlObserver = null; }
  cleanHighlights();

  let attempts = 0;
  let applied = false;

  const applyAndWatch = () => {
    attempts++;
    if (attempts > 30) return;
    if (!applyHighlights(query)) {
      requestAnimationFrame(() => setTimeout(applyAndWatch, 100));
      return;
    }
    applied = true;

    // Watch for React re-renders that destroy our marks, and re-apply
    const scroller = document.querySelector<HTMLElement>('[data-chat-scroller]');
    if (!scroller) return;

    let reapplyCount = 0;
    const maxReapplies = 10;

    const resetCleanTimer = () => {
      if (cleanTimer) clearTimeout(cleanTimer);
      cleanTimer = setTimeout(() => {
        if (hlObserver) { hlObserver.disconnect(); hlObserver = null; }
        cleanHighlights();
      }, 8000);
    };

    let reapplyTimer: ReturnType<typeof setTimeout> | null = null;
    hlObserver = new MutationObserver(() => {
      if (reapplyTimer) return; // debounce
      reapplyTimer = setTimeout(() => {
        reapplyTimer = null;
        const markCount = document.querySelectorAll(`mark.${MARK_CLASS}`).length;
        if (markCount === 0 && reapplyCount < maxReapplies) {
          reapplyCount++;
          applyHighlights(query);
          resetCleanTimer();
        }
      }, 100);
    });
    hlObserver.observe(scroller, { childList: true, subtree: true });

    resetCleanTimer();
  };

  if (waitForChatSwitch) {
    hlTimer = setTimeout(applyAndWatch, 300);
  } else {
    hlTimer = setTimeout(applyAndWatch, 50);
  }
}

const HighlightedSnippet = ({ snippet, query }: { snippet: string; query: string }) => {
  if (!query) return <>{snippet}</>;

  const lowerSnippet = snippet.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let idx = lowerSnippet.indexOf(lowerQuery);

  while (idx >= 0) {
    if (idx > lastIndex) {
      parts.push(snippet.slice(lastIndex, idx));
    }
    parts.push(
      <mark key={idx} className='bg-yellow-300/50 text-inherit dark:bg-yellow-500/30'>
        {snippet.slice(idx, idx + query.length)}
      </mark>
    );
    lastIndex = idx + query.length;
    idx = lowerSnippet.indexOf(lowerQuery, lastIndex);
  }

  if (lastIndex < snippet.length) {
    parts.push(snippet.slice(lastIndex));
  }

  return <>{parts}</>;
};

const GrepResultGroup = ({ result, query }: { result: GrepResult; query: string }) => {
  const [expanded, setExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const navigateToGrepResult = useStore((state) => state.navigateToGrepResult);
  const currentChatIndex = useStore((state) => state.currentChatIndex);

  const handleClick = (chatIndex: number, nodeId?: string) => {
    const isSameChat = currentChatIndex === chatIndex;
    navigateToGrepResult(chatIndex, nodeId);
    triggerHighlight(query, !isSameChat);
  };

  const visibleMatches = showAll ? result.matches : result.matches.slice(0, MAX_VISIBLE);
  const hasMore = result.matches.length > MAX_VISIBLE;

  return (
    <div className='mb-1'>
      <button
        className='flex w-full items-center gap-1 rounded px-2 py-1 text-left text-xs font-medium text-gray-700 hover:bg-gray-200/50 dark:text-gray-300 dark:hover:bg-gray-700/50'
        onClick={() => setExpanded(!expanded)}
      >
        <svg
          className={`h-3 w-3 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill='currentColor'
          viewBox='0 0 20 20'
        >
          <path fillRule='evenodd' d='M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z' clipRule='evenodd' />
        </svg>
        <span className='truncate'>{result.chatTitle}</span>
        <span className='ml-auto shrink-0 text-[10px] text-gray-400'>
          {result.matches.length}
        </span>
      </button>

      {expanded && (
        <div className='ml-3 border-l border-gray-200 dark:border-white/10'>
          {visibleMatches.map((match, i) => (
            <button
              key={`${match.nodeId}-${i}`}
              className='block w-full truncate px-3 py-1 text-left text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
              onClick={() => handleClick(result.chatIndex, match.nodeId)}
              title={match.snippet}
            >
              <HighlightedSnippet snippet={match.snippet} query={query} />
            </button>
          ))}
          {hasMore && !showAll && (
            <button
              className='px-3 py-1 text-[10px] text-blue-500 hover:text-blue-400'
              onClick={() => setShowAll(true)}
            >
              +{result.matches.length - MAX_VISIBLE} more
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const GrepResults = () => {
  const grepResults = useStore((state) => state.grepResults);
  const grepQuery = useStore((state) => state.grepQuery);
  const isGrepSearching = useStore((state) => state.isGrepSearching);

  if (isGrepSearching) {
    return (
      <div className='px-4 py-3 text-xs text-gray-400'>
        Searching...
      </div>
    );
  }

  if (!grepQuery.trim()) {
    return (
      <div className='px-4 py-3 text-xs text-gray-400'>
        Type to search across all chat content
      </div>
    );
  }

  if (grepResults.length === 0) {
    return (
      <div className='px-4 py-3 text-xs text-gray-400'>
        No results found
      </div>
    );
  }

  const totalMatches = grepResults.reduce((sum, r) => sum + r.matches.length, 0);

  return (
    <div className='flex min-h-0 flex-1 flex-col overflow-y-auto'>
      <div className='px-3 py-1 text-[10px] text-gray-400'>
        {totalMatches} matches in {grepResults.length} chats
      </div>
      {grepResults.map((result) => (
        <GrepResultGroup
          key={result.chatIndex}
          result={result}
          query={grepQuery}
        />
      ))}
    </div>
  );
};

export default GrepResults;
