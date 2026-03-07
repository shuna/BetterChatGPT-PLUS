import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { shallow } from 'zustand/shallow';
import useStore from '@store/store';
import ConfigMenu from '@components/ConfigMenu';
import { ChatInterface, ConfigInterface, ImageDetail } from '@type/chat';
import { _defaultChatConfig } from '@constants/chat';
import { ModelOptions } from '@utils/modelReader';
import { cloneChatAtIndex } from '@utils/chatShallowClone';
import { normalizeConfigStream } from '@utils/streamSupport';

const ChatTitle = React.memo(() => {
  const { t } = useTranslation('model');
  const customModels = useStore((state) => state.customModels);
  const favoriteModels = useStore((state) => state.favoriteModels) || [];
  const providers = useStore((state) => state.providers) || {};
  const chat = useStore(
    (state) =>
      state.chats &&
      state.chats.length > 0 &&
      state.currentChatIndex >= 0 &&
      state.currentChatIndex < state.chats.length
        ? state.chats[state.currentChatIndex]
        : undefined,
    shallow
  );
  const setChats = useStore((state) => state.setChats);
  const currentChatIndex = useStore((state) => state.currentChatIndex);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const setConfig = (config: ConfigInterface) => {
    const chats = useStore.getState().chats;
    if (!chats) return;
    const updatedChats = cloneChatAtIndex(chats, currentChatIndex);
    updatedChats[currentChatIndex].config = normalizeConfigStream(config);
    setChats(updatedChats);
  };

  const setImageDetail = (imageDetail: ImageDetail) => {
    const chats = useStore.getState().chats;
    if (!chats) return;
    const updatedChats = cloneChatAtIndex(chats, currentChatIndex);
    updatedChats[currentChatIndex].imageDetail = imageDetail;
    setChats(updatedChats);
  };

  const handleModelChange = (modelId: string) => {
    const chats = useStore.getState().chats;
    if (!chats) return;
    const updatedChats = cloneChatAtIndex(chats, currentChatIndex);
    updatedChats[currentChatIndex].config = normalizeConfigStream({
      ...updatedChats[currentChatIndex].config,
      model: modelId as ModelOptions,
    });
    setChats(updatedChats);
    setIsModelDropdownOpen(false);
  };

  const getModelDisplayName = (modelId: string) => {
    const fav = favoriteModels.find(f => f.modelId === modelId);
    if (fav) {
      return `${modelId} (${providers[fav.providerId]?.name || fav.providerId})`;
    }
    return t('provider.noModelSelected', 'モデル未選択') as string;
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    if (isModelDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isModelDropdownOpen]);

  // for migrating from old ChatInterface to new ChatInterface (with config)
  useEffect(() => {
    const chats = useStore.getState().chats;
    if (chats && chats.length > 0 && currentChatIndex !== -1 && !chat?.config) {
      const updatedChats = cloneChatAtIndex(chats, currentChatIndex);
      updatedChats[currentChatIndex].config = normalizeConfigStream({
        ..._defaultChatConfig,
      });
      setChats(updatedChats);
    }
  }, [currentChatIndex]);

  return chat ? (
    <>
      <div
        className='sticky top-0 z-10 flex gap-x-4 gap-y-1 flex-wrap w-full items-center justify-center border-b border-black/10 bg-gray-50 p-3 dark:border-gray-900/50 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
      >
        {/* Model name: dropdown for direct selection */}
        <div className='relative' ref={dropdownRef}>
          <div
            className='text-center p-1 rounded-md bg-gray-300/20 dark:bg-gray-900/10 hover:bg-gray-300/50 dark:hover:bg-gray-900/50 cursor-pointer flex items-center gap-1'
            onClick={(e) => {
              e.stopPropagation();
              setIsModelDropdownOpen(!isModelDropdownOpen);
            }}
          >
            {t('model')}: {getModelDisplayName(chat.config.model)}
            <svg className='w-3 h-3 ml-1' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 9l-7 7-7-7' />
            </svg>
          </div>
          {isModelDropdownOpen && (
            <div className='absolute top-full left-0 mt-1 min-w-[280px] max-h-[300px] overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg z-50'>
              {favoriteModels.length === 0 ? (
                <div className='px-3 py-2 text-sm text-gray-500'>
                  {t('provider.noModelSelected', 'モデル未選択')}
                </div>
              ) : (
                favoriteModels.map((fav) => (
                  <div
                    key={`${fav.providerId}-${fav.modelId}`}
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      chat.config.model === fav.modelId
                        ? 'bg-gray-100 dark:bg-gray-700 font-medium'
                        : ''
                    }`}
                    onClick={() => handleModelChange(fav.modelId)}
                  >
                    {fav.modelId} ({providers[fav.providerId]?.name || fav.providerId})
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Model options button */}
        <div
          className='text-center p-1 rounded-md bg-gray-300/20 dark:bg-gray-900/10 hover:bg-gray-300/50 dark:hover:bg-gray-900/50 cursor-pointer flex items-center gap-1'
          onClick={() => setIsModalOpen(true)}
        >
          <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4' />
          </svg>
          {t('modelOptions', 'モデルオプション')}
        </div>
      </div>
      {isModalOpen && (
        <ConfigMenu
          setIsModalOpen={setIsModalOpen}
          config={chat.config}
          setConfig={setConfig}
          imageDetail={chat.imageDetail}
          setImageDetail={setImageDetail}
        />
      )}
    </>
  ) : (
    <></>
  );
});

export default ChatTitle;
