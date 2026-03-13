import React from 'react';

import ArrowBottom from '@icon/ArrowBottom';
import DownArrow from '@icon/DownArrow';

interface ScrollToBottomButtonProps {
  atBottom: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  scrollToPreviousBubble: () => void;
  scrollToNextBubble: () => void;
  scrollToBottom: () => void;
}

const baseButtonClass =
  'cursor-pointer rounded-full border border-gray-200 bg-gray-50 p-1.5 text-gray-600 transition-colors hover:bg-gray-200 disabled:cursor-default disabled:opacity-40 dark:border-white/10 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/20';

const ScrollToBottomButton = React.memo(({
  atBottom,
  canMoveUp,
  canMoveDown,
  scrollToPreviousBubble,
  scrollToNextBubble,
  scrollToBottom,
}: ScrollToBottomButtonProps) => {
  return (
    <div className='absolute right-6 bottom-[60px] z-10 flex flex-col gap-1.5'>
      <button
        className={baseButtonClass}
        aria-label='scroll to previous bubble'
        title='一つ上に移動'
        disabled={!canMoveUp}
        onClick={scrollToPreviousBubble}
      >
        <DownArrow className='h-4 w-4 m-0 rotate-180' />
      </button>
      <button
        className={baseButtonClass}
        aria-label='scroll to next bubble'
        title='1つ下に移動'
        disabled={!canMoveDown}
        onClick={scrollToNextBubble}
      >
        <DownArrow className='h-4 w-4 m-0' />
      </button>
      <button
        className={baseButtonClass}
        aria-label='scroll to bottom'
        title='最下部へ移動'
        disabled={atBottom}
        onClick={scrollToBottom}
      >
        <ArrowBottom />
      </button>
    </div>
  );
});

export default ScrollToBottomButton;
