import { materializeActivePath } from '@utils/branchUtils';
import { ensureUniqueChatIds } from '@utils/chatIdentity';
import { ContentStoreData, validateDeltaIntegrity } from '@utils/contentStore';
import {
  finalizeStreamingSnapshotState,
  hasActiveStreamingBuffers,
  isStreamingContentHash,
} from '@utils/streamingBuffer';
import { addContent } from '@utils/contentStore';
import { getBufferedContent } from '@utils/streamingBuffer';
import { BranchClipboard, ChatInterface } from '@type/chat';
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
  | 'animateBubbleNavigation'
  | 'providers'
  | 'favoriteModels'
  | 'branchClipboard'
  | 'contentStore'
  | 'providerModelCache'
  | 'providerCustomModels'
  | '_legacyCustomModels'
  | 'onboardingCompleted'
  | 'splitPanelRatio'
  | 'splitPanelSwapped'
  | 'chatActiveView'
  | 'proxyEndpoint'
  | 'proxyAuthToken'
  | 'showDebugPanel'
  | 'verifiedStats'
  | 'pendingVerifications'
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
  'displayChatSize', 'menuWidth', 'defaultImageDetail', 'animateBubbleNavigation',
  'providers', 'favoriteModels',
  'branchClipboard', 'contentStore', 'providerModelCache',
  'providerCustomModels', '_legacyCustomModels',
  'onboardingCompleted',
  'splitPanelRatio', 'splitPanelSwapped', 'chatActiveView',
  'proxyEndpoint', 'proxyAuthToken',
  'showDebugPanel',
  'verifiedStats',
  'pendingVerifications',
];

const LOCAL_STORAGE_PERSIST_KEYS: (keyof LocalStoragePersistedState)[] = [
  'apiKey', 'apiVersion', 'apiEndpoint', 'theme', 'autoTitle',
  'titleModel', 'titleProviderId', 'advancedMode', 'prompts', 'defaultChatConfig', 'defaultSystemMessage',
  'hideMenuOptions', 'hideSideMenu', 'folders', 'enterToSubmit',
  'inlineLatex', 'markdownMode', 'streamingMarkdownPolicy', 'totalTokenUsed', 'countTotalTokens',
  'displayChatSize', 'menuWidth', 'defaultImageDetail', 'animateBubbleNavigation',
  'providers', 'favoriteModels',
  'providerModelCache',
  'providerCustomModels', '_legacyCustomModels',
  'onboardingCompleted',
  'splitPanelRatio', 'splitPanelSwapped', 'chatActiveView',
  'proxyEndpoint', 'proxyAuthToken',
  'showDebugPanel',
  'verifiedStats',
  'pendingVerifications',
];

let previousFullInputRefs: Partial<Record<keyof PersistedStoreState, unknown>> = {};
let previousFullResult: PersistedStoreState | null = null;

let previousLocalInputRefs: Partial<Record<keyof LocalStoragePersistedState, unknown>> = {};
let previousLocalResult: LocalStoragePersistedState | null = null;

/**
 * When true, localStorage persist will strip chats/contentStore/branchClipboard
 * (normal operation — data lives in IndexedDB).
 * When false (during bootstrap), localStorage retains these fields as a safety net
 * so that data is not lost if IndexedDB write fails or the page crashes mid-migration.
 */
let indexedDbMigrationComplete = false;

export function setIndexedDbMigrationComplete(v: boolean): void {
  indexedDbMigrationComplete = v;
  // Invalidate cache so next persist picks up the change
  previousLocalResult = null;
}

const buildPersistedChats = (state: StoreState): PersistedChat[] | undefined =>
  state.chats?.map(({ messages, ...rest }) =>
    rest.branchTree ? rest : { ...rest, messages }
  );

function sanitizeClipboard(
  clipboard: BranchClipboard | null,
  contentStore: ContentStoreData
): BranchClipboard | null {
  if (!clipboard) return null;
  const streamingNodes = Object.values(clipboard.nodes).filter((n) =>
    isStreamingContentHash(n.contentHash)
  );
  if (streamingNodes.length === 0) return clipboard;
  const updatedNodes = { ...clipboard.nodes };
  for (const node of streamingNodes) {
    const nodeId = node.id;
    const content = getBufferedContent(nodeId) ?? [];
    updatedNodes[nodeId] = {
      ...updatedNodes[nodeId],
      contentHash: addContent(contentStore, content),
    };
  }
  return { ...clipboard, nodes: updatedNodes };
}

