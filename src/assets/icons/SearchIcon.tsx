import React from 'react';

const SearchIcon = ({ className = 'h-4 w-4' }: { className?: string }) => {
  return (
    <svg
      stroke='currentColor'
      fill='none'
      strokeWidth='2'
      viewBox='0 0 24 24'
      strokeLinecap='round'
      strokeLinejoin='round'
      className={className}
      height='1em'
      width='1em'
      xmlns='http://www.w3.org/2000/svg'
    >
      <circle cx='11' cy='11' r='8' />
      <line x1='21' y1='21' x2='16.65' y2='16.65' />
    </svg>
  );
};

export default SearchIcon;
