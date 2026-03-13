import { materializeActivePath } from '@utils/branchUtils';
import { ensureUniqueChatIds } from '@utils/chatIdentity';
import { ContentStoreData } from '@utils/contentStore';
import { ChatInterface } from '@type/chat';
import {
  LocalStorageInterfaceV9ToV10,
  LocalStorageInterfaceV0ToV1,
  LocalStorageInterfaceV1ToV2,
  LocalStorageInterfaceV2ToV3,
  LocalStorageInterfaceV3ToV4,
  LocalStorageInterfaceV4ToV5,
  LocalStorageInterfaceV5ToV6,
  LocalStorageInterfaceV6ToV7,
  LocalStorageInterfaceV7oV8,
  LocalStorageInterfaceV8_1ToV8_2,
  LocalStorageInterfaceV8oV8_1,
  LocalStorageInterfaceV8_2ToV9,
  LocalStorageInterfaceV10ToV11,
  LocalStorageInterfaceV11ToV12,
  LocalStorageInterfaceV12ToV13,
  LocalStorageInterfaceV13ToV14,
  LocalStorageInterfaceV14ToV15,
  LocalStorageInterfaceV15ToV16,
} from '@type/chat';
import {
  migrateV10,
  migrateV11,
  migrateV12,
  migrateV9,
  migrateV0,
  migrateV1,
  migrateV2,
  migrateV3,
  migrateV4,
  migrateV5,
  migrateV6,
  migrateV7,
  migrateV8_1,
  migrateV8_1_fix,
  migrateV8_2,
  migrateV13,
  migrateV14,
  migrateV15,
} from './migrate';
import type { StoreState } from './store';
import { setLocalStorageItem } from './storage/storageErrors';
import { STORE_VERSION } from './version';

type PersistedChat = Omit<ChatInterface, 'messages'> & {
  messages?: ChatInterface['messages'];
};

export type PersistedStoreState = Omit<
  Pick<
  StoreState,
  | 'chats'
  | 'apiKey'
  | 'apiVersion'
  | 'apiEndpoint'
  | 'theme'
  | 'autoTitle'
  | 'titleModel'
  | 'titleProviderId'
  | 'advancedMode'
  | 'prompts'
  | 'defaultChatConfig'
  | 'defaultSystemMessage'
  | 'hideMenuOptions'
| 'hideSideMenu'
  | 'folders'
  | 'enterToSubmit'
  | 'inlineLatex'
  | 'markdownMode'
  | 'streamingMarkdownPolicy'
  | 'totalTokenUsed'
  | 'countTotalTokens'
  | 'displayChatSize'
  | 'menuWidth'
  | 'defaultImageDetail'
  | 'autoScroll'
  | 'animateBubbleNavigation'
  | 'hideShareGPT'
  | 'providers'
  | 'favoriteModels'
  | 'branchClipboard'
  | 'contentStore'
  | 'providerModelCache'
  | 'providerCustomModels'
  | '_legacyCustomModels'
  | 'onboardingCompleted'
  >,
  'chats'
> & {
  chats?: PersistedChat[];
};

export type PersistedChatData = Pick<
  PersistedStoreState,
  'chats' | 'contentStore' | 'branchClipboard'
>;

type LocalStoragePersistedState = Omit<
  PersistedStoreState,
  'chats' | 'contentStore' | 'branchClipboard'
>;

const FULL_PERSIST_KEYS: (keyof PersistedStoreState)[] = [
  'chats', 'apiKey', 'apiVersion', 'apiEndpoint', 'theme', 'autoTitle',
  'titleModel', 'titleProviderId', 'advancedMode', 'prompts', 'defaultChatConfig', 'defaultSystemMessage',
  'hideMenuOptions', 'hideSideMenu', 'folders', 'enterToSubmit',
  'inlineLatex', 'markdownMode', 'streamingMarkdownPolicy', 'totalTokenUsed', 'countTotalTokens',
  'displayChatSize', 'menuWidth', 'defaultImageDetail', 'autoScroll', 'animateBubbleNavigation',
  'hideShareGPT', 'providers', 'favoriteModels',
  'branchClipboard', 'contentStore', 'providerModelCache',
  'providerCustomModels', '_legacyCustomModels',
  'onboardingCompleted',
];

