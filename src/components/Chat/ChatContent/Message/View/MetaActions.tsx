import React from 'react';
import useStore from '@store/store';
import OmitIcon from '@icon/OmitIcon';
import ProtectedIcon from '@icon/ProtectedIcon';
import { useTranslation } from 'react-i18next';

type MetaActionsProps = {
  messageIndex: number;
  isOmitted: boolean;
  isProtected: boolean;
};

export default function MetaActions({
  messageIndex,
  isOmitted,
  isProtected,
}: MetaActionsProps) {
  const { t } = useTranslation();
  const currentChatIndex = useStore((state) => state.currentChatIndex);
  const toggleOmitNode = useStore((state) => state.toggleOmitNode);
  const toggleProtectNode = useStore((state) => state.toggleProtectNode);

  return (
    <div className='pointer-events-none absolute right-2 top-2 z-20 translate-y-[-2px] opacity-0 transition duration-150 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 md:right-3 md:top-2.5'>
      <div className='flex items-center gap-1 rounded-full border border-gray-300 bg-gray-200/80 px-1.5 py-1 shadow-sm backdrop-blur-2xl supports-[backdrop-filter]:bg-gray-200/45 dark:border-white/10 dark:bg-white/8 dark:supports-[backdrop-filter]:bg-white/5'>
        <button
          className={`rounded-md p-1 transition-colors ${
            isOmitted
              ? 'text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            toggleOmitNode(currentChatIndex, messageIndex);
          }}
          aria-label={String(isOmitted ? t('omitOff', 'Include in request') : t('omitOn', 'Omit from request'))}
          title={String(isOmitted ? t('omitOff', 'Include in request') : t('omitOn', 'Omit from request'))}
        >
          <OmitIcon />
        </button>
        <button
          className={`rounded-md p-1 transition-colors ${
            isProtected
              ? 'text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            toggleProtectNode(currentChatIndex, messageIndex);
          }}
          aria-label={String(isProtected ? t('protectOff', 'Unprotect') : t('protectOn', 'Protect'))}
          title={String(isProtected ? t('protectOff', 'Unprotect') : t('protectOn', 'Protect'))}
        >
          <ProtectedIcon />
        </button>
      </div>
    </div>
  );
}
