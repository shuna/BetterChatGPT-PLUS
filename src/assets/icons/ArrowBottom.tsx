import React from 'react';

const ArrowBottom = (props: React.SVGProps<SVGSVGElement>) => {
  return (
    <svg
      stroke='currentColor'
      fill='none'
      strokeWidth='2'
      viewBox='0 0 24 24'
      strokeLinecap='round'
      strokeLinejoin='round'
      xmlns='http://www.w3.org/2000/svg'
      className='h-4 w-4'
      width='1em'
      height='1em'
      {...props}
    >
      <line x1='12' y1='4' x2='12' y2='16' />
      <polyline points='17 11 12 16 7 11' />
      <line x1='6' y1='20' x2='18' y2='20' />
    </svg>
  );
};

export default ArrowBottom;
