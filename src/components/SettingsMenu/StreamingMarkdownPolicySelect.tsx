import React from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import type { StreamingMarkdownPolicy } from '@type/chat';

const StreamingMarkdownPolicySelect = () => {
  const { t } = useTranslation();
  const value = useStore((state) => state.streamingMarkdownPolicy);
  const setStreamingMarkdownPolicy = useStore((state) => state.setStreamingMarkdownPolicy);

  return (
    <label className='flex flex-col gap-1 text-sm text-gray-900 dark:text-gray-300'>
      <span className='font-medium'>
        {t('streamingMarkdownPolicy', 'Streaming markdown rendering')}
      </span>
      <select
        className='min-w-[14rem] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800'
        value={value}
        onChange={(e) => {
          setStreamingMarkdownPolicy(e.target.value as StreamingMarkdownPolicy);
        }}
      >
        <option value='auto'>{t('streamingMarkdownPolicy.auto', 'Auto')}</option>
        <option value='always'>{t('streamingMarkdownPolicy.always', 'Always on')}</option>
        <option value='never'>{t('streamingMarkdownPolicy.never', 'Power saver')}</option>
      </select>
    </label>
  );
};

export default StreamingMarkdownPolicySelect;
