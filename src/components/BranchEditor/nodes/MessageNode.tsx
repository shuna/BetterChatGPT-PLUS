import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { MessageNodeData } from '../useBranchEditorLayout';

const roleBadgeColors: Record<string, string> = {
  user: 'bg-blue-500',
  assistant: 'bg-green-500',
  system: 'bg-purple-500',
};

const MessageNode = memo(({ data }: NodeProps<MessageNodeData>) => {
  return (
    <div
      className={`px-3 py-2 rounded-lg border-2 shadow-md w-[280px] cursor-pointer transition-colors ${
        data.isActive
          ? 'border-blue-500 dark:border-blue-400 bg-white dark:bg-gray-700'
          : 'border-gray-400 dark:border-gray-500 bg-gray-100 dark:bg-gray-800 opacity-80'
      }`}
    >
      <Handle type='target' position={Position.Top} className='!bg-gray-400' />
      <div className='flex items-center gap-2 mb-1'>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded text-white font-medium ${
            roleBadgeColors[data.role] || 'bg-gray-500'
          }`}
        >
          {data.role}
        </span>
        {data.label && (
          <span className='text-[10px] text-gray-500 dark:text-gray-400 truncate'>
            {data.label}
          </span>
        )}
      </div>
      <p className='text-xs text-gray-700 dark:text-gray-300 line-clamp-2 leading-relaxed'>
        {data.contentPreview || '(empty)'}
      </p>
      <Handle
        type='source'
        position={Position.Bottom}
        className='!bg-gray-400'
      />
    </div>
  );
});

export default MessageNode;
