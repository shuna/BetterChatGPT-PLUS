import React from 'react';
import useStore from '@store/store';

const NavigationButtons = () => {
  const canBack = useStore((state) => state.navHistoryPast.length > 0);
  const canForward = useStore((state) => state.navHistoryFuture.length > 0);
  const navBack = useStore((state) => state.navBack);
  const navForward = useStore((state) => state.navForward);

  const btnClass = (enabled: boolean) =>
    `p-1.5 rounded ${
      enabled
        ? 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 active:bg-gray-300 dark:active:bg-gray-600'
        : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
    }`;

  return (
    <div className='flex items-center gap-0.5'>
      <button
        className={btnClass(canBack)}
        onClick={navBack}
        disabled={!canBack}
        aria-label='Back'
      >
        <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
          <path d='M15 18l-6-6 6-6' />
        </svg>
      </button>
      <button
        className={btnClass(canForward)}
        onClick={navForward}
        disabled={!canForward}
        aria-label='Forward'
      >
        <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
          <path d='M9 18l6-6-6-6' />
        </svg>
      </button>
    </div>
  );
};

export default NavigationButtons;
