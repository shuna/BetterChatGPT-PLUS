import React from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import { useDebugStore, DebugStatus } from '@store/debug-store';

const Spinner = () => (
  <svg
    className='w-3 h-3 flex-shrink-0 text-green-500 animate-spin'
    viewBox='0 0 16 16'
    fill='none'
  >
    <circle cx='8' cy='8' r='6' stroke='currentColor' strokeWidth='2' opacity='0.3' />
    <path d='M14 8a6 6 0 0 0-6-6' stroke='currentColor' strokeWidth='2' strokeLinecap='round' />
  </svg>
);

const StatusIndicator = ({ status }: { status: DebugStatus }) => {
  switch (status) {
    case 'active':
      return <Spinner />;
    case 'done':
      return (
        <span className='inline-block w-3 h-3 flex-shrink-0 text-blue-400 leading-none text-[10px]'>
          ✓
        </span>
      );
    case 'error':
      return (
        <span className='inline-block w-3 h-3 flex-shrink-0 text-red-500 leading-none text-[10px] font-bold'>
          !
        </span>
      );
    default:
      return (
        <span className='inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 bg-gray-400' />
      );
  }
};

const DebugPanel = () => {
  const { t } = useTranslation();
  const showDebugPanel = useStore((state) => state.showDebugPanel);
  const entries = useDebugStore((state) => state.entries);

  if (!showDebugPanel) return null;

  const sorted = Object.values(entries).sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return 1;
    return b.updatedAt - a.updatedAt;
  });

  return (
    <div className='flex-shrink-0 min-w-0 overflow-hidden border-t border-gray-300 dark:border-gray-600 px-2 py-1.5'>
      <div className='text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1'>
        {t('debugPanel')}
      </div>
      <div className='max-h-32 overflow-y-auto space-y-0.5'>
        {sorted.length === 0 ? (
          <div className='text-[11px] text-gray-400 dark:text-gray-500 italic'>
            {t('debugPanel.noActivity')}
          </div>
        ) : (
          sorted.map((entry) => (
            <div
              key={entry.id}
              className='flex items-center gap-1.5 min-w-0 text-[11px] text-gray-700 dark:text-gray-300 leading-tight'
            >
              <StatusIndicator status={entry.status} />
              <span className='truncate min-w-0'>
                <span className='font-medium'>{entry.label}</span>
                {entry.detail && (
                  <span className='text-gray-500 dark:text-gray-400'>
                    : {entry.detail}
                  </span>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DebugPanel;
