import React, { memo, useCallback, useRef } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import useStore from '@store/store';
import { MessageNodeData } from '../useBranchEditorLayout';

const roleBadgeColors: Record<string, string> = {
  user: 'bg-blue-500',
  assistant: 'bg-green-500',
  system: 'bg-purple-500',
};

const MessageNode = memo(({ data, id }: NodeProps<MessageNodeData>) => {
  const hoveredNodeId = useStore((state) => state.hoveredNodeId);
  const setHoveredNodeId = useStore((state) => state.setHoveredNodeId);
  const isSearchMatch = useStore((state) => state.matchedNodeIds.has(id));
  const isCurrentSearchResult = useStore((state) => state.currentResultNodeId === id);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const isHovered = hoveredNodeId === id;

  const handleMouseEnter = useCallback(() => {
    setHoveredNodeId(id);
  }, [id, setHoveredNodeId]);

  const handleMouseLeave = useCallback(() => {
    setHoveredNodeId(null);
  }, [setHoveredNodeId]);

  const handleMenuClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = menuBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Dispatch custom event to open context menu at button position
    const event = new CustomEvent('node-menu-click', {
      detail: { nodeId: id, chatIndex: data.chatIndex, x: rect.right, y: rect.bottom },
      bubbles: true,
    });
    menuBtnRef.current?.dispatchEvent(event);
  }, [id, data.chatIndex]);

  const borderColor = isCurrentSearchResult
    ? '#f97316'
    : isSearchMatch
      ? '#eab308'
      : data.isActive
        ? data.conversationColor || '#3b82f6'
        : undefined;

  const searchHighlightClass = isCurrentSearchResult
    ? 'ring-2 ring-orange-400 ring-offset-1'
    : isSearchMatch
      ? 'ring-1 ring-yellow-400'
      : '';

  return (
    <div
      className={`relative px-3 py-2 rounded-lg border-2 shadow-md w-[280px] cursor-pointer transition-shadow duration-150 ${
        data.isActive
          ? 'bg-gray-100 dark:bg-gray-600'
          : 'border-gray-400 dark:border-gray-500 bg-gray-200 dark:bg-gray-700 opacity-50'
      } ${isHovered ? 'outline outline-[3px] outline-blue-400 outline-offset-0' : ''} ${searchHighlightClass}`}
      style={(data.isActive || isSearchMatch || isCurrentSearchResult) ? { borderColor } : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Handle type='target' position={Position.Top} className='!bg-gray-400' />
      {/* Header: click navigates to chat */}
      <div className='flex items-center gap-2 mb-1 cursor-pointer' data-node-header>
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
      {/* Content: click opens detail modal */}
      <p className='text-xs text-gray-700 dark:text-gray-300 line-clamp-2 leading-relaxed' data-node-content>
        {data.contentPreview || '(empty)'}
      </p>
      {/* Hover menu button */}
      {isHovered && (
        <button
          ref={menuBtnRef}
          className='absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500 text-xs shadow-sm'
          onClick={handleMenuClick}
          title='メニュー'
        >
          ⋯
        </button>
      )}
      <Handle
        type='source'
        position={Position.Bottom}
        className='!bg-gray-400'
      />
    </div>
  );
});

export default MessageNode;
