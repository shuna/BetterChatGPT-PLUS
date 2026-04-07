import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { shallow } from 'zustand/shallow';
import useStore from '@store/store';
import BranchIcon from '@icon/BranchIcon';
import MenuIcon from '@icon/MenuIcon';
import ConfigMenu from '@components/ConfigMenu';
import { CapabilityIconsInline } from '@components/ConfigMenu/fields';
import { getModelCapabilities, useModelCapabilities } from '@utils/modelLookup';
import { ChatInterface, ChatView, ConfigInterface, ImageDetail, isSplitView } from '@type/chat';
import { _defaultChatConfig } from '@constants/chat';
import { ModelOptions } from '@type/chat';
import type { ProviderId } from '@type/provider';
import { cloneChatAtIndex } from '@utils/chatShallowClone';
import { normalizeConfigStream } from '@utils/streamSupport';
import useIsDesktop from '@hooks/useIsDesktop';
import { CURATED_MODELS } from '@src/local-llm/catalog';
import { localModelRuntime } from '@src/local-llm/runtime';
import { OpfsFileProvider } from '@src/local-llm/storage';

const ChatViewTabs = ({
  activeView,
  setActiveView,
}: {
  activeView: ChatView;
  setActiveView: (view: ChatView) => void;
}) => {
  const { t } = useTranslation('model');
  const { t: tMain } = useTranslation();
  const advancedMode = useStore((state) => state.advancedMode);
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
  const hideSideMenu = useStore((state) => state.hideSideMenu);
  const setHideSideMenu = useStore((state) => state.setHideSideMenu);
  const isDesktop = useIsDesktop();
  const splitPanelSwapped = useStore((state) => state.splitPanelSwapped);
  const setSplitPanelSwapped = useStore((state) => state.setSplitPanelSwapped);
  const branchEditorSyncEnabled = useStore((state) => state.branchEditorSyncEnabled);
  const setBranchEditorSyncEnabled = useStore((state) => state.setBranchEditorSyncEnabled);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState<boolean>(false);
  const [isLayoutDropdownOpen, setIsLayoutDropdownOpen] = useState<boolean>(false);
  const [isCompact, setIsCompact] = useState<boolean>(false);
  const setAllOmitted = useStore((state) => state.setAllOmitted);
  // Derive omit-all state from the current chat's omittedNodeMaps
  const isAllOmitted = useStore((state) => {
    const mapKey = String(state.currentChatIndex);
    const omitted = state.omittedNodeMaps[mapKey] ?? state.chats?.[state.currentChatIndex]?.omittedNodes ?? {};
    const count = Object.keys(omitted).length;
    if (count === 0) return false;
    const chat = state.chats?.[state.currentChatIndex];
    const totalMessages = chat?.branchTree?.activePath?.length ?? chat?.messages?.length ?? 0;
    return totalMessages > 0 && count >= totalMessages;
  });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layoutDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const check = () => {
      // Use a width threshold: if container is narrow, go compact
      setIsCompact(el.clientWidth < 700);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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

  const getModelDisplayName = (modelId: string, modelSource?: 'remote' | 'local') => {
    if (modelSource === 'local') {
      const storeDef = localModels.find((m) => m.id === modelId);
      if (storeDef) return `${storeDef.label} (Local)`;
      const catalogModel = CURATED_MODELS.find((cm) => cm.id === modelId);
      if (catalogModel) return `${catalogModel.label} (Local)`;
      return `${modelId} (Local)`;
    }
    const fav = favoriteModels.find(f => f.modelId === modelId);
    if (fav) {
      return `${modelId} (${providers[fav.providerId]?.name || fav.providerId})`;
    }
    return t('provider.noModelSelected', 'モデル未選択') as string;
  };

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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (layoutDropdownRef.current && !layoutDropdownRef.current.contains(e.target as Node)) {
        setIsLayoutDropdownOpen(false);
      }
    };
    if (isLayoutDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isLayoutDropdownOpen]);

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

  const menuToggleLabel = String(
    hideSideMenu
      ? tMain('showMenu', 'メニューを開く')
      : tMain('hideMenu', 'メニューを閉じる')
  );

  return (
    <>
      <div ref={containerRef} className={`flex items-center border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${isModelDropdownOpen || isLayoutDropdownOpen ? 'z-30' : 'z-10'} px-2 min-h-[40px]`}>
        <div className='flex min-w-0 items-center gap-2'>
          {hideSideMenu && (
            <button
              className='hidden shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-100 p-1.5 text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100 md:inline-flex'
              onClick={() => setHideSideMenu(false)}
              aria-label={menuToggleLabel}
              title={menuToggleLabel}
            >
              <MenuIcon className='h-4 w-4' />
            </button>
          )}

          {/* Left: Model dropdown & options */}
          {advancedMode && chat && (
            <div className='flex min-w-0 items-center gap-2 text-sm text-gray-600 dark:text-gray-300'>
            <div className='relative min-w-0' ref={dropdownRef}>
              <div
                ref={modelRef}
                className='p-1 px-2 rounded-md bg-gray-300/20 dark:bg-gray-900/10 hover:bg-gray-300/50 dark:hover:bg-gray-900/50 cursor-pointer flex items-center gap-1 overflow-hidden'
                onClick={(e) => {
                  e.stopPropagation();
                  setIsModelDropdownOpen(!isModelDropdownOpen);
                }}
              >
                <span className='truncate'>{t('model')}: {getModelDisplayName(chat.config.model, chat.config.modelSource)}</span>
                <CapabilityIconsInline
                  reasoning={getModelCapabilities(chat.config.model, chat.config.providerId, chat.config.modelSource).reasoning}
                  vision={getModelCapabilities(chat.config.model, chat.config.providerId, chat.config.modelSource).vision}
                  audio={getModelCapabilities(chat.config.model, chat.config.providerId, chat.config.modelSource).audio}
                />
                <svg className='w-3 h-3 ml-1' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 9l-7 7-7-7' />
                </svg>
              </div>
              {isModelDropdownOpen && (() => {
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
                <div className='absolute top-full left-0 mt-1 min-w-[280px] max-h-[300px] overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg z-[100]'>
                  {!hasAny ? (
                    <div className='px-3 py-2 text-sm text-gray-500'>
                      {t('provider.noModelSelected', 'モデル未選択')}
                    </div>
                  ) : (
                    <>
                    {favoriteModels.map((fav) => {
                      const caps = getModelCapabilities(fav.modelId, fav.providerId);
                      return (
                        <div
                          key={`${fav.providerId}-${fav.modelId}`}
                          className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center ${
                            chat.config.model === fav.modelId && chat.config.modelSource !== 'local'
                              ? 'bg-gray-100 dark:bg-gray-700 font-medium'
                              : ''
                          }`}
                          onClick={() => handleModelChange(fav.modelId, fav.providerId)}
                        >
                          <span className='truncate flex-1'>{fav.modelId} ({providers[fav.providerId]?.name || fav.providerId})</span>
                          <span className='ml-auto shrink-0'><CapabilityIconsInline reasoning={caps.reasoning} vision={caps.vision} audio={caps.audio} /></span>
                        </div>
                      );
                    })}
                    {localCandidates.length > 0 && favoriteModels.length > 0 && (
                      <div className='border-t border-gray-200 dark:border-gray-600 my-1' />
                    )}
                    {localCandidates.map((lm) => (
                      <div
                        key={`local-${lm.id}`}
                        className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center ${
                          chat.config.model === lm.id && chat.config.modelSource === 'local'
                            ? 'bg-gray-100 dark:bg-gray-700 font-medium'
                            : ''
                        }`}
                        onClick={() => handleModelChange(lm.id, undefined, 'local')}
                      >
                        <span className='truncate flex-1'>{lm.label} (Local)</span>
                      </div>
                    ))}
                    </>
                  )}
                </div>
                );
              })()}
            </div>
            <div
              className='p-1 px-2 rounded-md bg-gray-300/20 dark:bg-gray-900/10 hover:bg-gray-300/50 dark:hover:bg-gray-900/50 cursor-pointer flex items-center gap-1 shrink-0 whitespace-nowrap'
              onClick={() => setIsModalOpen(true)}
            >
              <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4' />
              </svg>
              {!isCompact && tMain('modelOptions')}
            </div>
            <div
              className={`p-1 px-2 rounded-md cursor-pointer flex items-center gap-1 shrink-0 whitespace-nowrap transition-colors ${
                isAllOmitted
                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50'
                  : 'bg-gray-300/20 dark:bg-gray-900/10 hover:bg-gray-300/50 dark:hover:bg-gray-900/50 text-gray-600 dark:text-gray-300'
              }`}
              onClick={() => {
                setAllOmitted(currentChatIndex, !isAllOmitted);
              }}
              title={String(isAllOmitted ? tMain('globalOmitOff') : tMain('globalOmitOn'))}
            >
              <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                <path d='M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94' />
                <path d='M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19' />
                <line x1='1' y1='1' x2='23' y2='23' />
              </svg>
              {!isCompact && tMain(isAllOmitted ? 'globalOmitOff' : 'globalOmitOn')}
            </div>
            </div>
          )}
        </div>

        {/* Right: View tabs + layout selector */}
        <div className='flex ml-auto shrink-0 whitespace-nowrap items-center'>
          {!isSplitView(activeView) && (
            <>
              <button
                className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  activeView === 'chat'
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
                onClick={() => setActiveView('chat')}
              >
                <svg className='w-3.5 h-3.5' stroke='currentColor' fill='none' strokeWidth='2' viewBox='0 0 24 24' strokeLinecap='round' strokeLinejoin='round'>
                  <path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'></path>
                </svg>
                {!isCompact && tMain('chat')}
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  activeView === 'branch-editor'
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
                onClick={() => setActiveView('branch-editor')}
              >
                <BranchIcon className='w-3.5 h-3.5' />
                {!isCompact && tMain('branchEditor')}
              </button>
            </>
          )}
          {isSplitView(activeView) && (
            <span className='px-3 py-2 text-sm text-gray-500 dark:text-gray-400'>
              {activeView === 'split-horizontal' ? tMain('splitHorizontal', 'Left/Right') : tMain('splitVertical', 'Top/Bottom')}
            </span>
          )}
          {isDesktop && (
            <div className='relative' ref={layoutDropdownRef}>
              <button
                className={`p-1.5 ml-1 rounded-md transition-colors ${
                  isLayoutDropdownOpen || isSplitView(activeView)
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                onClick={() => setIsLayoutDropdownOpen(!isLayoutDropdownOpen)}
                title={String(tMain('tabView', 'Layout'))}
              >
                <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2'>
                  <rect x='3' y='3' width='18' height='18' rx='2' />
                  <line x1='12' y1='3' x2='12' y2='21' />
                </svg>
              </button>
              {isLayoutDropdownOpen && (
                <div className='absolute top-full right-0 mt-1 min-w-[160px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg z-[100] py-1'>
                  <button
                    className={`w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      !isSplitView(activeView) ? 'font-medium text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'
                    }`}
                    onClick={() => { setActiveView('chat'); setIsLayoutDropdownOpen(false); }}
                  >
                    <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2'>
                      <rect x='3' y='3' width='18' height='18' rx='2' />
                    </svg>
                    {tMain('tabView', 'Tab View')}
                  </button>
                  <button
                    className={`w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      activeView === 'split-horizontal' ? 'font-medium text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'
                    }`}
                    onClick={() => { setActiveView('split-horizontal'); setIsLayoutDropdownOpen(false); }}
                  >
                    <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2'>
                      <rect x='3' y='3' width='18' height='18' rx='2' />
                      <line x1='12' y1='3' x2='12' y2='21' />
                    </svg>
                    {tMain('splitHorizontal', 'Left/Right')}
                  </button>
                  <button
                    className={`w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      activeView === 'split-vertical' ? 'font-medium text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'
                    }`}
                    onClick={() => { setActiveView('split-vertical'); setIsLayoutDropdownOpen(false); }}
                  >
                    <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2'>
                      <rect x='3' y='3' width='18' height='18' rx='2' />
                      <line x1='3' y1='12' x2='21' y2='12' />
                    </svg>
                    {tMain('splitVertical', 'Top/Bottom')}
                  </button>
                  {isSplitView(activeView) && (
                    <>
                      <div className='my-1 border-t border-gray-200 dark:border-gray-600' />
                      <button
                        className='w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                        onClick={() => { setSplitPanelSwapped(!splitPanelSwapped); setIsLayoutDropdownOpen(false); }}
                      >
                        <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                          <path d='M7 16l-4-4 4-4' />
                          <path d='M17 8l4 4-4 4' />
                          <line x1='3' y1='12' x2='21' y2='12' />
                        </svg>
                        {tMain('swapPanels', 'Swap Panels')}
                      </button>
                      <div className='my-1 border-t border-gray-200 dark:border-gray-600' />
                      <button
                        className={`w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          branchEditorSyncEnabled ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'
                        }`}
                        onClick={() => { setBranchEditorSyncEnabled(!branchEditorSyncEnabled); setIsLayoutDropdownOpen(false); }}
                      >
                        <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                          <path d='M8 7h12M8 12h12M8 17h12' />
                          <path d='M4 7h0M4 12h0M4 17h0' />
                        </svg>
                        {branchEditorSyncEnabled ? tMain('syncEnabled', 'リンク: ON') : tMain('syncDisabled', 'リンク: OFF')}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {isModalOpen && chat && (
        <ConfigMenu
          setIsModalOpen={setIsModalOpen}
          config={chat.config}
          setConfig={setConfig}
          imageDetail={chat.imageDetail}
          setImageDetail={setImageDetail}
        />
      )}
    </>
  );
};

export default ChatViewTabs;