const LOCAL_STORAGE_PERSIST_KEYS: (keyof LocalStoragePersistedState)[] = [
  'apiKey', 'apiVersion', 'apiEndpoint', 'theme', 'autoTitle',
  'titleModel', 'titleProviderId', 'advancedMode', 'prompts', 'defaultChatConfig', 'defaultSystemMessage',
  'hideMenuOptions', 'hideSideMenu', 'folders', 'enterToSubmit',
  'inlineLatex', 'markdownMode', 'streamingMarkdownPolicy', 'totalTokenUsed', 'countTotalTokens',
  'displayChatSize', 'menuWidth', 'defaultImageDetail', 'autoScroll', 'animateBubbleNavigation',
  'hideShareGPT', 'providers', 'favoriteModels',
  'providerModelCache',
  'providerCustomModels', '_legacyCustomModels',
  'onboardingCompleted',
];

let previousFullInputRefs: Partial<Record<keyof PersistedStoreState, unknown>> = {};
let previousFullResult: PersistedStoreState | null = null;

let previousLocalInputRefs: Partial<Record<keyof LocalStoragePersistedState, unknown>> = {};
let previousLocalResult: LocalStoragePersistedState | null = null;

const buildPersistedChats = (state: StoreState): PersistedChat[] | undefined =>
  state.chats?.map(({ messages, ...rest }) =>
    rest.branchTree ? rest : { ...rest, messages }
  );

function buildPartializedState(state: StoreState): PersistedStoreState {
  return {
    chats: buildPersistedChats(state),
    apiKey: state.apiKey,
    apiVersion: state.apiVersion,
    apiEndpoint: state.apiEndpoint,
    theme: state.theme,
    autoTitle: state.autoTitle,
    titleModel: state.titleModel,
    titleProviderId: state.titleProviderId,
    advancedMode: state.advancedMode,
    prompts: state.prompts,
    defaultChatConfig: state.defaultChatConfig,
    defaultSystemMessage: state.defaultSystemMessage,
    hideMenuOptions: state.hideMenuOptions,
    hideSideMenu: state.hideSideMenu,
    folders: state.folders,
    enterToSubmit: state.enterToSubmit,
    inlineLatex: state.inlineLatex,
    markdownMode: state.markdownMode,
    streamingMarkdownPolicy: state.streamingMarkdownPolicy,
    totalTokenUsed: state.totalTokenUsed,
    countTotalTokens: state.countTotalTokens,
    displayChatSize: state.displayChatSize,
    menuWidth: state.menuWidth,
    defaultImageDetail: state.defaultImageDetail,
    autoScroll: state.autoScroll,
    animateBubbleNavigation: state.animateBubbleNavigation,
    hideShareGPT: state.hideShareGPT,
    providers: state.providers,
    favoriteModels: state.favoriteModels,
    branchClipboard: state.branchClipboard,
    contentStore: state.contentStore,
    providerModelCache: state.providerModelCache,
    providerCustomModels: state.providerCustomModels,
    _legacyCustomModels: state._legacyCustomModels,
    onboardingCompleted: state.onboardingCompleted,
  };
}

function buildLocalStoragePartializedState(
  state: StoreState
): LocalStoragePersistedState {
  return {
    apiKey: state.apiKey,
    apiVersion: state.apiVersion,
    apiEndpoint: state.apiEndpoint,
    theme: state.theme,
    autoTitle: state.autoTitle,
    titleModel: state.titleModel,
    titleProviderId: state.titleProviderId,
    advancedMode: state.advancedMode,
    prompts: state.prompts,
    defaultChatConfig: state.defaultChatConfig,
    defaultSystemMessage: state.defaultSystemMessage,
    hideMenuOptions: state.hideMenuOptions,
    hideSideMenu: state.hideSideMenu,
    folders: state.folders,
    enterToSubmit: state.enterToSubmit,
    inlineLatex: state.inlineLatex,
    markdownMode: state.markdownMode,
    streamingMarkdownPolicy: state.streamingMarkdownPolicy,
    totalTokenUsed: state.totalTokenUsed,
    countTotalTokens: state.countTotalTokens,
    displayChatSize: state.displayChatSize,
    menuWidth: state.menuWidth,
    defaultImageDetail: state.defaultImageDetail,
    autoScroll: state.autoScroll,
    animateBubbleNavigation: state.animateBubbleNavigation,
    hideShareGPT: state.hideShareGPT,
    providers: state.providers,
    favoriteModels: state.favoriteModels,
    providerModelCache: state.providerModelCache,
    providerCustomModels: state.providerCustomModels,
    _legacyCustomModels: state._legacyCustomModels,
    onboardingCompleted: state.onboardingCompleted,
  };
}

