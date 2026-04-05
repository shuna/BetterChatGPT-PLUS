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

import downloadFile, { downloadFileGzip } from '@utils/downloadFile';
import { createRoot } from 'react-dom/client';
import Message from './Message';
import { MessageInterface } from '@type/chat';
import { ExportV3 } from '@type/export';
import { prepareChatForExport, chatToOpenAIFormat, chatToOpenRouterFormat, chatToLMStudioFormat } from '@utils/chatExport';

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

type DownloadFormat = 'image' | 'markdown' | 'json' | 'chatgpt' | 'openrouter' | 'lmstudio';

const DownloadChat = React.memo(
  ({ trigger }: { trigger?: (onClick: () => void) => React.ReactNode }) => {
    const { t } = useTranslation();
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [visibleBranchOnly, setVisibleBranchOnly] = useState<boolean>(false);
    const [useGzip, setUseGzip] = useState(true);
    const [downloadFormat, setDownloadFormat] = useState<DownloadFormat>('json');

    const openModal = () => setIsModalOpen(true);

    const handleDownload = async () => {
      const chats = useStore.getState().chats;
      const currentChatIndex = useStore.getState().currentChatIndex;
      if (!chats) return;
      const chat = chats[currentChatIndex];
      const contentStore = useStore.getState().contentStore;
      const evaluationSettings = useStore.getState().evaluationSettings;
      const evaluationResults = useStore.getState().evaluationResults;
      const filename = chat.title.trim() || 'download';

      switch (downloadFormat) {
        case 'image': {
          try {
            const msgs = getVisibleMessages();
            const imgData = await renderAllMessagesForCapture(msgs);
            downloadImg(imgData, `${filename}.png`);
          } catch (e) {
            console.error('Image export failed:', e);
          }
          break;
        }
        case 'markdown': {
          const exportChat = visibleBranchOnly
            ? prepareChatForExport(chat, contentStore, { visibleBranchOnly: true }).chat
            : chat;
          const markdown = chatToMarkdown(exportChat);
          downloadMarkdown(markdown, `${filename}.md`);
          break;
        }
        case 'json': {
          const prepared = prepareChatForExport(chat, contentStore, { visibleBranchOnly });
          const exportedChat = { ...prepared.chat };
          delete exportedChat.folder;
          const exportedEvaluationResults = Object.fromEntries(
            Object.entries(evaluationResults).filter(([key]) =>
              key.startsWith(`${exportedChat.id}:`)
            )
          );
          const fileData = {
            chats: [exportedChat],
            contentStore: prepared.contentStore,
            folders: {},
            evaluationSettings,
            evaluationResults: exportedEvaluationResults,
            version: 3,
          } satisfies ExportV3;
          if (useGzip) {
            await downloadFileGzip(fileData, exportedChat.title);
          } else {
            downloadFile(fileData, exportedChat.title);
          }
          break;
        }
        case 'chatgpt': {
          const openaiData = chatToOpenAIFormat(chat, contentStore, { visibleBranchOnly });
          downloadFile([openaiData], filename);
          break;
        }
        case 'openrouter': {
          const orData = chatToOpenRouterFormat(chat, contentStore);
          downloadFile(orData, filename);
          break;
        }
        case 'lmstudio': {
          const lmsData = chatToLMStudioFormat(chat, contentStore, { visibleBranchOnly });
          downloadFile(lmsData, filename);
          break;
        }
      }
    };

    const formatOptions: { value: DownloadFormat; label: string }[] = [
      { value: 'image', label: 'Image (.png)' },
      { value: 'markdown', label: 'Markdown (.md)' },
      { value: 'json', label: 'JSON (v3)' },
      { value: 'chatgpt', label: t('exportFormatOpenAI') as string },
      { value: 'openrouter', label: t('exportFormatOpenRouter') as string },
      { value: 'lmstudio', label: t('exportFormatLMStudio') as string },
    ];

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
            <div className='p-6 border-b border-gray-200 dark:border-gray-600 flex flex-col gap-3'>
              <div className='flex flex-col gap-2 text-xs text-gray-500 dark:text-gray-400'>
                {formatOptions.map((opt) => (
                  <label key={opt.value} className='flex items-center gap-1.5 cursor-pointer'>
                    <input
                      type='radio'
                      name='downloadFormat'
                      checked={downloadFormat === opt.value}
                      onChange={() => setDownloadFormat(opt.value)}
                      className='rounded'
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              <label className='flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer'>
                <input
                  type='checkbox'
                  checked={visibleBranchOnly}
                  onChange={(e) => setVisibleBranchOnly(e.target.checked)}
                  className='rounded'
                />
                {t('exportVisibleBranchOnly')}
              </label>
              <div className='flex items-center justify-between mt-1'>
                <label className='flex items-center gap-1.5 cursor-pointer text-xs text-gray-500 dark:text-gray-400'>
                  <input
                    type='checkbox'
                    checked={useGzip}
                    onChange={(e) => setUseGzip(e.target.checked)}
                    className='rounded'
                  />
                  {t('gzCompression')}
                </label>
                <button
                  className='btn btn-small btn-primary w-32 justify-center'
                  onClick={handleDownload}
                  aria-label={t('downloadChat') as string}
                >
                  {t('downloadChat')}
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
