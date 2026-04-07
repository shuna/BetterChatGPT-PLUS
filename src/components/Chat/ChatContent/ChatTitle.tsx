import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { shallow } from 'zustand/shallow';
import useStore from '@store/store';
import ConfigMenu from '@components/ConfigMenu';
import { ChatInterface, ConfigInterface, ImageDetail } from '@type/chat';
import { _defaultChatConfig } from '@constants/chat';
import { ModelOptions } from '@type/chat';
import type { ProviderId } from '@type/provider';
import { cloneChatAtIndex } from '@utils/chatShallowClone';
import { normalizeConfigStream } from '@utils/streamSupport';
import { CURATED_MODELS } from '@src/local-llm/catalog';
import { localModelRuntime } from '@src/local-llm/runtime';
import { OpfsFileProvider } from '@src/local-llm/storage';

const ChatTitle = React.memo(() => {
  const { t } = useTranslation('model');
  const favoriteModels = useStore((state) => state.favoriteModels) || [];
  const providers = useStore((state) => state.providers) || {};
  const localModels = useStore((state) => state.localModels) || [];
  const favoriteLocalIds = useStore((state) => state.favoriteLocalModelIds) || [];
  const savedMeta = useStore((state) => state.savedModelMeta) || {};
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

  const setChatSystemPrompt = useStore((state) => state.setChatSystemPrompt);
  const setConfig = (config: ConfigInterface) => {
    const chats = useStore.getState().chats;
    if (!chats) return;
    const prevSystemPrompt = chats[currentChatIndex]?.config?.systemPrompt;
    const updatedChats = cloneChatAtIndex(chats, currentChatIndex);
    updatedChats[currentChatIndex].config = normalizeConfigStream(config);
    setChats(updatedChats);
    // If system prompt changed, trigger bubble sync
    if ((config.systemPrompt ?? '') !== (prevSystemPrompt ?? '')) {
      setChatSystemPrompt(currentChatIndex, config.systemPrompt ?? '');
    }
  };

  const setImageDetail = (imageDetail: ImageDetail) => {
    const chats = useStore.getState().chats;
    if (!chats) return;
    const updatedChats = cloneChatAtIndex(chats, currentChatIndex);
    updatedChats[currentChatIndex].imageDetail = imageDetail;
    setChats(updatedChats);
  };

  const handleModelChange = (modelId: string, providerId?: ProviderId, modelSource?: 'remote' | 'local') => {
    const chats = useStore.getState().chats;
    if (!chats) return;
    const updatedChats = cloneChatAtIndex(chats, currentChatIndex);
    updatedChats[currentChatIndex].config = normalizeConfigStream({
      ...updatedChats[currentChatIndex].config,
      model: modelId as ModelOptions,
      providerId,
      modelSource,
    });
    setChats(updatedChats);
    setIsModelDropdownOpen(false);

    // Auto-load local model if not already loaded
    if (modelSource === 'local' && !localModelRuntime.isLoaded(modelId)) {
      const catalogModel = CURATED_MODELS.find((cm) => cm.id === modelId);
      const storeDef = localModels.find((m) => m.id === modelId);
      if (catalogModel) {
        const provider = new OpfsFileProvider(catalogModel.id, catalogModel.manifest);
        localModelRuntime.loadModel(
          {
            id: catalogModel.id,
            engine: catalogModel.engine,
            tasks: catalogModel.tasks,
            label: catalogModel.label,
            origin: catalogModel.huggingFaceRepo,
            source: 'opfs',
            manifest: catalogModel.manifest,
          },
          provider,
        ).catch(() => {});
      } else if (storeDef?.source === 'opfs' && storeDef.manifest) {
        const provider = new OpfsFileProvider(storeDef.id, storeDef.manifest);
        localModelRuntime.loadModel(storeDef, provider).catch(() => {});
      }
    }
  };

  const getModelDisplayName = (modelId: string, providerId?: ProviderId, modelSource?: 'remote' | 'local') => {
    if (modelSource === 'local') {
      const storeDef = localModels.find((m) => m.id === modelId);
      if (storeDef) return `${storeDef.label} (Local)`;
      const catalogModel = CURATED_MODELS.find((cm) => cm.id === modelId);
      if (catalogModel) return `${catalogModel.label} (Local)`;
      return `${modelId} (Local)`;
    }
    const fav = providerId
      ? favoriteModels.find((f) => f.modelId === modelId && f.providerId === providerId)
      : favoriteModels.find((f) => f.modelId === modelId);
    if (fav) {
      return `${modelId} (${providers[fav.providerId]?.name || fav.providerId})`;
    }
    if (providerId) {
      return `${modelId} (${providers[providerId]?.name || providerId})`;
    }
    return modelId || (t('provider.noModelSelected', 'モデル未選択') as string);
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
            {t('model')}: {getModelDisplayName(chat.config.model, chat.config.providerId, chat.config.modelSource)}
            <svg className='w-3 h-3 ml-1' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 9l-7 7-7-7' />
            </svg>
          </div>
          {isModelDropdownOpen && (() => {
            // Build local model candidates (favorited + saved)
            const localCandidates: { id: string; label: string }[] = [];
            const seenLocal = new Set<string>();
            for (const m of localModels) {
              if (favoriteLocalIds.includes(m.id) && savedMeta[m.id]?.storageState === 'saved') {
                seenLocal.add(m.id);
                localCandidates.push({ id: m.id, label: m.label });
              }
            }
            for (const cm of CURATED_MODELS) {
              if (!seenLocal.has(cm.id) && favoriteLocalIds.includes(cm.id) && savedMeta[cm.id]?.storageState === 'saved') {
                localCandidates.push({ id: cm.id, label: cm.label });
              }
            }
            const hasAny = favoriteModels.length > 0 || localCandidates.length > 0;

            return (
            <div className='absolute top-full left-0 mt-1 min-w-[280px] max-h-[300px] overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg z-50'>
              {!hasAny ? (
                <div className='px-3 py-2 text-sm text-gray-500'>
                  {t('provider.noModelSelected', 'モデル未選択')}
                </div>
              ) : (
                <>
                  {favoriteModels.map((fav) => (
                    <div
                      key={`${fav.providerId}-${fav.modelId}`}
                      className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        chat.config.model === fav.modelId && chat.config.providerId === fav.providerId && chat.config.modelSource !== 'local'
                          ? 'bg-gray-100 dark:bg-gray-700 font-medium'
                          : ''
                      }`}
                      onClick={() => handleModelChange(fav.modelId, fav.providerId)}
                    >
                      {fav.modelId} ({providers[fav.providerId]?.name || fav.providerId})
                    </div>
                  ))}
                  {localCandidates.length > 0 && favoriteModels.length > 0 && (
                    <div className='border-t border-gray-200 dark:border-gray-600 my-1' />
                  )}
                  {localCandidates.map((lm) => (
                    <div
                      key={`local-${lm.id}`}
                      className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        chat.config.model === lm.id && chat.config.modelSource === 'local'
                          ? 'bg-gray-100 dark:bg-gray-700 font-medium'
                          : ''
                      }`}
                      onClick={() => handleModelChange(lm.id, undefined, 'local')}
                    >
                      {lm.label} (Local)
                    </div>
                  ))}
                </>
              )}
            </div>
            );
          })()}
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
