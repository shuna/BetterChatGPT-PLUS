import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import BranchEditorCanvas from './BranchEditorCanvas';

const BranchEditorView = () => {
  const { t } = useTranslation();
  const currentChatIndex = useStore((state) => state.currentChatIndex);
  const ensureBranchTree = useStore((state) => state.ensureBranchTree);
  const branchTree = useStore(
    (state) => state.chats?.[state.currentChatIndex]?.branchTree
  );

  useEffect(() => {
    if (currentChatIndex >= 0 && !branchTree) {
      ensureBranchTree(currentChatIndex);
    }
  }, [currentChatIndex, branchTree, ensureBranchTree]);

  if (!branchTree || Object.keys(branchTree.nodes).length === 0) {
    return (
      <div className='flex items-center justify-center h-full text-gray-500 dark:text-gray-400'>
        {t('branchEditor')}...
      </div>
    );
  }

  return (
    <div className='h-full w-full'>
      <BranchEditorCanvas tree={branchTree} chatIndex={currentChatIndex} />
    </div>
  );
};

export default BranchEditorView;
