import React, { memo } from 'react';
import { NodeProps } from 'reactflow';

export interface ConversationHeaderData {
  chatIndex: number;
  chatTitle: string;
  conversationColor: string;
  onRemove?: () => void;
}

const ConversationHeaderNode = memo(({ data }: NodeProps<ConversationHeaderData>) => {
  return (
    <div
      className='px-3 py-1.5 rounded-md flex items-center gap-2 text-xs font-medium shadow-sm min-w-[280px]'
      style={{
        backgroundColor: data.conversationColor + '35',
        borderLeft: `3px solid ${data.conversationColor}`,
      }}
    >
      <div
        className='w-2.5 h-2.5 rounded-full shrink-0'
        style={{ backgroundColor: data.conversationColor }}
      />
      <span className='truncate text-gray-700 dark:text-gray-200'>
        {data.chatTitle || 'New Chat'}
      </span>
    </div>
  );
});

export default ConversationHeaderNode;
