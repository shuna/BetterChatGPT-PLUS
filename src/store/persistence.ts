import { materializeActivePath, buildPathToLeaf } from '@utils/branchUtils';
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
import type { StoreState } from './store';
import { setLocalStorageItem } from './storage/storageErrors';
import { STORE_VERSION } from './version';
import { normalizeProviderConfigs } from './provider-helpers';

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
  | 'proxyEnabled'
  | 'proxyEndpoint'
  | 'proxyAuthToken'
  | 'showDebugPanel'
  | 'searchHistory'
  | 'sidebarSearchHistory'
  | 'chatFindHistory'
  | 'verifiedStats'
  | 'pendingVerifications'
  | 'evaluationSettings'
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
  'proxyEnabled', 'proxyEndpoint', 'proxyAuthToken',
  'showDebugPanel',
  'searchHistory',
  'sidebarSearchHistory',
  'chatFindHistory',
  'verifiedStats',
  'pendingVerifications',
  'evaluationSettings',
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
  'proxyEnabled', 'proxyEndpoint', 'proxyAuthToken',
  'showDebugPanel',
  'searchHistory',
  'sidebarSearchHistory',
  'chatFindHistory',
  'verifiedStats',
  'pendingVerifications',
  'evaluationSettings',
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

const getMapKey = (chatIndex: number) => String(chatIndex);

const buildPersistedChats = (state: StoreState): PersistedChat[] | undefined =>
  state.chats?.map(({ messages, ...rest }, index) => {
    const mapKey = getMapKey(index);
    // Sync runtime node maps back into the chat object for persistence.
    // The toggle functions only update the runtime maps (collapsedNodeMaps,
    // omittedNodeMaps, protectedNodeMaps) without writing back to the
    // ChatInterface fields, so we merge them here before saving.
    const collapsedNodes = state.collapsedNodeMaps?.[mapKey] ?? rest.collapsedNodes;
    const omittedNodes = state.omittedNodeMaps?.[mapKey] ?? rest.omittedNodes;
    const protectedNodes = state.protectedNodeMaps?.[mapKey] ?? rest.protectedNodes;
    const merged = {
      ...rest,
      collapsedNodes,
      omittedNodes,
      protectedNodes,
    };
    return merged.branchTree ? merged : { ...merged, messages };
  });

