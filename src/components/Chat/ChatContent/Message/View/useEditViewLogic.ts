import React, { useEffect, useState, useRef } from 'react';
import useStore from '@store/store';
import useSubmit from '@hooks/useSubmit';
import {
  ContentInterface,
  ImageContentInterface,
  TextContentInterface,
  isImageContent,
} from '@type/chat';
import {
  truncateActivePathAfterIndex,
  upsertActivePathMessage,
} from '@utils/branchUtils';
import { defaultModel } from '@constants/chat';

function isChatBusy(): boolean {
  const state = useStore.getState();
  const chatId = state.chats?.[state.currentChatIndex]?.id ?? '';
  return Object.values(state.generatingSessions).some((s) => s.chatId === chatId);
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });

export function useEditViewLogic({
  content,
  setIsEdit,
  messageIndex,
  sticky,
}: {
  content: ContentInterface[];
  setIsEdit: React.Dispatch<React.SetStateAction<boolean>>;
  messageIndex: number;
  sticky?: boolean;
}) {
  const setCurrentChatIndex = useStore((state) => state.setCurrentChatIndex);
  const inputRole = useStore((state) => state.inputRole);
  const setChats = useStore((state) => state.setChats);
  var currentChatIndex = useStore((state) => state.currentChatIndex);
  const { model, providerId } = useStore((state) => {
    const isInitialised =
      state.chats &&
      state.chats.length > 0 &&
      state.currentChatIndex >= 0 &&
      state.currentChatIndex < state.chats.length;
    if (!isInitialised) {
      currentChatIndex = 0;
      setCurrentChatIndex(0);
    }
    const config = isInitialised
      ? state.chats![state.currentChatIndex].config
      : undefined;
    return {
      model: config?.model ?? defaultModel,
      providerId: config?.providerId,
    };
  });
  const favoriteModels = useStore((state) => state.favoriteModels) || [];
  const modelValid = !!model && favoriteModels.some((f) =>
    f.modelId === model && (providerId ? f.providerId === providerId : true)
  );

  const [_content, _setContent] = useState<ContentInterface[]>(content);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [imageUrl, setImageUrl] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { handleSubmit, handleSubmitMidChat } = useSubmit();

  const resetTextAreaHeight = () => {
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|playbook|silk/i.test(
        navigator.userAgent
      );
    if (e.key === 'Enter' && !isMobile && !e.nativeEvent.isComposing) {
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
    const hasTextContent = (_content[0] as TextContentInterface).text !== '';
    const hasImageContent = Array.isArray(_content) && _content.some(
      (c) => c.type === 'image_url'
    );
    if (sticky && ((!hasTextContent && !hasImageContent) || isChatBusy())) return;

    const chats = useStore.getState().chats!;
    const updatedChats = chats.slice();
    const chat = { ...chats[currentChatIndex], messages: [...chats[currentChatIndex].messages] };
    updatedChats[currentChatIndex] = chat;

    if (sticky) {
      const newMessage = { role: inputRole, content: _content };
      chat.messages.push(newMessage);
      upsertActivePathMessage(chat, chat.messages.length - 1, newMessage, useStore.getState().contentStore);
      _setContent([{ type: 'text', text: '' } as TextContentInterface]);
      resetTextAreaHeight();
    } else {
      chat.messages[messageIndex] = { ...chat.messages[messageIndex], content: _content };
      upsertActivePathMessage(chat, messageIndex, chat.messages[messageIndex], useStore.getState().contentStore);
      setIsEdit(false);
    }
    setChats(updatedChats);
  };

  const handleBranchOnly = () => {
    if (isChatBusy() || sticky) return;
    const { ensureBranchTree, createBranch } = useStore.getState();
    ensureBranchTree(currentChatIndex);
    const tree = useStore.getState().chats![currentChatIndex].branchTree!;
    const nodeId = tree.activePath[messageIndex];
    if (!nodeId) return;
    createBranch(currentChatIndex, nodeId, _content);
    setIsEdit(false);
  };

  const handleBranchGenerate = () => {
    if (isChatBusy() || !modelValid || sticky) return;
    const { ensureBranchTree, createBranch } = useStore.getState();
    ensureBranchTree(currentChatIndex);
    const tree = useStore.getState().chats![currentChatIndex].branchTree!;
    const nodeId = tree.activePath[messageIndex];
    if (!nodeId) return;
    createBranch(currentChatIndex, nodeId, _content);
    setIsEdit(false);
    handleSubmit();
  };

  const handleGenerateNextOnly = () => {
    if (isChatBusy() || !modelValid) return;
    const chats = useStore.getState().chats!;
    const updatedChats = chats.slice();
    const chat = { ...chats[currentChatIndex], messages: [...chats[currentChatIndex].messages] };
    updatedChats[currentChatIndex] = chat;
    chat.messages[messageIndex] = { ...chat.messages[messageIndex], content: _content };
    upsertActivePathMessage(chat, messageIndex, chat.messages[messageIndex], useStore.getState().contentStore);
    const nextIndex = messageIndex + 1;
    if (nextIndex < chat.messages.length) {
      chat.messages.splice(nextIndex, 1);
    }
    setIsEdit(false);
    setChats(updatedChats);
    handleSubmitMidChat(nextIndex);
  };

  const handleGenerate = () => {
    const hasTextContent = (_content[0] as TextContentInterface).text !== '';
    const hasImageContent = Array.isArray(_content) && _content.some(
      (c) => c.type === 'image_url'
    );
    if (isChatBusy() || !modelValid) return;

    const chats = useStore.getState().chats!;
    const updatedChats = chats.slice();
    const chat = { ...chats[currentChatIndex], messages: [...chats[currentChatIndex].messages] };
    updatedChats[currentChatIndex] = chat;

    if (sticky) {
      if (hasTextContent || hasImageContent) {
        const newMessage = { role: inputRole, content: _content };
        chat.messages.push(newMessage);
        upsertActivePathMessage(chat, chat.messages.length - 1, newMessage, useStore.getState().contentStore);
      }
      _setContent([{ type: 'text', text: '' } as TextContentInterface]);
      resetTextAreaHeight();
    } else {
      chat.messages[messageIndex] = { ...chat.messages[messageIndex], content: _content };
      upsertActivePathMessage(chat, messageIndex, chat.messages[messageIndex], useStore.getState().contentStore);
      chat.messages = chat.messages.slice(0, messageIndex + 1);
      truncateActivePathAfterIndex(chat, messageIndex);
      setIsEdit(false);
    }
    setChats(updatedChats);
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
  }, [(_content[0] as TextContentInterface).text]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, []);

  const handleUploadButtonClick = () => {
    (fileInputRef.current as HTMLInputElement)?.click();
  };

  return {
    model,
    providerId,
    modelValid,
    currentChatIndex,
    _content,
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
    handlePaste,
    handleUploadButtonClick,
  };
}
