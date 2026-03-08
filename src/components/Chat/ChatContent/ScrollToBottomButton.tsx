import React from 'react';

import DownArrow from '@icon/DownArrow';

interface ScrollToBottomButtonProps {
  atBottom: boolean;
  scrollToBottom: () => void;
}

const ScrollToBottomButton = React.memo(({ atBottom, scrollToBottom }: ScrollToBottomButtonProps) => {
  return (
    <button
      className={`cursor-pointer absolute right-6 bottom-[60px] md:bottom-[60px] z-10 rounded-full border border-gray-200 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-white/10 dark:text-gray-200 ${
        atBottom ? 'hidden' : ''
      }`}
      aria-label='scroll to bottom'
      onClick={scrollToBottom}
    >
      <DownArrow />
    </button>
  );
});

export default ScrollToBottomButton;
