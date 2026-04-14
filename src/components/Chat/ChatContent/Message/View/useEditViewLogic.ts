import React, { useEffect, useMemo, useState, useRef } from 'react';
import useStore from '@store/store';
import useSubmit from '@hooks/useSubmit';
import {
  ContentInterface,
  ImageContentInterface,
  TextContentInterface,
  isImageContent,
} from '@type/chat';
import { defaultModel } from '@constants/chat';
import { isKnownModel } from '@utils/modelLookup';
import { hasMeaningfulContent } from '@utils/contentValidation';
import { showToast } from '@utils/showToast';
import i18next from 'i18next';

function isChatBusy(): boolean {
  const state = useStore.getState();
  const chatId = state.chats?.[state.currentChatIndex]?.id ?? '';
  return Object.values(state.generatingSessions).some((s) => s.chatId === chatId);
}

function isNodeBusy(nodeId?: string): boolean {
  if (!nodeId) return false;
  const state = useStore.getState();
  const chat = state.chats?.[state.currentChatIndex];
  const chatId = chat?.id ?? '';
  return Object.values(state.generatingSessions).some(
    (s) => s.chatId === chatId && s.targetNodeId === nodeId
  );
}

function isNodeProtected(nodeId: string | undefined, messageIndex: number): boolean {
  const state = useStore.getState();
  const chatIndex = state.currentChatIndex;
  const chat = state.chats?.[chatIndex];
  const resolvedNodeId = nodeId ?? chat?.branchTree?.activePath?.[messageIndex] ?? String(messageIndex);
  const protectedNodes =
    state.protectedNodeMaps[String(chatIndex)] ?? chat?.protectedNodes ?? {};
  return protectedNodes[resolvedNodeId] ?? false;
}

function hasProtectedFollowingNodes(messageIndex: number): boolean {
  const state = useStore.getState();
  const chatIndex = state.currentChatIndex;
  const chat = state.chats?.[chatIndex];
  if (!chat) return false;
  const protectedNodes =
    state.protectedNodeMaps[String(chatIndex)] ?? chat.protectedNodes ?? {};
  if (!protectedNodes || Object.keys(protectedNodes).length === 0) return false;
  const totalMessages = chat.messages.length;
  for (let i = messageIndex + 1; i < totalMessages; i++) {
    const nid = chat.branchTree?.activePath?.[i] ?? String(i);
    if (protectedNodes[nid]) return true;
  }
  return false;
}

function resolveMessageIndex(nodeId: string | undefined, fallbackIndex: number): number {
  if (!nodeId) return fallbackIndex;
  const activePath =
    useStore.getState().chats?.[useStore.getState().currentChatIndex]?.branchTree?.activePath;
  const resolvedIndex = activePath?.indexOf(nodeId) ?? -1;
  return resolvedIndex >= 0 ? resolvedIndex : fallbackIndex;
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });

const editDraftCache = new Map<string, ContentInterface[]>();

const cloneContent = (content: ContentInterface[]): ContentInterface[] =>
  content.map((item) =>
    item.type === 'image_url'
      ? { ...item, image_url: { ...item.image_url } }
      : { ...item }
  );

