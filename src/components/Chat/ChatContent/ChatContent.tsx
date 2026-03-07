import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import ScrollToBottom from 'react-scroll-to-bottom';
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
import { TextContentInterface } from '@type/chat';
import countTokens, { limitMessageTokens } from '@utils/messageUtils';
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
  const messagesLimited = useMemo(
    () => limitMessageTokens(messages, reduceMessagesToTotalToken, model),
    [messages, model]
  );

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
    if (!isCurrentChatGenerating) {
      if (messagesLimited.length < messages.length) {
        const hiddenTokens =
          countTokens(messages, model) - countTokens(messagesLimited, model);
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
      }
    }
  }, [messagesLimited, isCurrentChatGenerating, messages, model]);

  const saveRef = useRef<HTMLDivElement>(null);

  // clear error at the start of generating new messages
  useEffect(() => {
    if (isCurrentChatGenerating) {
      setError('');
    }
  }, [isCurrentChatGenerating]);

  const { error, handleRetry } = useSubmit();
  const lastSubmitMode = useStore((state) => state.lastSubmitMode);
  const setLastSubmitContext = useStore((state) => state.setLastSubmitContext);

  const customScroller = ({ maxValue }: { maxValue: number; minValue: number; offsetHeight: number; scrollHeight: number; scrollTop: number }) => {
    return autoScroll ? maxValue : 0;
  };

  return (
    <div className='flex-1 overflow-hidden'>
      <ScrollToBottom
        className='h-full dark:bg-gray-800'
        followButtonClassName='hidden'
        scroller={customScroller}
      >
        <ScrollToBottomButton />
        <CollapseAllButtons />
        <div className='flex flex-col items-center text-sm dark:bg-gray-800'>
          <div
            className='flex flex-col items-center text-sm dark:bg-gray-800 w-full'
            ref={saveRef}
          >
            {!isCurrentChatGenerating && advancedMode && messages?.length === 0 && (
              <NewMessageButton messageIndex={-1} />
            )}
            {messagesLimited?.map(
              (message, index) =>
                (advancedMode || index !== 0 || message.role !== 'system') && (
                  <React.Fragment key={index}>
                    <Message
                      role={message.role}
                      content={message.content}
                      messageIndex={index}
                    />
                    {!isCurrentChatGenerating && advancedMode && (
                      <NewMessageButton messageIndex={index} />
                    )}
                  </React.Fragment>
                )
            )}
          </div>

          <Message
            role={inputRole}
            content={[{ type: 'text', text: '' } as TextContentInterface]}
            messageIndex={stickyIndex}
            sticky
          />

          {/* Inline stop button for current chat */}
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
                <DownloadChat saveRef={saveRef} />
                {!hideShareGPT && <Suspense fallback={null}><ShareGPT /></Suspense>}
                <CloneChat />
              </div>
            )}
          </div>
          <div className='w-full h-36'></div>
        </div>
      </ScrollToBottom>
    </div>
  );
};

export default ChatContent;
