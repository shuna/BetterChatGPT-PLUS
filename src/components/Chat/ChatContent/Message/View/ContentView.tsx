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
  deleteActivePathMessage,
  materializeActivePath,
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

    const handleDelete = () => {
      const updatedChats: ChatInterface[] = JSON.parse(
        JSON.stringify(useStore.getState().chats)
      );
      const contentStore = useStore.getState().contentStore;
      updatedChats[currentChatIndex].messages.splice(messageIndex, 1);
      if (updatedChats[currentChatIndex].branchTree) {
        deleteActivePathMessage(updatedChats[currentChatIndex], messageIndex, contentStore);
        updatedChats[currentChatIndex].messages = materializeActivePath(
          updatedChats[currentChatIndex].branchTree!,
          contentStore
        );
      }
      setChats(updatedChats);
    };

    const handleMove = (direction: 'up' | 'down') => {
      const updatedChats: ChatInterface[] = JSON.parse(
        JSON.stringify(useStore.getState().chats)
      );
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
      if (useStore.getState().generating) return;

      const updatedChats: ChatInterface[] = JSON.parse(
        JSON.stringify(useStore.getState().chats)
      );
      const updatedMessages = updatedChats[currentChatIndex].messages;
      const contentStore = useStore.getState().contentStore;

      const removeAt = (idx: number) => {
        updatedMessages.splice(idx, 1);
        if (updatedChats[currentChatIndex].branchTree) {
          deleteActivePathMessage(updatedChats[currentChatIndex], idx, contentStore);
          updatedChats[currentChatIndex].messages = materializeActivePath(
            updatedChats[currentChatIndex].branchTree!,
            contentStore
          );
        }
      };

      if (role === 'assistant') {
        // assistantバブル: 自身を削除して再生成
        removeAt(messageIndex);
        setChats(updatedChats);
        if (messageIndex >= updatedChats[currentChatIndex].messages.length) {
          handleSubmit();
        } else {
          handleSubmitMidChat(messageIndex);
        }
      } else {
        // userバブル: 直下のメッセージ(assistant)を1つ削除して再生成
        const nextIndex = messageIndex + 1;
        if (nextIndex < updatedMessages.length) {
          removeAt(nextIndex);
        }
        setChats(updatedChats);
        if (nextIndex >= updatedChats[currentChatIndex].messages.length) {
          handleSubmit();
        } else {
          handleSubmitMidChat(nextIndex);
        }
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
          ) : (
            <span className='whitespace-pre-wrap'>{currentTextContent}</span>
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
                {!useStore.getState().generating && role === 'assistant' && (
                  <RefreshButton onClick={handleRefresh} />
                )}
                {!useStore.getState().generating && role === 'user' && (
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