export const createPartializedState = (state: StoreState): PersistedStoreState => {
  let changed = !previousFullResult;

  if (!changed) {
    for (const key of FULL_PERSIST_KEYS) {
      if (state[key] !== previousFullInputRefs[key]) {
        changed = true;
        break;
      }
    }
  }

  if (changed) {
    previousFullResult = buildPartializedState(state);
    const refs: Partial<Record<keyof PersistedStoreState, unknown>> = {};
    for (const key of FULL_PERSIST_KEYS) {
      refs[key] = state[key];
    }
    previousFullInputRefs = refs;
  }

  return previousFullResult!;
};

export const createLocalStoragePartializedState = (
  state: StoreState
): LocalStoragePersistedState => {
  let changed = !previousLocalResult;

  if (!changed) {
    for (const key of LOCAL_STORAGE_PERSIST_KEYS) {
      if (state[key] !== previousLocalInputRefs[key]) {
        changed = true;
        break;
      }
    }
  }

  if (changed) {
    previousLocalResult = buildLocalStoragePartializedState(state);
    const refs: Partial<Record<keyof LocalStoragePersistedState, unknown>> = {};
    for (const key of LOCAL_STORAGE_PERSIST_KEYS) {
      refs[key] = state[key];
    }
    previousLocalInputRefs = refs;
  }

  return previousLocalResult!;
};

export const rehydrateStoreState = (state: StoreState) => {
  const savedIndex = parseInt(localStorage.getItem('currentChatIndex') ?? '-1', 10);
  let repaired = false;
  if (state.chats) {
    repaired = ensureUniqueChatIds(state.chats);
  }
  if (state.chats && state.chats.length > 0) {
    state.currentChatIndex = (savedIndex >= 0 && savedIndex < state.chats.length)
      ? savedIndex
      : 0;
  }

  const contentStore: ContentStoreData = state.contentStore ?? {};
  state.chats?.forEach((chat: ChatInterface) => {
    if (!chat.messages) chat.messages = [];
    if (chat.branchTree && chat.branchTree.activePath.length > 0) {
      chat.messages = materializeActivePath(chat.branchTree, contentStore);
    }
  });

  createPartializedState(state);
  return repaired;
};

export const createPersistedChatDataState = (
  state: StoreState
): PersistedChatData => ({
  chats: buildPersistedChats(state),
  contentStore: state.contentStore,
  branchClipboard: state.branchClipboard,
});

export const applyPersistedChatDataState = (
  state: StoreState,
  persistedChatData: PersistedChatData
) => {
  state.chats = persistedChatData.chats as ChatInterface[] | undefined;
  state.contentStore = persistedChatData.contentStore ?? {};
  state.branchClipboard = persistedChatData.branchClipboard ?? null;
  return rehydrateStoreState(state);
};

export const hydrateFromPersistedStoreState = (
  baseState: StoreState,
  persistedState: Partial<PersistedStoreState>
): Partial<StoreState> => {
  const hasChats = Object.prototype.hasOwnProperty.call(persistedState, 'chats');
  const hasContentStore = Object.prototype.hasOwnProperty.call(
    persistedState,
    'contentStore'
  );
  const hasBranchClipboard = Object.prototype.hasOwnProperty.call(
    persistedState,
    'branchClipboard'
  );
  const nextState = {
    ...baseState,
    ...persistedState,
  } as StoreState;

  applyPersistedChatDataState(nextState, {
    chats: hasChats ? persistedState.chats : baseState.chats,
    contentStore: hasContentStore
      ? persistedState.contentStore ?? {}
      : baseState.contentStore,
    branchClipboard: hasBranchClipboard
      ? persistedState.branchClipboard ?? null
      : baseState.branchClipboard,
  });

  const currentChatIndex =
    nextState.chats && nextState.chats.length > 0 ? nextState.currentChatIndex : -1;
  setLocalStorageItem('currentChatIndex', String(currentChatIndex));

  return {
    ...persistedState,
    chats: nextState.chats,
    contentStore: nextState.contentStore,
    branchClipboard: nextState.branchClipboard,
    currentChatIndex,
  };
};

