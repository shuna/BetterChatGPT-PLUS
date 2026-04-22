import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import DownChevronArrow from '@icon/DownChevronArrow';

interface Props {
  nodeId: string;
}

const AssistantPrefillSeed = ({ nodeId }: Props) => {
  const { t } = useTranslation();
  const config = useStore(
    (state) => state.chats?.[state.currentChatIndex]?.config
  );
  const draft = useStore((state) => (state.assistantPrefillMap ?? {})[nodeId] ?? '');
  const setDraft = useStore((state) => state.setAssistantPrefill);
  const [open, setOpen] = React.useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && textareaRef.current) textareaRef.current.focus();
  }, [open]);

  if (config?.modelSource !== 'local') return null;

  const hasContent = draft.trim().length > 0;

  return (
    <div className='mt-2'>
      <button
        type='button'
        onClick={() => setOpen((v) => !v)}
        className='flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors py-0.5 select-none'
        aria-expanded={open}
      >
        <DownChevronArrow
          className={`w-3 h-3 transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
        />
        <span>{t('assistantPrefill.label')}</span>
        {hasContent && !open && (
          <span className='ml-1 px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full leading-none'>
            {t('assistantPrefill.badge')}
          </span>
        )}
      </button>

      {open && (
        <div className='mt-1'>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(nodeId, e.target.value)}
            rows={2}
            placeholder={t('assistantPrefill.placeholder') as string}
            className={[
              'w-full resize-y text-sm rounded-md border px-3 py-1.5 font-mono',
              'bg-gray-50 dark:bg-gray-700/60',
              'border-gray-200 dark:border-gray-600',
              'text-gray-800 dark:text-gray-100',
              'placeholder:text-gray-400 dark:placeholder:text-gray-500',
              'focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500',
            ].join(' ')}
          />
          <p className='mt-0.5 text-[11px] text-gray-400 dark:text-gray-500'>
            {t('assistantPrefill.hint')}
          </p>
          {hasContent && (
            <span className='inline-flex items-center mt-0.5 px-2 py-0.5 text-[11px] font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full'>
              {t('assistantPrefill.badge')}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default AssistantPrefillSeed;
