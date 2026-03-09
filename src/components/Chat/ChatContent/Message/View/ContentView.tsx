import React, {
  memo,
  useState,
} from 'react';

import useStore from '@store/store';

import useSubmit from '@hooks/useSubmit';

import {
  ContentInterface,
  ImageContentInterface,
  Role,
  isImageContent,
  isTextContent,
} from '@type/chat';
import {
  resolveRegenerateTarget,
} from '@utils/branchUtils';
import ContentActions from './ContentActions';
import ContentAttachments from './ContentAttachments';
import ContentBody from './ContentBody';

const ContentView = memo(
  ({
    role,
    content,
    setIsEdit,
    messageIndex,
    nodeId,
  }: {
    role: string;
    content: ContentInterface[];
    setIsEdit: React.Dispatch<React.SetStateAction<boolean>>;
    messageIndex: number;
    nodeId?: string;
  }) => {
    const { handleSubmit, handleSubmitMidChat } = useSubmit();

    const [isDelete, setIsDelete] = useState<boolean>(false);

    const currentChatIndex = useStore((state) => state.currentChatIndex);
    const removeMessageAtIndex = useStore((state) => state.removeMessageAtIndex);
    const moveMessage = useStore((state) => state.moveMessage);
    const lastMessageIndex = useStore((state) =>
      state.chats ? state.chats[state.currentChatIndex].messages.length - 1 : 0
    );
    const inlineLatex = useStore((state) => state.inlineLatex);
    const markdownMode = useStore((state) => state.markdownMode);
    const currentChatId = useStore((state) =>
      state.chats?.[state.currentChatIndex]?.id ?? ''
    );
    const isGeneratingMessage = useStore((state) =>
      !!nodeId &&
      Object.values(state.generatingSessions).some(
        (s) => s.chatId === currentChatId && s.targetNodeId === nodeId
      )
    );
    const isCurrentChatGenerating = useStore((state) =>
      Object.values(state.generatingSessions).some((s) => s.chatId === currentChatId)
    );
    const resolveCurrentMessageIndex = () => {
      if (!nodeId) return messageIndex;
      const activePath =
        useStore.getState().chats?.[currentChatIndex]?.branchTree?.activePath ?? [];
      const resolvedIndex = activePath.indexOf(nodeId);
      return resolvedIndex >= 0 ? resolvedIndex : messageIndex;
    };

    const handleDelete = () => {
      removeMessageAtIndex(currentChatIndex, resolveCurrentMessageIndex());
    };

    const handleMove = (direction: 'up' | 'down') => {
      moveMessage(currentChatIndex, resolveCurrentMessageIndex(), direction);
    };

    const handleMoveUp = () => {
      handleMove('up');
    };

    const handleMoveDown = () => {
      handleMove('down');
    };

    const handleRefresh = () => {
      if (isCurrentChatGenerating) return;

      const plan = resolveRegenerateTarget(
        role as Role,
        resolveCurrentMessageIndex(),
        useStore.getState().chats![currentChatIndex].messages.length
      );
      if (!plan) return;

      if (plan.removeIndex >= 0) {
        removeMessageAtIndex(currentChatIndex, plan.removeIndex);
      }

      if (plan.submitMode === 'append') {
        handleSubmit();
      } else {
        handleSubmitMidChat(plan.insertIndex);
      }
    };

    const currentTextContent = isTextContent(content[0]) ? content[0].text : '';
    const handleCopy = () => {
      navigator.clipboard.writeText(currentTextContent);
    };
    const validImageContents = Array.isArray(content)
    ? (content.slice(1).filter(isImageContent) as ImageContentInterface[])
    : [];
    return (
      <>
        <ContentBody
          currentTextContent={currentTextContent}
          markdownMode={markdownMode}
          inlineLatex={inlineLatex}
          isGeneratingMessage={isGeneratingMessage}
        />
        <ContentAttachments images={validImageContents} />
        <ContentActions
          nodeId={nodeId}
          currentChatIndex={currentChatIndex}
          role={role}
          messageIndex={messageIndex}
          lastMessageIndex={lastMessageIndex}
          isDelete={isDelete}
          isGeneratingMessage={isGeneratingMessage}
          isCurrentChatGenerating={isCurrentChatGenerating}
          setIsEdit={setIsEdit}
          setIsDelete={setIsDelete}
          onRefresh={handleRefresh}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
          onCopy={handleCopy}
          onDelete={handleDelete}
        />
      </>
    );
  }
);

export default ContentView;
