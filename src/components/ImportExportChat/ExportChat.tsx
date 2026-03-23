import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import useStore from '@store/store';

import downloadFile, { downloadFileGzip } from '@utils/downloadFile';
import { getToday } from '@utils/date';
import { resolveContent, buildExportContentStore } from '@utils/contentStore';

import { ChatInterface } from '@type/chat';
import { ExportV1, ExportV3 } from '@type/export';
import { chatToOpenAIFormat, chatToOpenRouterFormat } from '@utils/chatExport';

type ExportFormat = 'v3' | 'v1' | 'openai' | 'openrouter';

const ExportChat = () => {
  const { t } = useTranslation();
  const [format, setFormat] = useState<ExportFormat>('v3');
  const [useGzip, setUseGzip] = useState(true);

  const handleExport = async () => {
    const chats = useStore.getState().chats;
    const folders = useStore.getState().folders;
    const contentStore = useStore.getState().contentStore;

    const filename = getToday();
    let fileData: object;

    if (format === 'openai') {
      fileData = chats?.map((chat) => chatToOpenAIFormat(chat, contentStore)) ?? [];
    } else if (format === 'openrouter') {
      fileData = chats?.map((chat) => chatToOpenRouterFormat(chat, contentStore)) ?? [];
    } else if (format === 'v1') {
      // Legacy: expand contentHash back to inline content, strip branchTree
      const v1Chats = chats?.map((chat) => {
        const expanded = { ...chat };
        if (expanded.branchTree) {
          expanded.messages = expanded.branchTree.activePath.map((id) => {
            const node = expanded.branchTree!.nodes[id];
            return {
              role: node.role,
              content: resolveContent(contentStore, node.contentHash),
            };
          });
        }
        const { branchTree, collapsedNodes, ...rest } = expanded;
        return rest as ChatInterface;
      });
      fileData = { chats: v1Chats, folders, version: 1 } satisfies ExportV1;
    } else {
      // V3 Compact: contentStore + chats with contentHash references
      fileData = { chats, contentStore: buildExportContentStore(contentStore), folders, version: 3 } satisfies ExportV3;
    }

    if (useGzip) {
      await downloadFileGzip(fileData, filename);
    } else {
      downloadFile(fileData, filename);
    }
  };

  return (
    <div>
      <div className='block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300'>
        {t('export')} (JSON)
      </div>
      <div className='flex flex-col gap-2 text-xs text-gray-500 dark:text-gray-400'>
        <label className='flex items-center gap-1.5 cursor-pointer'>
          <input
            type='radio'
            name='exportFormat'
            checked={format === 'v3'}
            onChange={() => setFormat('v3')}
            className='rounded'
          />
          {t('exportFormatCompact')}
        </label>
        <label className='flex items-center gap-1.5 cursor-pointer'>
          <input
            type='radio'
            name='exportFormat'
            checked={format === 'v1'}
            onChange={() => setFormat('v1')}
            className='rounded'
          />
          {t('exportFormatLegacy')}
        </label>
        <label className='flex items-center gap-1.5 cursor-pointer'>
          <input
            type='radio'
            name='exportFormat'
            checked={format === 'openai'}
            onChange={() => setFormat('openai')}
            className='rounded'
          />
          {t('exportFormatOpenAI')}
        </label>
        <label className='flex items-center gap-1.5 cursor-pointer'>
          <input
            type='radio'
            name='exportFormat'
            checked={format === 'openrouter'}
            onChange={() => setFormat('openrouter')}
            className='rounded'
          />
          {t('exportFormatOpenRouter')}
        </label>
      </div>
      <div className='flex items-center justify-between mt-3'>
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
          onClick={handleExport}
          aria-label={t('export') as string}
        >
          {t('export')}
        </button>
      </div>
    </div>
  );
};
export default ExportChat;
