import React from 'react';

const EvaluateIcon = (props: React.SVGProps<SVGSVGElement>) => {
  return (
    <svg
      fill='none'
      stroke='currentColor'
      strokeWidth={1.5}
      viewBox='0 0 24 24'
      height='1em'
      width='1em'
      {...props}
    >
      {/* Clipboard with checkmark — represents evaluation/assessment */}
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        d='M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4'
      />
    </svg>
  );
};

export default EvaluateIcon;
