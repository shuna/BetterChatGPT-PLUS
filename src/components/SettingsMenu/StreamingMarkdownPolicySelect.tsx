import React from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import type { StreamingMarkdownPolicy } from '@type/chat';

const StreamingMarkdownPolicySelect = () => {
  const { t } = useTranslation();
  const value = useStore((state) => state.streamingMarkdownPolicy);
  const setStreamingMarkdownPolicy = useStore((state) => state.setStreamingMarkdownPolicy);

  return (
    <div className='flex items-center justify-between gap-4 px-4 py-3'>
      <span className='text-sm font-medium text-gray-900 dark:text-gray-300'>
        {t('streamingMarkdownPolicy')}
      </span>
      <select
        className='flex-shrink-0 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
        value={value}
        onChange={(e) => {
          setStreamingMarkdownPolicy(e.target.value as StreamingMarkdownPolicy);
        }}
      >
        <option value='auto'>{t('streamingMarkdownPolicy.auto')}</option>
        <option value='always'>{t('streamingMarkdownPolicy.always')}</option>
        <option value='never'>{t('streamingMarkdownPolicy.never')}</option>
      </select>
    </div>
  );
};

export default StreamingMarkdownPolicySelect;
