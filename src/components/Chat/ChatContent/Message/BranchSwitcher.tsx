import React from 'react';
import useStore from '@store/store';
import { getSiblingsOf } from '@utils/branchUtils';
import { isSplitView } from '@type/chat';

const BranchSwitcher = ({
  chatIndex,
  nodeId,
}: {
  chatIndex: number;
  nodeId: string;
}) => {
  const switchBranchAtNode = useStore((state) => state.switchBranchAtNode);
  const setBranchEditorFocusNodeId = useStore((state) => state.setBranchEditorFocusNodeId);
  const chatActiveView = useStore((state) => state.chatActiveView);
  const navigateToBranchEditor = useStore((state) => state.navigateToBranchEditor);
  const branchTree = useStore(
    (state) => state.chats?.[chatIndex]?.branchTree
  );

  if (!branchTree) return null;

  const siblings = getSiblingsOf(branchTree, nodeId);
  if (siblings.length <= 1) return null;

  const currentIdx = siblings.findIndex((s) => s.id === nodeId);
  const total = siblings.length;

  const handlePrev = () => {
    if (currentIdx > 0) {
      switchBranchAtNode(chatIndex, siblings[currentIdx - 1].id);
    }
  };

  const handleNext = () => {
    if (currentIdx < total - 1) {
      switchBranchAtNode(chatIndex, siblings[currentIdx + 1].id);
    }
  };

  return (
    <div className='flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 select-none'>
      <button
        className='p-0.5 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30'
        onClick={handlePrev}
        disabled={currentIdx <= 0}
        aria-label='Previous branch'
      >
        <svg
          xmlns='http://www.w3.org/2000/svg'
          viewBox='0 0 20 20'
          fill='currentColor'
          className='w-3.5 h-3.5'
        >
          <path
            fillRule='evenodd'
            d='M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z'
            clipRule='evenodd'
          />
        </svg>
      </button>
      <button
        className='tabular-nums hover:text-blue-500 dark:hover:text-blue-400 cursor-pointer'
        onClick={() => {
          setBranchEditorFocusNodeId(nodeId);
          if (!isSplitView(chatActiveView)) {
            navigateToBranchEditor();
          }
        }}
        title='ブランチエディタで表示'
      >
        {currentIdx + 1}/{total}
      </button>
      <button
        className='p-0.5 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30'
        onClick={handleNext}
        disabled={currentIdx >= total - 1}
        aria-label='Next branch'
      >
        <svg
          xmlns='http://www.w3.org/2000/svg'
          viewBox='0 0 20 20'
          fill='currentColor'
          className='w-3.5 h-3.5'
        >
          <path
            fillRule='evenodd'
            d='M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z'
            clipRule='evenodd'
          />
        </svg>
      </button>
    </div>
  );
};

export default BranchSwitcher;
