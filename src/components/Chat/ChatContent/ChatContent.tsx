import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useStore from '@store/store';
import { useTranslation } from 'react-i18next';

import ScrollToBottomButton from './ScrollToBottomButton';
import CollapseAllButtons from './CollapseAllButtons';
import Message from './Message';
import NewMessageButton from './Message/NewMessageButton';
import CrossIcon from '@icon/CrossIcon';

import useSubmit from '@hooks/useSubmit';
import { stopSessionsForChat } from '@hooks/useSubmit';
import TokenCount from '@components/TokenCount/TokenCount';
import { MessageInterface, TextContentInterface } from '@type/chat';
import countTokens, { limitMessageTokens } from '@utils/messageUtils';
import { perfStart, perfEnd } from '@utils/perfTrace';
import { defaultModel, reduceMessagesToTotalToken } from '@constants/chat';
import { toast } from 'react-toastify';

const EMPTY_MESSAGES: never[] = [];
const SCROLL_ALIGN_TOLERANCE = 0.5;
const BOTTOM_THRESHOLD = 150;
const KEYBOARD_VIEWPORT_DELTA_THRESHOLD = 50;
type ScrollBehaviorMode = 'auto' | 'smooth';
const MESSAGE_EDIT_TEXTAREA_SELECTOR = 'textarea[data-message-editing="true"]';
const MESSAGE_ITEM_SELECTOR = '[data-item-index]';

type ActiveElementLike = {
  tagName?: string;
  matches?: (selector: string) => boolean;
} | null;

type ScrollerLike = {
  contains: (element: any) => boolean;
} | null;

export function isEditingMessageInScroller(scroller: HTMLElement | null): boolean {
  if (!scroller || typeof document === 'undefined') return false;
  return isEditingMessageElement(scroller, document.activeElement);
}

export function isEditingMessageElement(
  scroller: ScrollerLike,
  activeElement: ActiveElementLike
): boolean {
  if (
    !scroller ||
    !activeElement ||
    activeElement.tagName !== 'TEXTAREA' ||
    typeof activeElement.matches !== 'function'
  ) {
    return false;
  }

  return !!(
    activeElement.matches(MESSAGE_EDIT_TEXTAREA_SELECTOR) &&
    scroller.contains(activeElement) &&
    (activeElement as HTMLElement).closest?.(MESSAGE_ITEM_SELECTOR)
  );
}

export function shouldShowHiddenMessagesWarning({
  totalTokens,
  limitedTokens,
  totalMessages,
  limitedMessages,
  tokenLimit,
}: {
  totalTokens: number;
  limitedTokens: number;
  totalMessages: number;
  limitedMessages: number;
  tokenLimit: number;
}): boolean {
  return (
    totalMessages > 0 &&
    limitedMessages > 0 &&
    limitedMessages < totalMessages &&
    totalTokens > tokenLimit &&
    limitedTokens < totalTokens
  );
}

