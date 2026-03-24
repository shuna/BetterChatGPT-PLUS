import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import OmitIcon from '@icon/OmitIcon';
import ProtectedIcon from '@icon/ProtectedIcon';

const MetaActions = memo(
  ({
    messageIndex,
    isOmitted,
    isProtected,
  }: {
    messageIndex: number;
    isOmitted: boolean;
    isProtected: boolean;
  }) => {
    const { t } = useTranslation();
    const currentChatIndex = useStore((state) => state.currentChatIndex);
    const toggleOmitNode = useStore((state) => state.toggleOmitNode);
    const toggleProtectNode = useStore((state) => state.toggleProtectNode);

    return (
      <div className='pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100'>
        <div className='flex items-center gap-0.5 rounded-full bg-white/80 px-1.5 py-0.5 shadow-sm ring-1 ring-black/5 backdrop-blur-sm dark:bg-gray-800/80 dark:ring-white/10'>
          <button
            type='button'
            className={`rounded-full p-1 transition-colors ${
              isOmitted
                ? 'text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300'
                : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              toggleOmitNode(currentChatIndex, messageIndex);
            }}
            title={String(isOmitted ? t('omitOff') : t('omitOn'))}
            aria-label={String(isOmitted ? t('omitOff') : t('omitOn'))}
          >
            <OmitIcon className='h-3.5 w-3.5' />
          </button>
          <button
            type='button'
            className={`rounded-full p-1 transition-colors ${
              isProtected
                ? 'text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300'
                : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              toggleProtectNode(currentChatIndex, messageIndex);
            }}
            title={String(isProtected ? t('protectOff') : t('protectOn'))}
            aria-label={String(isProtected ? t('protectOff') : t('protectOn'))}
          >
            <ProtectedIcon className='h-3.5 w-3.5' />
          </button>
        </div>
      </div>
    );
  }
);

export default MetaActions;
