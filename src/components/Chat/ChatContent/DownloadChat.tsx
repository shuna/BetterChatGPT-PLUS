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
  ({ visibleMessages }: { visibleMessages: Array<{ message: MessageInterface; originalIndex: number }> }) => {
    const { t } = useTranslation();
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    return (
      <>
        <button
          className='btn btn-neutral'
          aria-label={t('downloadChat') as string}
          onClick={() => {
            setIsModalOpen(true);
          }}
        >
          {t('downloadChat')}
        </button>
        {isModalOpen && (
          <PopupModal
            setIsModalOpen={setIsModalOpen}
            title={t('downloadChat') as string}
            cancelButton={false}
          >
            <div className='p-6 border-b border-gray-200 dark:border-gray-600 flex gap-4'>
              <button
                className='btn btn-neutral gap-2'
                aria-label='image'
                onClick={async () => {
                  try {
                    const imgData = await renderAllMessagesForCapture(visibleMessages);
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
              {/* <button
                className='btn btn-neutral gap-2'
                onClick={async () => {
                  // PDF export placeholder
                }}
              >
                <PdfIcon />
                PDF
              </button> */}
              <button
                className='btn btn-neutral gap-2'
                aria-label='markdown'
                onClick={async () => {
                  const chats = useStore.getState().chats;
                  if (chats) {
                    const markdown = chatToMarkdown(
                      chats[useStore.getState().currentChatIndex]
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
                    const chat = chats[useStore.getState().currentChatIndex];
                    downloadFile([chat], chat.title);
                  }
                }}
              >
                <JsonIcon />
                JSON
              </button>
            </div>
          </PopupModal>
        )}
      </>
    );
  }
);

export default DownloadChat;
