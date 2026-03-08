import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
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
  const hideShareGPT = useStore((state) => state.hideShareGPT);

  const currentChatId = useStore((state) =>
    state.chats?.[state.currentChatIndex]?.id ?? ''
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
      if (messagesLimited.length < messages.length) {
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
  const [atBottom, setAtBottom] = useState(true);

  // Build visible items list, filtering hidden system messages
  const items = useMemo(() => {
    const result: Array<{ message: MessageInterface; originalIndex: number }> = [];
    messagesLimited?.forEach((message, index) => {
      if (!advancedMode && index === 0 && message.role === 'system') return;
      result.push({ message, originalIndex: index });
    });
    return result;
  }, [messagesLimited, advancedMode]);

  useEffect(() => {
    perfStart('chat-render');
  }, [currentChatIndex]);
  useEffect(() => {
    perfEnd('chat-render');
  }, [items]);

  const handleScrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth' });
  }, []);

  const handleFollowOutput = useCallback((isAtBottom: boolean) => {
    if (!autoScroll) return false;
    return isAtBottom ? 'smooth' as const : false;
  }, [autoScroll]);

  const itemContent = useCallback((index: number) => {
    const { message, originalIndex } = items[index];
    return (
      <>
        <Message
          role={message.role}
          content={message.content}
          messageIndex={originalIndex}
        />
        {!isCurrentChatGenerating && advancedMode && (
          <NewMessageButton messageIndex={originalIndex} />
        )}
      </>
    );
  }, [items, isCurrentChatGenerating, advancedMode]);

  const Header = useMemo(() => {
    if (!isCurrentChatGenerating && advancedMode && messages?.length === 0) {
      return () => <NewMessageButton messageIndex={-1} />;
    }
    return undefined;
  }, [isCurrentChatGenerating, advancedMode, messages?.length]);

  const Footer = useCallback(() => (
    <div className='flex flex-col items-center text-sm dark:bg-gray-800'>
      <Message
        role={inputRole}
        content={[{ type: 'text', text: '' } as TextContentInterface]}
        messageIndex={stickyIndex}
        sticky
      />

      {isCurrentChatGenerating && (
        <div className='flex justify-center my-2'>
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
        </div>
      )}

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
        {isCurrentChatGenerating || (
          <div className='md:w-[calc(100%-50px)] flex gap-4 flex-wrap justify-center'>
            <DownloadChat visibleMessages={items} />
            {!hideShareGPT && <Suspense fallback={null}><ShareGPT /></Suspense>}
            <CloneChat />
          </div>
        )}
      </div>
      <div className='w-full h-36'></div>
    </div>
  ), [inputRole, stickyIndex, isCurrentChatGenerating, currentChatId, error, lastSubmitMode, handleRetry, hideSideMenu, hideShareGPT, t, setError, setLastSubmitContext]);

  const components = useMemo(() => ({
    ...(Header ? { Header } : {}),
    Footer,
  }), [Header, Footer]);

  return (
    <div className='flex-1 overflow-hidden'>
      <div className='h-full dark:bg-gray-800 relative'>
        <ScrollToBottomButton
          atBottom={atBottom}
          scrollToBottom={handleScrollToBottom}
        />
        <CollapseAllButtons />

        <Virtuoso
          ref={virtuosoRef}
          key={currentChatIndex}
          className='h-full'
          totalCount={items.length}
          overscan={600}
          followOutput={handleFollowOutput}
          atBottomStateChange={setAtBottom}
          atBottomThreshold={50}
          itemContent={itemContent}
          components={components}
        />
      </div>
    </div>
  );
};

export default ChatContent;
