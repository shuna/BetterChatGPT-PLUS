import React, { memo, useCallback, useState } from 'react';
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
import { resolveRegenerateTarget } from '@utils/branchUtils';
import { useEditViewLogic } from './useEditViewLogic';
import OverTypeEditor from './OverTypeEditor';
import ContentActions from './ContentActions';
import ContentAttachments from './ContentAttachments';
import EditViewButtons from './EditViewButtons';
import ContentBody from './ContentBody';
import EvaluationPanel from './EvaluationPanel';
import EvaluationModal from './EvaluationModal';
import PopupModal from '@components/PopupModal';
import { useTranslation } from 'react-i18next';
import { useModelType } from '@utils/modelLookup';
import { TextContentInterface } from '@type/chat';
import { useStreamingText } from '@hooks/useStreamingText';
import { useStreamingReasoning } from '@hooks/useStreamingReasoning';
import { isReasoningContent } from '@type/chat';
import CollapsibleReasoning from './CollapsibleReasoning';

const UnifiedMessageView = memo(
  ({
    role,
    content,
    setIsEdit,
    messageIndex,
    nodeId,
    isEditState,
    editSessionKey,
  }: {
    role: string;
    content: ContentInterface[];
    setIsEdit: React.Dispatch<React.SetStateAction<boolean>>;
    messageIndex: number;
    nodeId?: string;
    isEditState: boolean;
    editSessionKey: string;
  }) => {
    const contentSurfaceClass =
      'rounded-2xl bg-white/60 px-4 pt-2.5 pb-2 shadow-sm ring-1 ring-black/5 dark:bg-gray-900/20 dark:ring-white/10 md:px-5 md:pt-3 md:pb-2.5';
    const contentMinHeightClass = 'min-h-[5.25rem]';
    const { t } = useTranslation();
    const {
      handleSubmit,
      handleSubmitMidChat,
      isUnknownContextConfirmOpen,
      setIsUnknownContextConfirmOpen,
      unknownContextConfirmMessage,
      handleUnknownContextConfirm,
      handleUnknownContextCancel,
    } = useSubmit();
    const [isDelete, setIsDelete] = useState(false);
    const [isEvalModalOpen, setIsEvalModalOpen] = useState(false);

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


    // Edit logic (only used when editing, but hook must always be called)
    const editLogic = useEditViewLogic({
      content,
      setIsEdit,
      messageIndex,
      nodeId,
      sticky: false,
      editSessionKey,
    });
    const isImageModel = useModelType(editLogic.model, editLogic.providerId) === 'image';

    // Resolve current message index from active path
    const resolveCurrentMessageIndex = () => {
      if (!nodeId) return messageIndex;
      const activePath =
        useStore.getState().chats?.[currentChatIndex]?.branchTree?.activePath ?? [];
      const resolvedIndex = activePath.indexOf(nodeId);
      return resolvedIndex >= 0 ? resolvedIndex : messageIndex;
    };

    // ContentView handlers
    const handleDelete = () => {
      removeMessageAtIndex(currentChatIndex, resolveCurrentMessageIndex());
    };
    const handleMove = (direction: 'up' | 'down') => {
      moveMessage(currentChatIndex, resolveCurrentMessageIndex(), direction);
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
      setIsEvalModalOpen(true);
    }, []);

    const getEvalContext = useCallback(() => {
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

      if (role === 'user') {
        userText = currentText;
      } else {
        // Collect consecutive user messages preceding this assistant message
        // (mirrors ensureRoleAlternation in submitHelpers.ts)
        const idx = resolveCurrentMessageIndex();
        const userTexts: string[] = [];
        for (let i = idx - 1; i >= 0; i--) {
          const msg = chat.messages[i];
          if (msg.role !== 'user') break;
          const text = msg.content
            .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
            .map((c) => c.text)
            .join('\n');
          userTexts.unshift(text);
        }
        userText = userTexts.join('\n');
        assistantText = currentText;
      }

      return { phase, userText, assistantText, resolved, model: config.model };
    }, [currentChatIndex, currentChatId, nodeId, content, role]);

    const streamingText = useStreamingText(isGeneratingMessage ? nodeId : undefined);
    const streamingReasoning = useStreamingReasoning(isGeneratingMessage ? nodeId : undefined);
    // Resolve reasoning: from streaming buffer during generation, from persisted content otherwise
    const persistedReasoning = Array.isArray(content)
      ? content.filter(isReasoningContent).map((c) => c.text).join('')
      : '';
    const currentReasoning = streamingReasoning ?? persistedReasoning;
    const firstTextItem = Array.isArray(content)
      ? content.find(isTextContent)
      : undefined;
    const currentTextContent = streamingText ?? (firstTextItem?.text ?? '');
    const handleCopy = () => {
      navigator.clipboard.writeText(currentTextContent);
    };
    const validImageContents = Array.isArray(content)
      ? (content.slice(1).filter(isImageContent) as ImageContentInterface[])
      : [];

    // Determine displayed value: draft when editing, saved content when viewing
    const displayValue = isEditState
      ? (editLogic._content[0] as TextContentInterface)?.text ?? ''
      : currentTextContent;

    return (
      <>
        {isEditState ? (
          <div className={contentSurfaceClass}>
            <div className={contentMinHeightClass}>
              <OverTypeEditor
                value={displayValue}
                mode='edit'
                onChange={(val) => {
                  editLogic._setContent((prev) => [
                    { type: 'text', text: val },
                    ...prev.slice(1),
                  ]);
                }}
                onKeyDown={(e) => {
                  // Convert native KeyboardEvent to React-compatible format for handleKeyDown
                  editLogic.handleKeyDown(e as unknown as React.KeyboardEvent<HTMLTextAreaElement>);
                }}
                onPaste={(e) => {
                  editLogic.handlePaste(e as unknown as React.ClipboardEvent<HTMLTextAreaElement>);
                }}
                autoFocus
                minHeight='5.25rem'
              />
            </div>
            <EditViewButtons
              sticky={false}
              handleFileChange={editLogic.handleFileChange}
              handleImageDetailChange={editLogic.handleImageDetailChange}
              handleRemoveImage={editLogic.handleRemoveImage}
              handleGenerate={editLogic.handleGenerate}
              handleGenerateNextOnly={editLogic.handleGenerateNextOnly}
              generateBelowDisabled={editLogic.generateBelowDisabled}
              handleBranchGenerate={editLogic.handleBranchGenerate}
              handleSave={editLogic.handleSave}
              handleBranchOnly={editLogic.handleBranchOnly}
              handleCancel={editLogic.handleCancel}
              contentChanged={editLogic.contentChanged}
              handleUploadButtonClick={editLogic.handleUploadButtonClick}
              setIsModalOpen={editLogic.setIsModalOpen}
              _setContent={editLogic._setContent}
              _content={editLogic._content}
              imageUrl={editLogic.imageUrl}
              setImageUrl={editLogic.setImageUrl}
              handleImageUrlChange={editLogic.handleImageUrlChange}
              fileInputRef={editLogic.fileInputRef}
              model={editLogic.model}
              providerId={editLogic.providerId}
              modelValid={editLogic.modelValid}
              messageIndex={messageIndex}
              role={role}
            />
            {editLogic.isModalOpen && (
              <PopupModal
                setIsModalOpen={editLogic.setIsModalOpen}
                title={t('warning') as string}
                message={t('clearMessageWarning') as string}
                handleConfirm={editLogic.handleGenerate}
              />
            )}
            {editLogic.isUnknownContextConfirmOpen && (
              <PopupModal
                setIsModalOpen={editLogic.setIsUnknownContextConfirmOpen}
                title={t('warning') as string}
                message={editLogic.unknownContextConfirmMessage}
                handleConfirm={editLogic.handleUnknownContextConfirm}
                handleClose={editLogic.handleUnknownContextCancel}
              />
            )}
          </div>
        ) : (
          <div className={`${contentSurfaceClass} relative`}>
            {role === 'assistant' && currentReasoning && (
              <CollapsibleReasoning
                reasoning={currentReasoning}
                isGenerating={isGeneratingMessage}
              />
            )}
            <div className={contentMinHeightClass}>
              <ContentBody
                currentTextContent={currentTextContent}
                markdownMode={markdownMode}
                streamingMarkdownPolicy={streamingMarkdownPolicy}
                inlineLatex={inlineLatex}
                isGeneratingMessage={isGeneratingMessage}
                nodeId={nodeId}
              />
            </div>
            <ContentAttachments images={isEditState ? [] : validImageContents} />
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
              setIsEdit={setIsEdit}
              setIsDelete={setIsDelete}
              onRefresh={handleRefresh}
              onMoveUp={() => handleMove('up')}
              onMoveDown={() => handleMove('down')}
              onCopy={handleCopy}
              onDelete={handleDelete}
              showEvaluateButton={true}
              onEvaluate={handleEvaluate}
            />
            {(() => {
              if (!isEvalModalOpen || !nodeId || !currentChatId) return null;
              const ctx = getEvalContext();
              if (!ctx) return null;
              return (
                <EvaluationModal
                  chatId={currentChatId}
                  nodeId={nodeId}
                  phase={ctx.phase}
                  userText={ctx.userText}
                  assistantText={ctx.assistantText}
                  resolvedProvider={ctx.resolved}
                  model={ctx.model}
                  setIsModalOpen={setIsEvalModalOpen}
                />
              );
            })()}
            {isUnknownContextConfirmOpen && (
              <PopupModal
                setIsModalOpen={setIsUnknownContextConfirmOpen}
                title={t('warning') as string}
                message={unknownContextConfirmMessage}
                handleConfirm={handleUnknownContextConfirm}
                handleClose={handleUnknownContextCancel}
              />
            )}
          </div>
        )}
      </>
    );
  }
);

export default UnifiedMessageView;
