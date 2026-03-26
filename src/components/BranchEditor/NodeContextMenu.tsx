import React, { useState } from 'react';
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
  onNodeDiff: (nodeIdA: string, nodeIdB: string) => void;
  onNavigateToChat: (chatIndex: number, nodeId: string) => void;
  selectedNodeIds?: string[];
}

const NodeContextMenu = ({
  chatIndex,
  nodeId,
  x,
  y,
  onClose,
  onDiff,
  onNodeDiff,
  onNavigateToChat,
  selectedNodeIds = [],
}: NodeContextMenuProps) => {
  const { t } = useTranslation();
  const deleteBranch = useStore((state) => state.deleteBranch);
  const copyBranchSequence = useStore((state) => state.copyBranchSequence);
  const pasteBranchSequence = useStore((state) => state.pasteBranchSequence);
  const renameBranchNode = useStore((state) => state.renameBranchNode);
  const toggleNodeStar = useStore((state) => state.toggleNodeStar);
  const toggleNodePin = useStore((state) => state.toggleNodePin);
  const compareTarget = useStore((state) => state.compareTarget);
  const setCompareTarget = useStore((state) => state.setCompareTarget);
  const branchClipboard = useStore((state) => state.branchClipboard);
  const chats = useStore((state) => state.chats);
  const tree = useStore(
    (state) => state.chats?.[chatIndex]?.branchTree
  );

  const node = tree?.nodes[nodeId];
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState(node?.label ?? '');

  // Find source chat title for clipboard
  const clipboardSourceTitle = branchClipboard
    ? chats?.find((c) => c.id === branchClipboard.sourceChat)?.title || 'Chat'
    : null;

  const handleDelete = () => {
    deleteBranch(chatIndex, nodeId);
    onClose();
  };

  const hasSelection = selectedNodeIds.length > 1;

  const handleCopyFrom = () => {
    if (!tree) return;
    const path = buildPathToLeaf(tree, nodeId);
    const leafId = path[path.length - 1];
    copyBranchSequence(chatIndex, nodeId, leafId);
    onClose();
  };

  const handleCutFrom = () => {
    if (!tree) return;
    const path = buildPathToLeaf(tree, nodeId);
    const leafId = path[path.length - 1];
    copyBranchSequence(chatIndex, nodeId, leafId);
    deleteBranch(chatIndex, nodeId);
    onClose();
  };

  const handleCopySelected = () => {
    if (!tree || selectedNodeIds.length < 2) return;
    const firstId = selectedNodeIds[0];
    const lastId = selectedNodeIds[selectedNodeIds.length - 1];
    copyBranchSequence(chatIndex, firstId, lastId);
    onClose();
  };

  const handleCutSelected = () => {
    if (!tree || selectedNodeIds.length < 2) return;
    const firstId = selectedNodeIds[0];
    const lastId = selectedNodeIds[selectedNodeIds.length - 1];
    copyBranchSequence(chatIndex, firstId, lastId);
    deleteBranch(chatIndex, firstId);
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

  const handleLabelSubmit = () => {
    renameBranchNode(chatIndex, nodeId, labelValue.trim());
    setIsEditingLabel(false);
    onClose();
  };

  const handleCompareWith = () => {
    if (compareTarget && compareTarget.nodeId !== nodeId) {
      onNodeDiff(compareTarget.nodeId, nodeId);
      setCompareTarget(null);
      onClose();
    } else {
      setCompareTarget({ chatIndex, nodeId });
      onClose();
    }
  };

  if (isEditingLabel) {
    return (
      <>
        <div className='fixed inset-0 z-40' onClick={onClose} />
        <div
          className='fixed z-50 min-w-[220px] rounded-lg border border-gray-200 bg-white p-3 text-gray-800 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'
          style={{ left: x, top: y }}
        >
          <label className='block text-xs text-gray-500 dark:text-gray-400 mb-1'>
            {t('editLabel')}
          </label>
          <input
            type='text'
            value={labelValue}
            onChange={(e) => setLabelValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleLabelSubmit();
              if (e.key === 'Escape') onClose();
            }}
            autoFocus
            className='w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 outline-none focus:border-blue-500'
            placeholder='Label...'
          />
          <div className='flex justify-end gap-1 mt-2'>
            <button
              className='px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              onClick={onClose}
            >
              {t('cancel')}
            </button>
            <button
              className='px-2 py-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 font-medium'
              onClick={handleLabelSubmit}
            >
              {t('save')}
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className='fixed inset-0 z-40' onClick={onClose} />
      <div
        className='fixed z-50 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 text-gray-800 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'
        style={{ left: x, top: y }}
      >
        <button
          className='w-full px-4 py-2 text-left text-sm text-inherit hover:bg-gray-100 dark:hover:bg-gray-700'
          onClick={() => setIsEditingLabel(true)}
        >
          {t('editLabel')}
        </button>
        <button
          className='w-full px-4 py-2 text-left text-sm text-inherit hover:bg-gray-100 dark:hover:bg-gray-700'
          onClick={() => {
            toggleNodeStar(chatIndex, nodeId);
            onClose();
          }}
        >
          {node?.starred ? t('unstar') : t('star')}
        </button>
        <button
          className='w-full px-4 py-2 text-left text-sm text-inherit hover:bg-gray-100 dark:hover:bg-gray-700'
          onClick={() => {
            toggleNodePin(chatIndex, nodeId);
            onClose();
          }}
        >
          {node?.pinned ? t('unpin') : t('pin')}
        </button>
        <hr className='my-1 border-gray-200 dark:border-gray-700' />
        {hasSelection && (
          <>
            <button
              className='w-full px-4 py-2 text-left text-sm text-inherit hover:bg-gray-100 dark:hover:bg-gray-700'
              onClick={handleCopySelected}
            >
              {t('copySelectedNodes')}
            </button>
            <button
              className='w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
              onClick={handleCutSelected}
            >
              {t('cutSelectedNodes')}
            </button>
            <hr className='my-1 border-gray-200 dark:border-gray-700' />
          </>
        )}
        <button
          className='w-full px-4 py-2 text-left text-sm text-inherit hover:bg-gray-100 dark:hover:bg-gray-700'
          onClick={handleCopyFrom}
        >
          {t('copyMessages')}
        </button>
        <button
          className='w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
          onClick={handleCutFrom}
        >
          {t('cutMessages')}
        </button>
        {branchClipboard && (
          <button
            className='w-full px-4 py-2 text-left text-sm text-inherit hover:bg-gray-100 dark:hover:bg-gray-700'
            onClick={handlePaste}
          >
            {t('pasteMessages')}
            {clipboardSourceTitle && (
              <span className='ml-1 text-xs text-gray-500 dark:text-gray-400'>
                ({clipboardSourceTitle})
              </span>
            )}
          </button>
        )}
        <button
          className='w-full px-4 py-2 text-left text-sm text-inherit hover:bg-gray-100 dark:hover:bg-gray-700'
          onClick={handleDiff}
        >
          {t('compareBranches')}
        </button>
        <button
          className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
            compareTarget ? 'text-purple-600 dark:text-purple-400' : 'text-inherit'
          }`}
          onClick={handleCompareWith}
        >
          {compareTarget && compareTarget.nodeId !== nodeId
            ? t('compareWithSelected')
            : t('compareWith')}
        </button>
        <button
          className='w-full px-4 py-2 text-left text-sm text-inherit hover:bg-gray-100 dark:hover:bg-gray-700'
          onClick={() => {
            onNavigateToChat(chatIndex, nodeId);
            onClose();
          }}
        >
          {t('navigateToMessage')}
        </button>
        <hr className='my-1 border-gray-200 dark:border-gray-700' />
        <button
          className='w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
          onClick={handleDelete}
        >
          {t('deleteBranch')}
        </button>
      </div>
    </>
  );
};

export default NodeContextMenu;
