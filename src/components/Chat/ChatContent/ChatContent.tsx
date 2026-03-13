import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListRange, Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import useStore from '@store/store';
import { useTranslation } from 'react-i18next';

import ScrollToBottomButton from './ScrollToBottomButton';
import CollapseAllButtons from './CollapseAllButtons';
import Message from './Message';
import NewMessageButton from './Message/NewMessageButton';
import CrossIcon from '@icon/CrossIcon';

import useSubmit from '@hooks/useSubmit';
import { stopSessionsForChat } from '@hooks/useSubmit';
import DownloadChat from './DownloadChat';
import CloneChat from './CloneChat';
const ShareGPT = React.lazy(() => import('@components/ShareGPT'));
import { MessageInterface, TextContentInterface } from '@type/chat';
import countTokens, { limitMessageTokens } from '@utils/messageUtils';
import { perfStart, perfEnd } from '@utils/perfTrace';
import { defaultModel, reduceMessagesToTotalToken } from '@constants/chat';
import { toast } from 'react-toastify';

const EMPTY_MESSAGES: never[] = [];
const SCROLL_TO_BOTTOM_TOP = Number.MAX_SAFE_INTEGER;
const SCROLL_ALIGN_TOLERANCE = 0.5;
type ScrollBehaviorMode = 'auto' | 'smooth';

