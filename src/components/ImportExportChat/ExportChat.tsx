import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import useStore from '@store/store';

import downloadFile from '@utils/downloadFile';
import { getToday } from '@utils/date';
import { resolveContent } from '@utils/contentStore';

import { ChatInterface } from '@type/chat';
import { ExportV1, ExportV3 } from '@type/export';

type ExportFormat = 'v3' | 'v1';

const ExportChat = () => {
  const { t } = useTranslation();
  const [format, setFormat] = useState<ExportFormat>('v3');
  const [useGzip, setUseGzip] = useState(false);

  const handleExport = async () => {
    const chats = useStore.getState().chats;
    const folders = useStore.getState().folders;
    const contentStore = useStore.getState().contentStore;

    let fileData: any;
    const filename = getToday();

    if (format === 'v1') {
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
        const { branchTree, ...rest } = expanded;
        return rest as ChatInterface;
      });
      fileData = { chats: v1Chats, folders, version: 1 } satisfies ExportV1;
    } else {
      // V3 Compact: contentStore + chats with contentHash references
      fileData = { chats, contentStore, folders, version: 3 } satisfies ExportV3;
    }

    if (useGzip && typeof CompressionStream !== 'undefined') {
      const jsonStr = JSON.stringify(fileData);
      const blob = new Blob([jsonStr]);
      const cs = new CompressionStream('gzip');
      const compressedStream = blob.stream().pipeThrough(cs);
      const compressedBlob = await new Response(compressedStream).blob();
      const url = URL.createObjectURL(compressedBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.json.gz`;
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } else {
      downloadFile(fileData, filename);
    }
  };

  return (
    <div className='mt-6'>
      <div className='block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300'>
        {t('export')} (JSON)
      </div>
      <div className='flex flex-col gap-2'>
        <div className='flex items-center gap-3'>
          <button
            className='btn btn-small btn-primary'
            onClick={handleExport}
            aria-label={t('export') as string}
          >
            {t('export')}
          </button>
        </div>
        <div className='flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400'>
          <label className='flex items-center gap-1.5 cursor-pointer'>
            <input
              type='radio'
              name='exportFormat'
              checked={format === 'v3'}
              onChange={() => setFormat('v3')}
              className='rounded'
            />
            Compact (v3)
          </label>
          <label className='flex items-center gap-1.5 cursor-pointer'>
            <input
              type='radio'
              name='exportFormat'
              checked={format === 'v1'}
              onChange={() => setFormat('v1')}
              className='rounded'
            />
            Legacy {t('compatible', 'compatible')} (v1)
          </label>
          <label className='flex items-center gap-1.5 cursor-pointer'>
            <input
              type='checkbox'
              checked={useGzip}
              onChange={(e) => setUseGzip(e.target.checked)}
              className='rounded'
            />
            .gz {t('compression', 'compression')}
          </label>
        </div>
      </div>
    </div>
  );
};
export default ExportChat;
