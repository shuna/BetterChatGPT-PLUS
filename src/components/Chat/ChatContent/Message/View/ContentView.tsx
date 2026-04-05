import React, {
  memo,
  useCallback,
  useState,
} from 'react';

import useStore from '@store/store';

import useSubmit from '@hooks/useSubmit';
import { resolveProviderForModel, type ResolvedProvider } from '@hooks/submitHelpers';

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
import EvaluationPanel from './EvaluationPanel';
import EvaluationModal from './EvaluationModal';

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
    const [isEvalModalOpen, setIsEvalModalOpen] = useState(false);
    const [evalInitialTab, setEvalInitialTab] = useState<'safety' | 'quality'>('safety');
    const [evalAllPrompts, setEvalAllPrompts] = useState(false);

    const currentChatIndex = useStore((state) => state.currentChatIndex);
    const removeMessageAtIndex = useStore((state) => state.removeMessageAtIndex);
    const moveMessage = useStore((state) => state.moveMessage);
    const lastMessageIndex = useStore((state) =>
      state.chats?.[state.currentChatIndex]?.messages
        ? state.chats[state.currentChatIndex].messages.length - 1
        : 0
    );
    const inlineLatex = useStore((state) => state.inlineLatex);
    const markdownMode = useStore((state) => state.markdownMode);
    const streamingMarkdownPolicy = useStore((state) => state.streamingMarkdownPolicy);
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
    const isProtected = useStore((state) => {
      const mapKey = String(state.currentChatIndex);
      const chat = state.chats?.[state.currentChatIndex];
      const resolvedNodeId = nodeId ?? chat?.branchTree?.activePath?.[messageIndex] ?? String(messageIndex);
      const protectedNodes = state.protectedNodeMaps[mapKey] ?? chat?.protectedNodes ?? {};
      return protectedNodes[resolvedNodeId] ?? false;
    });

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

    const handleEvaluate = useCallback(() => {
      setEvalAllPrompts(false);
      setIsEvalModalOpen(true);
    }, []);

    const handleEvaluateSafety = useCallback(() => {
      setEvalInitialTab('safety');
      setEvalAllPrompts(true);
      setIsEvalModalOpen(true);
    }, []);

    const handleEvaluateQuality = useCallback(() => {
      setEvalInitialTab('quality');
      setEvalAllPrompts(true);
      setIsEvalModalOpen(true);
    }, []);

    const handleEvaluateSafetyOnly = useCallback(() => {
      setEvalInitialTab('safety');
      setEvalAllPrompts(false);
      setIsEvalModalOpen(true);
    }, []);

    const handleEvaluateQualityOnly = useCallback(() => {
      setEvalInitialTab('quality');
      setEvalAllPrompts(false);
      setIsEvalModalOpen(true);
    }, []);

    // Resolve evaluation context for the modal
    const getEvalContext = useCallback((allPrompts: boolean) => {
      const state = useStore.getState();
      const chat = state.chats?.[currentChatIndex];
      if (!chat || !nodeId || !currentChatId) return null;

      const config = chat.config;
      const fallbackProvider: ResolvedProvider = {
        endpoint: state.apiEndpoint,
        key: state.apiKey,
      };
      const resolved = resolveProviderForModel(
        config.model,
        state.favoriteModels || [],
        state.providers || {},
        fallbackProvider,
        config.providerId
      );

      const currentText = content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('\n');

      const phase: 'pre-send' | 'post-receive' =
        role === 'user' ? 'pre-send' : 'post-receive';

      let userText = '';
      let assistantText: string | undefined;

      if (allPrompts) {
        const idx = resolveCurrentMessageIndex();
        const userTexts: string[] = [];
        for (let i = 0; i <= idx; i++) {
          const msg = chat.messages[i];
          if (msg.role === 'user') {
            const text = msg.content
              .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
              .map((c) => c.text)
              .join('\n');
            userTexts.push(text);
          }
        }
        userText = userTexts.join('\n');
        if (role === 'assistant') {
          assistantText = currentText;
        }
      } else if (role === 'user') {
        userText = currentText;
      } else {
        const idx = resolveCurrentMessageIndex();
        for (let i = idx - 1; i >= 0; i--) {
          const msg = chat.messages[i];
          if (msg.role === 'user') {
            userText = msg.content
              .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
              .map((c) => c.text)
              .join('\n');
            break;
          }
        }
        assistantText = currentText;
      }

      return {
        phase,
        userText,
        assistantText,
        resolved,
        model: config.model,
      };
    }, [currentChatIndex, currentChatId, nodeId, content, role]);

    const currentTextContent = content?.[0] && isTextContent(content[0]) ? content[0].text : '';
    const handleCopy = () => {
      navigator.clipboard.writeText(currentTextContent);
    };
    const validImageContents = Array.isArray(content)
    ? (content.slice(1).filter(isImageContent) as ImageContentInterface[])
    : [];

    const evalContext = isEvalModalOpen ? getEvalContext(evalAllPrompts) : null;

    return (
      <>
        <ContentBody
          currentTextContent={currentTextContent}
          markdownMode={markdownMode}
          streamingMarkdownPolicy={streamingMarkdownPolicy}
          inlineLatex={inlineLatex}
          isGeneratingMessage={isGeneratingMessage}
          nodeId={nodeId}
        />
        <ContentAttachments images={validImageContents} />
        {nodeId && currentChatId && (
          <>
            <EvaluationPanel chatId={currentChatId} nodeId={nodeId} phase='pre-send' />
            <EvaluationPanel chatId={currentChatId} nodeId={nodeId} phase='post-receive' />
          </>
        )}
        <ContentActions
          nodeId={nodeId}
          currentChatIndex={currentChatIndex}
          role={role}
          messageIndex={messageIndex}
          lastMessageIndex={lastMessageIndex}
          isDelete={isDelete}
          isProtected={isProtected}
          isGeneratingMessage={isGeneratingMessage}
          isCurrentChatGenerating={isCurrentChatGenerating}
          showEvaluateButton={true}
          setIsEdit={setIsEdit}
          setIsDelete={setIsDelete}
          onRefresh={handleRefresh}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
          onCopy={handleCopy}
          onDelete={handleDelete}
          onEvaluate={handleEvaluate}
          onEvaluateSafety={handleEvaluateSafety}
          onEvaluateQuality={handleEvaluateQuality}
          onEvaluateSafetyOnly={handleEvaluateSafetyOnly}
          onEvaluateQualityOnly={handleEvaluateQualityOnly}
        />
        {isEvalModalOpen && nodeId && currentChatId && evalContext && (
          <EvaluationModal
            chatId={currentChatId}
            nodeId={nodeId}
            phase={evalContext.phase}
            userText={evalContext.userText}
            assistantText={evalContext.assistantText}
            resolvedProvider={evalContext.resolved}
            model={evalContext.model}
            setIsModalOpen={setIsEvalModalOpen}
            initialTab={evalInitialTab}
          />
        )}
      </>
    );
  }
);

export default ContentView;
