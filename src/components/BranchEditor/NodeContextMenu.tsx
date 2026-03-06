import React from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import { buildPathToLeaf } from '@utils/branchUtils';

interface NodeContextMenuProps {
  chatIndex: number;
  nodeId: string;
  x: number;
  y: number;
  onClose: () => void;
  onDiff: (pathA: string[]) => void;
}

const NodeContextMenu = ({
  chatIndex,
  nodeId,
  x,
  y,
  onClose,
  onDiff,
}: NodeContextMenuProps) => {
  const { t } = useTranslation();
  const deleteBranch = useStore((state) => state.deleteBranch);
  const copyBranchSequence = useStore((state) => state.copyBranchSequence);
  const pasteBranchSequence = useStore((state) => state.pasteBranchSequence);
  const branchClipboard = useStore((state) => state.branchClipboard);
  const chats = useStore((state) => state.chats);
  const tree = useStore(
    (state) => state.chats?.[chatIndex]?.branchTree
  );

  // Find source chat title for clipboard
  const clipboardSourceTitle = branchClipboard
    ? chats?.find((c) => c.id === branchClipboard.sourceChat)?.title || 'Chat'
    : null;

  const handleDelete = () => {
    deleteBranch(chatIndex, nodeId);
    onClose();
  };

  const handleCopyFrom = () => {
    if (!tree) return;
    const path = tree.activePath;
    const idx = path.indexOf(nodeId);
    if (idx >= 0) {
      copyBranchSequence(chatIndex, nodeId, path[path.length - 1]);
    }
    onClose();
  };

  const handlePaste = () => {
    pasteBranchSequence(chatIndex, nodeId);
    onClose();
  };

  const handleDiff = () => {
    if (!tree) return;
    const altPath = buildPathToLeaf(tree, nodeId);
    onDiff(altPath);
    onClose();
  };

  return (
    <>
      <div className='fixed inset-0 z-40' onClick={onClose} />
      <div
        className='fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[180px]'
        style={{ left: x, top: y }}
      >
        <button
          className='w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700'
          onClick={handleCopyFrom}
        >
          {t('copyMessages')}
        </button>
        {branchClipboard && (
          <button
            className='w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700'
            onClick={handlePaste}
          >
            {t('pasteMessages')}
            {clipboardSourceTitle && (
              <span className='ml-1 text-xs text-gray-400'>
                ({clipboardSourceTitle})
              </span>
            )}
          </button>
        )}
        <button
          className='w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700'
          onClick={handleDiff}
        >
          {t('compareBranches')}
        </button>
        <hr className='my-1 border-gray-200 dark:border-gray-700' />
        <button
          className='w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
          onClick={handleDelete}
        >
          {t('deleteBranch')}
        </button>
      </div>
    </>
  );
};

export default NodeContextMenu;