export const migratePersistedChatDataState = (
  baseState: StoreState,
  persistedChatData: PersistedChatData,
  version: number
): PersistedChatData => {
  if (version >= STORE_VERSION) {
    return persistedChatData;
  }

  const mergedState = JSON.parse(
    JSON.stringify({
      ...createPartializedState(baseState),
      chats: persistedChatData.chats,
      contentStore: persistedChatData.contentStore,
      branchClipboard: persistedChatData.branchClipboard,
    })
  ) as PersistedStoreState;

  const migrated = migratePersistedState(mergedState, version) as PersistedStoreState;
  return {
    chats: migrated.chats,
    contentStore: migrated.contentStore ?? {},
    branchClipboard: migrated.branchClipboard ?? null,
  };
};

type PersistedStateVersion =
  | LocalStorageInterfaceV0ToV1
  | LocalStorageInterfaceV1ToV2
  | LocalStorageInterfaceV2ToV3
  | LocalStorageInterfaceV3ToV4
  | LocalStorageInterfaceV4ToV5
  | LocalStorageInterfaceV5ToV6
  | LocalStorageInterfaceV6ToV7
  | LocalStorageInterfaceV7oV8
  | LocalStorageInterfaceV8oV8_1
  | LocalStorageInterfaceV8_1ToV8_2
  | LocalStorageInterfaceV8_2ToV9
  | LocalStorageInterfaceV9ToV10
  | LocalStorageInterfaceV10ToV11
  | LocalStorageInterfaceV11ToV12
  | LocalStorageInterfaceV12ToV13
  | LocalStorageInterfaceV13ToV14
  | LocalStorageInterfaceV14ToV15
  | LocalStorageInterfaceV15ToV16;

type MigrationEntry = {
  version: number;
  apply: (state: PersistedStateVersion) => void;
};

const MIGRATIONS: MigrationEntry[] = [
  { version: 0, apply: (state) => migrateV0(state as LocalStorageInterfaceV0ToV1) },
  { version: 1, apply: (state) => migrateV1(state as LocalStorageInterfaceV1ToV2) },
  { version: 2, apply: (state) => migrateV2(state as LocalStorageInterfaceV2ToV3) },
  { version: 3, apply: (state) => migrateV3(state as LocalStorageInterfaceV3ToV4) },
  { version: 4, apply: (state) => migrateV4(state as LocalStorageInterfaceV4ToV5) },
  { version: 5, apply: (state) => migrateV5(state as LocalStorageInterfaceV5ToV6) },
  { version: 6, apply: (state) => migrateV6(state as LocalStorageInterfaceV6ToV7) },
  { version: 7, apply: (state) => migrateV7(state as LocalStorageInterfaceV7oV8) },
  { version: 8, apply: (state) => migrateV8_1(state as LocalStorageInterfaceV8oV8_1) },
  { version: 8.1, apply: (state) => migrateV8_1_fix(state as LocalStorageInterfaceV8_1ToV8_2) },
  { version: 8.2, apply: (state) => migrateV8_2(state as LocalStorageInterfaceV8_2ToV9) },
  { version: 9, apply: (state) => migrateV9(state as LocalStorageInterfaceV9ToV10) },
  { version: 10, apply: (state) => migrateV10(state as LocalStorageInterfaceV10ToV11) },
  { version: 11, apply: (state) => migrateV11(state as LocalStorageInterfaceV11ToV12) },
  { version: 12, apply: (state) => migrateV12(state as LocalStorageInterfaceV12ToV13) },
  { version: 13, apply: (state) => migrateV13(state as LocalStorageInterfaceV13ToV14) },
  { version: 14, apply: (state) => migrateV14(state as LocalStorageInterfaceV14ToV15) },
  { version: 15, apply: (state) => migrateV15(state as LocalStorageInterfaceV15ToV16) },
];

export const migratePersistedState = (
  persistedState: unknown,
  version: number
) => {
  const state = persistedState as PersistedStateVersion;

  for (const migration of MIGRATIONS) {
    if (version <= migration.version) {
      migration.apply(state);
    }
  }

  return persistedState as StoreState;
};
