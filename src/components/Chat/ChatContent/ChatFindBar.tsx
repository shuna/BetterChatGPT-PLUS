import React, { useCallback, useEffect, useRef, useState } from 'react';

interface ChatFindBarProps {
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

const MARK_CLASS = 'chat-find-highlight';
const MARK_ACTIVE_CLASS = 'chat-find-highlight-active';

/**
 * Find-in-page search bar for chat content.
 * Walks text nodes inside the scroller, wraps matches with <mark>, and
 * provides prev/next navigation.
 */
const ChatFindBar = ({ scrollerRef, onClose }: ChatFindBarProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const marksRef = useRef<HTMLElement[]>([]);

  // Focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  const doSearch = useCallback(
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
          // Skip nodes inside the find bar itself
          if ((node.parentElement as HTMLElement)?.closest('[data-chat-find-bar]')) {
            return NodeFilter.FILTER_REJECT;
          }
          // Skip nodes inside input/textarea
          const tag = node.parentElement?.tagName;
          if (tag === 'TEXTAREA' || tag === 'INPUT') {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      const marks: HTMLElement[] = [];
      const textNodes: { node: Text; start: number }[] = [];

      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = node.textContent ?? '';
        const lower = text.toLowerCase();
        let idx = lower.indexOf(lowerQ);
        if (idx === -1) continue;

        // Collect all match positions in this text node
        const positions: number[] = [];
        while (idx !== -1) {
          positions.push(idx);
          idx = lower.indexOf(lowerQ, idx + 1);
        }

        textNodes.push({ node: node as Text, start: positions[0] });

        // Replace text node with fragments containing <mark> wrappers
        const parent = node.parentNode!;
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
        parent.replaceChild(frag, node);
      }

      marksRef.current = marks;
      setMatchCount(marks.length);
      if (marks.length > 0) {
        setCurrentIndex(0);
        marks[0].classList.add(MARK_ACTIVE_CLASS);
        marks[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
      } else {
        setCurrentIndex(-1);
      }
    },
    [scrollerRef, clearHighlights]
  );

  // Debounced search on query change
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 250);
    return () => clearTimeout(debounceRef.current);
  }, [query, doSearch]);

  // Clean up highlights on unmount
  useEffect(() => {
    return () => clearHighlights();
  }, [clearHighlights]);

  const goTo = useCallback(
    (newIndex: number) => {
      const marks = marksRef.current;
      if (marks.length === 0) return;
      if (currentIndex >= 0 && currentIndex < marks.length) {
        marks[currentIndex].classList.remove(MARK_ACTIVE_CLASS);
      }
      marks[newIndex].classList.add(MARK_ACTIVE_CLASS);
      marks[newIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
      setCurrentIndex(newIndex);
    },
    [currentIndex]
  );

  const goNext = useCallback(() => {
    if (matchCount === 0) return;
    goTo((currentIndex + 1) % matchCount);
  }, [currentIndex, matchCount, goTo]);

  const goPrev = useCallback(() => {
    if (matchCount === 0) return;
    goTo((currentIndex - 1 + matchCount) % matchCount);
  }, [currentIndex, matchCount, goTo]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) goPrev();
        else goNext();
      }
    },
    [onClose, goNext, goPrev]
  );

  return (
    <div
      data-chat-find-bar
      className='absolute top-0 left-0 right-0 z-40 flex items-center gap-1.5 bg-white dark:bg-gray-800 border-b border-gray-300 dark:border-gray-600 shadow-md px-3 py-2'
    >
      <input
        ref={inputRef}
        type='text'
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder='ページ内検索...'
        className='flex-1 min-w-0 text-sm bg-transparent outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400 border border-gray-300 dark:border-gray-600 rounded px-2 py-1'
      />

      {/* Result count */}
      <span className='text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap min-w-[3rem] text-center'>
        {matchCount > 0
          ? `${currentIndex + 1}/${matchCount}`
          : query.trim()
            ? '0件'
            : ''}
      </span>

      {/* Prev */}
      <button
        onClick={goPrev}
        disabled={matchCount === 0}
        className='p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30'
        aria-label='前の結果'
      >
        <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2.5'>
          <path d='M5 15l7-7 7 7' />
        </svg>
      </button>

      {/* Next */}
      <button
        onClick={goNext}
        disabled={matchCount === 0}
        className='p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30'
        aria-label='次の結果'
      >
        <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2.5'>
          <path d='M19 9l-7 7-7-7' />
        </svg>
      </button>

      {/* Close */}
      <button
        onClick={onClose}
        className='p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
        aria-label='閉じる'
      >
        <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2.5'>
          <path d='M6 18L18 6M6 6l12 12' />
        </svg>
      </button>
    </div>
  );
};

export default ChatFindBar;
