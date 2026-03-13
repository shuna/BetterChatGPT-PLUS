import React from 'react';

const BaseButton = ({
  onClick,
  icon,
  buttonProps,
}: {
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  icon: React.ReactElement;
  buttonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
}) => {
  return (
    <div className='visible flex self-end justify-center gap-3 text-gray-600 lg:self-center md:gap-4 dark:text-gray-400'>
      <button
        className='rounded-md p-1 hover:bg-gray-200 hover:text-gray-950 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:invisible md:group-hover:visible'
        onClick={onClick}
        {...buttonProps}
      >
        {icon}
      </button>
    </div>
  );
};

export default BaseButton;