const ChatContent = () => {
  const { t } = useTranslation();
  const inputRole = useStore((state) => state.inputRole);
  const setError = useStore((state) => state.setError);
  const setChats = useStore((state) => state.setChats);
  const messages = useStore((state) =>
    state.chats &&
    state.chats.length > 0 &&
    state.currentChatIndex >= 0 &&
    state.currentChatIndex < state.chats.length
      ? state.chats[state.currentChatIndex].messages
      : EMPTY_MESSAGES
  );
  const currentChatIndex = useStore((state) => state.currentChatIndex);
  const stickyIndex = useStore((state) =>
    state.chats &&
    state.chats.length > 0 &&
    state.currentChatIndex >= 0 &&
    state.currentChatIndex < state.chats.length
      ? state.chats[state.currentChatIndex].messages.length
      : 0
  );
  const advancedMode = useStore((state) => state.advancedMode);
  const hideSideMenu = useStore((state) => state.hideSideMenu);
  const autoScroll = useStore((state) => state.autoScroll);
  const animateBubbleNavigation = useStore((state) => state.animateBubbleNavigation);
  const hideShareGPT = useStore((state) => state.hideShareGPT);

  const currentChatId = useStore((state) =>
    state.chats?.[state.currentChatIndex]?.id ?? ''
  );
  const activePath = useStore((state) =>
    state.chats?.[state.currentChatIndex]?.branchTree?.activePath ?? []
  );
  const isCurrentChatGenerating = useStore((state) =>
    Object.values(state.generatingSessions).some((s) => s.chatId === currentChatId)
  );

  const model = useStore((state) =>
    state.chats &&
    state.chats.length > 0 &&
    state.currentChatIndex >= 0 &&
    state.currentChatIndex < state.chats.length
      ? state.chats[state.currentChatIndex].config.model
      : defaultModel
  );
  const [messagesLimited, setMessagesLimited] = React.useState(messages);

  // Synchronously reset messagesLimited when conversation changes so that
  // the new messages are displayed immediately (before async token limiting).
  const prevChatIndexRef = useRef(currentChatIndex);
  if (prevChatIndexRef.current !== currentChatIndex) {
    prevChatIndexRef.current = currentChatIndex;
    setMessagesLimited(messages);
  }

  useEffect(() => {
    let cancelled = false;

    limitMessageTokens(messages, reduceMessagesToTotalToken, model).then((nextMessages) => {
      if (!cancelled) setMessagesLimited(nextMessages);
    });

    return () => {
      cancelled = true;
    };
  }, [messages, model]);

  const handleReduceMessages = () => {
    const confirmMessage = t('reduceMessagesWarning');
    if (window.confirm(confirmMessage)) {
      const chats = useStore.getState().chats!;
      const removedMessagesCount = messages.length - messagesLimited.length;
      const updatedChats = chats.slice();
      updatedChats[currentChatIndex] = { ...chats[currentChatIndex], messages: messagesLimited };
      setChats(updatedChats);
      toast.dismiss();
      toast.success(t('reduceMessagesSuccess', { count: removedMessagesCount }));
    }
  };

  useEffect(() => {
    let cancelled = false;

    if (!isCurrentChatGenerating) {
      if (messagesLimited.length > 0 && messagesLimited.length < messages.length) {
        Promise.all([
          countTokens(messages, model),
          countTokens(messagesLimited, model),
        ]).then(([allTokens, limitedTokens]) => {
          if (cancelled) return;
          const hiddenTokens = allTokens - limitedTokens;
          const message = (
            <div>
              <span>
                {t('hiddenMessagesWarning', { hiddenTokens, reduceMessagesToTotalToken })}
              </span><br />
              <button
                onClick={handleReduceMessages}
                className="px-2 py-1 bg-blue-500 text-white rounded"
              >
                {t('reduceMessagesButton')}
              </button>
            </div>
          );
          toast.error(message);
        });
      }
    }

    return () => {
      cancelled = true;
    };
  }, [messagesLimited, isCurrentChatGenerating, messages, model]);

  // clear error at the start of generating new messages
  useEffect(() => {
    if (isCurrentChatGenerating) {
      setError('');
    }
  }, [isCurrentChatGenerating]);

  const { error, handleRetry } = useSubmit();
  const lastSubmitMode = useStore((state) => state.lastSubmitMode);
  const setLastSubmitContext = useStore((state) => state.setLastSubmitContext);

  // Virtuoso state
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [bubbleNavigationState, setBubbleNavigationState] = useState({
    canMoveUp: false,
    canMoveDown: false,
  });

  // Scroll anchor tracking (local refs, saved to store on departure)
  const saveChatScrollAnchor = useStore((state) => state.saveChatScrollAnchor);
  const getChatScrollAnchor = useStore((state) => state.getChatScrollAnchor);
  const anchorRef = useRef({ firstVisibleItemIndex: 0, offsetWithinItem: 0, wasAtBottom: true });
  const atBottomRef = useRef(true);

  // Bottom lock mode
  const bottomLockRef = useRef(false);
  const bottomLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollTopRef = useRef(0);

  // Build visible items list, filtering hidden system messages
  const items = useMemo(() => {
    const result: Array<{ message: MessageInterface; originalIndex: number }> = [];
    messagesLimited?.forEach((message, index) => {
      if (!advancedMode && index === 0 && message.role === 'system') return;
      result.push({ message, originalIndex: index });
    });
    return result;
  }, [messagesLimited, advancedMode]);

  // Track visible range for anchor
  const refreshAnchorOffsetWithinItem = useCallback(() => {
    if (!scrollerRef.current || items.length === 0) return;
    const anchorIndex = Math.min(
      Math.max(anchorRef.current.firstVisibleItemIndex, 0),
      items.length - 1
    );
    const firstItem = scrollerRef.current.querySelector(`[data-item-index="${anchorIndex}"]`);
    if (!firstItem) return;

    const scrollerRect = scrollerRef.current.getBoundingClientRect();
    const itemRect = firstItem.getBoundingClientRect();
    anchorRef.current.offsetWithinItem = scrollerRect.top - itemRect.top;
  }, [items.length]);

  const getViewportBubbleState = useCallback(() => {
    if (!scrollerRef.current || items.length === 0) {
      return { currentIndex: -1, insideBubble: false };
    }

    const scrollerRect = scrollerRef.current.getBoundingClientRect();
    const viewportTop = scrollerRect.top + SCROLL_ALIGN_TOLERANCE;
    const renderedItems = Array.from(
      scrollerRef.current.querySelectorAll<HTMLElement>('[data-item-index]')
    );

    for (const item of renderedItems) {
      const itemIndex = Number(item.dataset.itemIndex);
      if (Number.isNaN(itemIndex)) continue;
      const itemRect = item.getBoundingClientRect();
      if (itemRect.top <= viewportTop && itemRect.bottom > viewportTop) {
        return {
          currentIndex: Math.min(Math.max(itemIndex, 0), items.length - 1),
          insideBubble: viewportTop - itemRect.top > SCROLL_ALIGN_TOLERANCE,
        };
      }
    }

    const fallbackIndex = Math.min(
      Math.max(anchorRef.current.firstVisibleItemIndex, 0),
      items.length - 1
    );
    return {
      currentIndex: fallbackIndex,
      insideBubble: anchorRef.current.offsetWithinItem > SCROLL_ALIGN_TOLERANCE,
    };
  }, [items.length]);

  const updateBubbleNavigationState = useCallback(() => {
    const { currentIndex, insideBubble } = getViewportBubbleState();
    if (currentIndex < 0) {
      setBubbleNavigationState({ canMoveUp: false, canMoveDown: false });
      return;
    }

    setBubbleNavigationState({
      canMoveUp: currentIndex > 0 || (currentIndex === 0 && insideBubble),
      canMoveDown: currentIndex < items.length - 1,
    });
  }, [getViewportBubbleState, items.length]);

  const handleRangeChanged = useCallback((range: ListRange) => {
    anchorRef.current.firstVisibleItemIndex = range.startIndex;
    refreshAnchorOffsetWithinItem();
    updateBubbleNavigationState();
  }, [refreshAnchorOffsetWithinItem, updateBubbleNavigationState]);

  // Save scroll anchor to store (called on chat departure / unmount)
  const saveCurrentAnchor = useCallback(() => {
    if (!currentChatId) return;
    saveChatScrollAnchor(currentChatId, {
      ...anchorRef.current,
      wasAtBottom: atBottomRef.current,
    });
  }, [currentChatId, saveChatScrollAnchor]);

  // Save anchor when chat changes or component unmounts
  const prevChatIdRef = useRef(currentChatId);
  useEffect(() => {
    if (prevChatIdRef.current && prevChatIdRef.current !== currentChatId) {
      // Chat changed — save anchor for the previous chat
      saveChatScrollAnchor(prevChatIdRef.current, {
        ...anchorRef.current,
        wasAtBottom: atBottomRef.current,
      });
      // Reset bottom lock so it doesn't bleed into the new chat
      bottomLockRef.current = false;
      if (bottomLockTimerRef.current) {
        clearTimeout(bottomLockTimerRef.current);
        bottomLockTimerRef.current = null;
      }
    }
    prevChatIdRef.current = currentChatId;
  }, [currentChatId, saveChatScrollAnchor]);

  useEffect(() => {
    return () => {
      saveCurrentAnchor();
    };
  }, [saveCurrentAnchor]);

  // Restore scroll anchor on mount (after Virtuoso renders)
  const pendingChatFocus = useStore((state) => state.pendingChatFocus);
  const clearPendingChatFocus = useStore((state) => state.clearPendingChatFocus);

  // Handle pendingChatFocus — reacts to focus changes (including same-chat branch editor return)
  useEffect(() => {
    if (!pendingChatFocus || pendingChatFocus.chatIndex !== currentChatIndex) return;
    const nodeId = pendingChatFocus.nodeId;
    const pathIndex = activePath.indexOf(nodeId);
    if (pathIndex < 0) return;
    const itemIndex = items.findIndex((item) => item.originalIndex === pathIndex);
    if (itemIndex < 0) return;

    clearPendingChatFocus();
    requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({ index: itemIndex, behavior: 'smooth', align: 'center' });
    });
  }, [pendingChatFocus, currentChatIndex, activePath, items, clearPendingChatFocus]);

  // Restore saved scroll anchor on chat switch (when no pendingChatFocus)
  useEffect(() => {
    // Skip if pendingChatFocus will handle scrolling
    if (pendingChatFocus && pendingChatFocus.chatIndex === currentChatIndex) return;

    const anchor = getChatScrollAnchor(currentChatId);
    if (!anchor) return; // first visit — Virtuoso defaults to bottom
    if (anchor.wasAtBottom) return; // was at bottom — Virtuoso defaults correctly

    requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({
        index: anchor.firstVisibleItemIndex,
        align: 'start',
        offset: -anchor.offsetWithinItem,
      });
    });
  }, [currentChatIndex]); // intentionally only on chat switch (mount)

  useEffect(() => {
    perfStart('chat-render');
  }, [currentChatIndex]);
  useEffect(() => {
    perfEnd('chat-render');
  }, [items]);

  useEffect(() => {
    updateBubbleNavigationState();
  }, [currentChatIndex, items.length, updateBubbleNavigationState]);

  const handleScrollToBottom = useCallback(() => {
    bottomLockRef.current = true;
    const scrollBehavior: ScrollBehaviorMode = animateBubbleNavigation ? 'smooth' : 'auto';
    // Clear any pending unlock timer
    if (bottomLockTimerRef.current) clearTimeout(bottomLockTimerRef.current);
    virtuosoRef.current?.scrollTo({ top: SCROLL_TO_BOTTOM_TOP, behavior: scrollBehavior });
    // Retry scroll for a few frames to handle pending height changes
    let retries = 3;
    const retryScroll = () => {
      if (retries-- > 0 && bottomLockRef.current) {
        virtuosoRef.current?.scrollTo({ top: SCROLL_TO_BOTTOM_TOP });
        requestAnimationFrame(retryScroll);
      }
    };
    requestAnimationFrame(retryScroll);
  }, [animateBubbleNavigation]);

  const scrollToBubbleAtIndex = useCallback((index: number) => {
    if (index < 0 || index >= items.length) return;
    virtuosoRef.current?.scrollToIndex({
      index,
      align: 'start',
      behavior: animateBubbleNavigation ? 'smooth' : 'auto',
    });
  }, [animateBubbleNavigation, items.length]);

  const getAnchorBubbleIndex = useCallback(() => {
    if (items.length === 0) return -1;
    const anchorIndex = Math.min(
      Math.max(anchorRef.current.firstVisibleItemIndex, 0),
      items.length - 1
    );
    return anchorIndex;
  }, [items.length]);

  const getTopAlignedBubbleIndex = useCallback(() => {
    const { currentIndex, insideBubble } = getViewportBubbleState();
    if (currentIndex < 0) return -1;
    return insideBubble ? Math.min(currentIndex + 1, items.length - 1) : currentIndex;
  }, [getViewportBubbleState, items.length]);

  const handleScrollToPreviousBubble = useCallback(() => {
    const topAlignedIndex = getTopAlignedBubbleIndex();
    if (topAlignedIndex <= 0) return;
    scrollToBubbleAtIndex(topAlignedIndex - 1);
  }, [getTopAlignedBubbleIndex, scrollToBubbleAtIndex]);

  const handleScrollToNextBubble = useCallback(() => {
    const topAlignedIndex = getTopAlignedBubbleIndex();
    if (topAlignedIndex < 0 || topAlignedIndex >= items.length - 1) return;
    scrollToBubbleAtIndex(topAlignedIndex + 1);
  }, [getTopAlignedBubbleIndex, items.length, scrollToBubbleAtIndex]);

  const { canMoveUp, canMoveDown } = bubbleNavigationState;

  const handleFollowOutput = useCallback((isAtBottom: boolean) => {
    if (!autoScroll) return false;

    // Avoid restarting smooth follow animations while streaming content is still changing height.
    if (isCurrentChatGenerating) {
      if (bottomLockRef.current) return true;
      return isAtBottom ? true : false;
    }

    // Bottom lock forces follow regardless of current position
    if (bottomLockRef.current) return 'smooth' as const;
    return isAtBottom ? 'smooth' as const : false;
  }, [autoScroll, isCurrentChatGenerating]);

  const handleAtBottomStateChange = useCallback((bottom: boolean) => {
    setAtBottom(bottom);
    atBottomRef.current = bottom;

    // Bottom lock release: require stable atBottom for 500ms
    if (bottom && bottomLockRef.current) {
      if (bottomLockTimerRef.current) clearTimeout(bottomLockTimerRef.current);
      bottomLockTimerRef.current = setTimeout(() => {
        bottomLockRef.current = false;
        bottomLockTimerRef.current = null;
      }, 500);
    } else if (!bottom && bottomLockTimerRef.current) {
      // Not at bottom — cancel pending unlock
      clearTimeout(bottomLockTimerRef.current);
      bottomLockTimerRef.current = null;
    }
  }, []);

  // Detect manual upward scroll to release bottom lock
  const scrollListenerCleanupRef = useRef<(() => void) | null>(null);

  const handleScrollerRef = useCallback((ref: HTMLElement | Window | null) => {
    // Clean up previous listener
    if (scrollListenerCleanupRef.current) {
      scrollListenerCleanupRef.current();
      scrollListenerCleanupRef.current = null;
    }

    if (ref && ref instanceof HTMLElement) {
      scrollerRef.current = ref;
      const onScroll = () => {
        const currentTop = ref.scrollTop;
        // User scrolled up manually — release bottom lock
        if (bottomLockRef.current && currentTop < lastScrollTopRef.current - 10) {
          bottomLockRef.current = false;
          if (bottomLockTimerRef.current) {
            clearTimeout(bottomLockTimerRef.current);
            bottomLockTimerRef.current = null;
          }
        }
        lastScrollTopRef.current = currentTop;
        updateBubbleNavigationState();
      };
      ref.addEventListener('scroll', onScroll, { passive: true });
      scrollListenerCleanupRef.current = () => ref.removeEventListener('scroll', onScroll);
      updateBubbleNavigationState();
    } else {
      scrollerRef.current = null;
      updateBubbleNavigationState();
    }
  }, [updateBubbleNavigationState]);

  // Cleanup scroll listener on unmount
  useEffect(() => {
    return () => {
      if (scrollListenerCleanupRef.current) {
        scrollListenerCleanupRef.current();
        scrollListenerCleanupRef.current = null;
      }
    };
  }, []);

  const itemContent = useCallback((index: number) => {
    const { message, originalIndex } = items[index];
    return (
      <>
        <Message
          role={message.role}
          content={message.content}
          messageIndex={originalIndex}
          nodeId={activePath[originalIndex]}
        />
        {!isCurrentChatGenerating && advancedMode && (
          <NewMessageButton messageIndex={originalIndex} />
        )}
      </>
    );
  }, [items, activePath, isCurrentChatGenerating, advancedMode]);

  const Footer = useCallback(() => (
    <div className='flex flex-col items-center text-sm dark:bg-gray-800'>
      <Message
        role={inputRole}
        content={[{ type: 'text', text: '' } as TextContentInterface]}
        messageIndex={stickyIndex}
        sticky
      />

      <div
        className={`flex justify-center my-2 min-h-[40px] ${
          isCurrentChatGenerating ? '' : 'invisible pointer-events-none'
        }`}
        aria-hidden={!isCurrentChatGenerating}
      >
        {isCurrentChatGenerating && (
          <button
            className='btn relative btn-neutral border-0 md:border'
            onClick={() => {
              if (currentChatId) stopSessionsForChat(currentChatId);
            }}
            aria-label={t('stopGenerating') as string}
          >
            <div className='flex w-full items-center justify-center gap-2'>
              <svg
                stroke='currentColor'
                fill='none'
                strokeWidth='1.5'
                viewBox='0 0 24 24'
                strokeLinecap='round'
                strokeLinejoin='round'
                className='h-3 w-3 animate-pulse'
                height='1em'
                width='1em'
                xmlns='http://www.w3.org/2000/svg'
              >
                <rect x='3' y='3' width='18' height='18' rx='2' ry='2'></rect>
              </svg>
              {t('stopGenerating')}
            </div>
          </button>
        )}
      </div>

      {error !== '' && (
        <div className='relative py-2 px-3 w-3/5 mt-3 max-md:w-11/12 border rounded-md border-red-500 bg-red-500/10'>
          <div className='text-gray-600 dark:text-gray-100 text-sm whitespace-pre-wrap'>
            {error}
          </div>
          {lastSubmitMode && (
            <div className='flex items-center gap-2 mt-2'>
              <button
                className='px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors'
                onClick={handleRetry}
              >
                {t('retry')}
              </button>
            </div>
          )}
          <div
            className='text-white absolute top-1 right-1 cursor-pointer'
            onClick={() => {
              setError('');
              setLastSubmitContext(null, null, null, null);
            }}
          >
            <CrossIcon />
          </div>
        </div>
      )}
      <div
        className={`mt-4 w-full m-auto  ${
          hideSideMenu
            ? 'md:max-w-5xl lg:max-w-5xl xl:max-w-6xl'
            : 'md:max-w-3xl lg:max-w-3xl xl:max-w-4xl'
        }`}
      >
        <div
          className={`md:w-[calc(100%-50px)] flex gap-4 flex-wrap justify-center min-h-[40px] ${
            isCurrentChatGenerating ? 'invisible pointer-events-none' : ''
          }`}
          aria-hidden={isCurrentChatGenerating}
        >
          {!isCurrentChatGenerating && (
            <>
              <DownloadChat visibleMessages={items} />
              {!hideShareGPT && <Suspense fallback={null}><ShareGPT /></Suspense>}
              <CloneChat />
            </>
          )}
        </div>
      </div>
      <div className='w-full h-36'></div>
    </div>
  ), [inputRole, stickyIndex, isCurrentChatGenerating, currentChatId, error, lastSubmitMode, handleRetry, hideSideMenu, hideShareGPT, t, setError, setLastSubmitContext]);

  const components = useMemo(() => ({ Footer }), [Footer]);

  return (
    <div className='flex-1 overflow-hidden'>
      <div className='h-full dark:bg-gray-800 relative'>
        <ScrollToBottomButton
          atBottom={atBottom}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          scrollToPreviousBubble={handleScrollToPreviousBubble}
          scrollToNextBubble={handleScrollToNextBubble}
          scrollToBottom={handleScrollToBottom}
        />
        <CollapseAllButtons />

        <Virtuoso
          ref={virtuosoRef}
          key={currentChatIndex}
          className='h-full'
          totalCount={items.length}
          computeItemKey={(index) => activePath[items[index].originalIndex] ?? `${currentChatId}:${items[index].originalIndex}`}
          overscan={600}
          followOutput={handleFollowOutput}
          atBottomStateChange={handleAtBottomStateChange}
          atBottomThreshold={150}
          itemContent={itemContent}
          components={components}
          rangeChanged={handleRangeChanged}
          scrollerRef={handleScrollerRef}
        />
      </div>
    </div>
  );
};

export default ChatContent;
