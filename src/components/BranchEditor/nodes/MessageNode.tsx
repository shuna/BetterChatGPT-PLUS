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
  const toggleNodeStar = useStore((state) => state.toggleNodeStar);
  const isSearchMatch = useStore((state) => state.matchedNodeIds.has(id));
  const isCurrentSearchResult = useStore((state) => state.currentResultNodeId === id);
  const compareTarget = useStore((state) => state.compareTarget);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const isHovered = hoveredNodeId === id;
  const isCompareTarget = compareTarget?.nodeId === id;

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

  const handleStarClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleNodeStar(data.chatIndex, id);
  }, [data.chatIndex, id, toggleNodeStar]);

  const borderColor = isCurrentSearchResult
    ? '#f97316'
    : isSearchMatch
      ? '#eab308'
      : isCompareTarget
        ? '#a855f7'
        : data.isActive
          ? data.conversationColor || '#3b82f6'
          : undefined;

  const searchHighlightClass = isCurrentSearchResult
    ? 'ring-2 ring-orange-400 ring-offset-1'
    : isSearchMatch
      ? 'ring-1 ring-yellow-400'
      : isCompareTarget
        ? 'ring-2 ring-purple-400 ring-offset-1'
        : '';

  return (
    <div
      className={`relative px-3 py-2 rounded-lg border-2 shadow-md w-[280px] cursor-pointer transition-shadow duration-150 ${
        data.isActive
          ? 'bg-gray-100 dark:bg-gray-600'
          : 'border-gray-400 dark:border-gray-500 bg-gray-200 dark:bg-gray-700 opacity-50'
      } ${isHovered ? 'outline outline-[3px] outline-blue-400 outline-offset-0' : ''} ${searchHighlightClass}`}
      style={(data.isActive || isSearchMatch || isCurrentSearchResult || isCompareTarget) ? { borderColor } : undefined}
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
      {/* Hover overlay buttons: pin → star → menu (right to left) */}
      <div className={`absolute -top-1 -right-1 flex items-center gap-0.5 ${
        isHovered || data.starred || data.pinned ? '' : 'hidden'
      }`}>
        {/* Pin icon */}
        {(data.pinned || isHovered) && (
          <span
            className={`w-5 h-5 flex items-center justify-center rounded-full text-xs ${
              data.pinned
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300'
                : 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500'
            }`}
            title={data.pinned ? 'Pinned' : ''}
          >
            <svg className='w-3 h-3' viewBox='0 0 24 24' fill='currentColor'>
              <path d='M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z' />
            </svg>
          </span>
        )}
        {/* Star icon */}
        {(data.starred || isHovered) && (
          <button
            className={`w-5 h-5 flex items-center justify-center rounded-full shadow-sm ${
              data.starred
                ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-500 dark:text-yellow-300'
                : 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 hover:bg-gray-300 dark:hover:bg-gray-500'
            }`}
            onClick={handleStarClick}
            title={data.starred ? 'Unstar' : 'Star'}
          >
            <svg className='w-3 h-3' viewBox='0 0 24 24' fill='currentColor'>
              <path d='M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' />
            </svg>
          </button>
        )}
        {/* Menu button */}
        {isHovered && (
          <button
            ref={menuBtnRef}
            className='w-5 h-5 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500 text-xs shadow-sm'
            onClick={handleMenuClick}
            title='メニュー'
          >
            ⋯
          </button>
        )}
      </div>
      <Handle
        type='source'
        position={Position.Bottom}
        className='!bg-gray-400'
      />
    </div>
  );
});

export default MessageNode;
