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
  const multiViewChatIndices = useStore((state) => state.multiViewChatIndices);
  const chats = useStore((state) => state.chats);
  const activeView = useStore((state) => state.chatActiveView);

  // Ensure branch tree for current chat — only when branch editor is visible
  useEffect(() => {
    if (activeView !== 'branch-editor') return;
    if (currentChatIndex >= 0 && !branchTree) {
      ensureBranchTree(currentChatIndex);
    }
  }, [activeView, currentChatIndex, branchTree, ensureBranchTree]);

  // Ensure branch trees for all multi-view chats — only when branch editor is visible
  useEffect(() => {
    if (activeView !== 'branch-editor') return;
    if (multiViewChatIndices.length > 1) {
      multiViewChatIndices.forEach((idx) => {
        if (chats?.[idx] && !chats[idx].branchTree) {
          ensureBranchTree(idx);
        }
      });
    }
  }, [activeView, multiViewChatIndices, chats, ensureBranchTree]);

  const chatIndices = multiViewChatIndices.length > 1
    ? multiViewChatIndices
    : [currentChatIndex];

  const hasAnyTree = chatIndices.some(
    (idx) => chats?.[idx]?.branchTree && Object.keys(chats[idx].branchTree!.nodes).length > 0
  );

  if (!hasAnyTree) {
    return (
      <div className='flex items-center justify-center h-full text-gray-500 dark:text-gray-400'>
        {t('branchEditor')}...
      </div>
    );
  }

  return (
    <div className='h-full w-full relative'>
      <BranchEditorCanvas
        chatIndices={chatIndices}
        primaryChatIndex={currentChatIndex}
      />
    </div>
  );
};

export default BranchEditorView;