function buildPartializedState(state: StoreState): PersistedStoreState {
  const snapshot = finalizeStreamingSnapshotState(state.chats, state.contentStore);
  return {
    chats: buildPersistedChats({
      ...state,
      chats: snapshot.chats,
    } as StoreState),
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
    animateBubbleNavigation: state.animateBubbleNavigation,

    providers: state.providers,
    favoriteModels: state.favoriteModels,
    branchClipboard: sanitizeClipboard(state.branchClipboard, snapshot.contentStore),
    contentStore: snapshot.contentStore,
    providerModelCache: state.providerModelCache,
    providerCustomModels: state.providerCustomModels,
    _legacyCustomModels: state._legacyCustomModels,
    onboardingCompleted: state.onboardingCompleted,
    splitPanelRatio: state.splitPanelRatio,
    splitPanelSwapped: state.splitPanelSwapped,
    chatActiveView: state.chatActiveView,
    proxyEndpoint: state.proxyEndpoint,
    proxyAuthToken: state.proxyAuthToken,
    showDebugPanel: state.showDebugPanel,
    verifiedStats: state.verifiedStats,
    pendingVerifications: state.pendingVerifications,
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
    animateBubbleNavigation: state.animateBubbleNavigation,

    providers: state.providers,
    favoriteModels: state.favoriteModels,
    providerModelCache: state.providerModelCache,
    providerCustomModels: state.providerCustomModels,
    _legacyCustomModels: state._legacyCustomModels,
    onboardingCompleted: state.onboardingCompleted,
    splitPanelRatio: state.splitPanelRatio,
    splitPanelSwapped: state.splitPanelSwapped,
    chatActiveView: state.chatActiveView,
    proxyEndpoint: state.proxyEndpoint,
    proxyAuthToken: state.proxyAuthToken,
    showDebugPanel: state.showDebugPanel,
    verifiedStats: state.verifiedStats,
    pendingVerifications: state.pendingVerifications,
  };
}

export const createPartializedState = (state: StoreState): PersistedStoreState => {
  let changed = !previousFullResult || hasActiveStreamingBuffers();

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
): LocalStoragePersistedState | PersistedStoreState => {
  // Before IndexedDB migration is confirmed, keep chats/contentStore in localStorage
  // as a safety net against data loss from crashes or storage eviction.
  if (!indexedDbMigrationComplete) {
    const hasChats = state.chats && state.chats.length > 0;
    const hasContentStore = Object.keys(state.contentStore ?? {}).length > 0;
    if (hasChats || hasContentStore || state.branchClipboard) {
      return createPartializedState(state);
    }
  }

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
  validateDeltaIntegrity(contentStore);
  state.chats?.forEach((chat: ChatInterface) => {
    if (!chat.messages) chat.messages = [];
    if (chat.branchTree) {
      // Replace orphaned streaming markers (from interrupted streams) with empty content
      for (const node of Object.values(chat.branchTree.nodes)) {
        if (isStreamingContentHash(node.contentHash)) {
          node.contentHash = addContent(contentStore, []);
        }
      }
      if (chat.branchTree.activePath.length > 0) {
        chat.messages = materializeActivePath(chat.branchTree, contentStore);
      }
    }
  });

  if (state.pendingVerifications) {
    const now = Date.now();
    state.pendingVerifications = Object.fromEntries(
      Object.entries(state.pendingVerifications).map(([key, verification]) => [
        key,
        verification.status === 'fetching'
          ? {
              ...verification,
              status: 'pending',
              nextAttemptAt: Math.min(verification.nextAttemptAt, now),
            }
          : verification,
      ])
    );
  }

  createPartializedState(state);
  return repaired;
};

export const createPersistedChatDataState = (
  state: StoreState
): PersistedChatData => {
  const snapshot = finalizeStreamingSnapshotState(state.chats, state.contentStore);
  return {
    chats: buildPersistedChats({
      ...state,
      chats: snapshot.chats,
    } as StoreState),
    contentStore: snapshot.contentStore,
    branchClipboard: sanitizeClipboard(state.branchClipboard, snapshot.contentStore),
  };
};

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
