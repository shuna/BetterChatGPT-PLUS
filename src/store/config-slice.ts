import { StoreSlice } from './store';
import { Theme } from '@type/theme';
import { _defaultChatConfig, _defaultSystemMessage,_defaultMenuWidth, defaultModel, _defaultImageDetail, _defaultDisplayChatSize } from '@constants/chat';
import { ConfigInterface, ImageDetail, StreamingMarkdownPolicy, TotalTokenUsed } from '@type/chat';
import { ModelOptions } from '@type/chat';
import type { ProviderId } from '@type/provider';
import { normalizeConfigStream } from '@utils/streamSupport';
import { STORE_VERSION } from './version';

const isSameConfig = (
  left: ConfigInterface,
  right: ConfigInterface
) =>
  left.model === right.model &&
  left.max_tokens === right.max_tokens &&
  left.temperature === right.temperature &&
  left.presence_penalty === right.presence_penalty &&
  left.top_p === right.top_p &&
  left.frequency_penalty === right.frequency_penalty &&
  (left.stream !== false) === (right.stream !== false);

export interface ConfigSlice {
  openConfig: boolean;
  theme: Theme;
  autoTitle: boolean;
  titleModel: ModelOptions;
  titleProviderId?: ProviderId;
  hideMenuOptions: boolean;
  advancedMode: boolean;
  defaultChatConfig: ConfigInterface;
  defaultSystemMessage: string;
  hideSideMenu: boolean;
  enterToSubmit: boolean;
  inlineLatex: boolean;
  markdownMode: boolean;
  streamingMarkdownPolicy: StreamingMarkdownPolicy;
  countTotalTokens: boolean;
  totalTokenUsed: TotalTokenUsed;
  menuWidth: number;
  displayChatSize: boolean;
  defaultImageDetail: ImageDetail;
  autoScroll: boolean;
  hideShareGPT: boolean;
  onboardingCompleted: number | false; // false = not completed, number = store version when completed
  setOnboardingCompleted: (completed: boolean) => void;
  setOpenConfig: (openConfig: boolean) => void;
  setTheme: (theme: Theme) => void;
  setAutoTitle: (autoTitle: boolean) => void;
  setTitleModel: (titleModel: ModelOptions, titleProviderId?: ProviderId) => void;
  setAdvancedMode: (advancedMode: boolean) => void;
  setDefaultChatConfig: (defaultChatConfig: ConfigInterface) => void;
  setDefaultSystemMessage: (defaultSystemMessage: string) => void;
  setHideMenuOptions: (hideMenuOptions: boolean) => void;
  setHideSideMenu: (hideSideMenu: boolean) => void;
  setEnterToSubmit: (enterToSubmit: boolean) => void;
  setInlineLatex: (inlineLatex: boolean) => void;
  setMarkdownMode: (markdownMode: boolean) => void;
  setStreamingMarkdownPolicy: (streamingMarkdownPolicy: StreamingMarkdownPolicy) => void;
  setCountTotalTokens: (countTotalTokens: boolean) => void;
  setTotalTokenUsed: (totalTokenUsed: TotalTokenUsed) => void;
  setMenuWidth: (menuWidth: number) => void;
  setDisplayChatSize: (displayChatSize: boolean) => void;
  setDefaultImageDetail: (imageDetail: ImageDetail) => void;
  setAutoScroll: (autoScroll: boolean) => void;
  setHideShareGPT: (hideShareGPT: boolean) => void;
}