function sanitizeBranchTreeReferences(chat: ChatInterface): boolean {
  if (!chat.branchTree) return false;

  let repaired = false;
  const { branchTree } = chat;
  if (!branchTree.nodes || typeof branchTree.nodes !== 'object') {
    branchTree.nodes = {};
    repaired = true;
  }

  if (!branchTree.nodes[branchTree.rootId]) {
    branchTree.rootId = Object.keys(branchTree.nodes)[0] ?? '';
    repaired = true;
  }

  const prevLen = Array.isArray(branchTree.activePath)
    ? branchTree.activePath.length
    : -1;

  if (!Array.isArray(branchTree.activePath)) {
    branchTree.activePath = [];
  }
  branchTree.activePath = branchTree.activePath.filter((id) => {
    const node = branchTree.nodes[id];
    return !!node && typeof node.contentHash === 'string';
  });

  if (branchTree.activePath.length !== prevLen) {
    repaired = true;
  }

  // Rebuild activePath when it became empty but nodes still exist
  if (
    branchTree.activePath.length === 0 &&
    branchTree.rootId &&
    branchTree.nodes[branchTree.rootId]
  ) {
    branchTree.activePath = buildPathToLeaf(branchTree, branchTree.rootId);
    repaired = true;
  }

  return repaired;
}

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
    proxyEnabled: state.proxyEnabled,
    proxyEndpoint: state.proxyEndpoint,
    proxyAuthToken: state.proxyAuthToken,
    showDebugPanel: state.showDebugPanel,
    searchHistory: state.searchHistory,
    sidebarSearchHistory: state.sidebarSearchHistory,
    chatFindHistory: state.chatFindHistory,
    verifiedStats: state.verifiedStats,
    pendingVerifications: state.pendingVerifications,
    evaluationSettings: state.evaluationSettings,
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
    proxyEnabled: state.proxyEnabled,
    proxyEndpoint: state.proxyEndpoint,
    proxyAuthToken: state.proxyAuthToken,
    showDebugPanel: state.showDebugPanel,
    searchHistory: state.searchHistory,
    sidebarSearchHistory: state.sidebarSearchHistory,
    chatFindHistory: state.chatFindHistory,
    verifiedStats: state.verifiedStats,
    pendingVerifications: state.pendingVerifications,
    evaluationSettings: state.evaluationSettings,
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
  state.providers = normalizeProviderConfigs(state.providers);
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
  const repairedChatTitles: string[] = [];
  state.chats?.forEach((chat: ChatInterface) => {
    if (!chat.messages) chat.messages = [];
    if (chat.branchTree) {
      try {
        const chatRepaired = sanitizeBranchTreeReferences(chat);
        if (chatRepaired) {
          repairedChatTitles.push(chat.title || chat.id);
        }
        // Replace orphaned streaming markers (from interrupted streams) with empty content
        for (const node of Object.values(chat.branchTree.nodes)) {
          if (isStreamingContentHash(node.contentHash)) {
            node.contentHash = addContent(contentStore, []);
          }
        }
        if (chat.branchTree.activePath.length > 0) {
          chat.messages = materializeActivePath(chat.branchTree, contentStore);
        }
      } catch (e) {
        console.warn('[rehydrate] skipping corrupt branchTree for chat', chat.id, e);
        repairedChatTitles.push(chat.title || chat.id);
      }
    }
  });
  if (repairedChatTitles.length > 0) {
    repaired = true;
    setTimeout(() => {
      import('@utils/showToast').then(({ showToast }) => {
        showToast(
          `${repairedChatTitles.length}件のチャットデータを修復しました: ${repairedChatTitles.join(', ')}`,
          'warning'
        );
      });
    }, 0);
  }

  if (!state.verifiedStats || typeof state.verifiedStats !== 'object') {
    state.verifiedStats = {};
  }

  if (!state.pendingVerifications || typeof state.pendingVerifications !== 'object') {
    state.pendingVerifications = {};
  } else {
    const now = Date.now();
    state.pendingVerifications = Object.fromEntries(
      Object.entries(state.pendingVerifications).flatMap(([key, verification]) => {
        if (!verification || typeof verification !== 'object') {
          return [];
        }
        const normalized = {
          ...verification,
          status:
            verification.status === 'fetching' ||
            verification.status === 'pending' ||
            verification.status === 'failed'
              ? verification.status
              : 'pending',
          nextAttemptAt:
            typeof verification.nextAttemptAt === 'number'
              ? verification.nextAttemptAt
              : now,
        };
        return [[
          key,
          normalized.status === 'fetching'
            ? {
                ...normalized,
                status: 'pending',
                nextAttemptAt: Math.min(normalized.nextAttemptAt, now),
              }
            : normalized,
        ]];
      })
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

/**
 * Flag set when persisted data was loaded from an older store version.
 * Bootstrap checks this to show an export/import prompt instead of
 * auto-migrating.
 */
let _needsDataMigration = false;

export function needsDataMigration(): boolean {
  return _needsDataMigration;
}

export function clearNeedsDataMigration(): void {
  _needsDataMigration = false;
}

/**
 * Called by zustand persist middleware when the stored version differs
 * from STORE_VERSION.  Auto-migration has been removed — the persisted
 * state is returned as-is and a flag is raised so the UI can prompt the
 * user to export and re-import.
 */
export const migratePersistedState = (
  persistedState: unknown,
  version: number
) => {
  if (version < STORE_VERSION) {
    _needsDataMigration = true;
    console.warn(
      `[persistence] Persisted data version ${version} < ${STORE_VERSION}. ` +
      'Auto-migration removed. Please export and re-import your data.'
    );
  }
  return persistedState as StoreState;
};
