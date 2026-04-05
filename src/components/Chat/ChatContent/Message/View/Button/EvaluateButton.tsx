import React from 'react';
import EvaluateIcon from '@icon/EvaluateIcon';

const EvaluateButton = ({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) => {
  return (
    <button
      className='rounded-md p-1 hover:bg-gray-200 hover:text-gray-950 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed'
      onClick={onClick}
      disabled={disabled}
      aria-label='evaluate'
      title='Evaluate'
    >
      <EvaluateIcon />
    </button>
  );
};

export default EvaluateButton;
