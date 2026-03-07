import React, {
  Suspense,
  memo,
  useState,
} from 'react';

import useStore from '@store/store';

import TickIcon from '@icon/TickIcon';
import CrossIcon from '@icon/CrossIcon';

import useSubmit from '@hooks/useSubmit';

import {
  ChatInterface,
  ContentInterface,
  ImageContentInterface,
  Role,
  isImageContent,
  isTextContent,
} from '@type/chat';

import RefreshButton from './Button/RefreshButton';
import RegenerateNextButton from './Button/RegenerateNextButton';
import UpButton from './Button/UpButton';
import DownButton from './Button/DownButton';
import CopyButton from './Button/CopyButton';
import EditButton from './Button/EditButton';
import DeleteButton from './Button/DeleteButton';
import MarkdownModeButton from './Button/MarkdownModeButton';
import ShowInEditorButton from './Button/ShowInEditorButton';
import BranchSwitcher from '../BranchSwitcher';

import PopupModal from '@components/PopupModal';
import {
  removeMessageWithBranchSync,
  resolveRegenerateTarget,
} from '@utils/branchUtils';

const MarkdownRenderer = React.lazy(() => import('./MarkdownRenderer'));

const ContentView = memo(
  ({
    role,
    content,
    setIsEdit,
    messageIndex,
  }: {
    role: string;
    content: ContentInterface[];
    setIsEdit: React.Dispatch<React.SetStateAction<boolean>>;
    messageIndex: number;
  }) => {
    const { handleSubmit, handleSubmitMidChat } = useSubmit();

    const [isDelete, setIsDelete] = useState<boolean>(false);
    const [zoomedImage, setZoomedImage] = useState<string | null>(null);

    const currentChatIndex = useStore((state) => state.currentChatIndex);
    const setChats = useStore((state) => state.setChats);
    const nodeId = useStore(
      (state) =>
        state.chats?.[state.currentChatIndex]?.branchTree?.activePath?.[
          messageIndex
        ]
    );
    const lastMessageIndex = useStore((state) =>
      state.chats ? state.chats[state.currentChatIndex].messages.length - 1 : 0
    );
    const inlineLatex = useStore((state) => state.inlineLatex);
    const markdownMode = useStore((state) => state.markdownMode);
    const currentChatId = useStore((state) =>
      state.chats?.[state.currentChatIndex]?.id ?? ''
    );
    const isGeneratingMessage = useStore((state) =>
      role === 'assistant' &&
      Object.values(state.generatingSessions).some(
        (s) => s.chatId === currentChatId && s.messageIndex === messageIndex
      )
    );
    const isCurrentChatGenerating = useStore((state) =>
      Object.values(state.generatingSessions).some((s) => s.chatId === currentChatId)
    );

    const handleDelete = () => {
      const chats = useStore.getState().chats!;
      const contentStore = useStore.getState().contentStore;
      const updatedChats = chats.slice();
      updatedChats[currentChatIndex] = structuredClone(chats[currentChatIndex]);
      removeMessageWithBranchSync(updatedChats[currentChatIndex], messageIndex, contentStore);
      setChats(updatedChats);
    };

    const handleMove = (direction: 'up' | 'down') => {
      const chats = useStore.getState().chats!;
      const updatedChats = chats.slice();
      updatedChats[currentChatIndex] = structuredClone(chats[currentChatIndex]);
      const updatedMessages = updatedChats[currentChatIndex].messages;
      const temp = updatedMessages[messageIndex];
      if (direction === 'up') {
        updatedMessages[messageIndex] = updatedMessages[messageIndex - 1];
        updatedMessages[messageIndex - 1] = temp;
      } else {
        updatedMessages[messageIndex] = updatedMessages[messageIndex + 1];
        updatedMessages[messageIndex + 1] = temp;
      }
      setChats(updatedChats);
    };

    const handleMoveUp = () => {
      handleMove('up');
    };

    const handleMoveDown = () => {
      handleMove('down');
    };

    const handleRefresh = () => {
      if (isCurrentChatGenerating) return;

      const plan = resolveRegenerateTarget(
        role as Role,
        messageIndex,
        useStore.getState().chats![currentChatIndex].messages.length
      );
      if (!plan) return;

      const chats = useStore.getState().chats!;
      const contentStore = useStore.getState().contentStore;
      const updatedChats = chats.slice();
      updatedChats[currentChatIndex] = structuredClone(chats[currentChatIndex]);

      if (plan.removeIndex >= 0) {
        removeMessageWithBranchSync(updatedChats[currentChatIndex], plan.removeIndex, contentStore);
      }
      setChats(updatedChats);

      if (plan.submitMode === 'append') {
        handleSubmit();
      } else {
        handleSubmitMidChat(plan.insertIndex);
      }
    };

    const currentTextContent = isTextContent(content[0]) ? content[0].text : '';
    const handleCopy = () => {
      navigator.clipboard.writeText(currentTextContent);
    };

    const handleImageClick = (imageUrl: string) => {
      setZoomedImage(imageUrl);
    };

    const handleCloseZoom = () => {
      setZoomedImage(null);
    };
    const validImageContents = Array.isArray(content)
    ? (content.slice(1).filter(isImageContent) as ImageContentInterface[])
    : [];
    return (
      <>
        <div className='markdown prose w-full md:max-w-full break-words dark:prose-invert dark share-gpt-message'>
          {markdownMode ? (
            <>
              <Suspense
                fallback={
                  <span className='whitespace-pre-wrap'>
                    {currentTextContent}
                  </span>
                }
              >
                <MarkdownRenderer
                  content={currentTextContent}
                  inlineLatex={inlineLatex}
                />
              </Suspense>
              {isGeneratingMessage && (
                <span className='inline-block animate-pulse text-gray-500 dark:text-gray-400'>▌</span>
              )}
            </>
          ) : (
            <span className='whitespace-pre-wrap'>
              {currentTextContent}
              {isGeneratingMessage && <span className='animate-pulse'>▌</span>}
            </span>
          )}
        </div>
        {validImageContents.length > 0 && (
          <div className='flex gap-4'>
            {validImageContents.map((image, index) => (
              <div key={index} className='image-container'>
                <img
                  src={image.image_url.url}
                  alt={`uploaded-${index}`}
                  className='h-20 cursor-pointer'
                  onClick={() => handleImageClick(image.image_url.url)}
                />
              </div>
            ))}
          </div>
        )}
        {zoomedImage && (
          <PopupModal
            title=''
            setIsModalOpen={handleCloseZoom}
            handleConfirm={handleCloseZoom}
            cancelButton={false}
          >
            <div className='flex justify-center'>
              <img
                src={zoomedImage}
                alt='Zoomed'
                className='max-w-full max-h-full'
              />
            </div>
          </PopupModal>
        )}
        <div className='mt-2 flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2'>
          <div className='min-w-0'>
            {nodeId && (
              <BranchSwitcher
                chatIndex={currentChatIndex}
                nodeId={nodeId}
              />
            )}
          </div>
          <div className='ml-auto flex flex-wrap items-center justify-end gap-2'>
            {isDelete || (
              <>
                {!isCurrentChatGenerating && role === 'assistant' && (
                  <RefreshButton onClick={handleRefresh} />
                )}
                {!isCurrentChatGenerating && role === 'user' && (
                  <RegenerateNextButton onClick={handleRefresh} />
                )}
                {messageIndex !== 0 && <UpButton onClick={handleMoveUp} />}
                {messageIndex !== lastMessageIndex && (
                  <DownButton onClick={handleMoveDown} />
                )}

                <MarkdownModeButton />
                <CopyButton onClick={handleCopy} />
                <EditButton setIsEdit={setIsEdit} />
                <ShowInEditorButton messageIndex={messageIndex} />
                <DeleteButton setIsDelete={setIsDelete} />
              </>
            )}
            {isDelete && (
              <>
                <button
                  className='p-1 hover:text-white'
                  aria-label='cancel'
                  onClick={() => setIsDelete(false)}
                >
                  <CrossIcon />
                </button>
                <button
                  className='p-1 hover:text-white'
                  aria-label='confirm'
                  onClick={handleDelete}
                >
                  <TickIcon />
                </button>
              </>
            )}
          </div>
        </div>
      </>
    );
  }
);

export default ContentView;
