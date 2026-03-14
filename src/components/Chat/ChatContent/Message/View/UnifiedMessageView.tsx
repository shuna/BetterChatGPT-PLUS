import React, { memo, useState } from 'react';
import useStore from '@store/store';
import useSubmit from '@hooks/useSubmit';
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
import PopupModal from '@components/PopupModal';
import { useTranslation } from 'react-i18next';
import { useModelType } from '@utils/modelLookup';
import { TextContentInterface } from '@type/chat';

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
    const { t } = useTranslation();
    const { handleSubmit, handleSubmitMidChat } = useSubmit();
    const [isDelete, setIsDelete] = useState(false);

    const currentChatIndex = useStore((state) => state.currentChatIndex);
    const removeMessageAtIndex = useStore((state) => state.removeMessageAtIndex);
    const moveMessage = useStore((state) => state.moveMessage);
    const lastMessageIndex = useStore((state) =>
      state.chats ? state.chats[state.currentChatIndex].messages.length - 1 : 0
    );
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

    const currentTextContent = isTextContent(content[0]) ? content[0].text : '';
    const handleCopy = () => {
      navigator.clipboard.writeText(currentTextContent);
    };
    const validImageContents = Array.isArray(content)
      ? (content.slice(1).filter(isImageContent) as ImageContentInterface[])
      : [];

    // Determine displayed value: draft when editing, saved content when viewing
    const displayValue = isEditState
      ? (editLogic._content[0] as TextContentInterface).text
      : currentTextContent;

    return (
      <>
        <OverTypeEditor
          value={displayValue}
          mode={isEditState ? 'edit' : 'preview'}
          onChange={
            isEditState
              ? (val) => {
                  editLogic._setContent((prev) => [
                    { type: 'text', text: val },
                    ...prev.slice(1),
                  ]);
                }
              : undefined
          }
          onKeyDown={isEditState ? (e) => {
            // Convert native KeyboardEvent to React-compatible format for handleKeyDown
            editLogic.handleKeyDown(e as unknown as React.KeyboardEvent<HTMLTextAreaElement>);
          } : undefined}
          onPaste={isEditState ? (e) => {
            editLogic.handlePaste(e as unknown as React.ClipboardEvent<HTMLTextAreaElement>);
          } : undefined}
          autoFocus={isEditState}
        />
        <ContentAttachments images={isEditState ? [] : validImageContents} />
        <div className='min-h-[68px] mt-3 flex items-end'>
        {isEditState ? (
          <>
            <EditViewButtons
              sticky={false}
              handleFileChange={editLogic.handleFileChange}
              handleImageDetailChange={editLogic.handleImageDetailChange}
              handleRemoveImage={editLogic.handleRemoveImage}
              handleGenerate={editLogic.handleGenerate}
              handleGenerateNextOnly={editLogic.handleGenerateNextOnly}
              handleSave={editLogic.handleSave}
              handleCancel={editLogic.handleCancel}
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
          </>
        ) : (
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
            onMoveUp={() => handleMove('up')}
            onMoveDown={() => handleMove('down')}
            onCopy={handleCopy}
            onDelete={handleDelete}
          />
        )}
        </div>
      </>
    );
  }
);

export default UnifiedMessageView;