export function useEditViewLogic({
  content,
  setIsEdit,
  messageIndex,
  nodeId,
  sticky,
  editSessionKey,
}: {
  content: ContentInterface[];
  setIsEdit: React.Dispatch<React.SetStateAction<boolean>>;
  messageIndex: number;
  nodeId?: string;
  sticky?: boolean;
  editSessionKey: string;
}) {
  const inputRole = useStore((state) => state.inputRole);
  const appendNodeToActivePath = useStore((state) => state.appendNodeToActivePath);
  const replaceMessageAndPruneFollowing = useStore((state) => state.replaceMessageAndPruneFollowing);
  const upsertWithAutoBranch = useStore((state) => state.upsertWithAutoBranch);
  const currentChatIndex = useStore((state) => state.currentChatIndex);
  const { model, providerId, modelSource } = useStore((state) => {
    const { chats, currentChatIndex: idx } = state;
    const config =
      chats && chats.length > 0 && idx >= 0 && idx < chats.length
        ? chats[idx].config
        : undefined;
    return {
      model: config?.model ?? defaultModel,
      providerId: config?.providerId,
      modelSource: config?.modelSource,
    };
  });
  const favoriteModels = useStore((state) => state.favoriteModels) || [];
  const currentChatId = useStore((state) => state.chats?.[state.currentChatIndex]?.id ?? '');
  const isGeneratingMessage = useStore((state) =>
    !!nodeId &&
    Object.values(state.generatingSessions).some(
      (session) => session.chatId === currentChatId && session.targetNodeId === nodeId
    )
  );
  const modelValid = !!model && (
    modelSource === 'local' ||
    favoriteModels.some((f) =>
      f.modelId === model && (providerId ? f.providerId === providerId : true)
    ) || isKnownModel(model)
  );

  const [_content, setContentState] = useState<ContentInterface[]>(
    () => cloneContent(editDraftCache.get(editSessionKey) ?? content)
  );
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [imageUrl, setImageUrl] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync _content with content prop when it changes and no draft exists.
  // This handles desync when a mid-chat insert causes activePath and
  // messagesLimited to temporarily diverge during async token limiting.
  useEffect(() => {
    if (!editDraftCache.has(editSessionKey)) {
      setContentState(cloneContent(content));
    }
  }, [content, editSessionKey]);
  const _setContent = React.useCallback<React.Dispatch<React.SetStateAction<ContentInterface[]>>>(
    (value) => {
      setContentState((previous) => {
        const nextValue = typeof value === 'function' ? value(previous) : value;
        const cloned = cloneContent(nextValue);
        editDraftCache.set(editSessionKey, cloned);
        return cloned;
      });
    },
    [editSessionKey]
  );
  const clearDraft = React.useCallback(() => {
    editDraftCache.delete(editSessionKey);
  }, [editSessionKey]);

  const {
    handleSubmit,
    handleSubmitMidChat,
    isUnknownContextConfirmOpen,
    setIsUnknownContextConfirmOpen,
    unknownContextConfirmMessage,
    handleUnknownContextConfirm,
    handleUnknownContextCancel,
  } = useSubmit();

  const resetTextAreaHeight = () => {
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|playbook|silk/i.test(
        navigator.userAgent
      );
    const isComposing = (e as any).nativeEvent?.isComposing ?? (e as any).isComposing ?? false;
    if (e.key === 'Enter' && !isMobile && !isComposing) {
      const enterToSubmit = useStore.getState().enterToSubmit;
      if (e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        handleGenerate();
        resetTextAreaHeight();
      } else if (
        (enterToSubmit && !e.shiftKey) ||
        (!enterToSubmit && (e.ctrlKey || e.shiftKey))
      ) {
        if (sticky) {
          e.preventDefault();
          handleGenerate();
          resetTextAreaHeight();
        } else {
          handleSave();
        }
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const chat = useStore.getState().chats![currentChatIndex];
    const files = e.target.files!;
    const newImageURLs = Array.from(files).map((file: Blob) =>
      URL.createObjectURL(file)
    );
    const newImages = await Promise.all(
      newImageURLs.map(async (url) => {
        const blob = await fetch(url).then((r) => r.blob());
        return {
          type: 'image_url',
          image_url: {
            detail: chat.imageDetail,
            url: await blobToBase64(blob),
          },
        } as ImageContentInterface;
      })
    );
    _setContent((prev) => [...prev, ...newImages]);
  };

  const handleImageUrlChange = () => {
    if (imageUrl.trim() === '') return;
    const chat = useStore.getState().chats![currentChatIndex];
    const newImage: ImageContentInterface = {
      type: 'image_url',
      image_url: { detail: chat.imageDetail, url: imageUrl },
    };
    _setContent((prev) => [...prev, newImage]);
    setImageUrl('');
  };

  const handleImageDetailChange = (index: number, detail: string) => {
    const updatedImages = [..._content];
    const image = updatedImages[index + 1];
    if (!isImageContent(image)) return;
    image.image_url.detail = detail as ImageContentInterface['image_url']['detail'];
    _setContent(updatedImages);
  };

  const handleRemoveImage = (index: number) => {
    const updatedImages = [..._content];
    updatedImages.splice(index + 1, 1);
    _setContent(updatedImages);
  };

  const handleSave = () => {
    const hasSubmittableContent = hasMeaningfulContent(_content);
    if (sticky && !hasSubmittableContent) return;
    if (!sticky && isNodeBusy(nodeId)) return;
    if (!sticky && isNodeProtected(nodeId, messageIndex)) {
      showToast(i18next.t('protectedCannotEdit', { ns: 'main' }), 'warning');
      return;
    }

    const resolvedMessageIndex = resolveMessageIndex(nodeId, messageIndex);

    if (sticky) {
      appendNodeToActivePath(currentChatIndex, inputRole, _content);
      _setContent([{ type: 'text', text: '' } as TextContentInterface]);
      clearDraft();
      resetTextAreaHeight();
    } else {
      upsertWithAutoBranch(
        currentChatIndex,
        resolvedMessageIndex,
        useStore.getState().chats![currentChatIndex].messages[resolvedMessageIndex].role,
        _content
      );
      clearDraft();
      setIsEdit(false);
    }
  };

  const handleBranchOnly = () => {
    if (sticky || isNodeBusy(nodeId)) return;
    const { ensureBranchTree, createBranch } = useStore.getState();
    ensureBranchTree(currentChatIndex);
    const activeNodeId =
      nodeId ??
      useStore.getState().chats![currentChatIndex].branchTree!.activePath[
        resolveMessageIndex(nodeId, messageIndex)
      ];
    if (!activeNodeId) return;
    createBranch(currentChatIndex, activeNodeId, _content);
    clearDraft();
    setIsEdit(false);
  };

  const handleBranchGenerate = () => {
    if (isChatBusy() || !modelValid || sticky || isNodeBusy(nodeId)) return;
    const { ensureBranchTree, createBranch } = useStore.getState();
    ensureBranchTree(currentChatIndex);
    const activeNodeId =
      nodeId ??
      useStore.getState().chats![currentChatIndex].branchTree!.activePath[
        resolveMessageIndex(nodeId, messageIndex)
      ];
    if (!activeNodeId) return;
    createBranch(currentChatIndex, activeNodeId, _content);
    clearDraft();
    setIsEdit(false);
    handleSubmit();
  };

  const handleGenerateNextOnly = () => {
    if (isChatBusy() || !modelValid) return;
    if (isNodeProtected(nodeId, messageIndex)) {
      showToast(i18next.t('protectedCannotEdit', { ns: 'main' }), 'warning');
      return;
    }
    const resolvedMessageIndex = resolveMessageIndex(nodeId, messageIndex);
    const nextIndex = resolvedMessageIndex + 1;
    const chats = useStore.getState().chats!;
    const removeCount = nextIndex < chats[currentChatIndex].messages.length ? 1 : 0;
    // Only block if the immediately next node is protected
    if (removeCount > 0) {
      const nextNodeId = chats[currentChatIndex].branchTree?.activePath?.[nextIndex] ?? String(nextIndex);
      if (isNodeProtected(nextNodeId, nextIndex)) {
        showToast(i18next.t('protectedCannotDelete', { ns: 'main' }), 'warning');
        return;
      }
    }
    replaceMessageAndPruneFollowing(
      currentChatIndex,
      resolvedMessageIndex,
      chats[currentChatIndex].messages[resolvedMessageIndex].role,
      _content,
      removeCount
    );
    clearDraft();
    setIsEdit(false);
    handleSubmitMidChat(nextIndex);
  };

  const handleGenerate = () => {
    const hasSubmittableContent = hasMeaningfulContent(_content);
    if (isChatBusy() || !modelValid) return;
    if (sticky && !hasSubmittableContent) return;
    if (!sticky && isNodeProtected(nodeId, messageIndex)) {
      showToast(i18next.t('protectedCannotEdit', { ns: 'main' }), 'warning');
      return;
    }

    if (sticky) {
      if (hasSubmittableContent) {
        appendNodeToActivePath(currentChatIndex, inputRole, _content);
      }
      _setContent([{ type: 'text', text: '' } as TextContentInterface]);
      clearDraft();
      resetTextAreaHeight();
    } else {
      const resolvedMessageIndex = resolveMessageIndex(nodeId, messageIndex);
      const chats = useStore.getState().chats!;
      const removeCount = Math.max(
        0,
        chats[currentChatIndex].messages.length - (resolvedMessageIndex + 1)
      );
      if (removeCount > 0 && hasProtectedFollowingNodes(resolvedMessageIndex)) {
        showToast(i18next.t('protectedPruneStopped', { ns: 'main' }), 'warning');
        return;
      }
      replaceMessageAndPruneFollowing(
        currentChatIndex,
        resolvedMessageIndex,
        chats[currentChatIndex].messages[resolvedMessageIndex].role,
        _content,
        removeCount
      );
      clearDraft();
      setIsEdit(false);
    }
    handleSubmit();
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    const chat = useStore.getState().chats![currentChatIndex];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          const base64Image = await blobToBase64(blob);
          const newImage: ImageContentInterface = {
            type: 'image_url',
            image_url: { detail: chat.imageDetail, url: base64Image },
          };
          _setContent((prev) => [...prev, newImage]);
        }
      }
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [(_content[0] as TextContentInterface)?.text]);

  const handleUploadButtonClick = () => {
    (fileInputRef.current as HTMLInputElement)?.click();
  };

  const handleCancel = () => {
    clearDraft();
    setIsEdit(false);
  };

  const contentChanged = useMemo(() => {
    const normalize = (c: ContentInterface[]) =>
      c.filter((item) => !(item.type === 'text' && (item as TextContentInterface).text === ''));
    const a = normalize(_content);
    const b = normalize(content);
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) {
      const ai = a[i], bi = b[i];
      if (ai.type !== bi.type) return true;
      if (ai.type === 'text' && bi.type === 'text' &&
        (ai as TextContentInterface).text !== (bi as TextContentInterface).text) return true;
      if (ai.type === 'image_url' && bi.type === 'image_url' &&
        (ai as ImageContentInterface).image_url.url !== (bi as ImageContentInterface).image_url.url) return true;
    }
    return false;
  }, [_content, content]);

  return {
    model,
    providerId,
    modelValid,
    isGeneratingMessage,
    currentChatIndex,
    _content,
    contentChanged,
    _setContent,
    isModalOpen,
    setIsModalOpen,
    imageUrl,
    setImageUrl,
    textareaRef,
    fileInputRef,
    handleKeyDown,
    handleFileChange,
    handleImageUrlChange,
    handleImageDetailChange,
    handleRemoveImage,
    handleSave,
    handleBranchOnly,
    handleBranchGenerate,
    handleGenerateNextOnly,
    handleGenerate,
    generateBelowDisabled: !sticky && hasProtectedFollowingNodes(messageIndex),
    handleCancel,
    handlePaste,
    handleUploadButtonClick,
    isUnknownContextConfirmOpen,
    setIsUnknownContextConfirmOpen,
    unknownContextConfirmMessage,
    handleUnknownContextConfirm,
    handleUnknownContextCancel,
  };
}