export const createConfigSlice: StoreSlice<ConfigSlice> = (set, get) => ({
  openConfig: false,
  theme: 'dark',
  hideMenuOptions: false,
  hideSideMenu: false,
  autoTitle: false,
  titleModel: defaultModel,
  titleProviderId: undefined,
  enterToSubmit: true,
  advancedMode: true,
  defaultChatConfig: _defaultChatConfig,
  defaultSystemMessage: _defaultSystemMessage,
  inlineLatex: false,
  markdownMode: true,
  streamingMarkdownPolicy: 'auto',
  countTotalTokens: false,
  totalTokenUsed: {},
  menuWidth: _defaultMenuWidth,
  displayChatSize: _defaultDisplayChatSize,
  defaultImageDetail: _defaultImageDetail,
  autoScroll: true,
  hideShareGPT: true,
  onboardingCompleted: false,
  setOnboardingCompleted: (completed: boolean) => {
    const value = completed ? STORE_VERSION : false;
    if (get().onboardingCompleted === value) return;
    set((prev: ConfigSlice) => ({ ...prev, onboardingCompleted: value }));
  },
  setOpenConfig: (openConfig: boolean) => {
    if (get().openConfig === openConfig) return;
    set((prev: ConfigSlice) => ({
      ...prev,
      openConfig: openConfig,
    }));
  },
  setTheme: (theme: Theme) => {
    if (get().theme === theme) return;
    set((prev: ConfigSlice) => ({
      ...prev,
      theme: theme,
    }));
  },
  setAutoTitle: (autoTitle: boolean) => {
    if (get().autoTitle === autoTitle) return;
    set((prev: ConfigSlice) => ({
      ...prev,
      autoTitle: autoTitle,
    }));
  },
  setTitleModel: (titleModel: ModelOptions, titleProviderId?: ProviderId) => {
    if (get().titleModel === titleModel && get().titleProviderId === titleProviderId) return;
    set((prev: ConfigSlice) => ({
      ...prev,
      titleModel,
      titleProviderId,
    }));
  },
  setAdvancedMode: (advancedMode: boolean) => {
    if (get().advancedMode === advancedMode) return;
    set((prev: ConfigSlice) => ({
      ...prev,
      advancedMode: advancedMode,
    }));
  },
  setDefaultChatConfig: (defaultChatConfig: ConfigInterface) => {
    const normalized = normalizeConfigStream(defaultChatConfig);
    if (isSameConfig(get().defaultChatConfig, normalized)) return;
    set((prev: ConfigSlice) => ({
      ...prev,
      defaultChatConfig: normalized,
    }));
  },
  setDefaultSystemMessage: (defaultSystemMessage: string) => {
    if (get().defaultSystemMessage === defaultSystemMessage) return;
    set((prev: ConfigSlice) => ({
      ...prev,
      defaultSystemMessage: defaultSystemMessage,
    }));
  },
  setHideMenuOptions: (hideMenuOptions: boolean) => {
    if (get().hideMenuOptions === hideMenuOptions) return;
    set((prev: ConfigSlice) => ({
      ...prev,
      hideMenuOptions: hideMenuOptions,
    }));
  },
  setHideSideMenu: (hideSideMenu: boolean) => {
    if (get().hideSideMenu === hideSideMenu) return;
    set((prev: ConfigSlice) => ({
      ...prev,
      hideSideMenu: hideSideMenu,
    }));
  },
  setEnterToSubmit: (enterToSubmit: boolean) => {
    if (get().enterToSubmit === enterToSubmit) return;
    set((prev: ConfigSlice) => ({
      ...prev,
      enterToSubmit: enterToSubmit,
    }));
  },
  setInlineLatex: (inlineLatex: boolean) => {
    if (get().inlineLatex === inlineLatex) return;
    set((prev: ConfigSlice) => ({
      ...prev,
      inlineLatex: inlineLatex,
    }));
  },
  setMarkdownMode: (markdownMode: boolean) => {
    if (get().markdownMode === markdownMode) return;
    set((prev: ConfigSlice) => ({
      ...prev,
      markdownMode: markdownMode,
    }));
  },
  setStreamingMarkdownPolicy: (streamingMarkdownPolicy: StreamingMarkdownPolicy) => {
    if (get().streamingMarkdownPolicy === streamingMarkdownPolicy) return;
    set((prev: ConfigSlice) => ({
      ...prev,
      streamingMarkdownPolicy,
    }));
  },
  setCountTotalTokens: (countTotalTokens: boolean) => {
    if (get().countTotalTokens === countTotalTokens) return;
    set((prev: ConfigSlice) => ({
      ...prev,
      countTotalTokens: countTotalTokens,
    }));
  },
  setTotalTokenUsed: (totalTokenUsed: TotalTokenUsed) => {
    if (get().totalTokenUsed === totalTokenUsed) return;
    set((prev: ConfigSlice) => ({
      ...prev,
      totalTokenUsed: totalTokenUsed,
    }));
  },
  setMenuWidth: (menuWidth: number) => {
    if (get().menuWidth === menuWidth) return;
    set((prev: ConfigSlice) => ({
      ...prev,
      menuWidth: menuWidth,
    }));
  },
  setDisplayChatSize: (displayChatSize: boolean) => {
    if (get().displayChatSize === displayChatSize) return;
    set((prev: ConfigSlice) => ({
      ...prev,
      displayChatSize: displayChatSize,
    }));
  },
  setDefaultImageDetail: (imageDetail: ImageDetail) => {
    if (get().defaultImageDetail === imageDetail) return;
    set((prev: ConfigSlice) => ({
      ...prev,
      defaultImageDetail: imageDetail,
    }));
  },
  setAutoScroll: (autoScroll: boolean) => {
    if (get().autoScroll === autoScroll) return;
    set((prev: ConfigSlice) => ({
      ...prev,
      autoScroll: autoScroll,
    }));
  },
  setHideShareGPT: (hideShareGPT: boolean) => {
    if (get().hideShareGPT === hideShareGPT) return;
    set((prev: ConfigSlice) => ({
      ...prev,
      hideShareGPT: hideShareGPT,
    }));
  },
});
