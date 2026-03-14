import React, { memo } from 'react';

import BranchIcon from '@icon/BranchIcon';
import BaseButton from './BaseButton';
import useStore from '@store/store';

const ShowInEditorButton = memo(
  ({ messageIndex }: { messageIndex: number }) => {
    const handleClick = () => {
      const state = useStore.getState();
      const chatIndex = state.currentChatIndex;

      // Ensure branchTree exists
      state.ensureBranchTree(chatIndex);

      const tree = useStore.getState().chats?.[chatIndex]?.branchTree;
      if (!tree) return;

      const nodeId = tree.activePath[messageIndex];
      if (!nodeId) return;

      state.setBranchEditorFocusNodeId(nodeId);
      state.navigateToBranchEditor();
    };

    return (
      <BaseButton
        icon={<BranchIcon />}
        buttonProps={{ 'aria-label': 'show in branch editor' }}
        onClick={handleClick}
      />
    );
  }
);

export default ShowInEditorButton;
