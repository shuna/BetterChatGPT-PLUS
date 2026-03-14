import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import PopupModal from '@components/PopupModal';
import {
  chatToMarkdown,
  downloadImg,
  downloadMarkdown,
  htmlToImg,
} from '@utils/chat';
import ImageIcon from '@icon/ImageIcon';
import MarkdownIcon from '@icon/MarkdownIcon';
import JsonIcon from '@icon/JsonIcon';

import downloadFile from '@utils/downloadFile';
import { createRoot } from 'react-dom/client';
import Message from './Message';
import { MessageInterface } from '@type/chat';
import { ExportV3 } from '@type/export';
import { prepareChatForExport } from '@utils/chatExport';

const getVisibleMessages = (): Array<{ message: MessageInterface; originalIndex: number }> => {
  const state = useStore.getState();
  const chat = state.chats?.[state.currentChatIndex];
  if (!chat) return [];
  const result: Array<{ message: MessageInterface; originalIndex: number }> = [];
  chat.messages.forEach((message, index) => {
    if (!state.advancedMode && index === 0 && message.role === 'system') return;
    result.push({ message, originalIndex: index });
  });
  return result;
};

const renderAllMessagesForCapture = (
  visibleMessages: Array<{ message: MessageInterface; originalIndex: number }>
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (visibleMessages.length === 0) {
      reject(new Error('No messages to export'));
      return;
    }

    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '1023px';
    container.className = 'flex flex-col items-center text-sm dark:bg-gray-800';
    document.body.appendChild(container);

    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        {visibleMessages.map(({ message, originalIndex }) => (
          <Message
            key={originalIndex}
            role={message.role}
            content={message.content}
            messageIndex={originalIndex}
          />
        ))}
      </React.StrictMode>
    );

    // Wait for render to complete and images to load
    requestAnimationFrame(() => {
      setTimeout(async () => {
        try {
          const imgData = await htmlToImg(container);
          resolve(imgData);
        } catch (e) {
          reject(e);
        } finally {
          root.unmount();
          document.body.removeChild(container);
        }
      }, 500);
    });
  });
};

const DownloadChat = React.memo(
  ({ trigger }: { trigger?: (onClick: () => void) => React.ReactNode }) => {
    const { t } = useTranslation();
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [visibleBranchOnly, setVisibleBranchOnly] = useState<boolean>(false);

    const openModal = () => setIsModalOpen(true);

    return (
      <>
        {trigger ? (
          trigger(openModal)
        ) : (
          <button
            className='btn btn-neutral'
            aria-label={t('downloadChat') as string}
            onClick={openModal}
          >
            {t('downloadChat')}
          </button>
        )}
        {isModalOpen && (
          <PopupModal
            setIsModalOpen={setIsModalOpen}
            title={t('downloadChat') as string}
            cancelButton={false}
          >
            <div className='p-6 border-b border-gray-200 dark:border-gray-600 flex flex-col gap-4'>
              <label className='flex items-center gap-2 text-sm text-gray-900 dark:text-gray-300 cursor-pointer'>
                <input
                  type='checkbox'
                  checked={visibleBranchOnly}
                  onChange={(e) => setVisibleBranchOnly(e.target.checked)}
                  className='rounded'
                />
                {t('exportVisibleBranchOnly')}
              </label>
              <div className='flex gap-4'>
              <button
                className='btn btn-neutral gap-2'
                aria-label='image'
                onClick={async () => {
                  try {
                    const msgs = getVisibleMessages();
                    const imgData = await renderAllMessagesForCapture(msgs);
                    downloadImg(
                      imgData,
                      `${
                        useStore
                          .getState()
                          .chats?.[
                            useStore.getState().currentChatIndex
                          ].title.trim() ?? 'download'
                      }.png`
                    );
                  } catch (e) {
                    console.error('Image export failed:', e);
                  }
                }}
              >
                <ImageIcon />
                Image
              </button>
              <button
                className='btn btn-neutral gap-2'
                aria-label='markdown'
                onClick={async () => {
                  const chats = useStore.getState().chats;
                  if (chats) {
                    const exportChat = visibleBranchOnly
                      ? prepareChatForExport(
                          chats[useStore.getState().currentChatIndex],
                          useStore.getState().contentStore,
                          { visibleBranchOnly: true }
                        ).chat
                      : chats[useStore.getState().currentChatIndex];
                    const markdown = chatToMarkdown(
                      exportChat
                    );
                    downloadMarkdown(
                      markdown,
                      `${
                        chats[
                          useStore.getState().currentChatIndex
                        ].title.trim() ?? 'download'
                      }.md`
                    );
                  }
                }}
              >
                <MarkdownIcon />
                Markdown
              </button>
              <button
                className='btn btn-neutral gap-2'
                aria-label='json'
                onClick={async () => {
                  const chats = useStore.getState().chats;
                  if (chats) {
                    const prepared = prepareChatForExport(
                      chats[useStore.getState().currentChatIndex],
                      useStore.getState().contentStore,
                      { visibleBranchOnly }
                    );
                    const exportedChat = { ...prepared.chat };
                    delete exportedChat.folder;
                    const fileData = {
                      chats: [exportedChat],
                      contentStore: prepared.contentStore,
                      folders: {},
                      version: 3,
                    } satisfies ExportV3;
                    downloadFile(fileData, exportedChat.title);
                  }
                }}
              >
                <JsonIcon />
                JSON
              </button>
              </div>
            </div>
          </PopupModal>
        )}
      </>
    );
  }
);

export default DownloadChat;