export function scrollViewportToBottom(
  scroller: { scrollHeight: number; scrollTop: number },
  onBottomStateChange: (isAtBottom: boolean) => void
): void {
  scroller.scrollTop = scroller.scrollHeight;
  onBottomStateChange(true);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement ||
    target.isContentEditable
  );
}

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
  const autoScroll = useStore((state) => state.autoScroll);
  const animateBubbleNavigation = useStore((state) => state.animateBubbleNavigation);
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
          if (
            !shouldShowHiddenMessagesWarning({
              totalTokens: allTokens,
              limitedTokens,
              totalMessages: messages.length,
              limitedMessages: messagesLimited.length,
              tokenLimit: reduceMessagesToTotalToken,
            })
          ) {
            return;
          }
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

  // Scroller refs — simplified from Virtuoso's dual-ref pattern
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollerElement, setScrollerElement] = useState<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [atTop, setAtTop] = useState(true);
  const [isEditingInScroller, setIsEditingInScroller] = useState(false);
  const [bubbleNavigationState, setBubbleNavigationState] = useState({
    canMoveUp: false,
    canMoveDown: false,
  });

  const scrollerCallbackRef = useCallback((el: HTMLDivElement | null) => {
    (scrollerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    setScrollerElement(el);
  }, []);

  // Scroll anchor tracking (local refs, saved to store on departure)
  const saveChatScrollAnchor = useStore((state) => state.saveChatScrollAnchor);
  const getChatScrollAnchor = useStore((state) => state.getChatScrollAnchor);
  const anchorRef = useRef({ firstVisibleItemIndex: 0, offsetWithinItem: 0, wasAtBottom: true });
  const atBottomRef = useRef(true);
  const pendingEditStateSyncRef = useRef<number | null>(null);

  // Build visible items list, filtering hidden system messages
  const items = useMemo(() => {
    const result: Array<{ message: MessageInterface; originalIndex: number }> = [];
    messagesLimited?.forEach((message, index) => {
      if (!advancedMode && index === 0 && message.role === 'system') return;
      result.push({ message, originalIndex: index });
    });
    return result;
  }, [messagesLimited, advancedMode]);

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
      saveChatScrollAnchor(prevChatIdRef.current, {
        ...anchorRef.current,
        wasAtBottom: atBottomRef.current,
      });
    }
    prevChatIdRef.current = currentChatId;
  }, [currentChatId, saveChatScrollAnchor]);

  useEffect(() => {
    return () => {
      saveCurrentAnchor();
    };
  }, [saveCurrentAnchor]);

  // --- Scroll event: atBottom + anchor tracking ---
  useEffect(() => {
    const scroller = scrollerElement;
    if (!scroller) return;

    const onScroll = () => {
      const isBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < BOTTOM_THRESHOLD;
      const isTop = scroller.scrollTop < BOTTOM_THRESHOLD;
      setAtBottom(isBottom);
      setAtTop(isTop);
      atBottomRef.current = isBottom;

      // Anchor update
      if (!isBottom) {
        const scrollerRect = scroller.getBoundingClientRect();
        const nodeItems = scroller.querySelectorAll<HTMLElement>(MESSAGE_ITEM_SELECTOR);
        for (const item of nodeItems) {
          const rect = item.getBoundingClientRect();
          if (rect.bottom > scrollerRect.top) {
            anchorRef.current.firstVisibleItemIndex = Number(item.dataset.itemIndex);
            anchorRef.current.offsetWithinItem = scrollerRect.top - rect.top;
            break;
          }
        }
      }
      anchorRef.current.wasAtBottom = isBottom;

      updateBubbleNavigationState();
    };

    // Sync initial state before any scroll event fires
    onScroll();

    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [scrollerElement, updateBubbleNavigationState]);

  // --- Streaming auto-follow via ResizeObserver ---
  // Track atBottom via ref so the observer can read it without being a dependency.
  // This prevents the observer from tearing down when content growth momentarily
  // sets atBottom=false before the scroll-to-end callback fires.
  const atBottomForAutoScrollRef = useRef(atBottom);
  atBottomForAutoScrollRef.current = atBottom;
  const syncAtBottomState = useCallback((isBottom: boolean) => {
    atBottomRef.current = isBottom;
    atBottomForAutoScrollRef.current = isBottom;
    setAtBottom(isBottom);
  }, []);

  useEffect(() => {
    if (!isCurrentChatGenerating || !autoScroll) return;
    if (isEditingInScroller) return;

    const scroller = scrollerRef.current;
    const messageList = scroller?.querySelector('[data-message-list]');
    if (!scroller || !messageList) return;

    // Only start auto-follow if already at the bottom when generation begins
    if (!atBottomForAutoScrollRef.current) return;

    const scrollToEnd = () => {
      // Stop following if user scrolled away manually
      if (!atBottomForAutoScrollRef.current) return;
      // Eagerly keep both state and refs pinned to "at bottom" so content growth
      // during streaming cannot temporarily break the auto-follow loop.
      scrollViewportToBottom(scroller, syncAtBottomState);
    };

    // Scroll to end immediately
    scrollToEnd();

    // ResizeObserver to follow content height changes
    const observer = new ResizeObserver(scrollToEnd);
    observer.observe(messageList);

    // Also observe individual message elements for streaming text growth
    const observeMessages = () => {
      const msgs = messageList.querySelectorAll('[data-item-index]');
      msgs.forEach((msg) => observer.observe(msg));
    };
    observeMessages();

    // Re-observe when new message elements are added
    const mutationObserver = new MutationObserver(() => {
      observeMessages();
      scrollToEnd();
    });
    mutationObserver.observe(messageList, { childList: true });

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, [isCurrentChatGenerating, autoScroll, isEditingInScroller, syncAtBottomState]);

  // Restore scroll anchor on mount
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
      const scroller = scrollerRef.current;
      const item = scroller?.querySelector<HTMLElement>(`[data-item-index="${itemIndex}"]`);
      if (!item || !scroller) return;
      const scrollerHeight = scroller.clientHeight;
      const itemHeight = item.offsetHeight;
      item.scrollIntoView({
        block: itemHeight > scrollerHeight ? 'start' : 'center',
        behavior: 'smooth',
      });
    });
  }, [pendingChatFocus, currentChatIndex, activePath, items, clearPendingChatFocus]);

  // Restore saved scroll anchor on chat switch (when no pendingChatFocus)
  useEffect(() => {
    if (pendingChatFocus && pendingChatFocus.chatIndex === currentChatIndex) return;

    const anchor = getChatScrollAnchor(currentChatId);
    if (!anchor) return;
    if (anchor.wasAtBottom) return;

    requestAnimationFrame(() => {
      const scroller = scrollerRef.current;
      const item = scroller?.querySelector<HTMLElement>(`[data-item-index="${anchor.firstVisibleItemIndex}"]`);
      if (!item || !scroller) return;
      item.scrollIntoView({ block: 'start' });
      scroller.scrollTop += anchor.offsetWithinItem;
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

  const handleScrollToTop = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTo({
      top: 0,
      behavior: animateBubbleNavigation ? 'smooth' : 'auto',
    });
  }, [animateBubbleNavigation]);

  const handleScrollToBottom = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTo({
      top: scroller.scrollHeight,
      behavior: animateBubbleNavigation ? 'smooth' : 'auto',
    });
  }, [animateBubbleNavigation]);

  const scrollToBubbleAtIndex = useCallback((index: number) => {
    if (index < 0 || index >= items.length) return;
    const scroller = scrollerRef.current;
    const item = scroller?.querySelector<HTMLElement>(`[data-item-index="${index}"]`);
    if (!item) return;
    item.scrollIntoView({
      block: 'start',
      behavior: animateBubbleNavigation ? 'smooth' : 'auto',
    });
  }, [animateBubbleNavigation, items.length]);

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

  // --- Focus tracking for isEditingInScroller ---
  useEffect(() => {
    if (!scrollerElement) return;

    const onFocusIn = (event: FocusEvent) => {
      if (pendingEditStateSyncRef.current != null) {
        cancelAnimationFrame(pendingEditStateSyncRef.current);
        pendingEditStateSyncRef.current = null;
      }

      const target = event.target;
      if (
        target instanceof HTMLTextAreaElement &&
        target.matches(MESSAGE_EDIT_TEXTAREA_SELECTOR) &&
        scrollerElement.contains(target) &&
        target.closest(MESSAGE_ITEM_SELECTOR)
      ) {
        setIsEditingInScroller(true);
      }
    };

    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (
        next instanceof HTMLTextAreaElement &&
        next.matches(MESSAGE_EDIT_TEXTAREA_SELECTOR) &&
        scrollerElement.contains(next) &&
        next.closest(MESSAGE_ITEM_SELECTOR)
      ) {
        return;
      }

      pendingEditStateSyncRef.current = requestAnimationFrame(() => {
        pendingEditStateSyncRef.current = null;
        setIsEditingInScroller(isEditingMessageInScroller(scrollerElement));
      });
    };

    scrollerElement.addEventListener('focusin', onFocusIn);
    scrollerElement.addEventListener('focusout', onFocusOut);

    return () => {
      if (pendingEditStateSyncRef.current != null) {
        cancelAnimationFrame(pendingEditStateSyncRef.current);
        pendingEditStateSyncRef.current = null;
      }
      scrollerElement.removeEventListener('focusin', onFocusIn);
      scrollerElement.removeEventListener('focusout', onFocusOut);
    };
  }, [scrollerElement]);

  // --- Keyboard viewport resize handling ---
  useEffect(() => {
    if (!scrollerElement || typeof window === 'undefined') return;

    const viewport = window.visualViewport;
    if (!viewport) return;

    let prevHeight = viewport.height;
    let didShrinkWhileEditingMessage = false;

    const onResize = () => {
      const delta = viewport.height - prevHeight;
      prevHeight = viewport.height;

      if (Math.abs(delta) < KEYBOARD_VIEWPORT_DELTA_THRESHOLD) return;

      const activeElement = document.activeElement;
      const isEditingMessage =
        activeElement instanceof HTMLElement &&
        activeElement.matches(MESSAGE_EDIT_TEXTAREA_SELECTOR);

      if (delta < 0 && isEditingMessage) {
        didShrinkWhileEditingMessage = true;
        requestAnimationFrame(() => {
          activeElement.scrollIntoView({
            block: 'center',
            behavior: 'auto',
          });
        });
        return;
      }

      if (delta > 0 && didShrinkWhileEditingMessage) {
        didShrinkWhileEditingMessage = false;
      }
    };

    viewport.addEventListener('resize', onResize);
    return () => viewport.removeEventListener('resize', onResize);
  }, [scrollerElement]);

  // --- Keyboard bubble navigation ---
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      if (isEditingInScroller || isEditableTarget(event.target)) return;

      event.preventDefault();
      if (event.key === 'ArrowUp') {
        handleScrollToPreviousBubble();
      } else {
        handleScrollToNextBubble();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleScrollToNextBubble, handleScrollToPreviousBubble, isEditingInScroller]);

  const computeItemKey = useCallback((index: number) => {
    return activePath[items[index].originalIndex] ?? `${currentChatId}:${items[index].originalIndex}`;
  }, [activePath, items, currentChatId]);

  return (
    <div className='flex-1 overflow-hidden'>
      <div className='h-full dark:bg-gray-800 relative'>
        <ScrollToBottomButton
          atBottom={atBottom}
          atTop={atTop}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          scrollToTop={handleScrollToTop}
          scrollToPreviousBubble={handleScrollToPreviousBubble}
          scrollToNextBubble={handleScrollToNextBubble}
          scrollToBottom={handleScrollToBottom}
        />
        <CollapseAllButtons />

        <div
          ref={scrollerCallbackRef}
          key={currentChatIndex}
          className='h-full overflow-y-auto overscroll-contain'
          data-chat-scroller
        >
          <div data-message-list>
            {items.map((item, index) => (
              <div key={computeItemKey(index)} data-item-index={index}>
                <Message
                  role={item.message.role}
                  content={item.message.content}
                  messageIndex={item.originalIndex}
                  nodeId={activePath[item.originalIndex]}
                />
                {!isCurrentChatGenerating && advancedMode && (
                  <NewMessageButton
                    messageIndex={item.originalIndex}
                    nodeId={activePath[item.originalIndex]}
                    role={item.message.role}
                  />
                )}
              </div>
            ))}
          </div>

          <div className='flex flex-col items-center text-sm dark:bg-gray-800'>
            <Message
              role={inputRole}
              content={[{ type: 'text', text: '' } as TextContentInterface]}
              messageIndex={stickyIndex}
              sticky
            />

            <div className='flex justify-center mt-1'>
              <TokenCount />
            </div>

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
            <div className='w-full h-36'></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatContent;
