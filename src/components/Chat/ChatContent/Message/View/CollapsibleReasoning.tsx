import React, { memo, useState } from 'react';

const CollapsibleReasoning = memo(function CollapsibleReasoning({
  reasoning,
  isGenerating,
}: {
  reasoning: string;
  isGenerating: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (!reasoning) return null;

  return (
    <div className='mb-2'>
      <button
        type='button'
        className='flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors'
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
          fill='none'
          viewBox='0 0 24 24'
          stroke='currentColor'
          strokeWidth={2}
        >
          <path strokeLinecap='round' strokeLinejoin='round' d='M9 5l7 7-7 7' />
        </svg>
        <span>
          思考過程
          {isGenerating && (
            <span className='ml-1 animate-pulse'>...</span>
          )}
        </span>
      </button>
      {isOpen && (
        <div className='mt-1.5 pl-4 border-l-2 border-gray-200 dark:border-gray-700'>
          <pre className='text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words font-sans leading-relaxed max-h-96 overflow-y-auto'>
            {reasoning}
          </pre>
        </div>
      )}
    </div>
  );
});

export default CollapsibleReasoning;
