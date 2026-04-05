import { v4 as uuidv4 } from 'uuid';
import { showToast } from '@utils/showToast';

import useStore from '@store/store';
import { createPartializedState } from '@store/store';
import type { StoreState } from '@store/store';
import {
  importOpenAIChatExport,
  isLegacyImport,
  isOpenAIContent,
  isSingleChatImport,
  PartialImportError,
  validateAndFixChats,
  validateExportV1,
  validateExportV2,
  validateExportV3,
} from '@utils/import';
import { flatMessagesToBranchTree } from '@utils/branchUtils';
import { assignFreshChatIds } from '@utils/chatIdentity';
import { ContentStoreData, addContent } from '@utils/contentStore';
import { normalizeSystemPrompt } from '@utils/systemPromptNormalize';
import { isKnownModel } from '@utils/modelLookup';
import { BranchNodeLegacy, ChatInterface, Folder, FolderCollection } from '@type/chat';
import { ExportV1, ExportV2, ExportV3, OpenAIChat, OpenAIPlaygroundJSON } from '@type/export';
import type { EvaluationResultMap } from '@type/evaluation';

export type ImportResult = {
  success: boolean;
  message: string;
};

export type ImportMode = 'append' | 'replace';

type Translator = (key: string, opts?: Record<string, unknown>) => string;
type ImportType =
  | 'OpenAIContent'
  | 'LegacyImport'
  | 'SingleChat'
  | 'ExportV1'
  | 'ExportV2'
  | 'ExportV3'
  | '';

type StoreSnapshot = {
  persistedState: ReturnType<typeof createPartializedState>;
  currentChatIndex: number;
};

const applyPersistedState = (persistedState: ReturnType<typeof createPartializedState>) => {
  const currentState = useStore.getState();
  const nextState: StoreState = {
    ...currentState,
    ...persistedState,
    chats: persistedState.chats?.map((chat) => ({
      ...chat,
      messages: chat.messages ?? [],
    })) ?? currentState.chats,
  };
  useStore.setState(nextState);
};

const cloneState = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const deepClone = <T,>(value: T): T =>
  typeof structuredClone === 'function' ? structuredClone(value) : cloneState(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const extractModelId = (chat: unknown): string | undefined => {
  if (!isRecord(chat) || !isRecord(chat.config) || typeof chat.config.model !== 'string') {
    return undefined;
  }
  return chat.config.model;
};

const takeSnapshot = (): StoreSnapshot => ({
  persistedState: deepClone(createPartializedState(useStore.getState())),
  currentChatIndex: useStore.getState().currentChatIndex,
});

const restoreSnapshot = (snapshot: StoreSnapshot) => {
  applyPersistedState(snapshot.persistedState);
  useStore.getState().setCurrentChatIndex(snapshot.currentChatIndex);
};

const resetPersistedStateForReplace = () => {
  const initialState = deepClone(
    createPartializedState(useStore.getInitialState())
  );
  applyPersistedState(initialState);
  useStore.getState().setCurrentChatIndex(initialState.chats?.length ? 0 : -1);
};

const resetChatsOnlyForReplace = () => {
  useStore.setState({
    chats: [],
    folders: {},
    contentStore: {},
    branchClipboard: null,
  });
  useStore.getState().setCurrentChatIndex(-1);
};

const mergeChats = (chatsToImport: ChatInterface[]) => {
  const chatIdMap: Record<string, string> = {};
  chatsToImport.forEach((chat) => {
    const prevId = chat.id;
    assignFreshChatIds([chat]);
    chatIdMap[prevId] = chat.id;
  });
  // Normalize system prompts: migrate system bubbles → config.systemPrompt
  const contentStore = useStore.getState().contentStore ?? {};
  for (const chat of chatsToImport) {
    try {
      normalizeSystemPrompt(chat, contentStore);
    } catch (e) {
      console.warn('[import] system prompt normalization failed for chat', chat.id, e);
    }
  }
  const existingChats = useStore.getState().chats;
  if (existingChats) {
    useStore.getState().setChats(chatsToImport.concat(cloneState(existingChats)));
  } else {
    useStore.getState().setChats(chatsToImport);
  }
  return chatIdMap;
};

const remapEvaluationResultKeys = (
  results: EvaluationResultMap | undefined,
  chatIdMap: Record<string, string>
): EvaluationResultMap => {
  if (!results) return {};
  return Object.fromEntries(
    Object.entries(results).map(([key, value]) => {
      const firstSep = key.indexOf(':');
      const secondSep = key.indexOf(':', firstSep + 1);
      if (firstSep < 0 || secondSep < 0) return [key, value];
      const chatId = key.slice(0, firstSep);
      const nextChatId = chatIdMap[chatId] ?? chatId;
      return [`${nextChatId}${key.slice(firstSep)}`, value];
    })
  );
};

const clearMissingFolderReferences = (
  chats: ChatInterface[] | undefined,
  folders: FolderCollection
) => {
  if (!chats) return;

  chats.forEach((chat) => {
    if (chat.folder && !folders[chat.folder]) {
      delete chat.folder;
    }
  });
};

const shiftAndMergeFolders = (folders: FolderCollection) => {
  const offset = Object.keys(folders).length;
  const currentFolders = useStore.getState().folders;
  Object.values(currentFolders).forEach((folder) => {
    folder.order += offset;
  });
  useStore.getState().setFolders({ ...folders, ...currentFolders });
};

const warnUnsupportedModels = (chats: unknown[], t: Translator) => {
  const unsupportedModels = Array.from(
    new Set(
      chats
        .map(extractModelId)
        .filter((id: string | undefined) => id && !isKnownModel(id))
    )
  );

  if (unsupportedModels.length === 0) return false;

  showToast(
    t('notifications.unsupportedModels', {
      ns: 'import',
      models: unsupportedModels.join(', '),
    }) ||
      `Unsupported model(s): ${unsupportedModels.join(', ')}. Please add them in AI Provider Settings → Custom tab before importing.`,
    'warning',
    15000
  );
  return true;
};

const readImportFile = async (file: File): Promise<string> => {
  if (file.name.endsWith('.gz') && typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('gzip');
    const decompressedStream = file.stream().pipeThrough(ds);
    return await new Response(decompressedStream).text();
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.readAsText(file);
  });
};

const detectImportType = (parsedData: unknown): ImportType => {
  // Check versioned exports first — they are the most specific (have a
  // numeric `version` field) and must not be swallowed by the broader
  // OpenAI / legacy checks that follow.
  if (isRecord(parsedData) && parsedData.version === 3) return 'ExportV3';
  if (isRecord(parsedData) && parsedData.version === 2) return 'ExportV2';
  if (isRecord(parsedData) && parsedData.version === 1) return 'ExportV1';
  if (isOpenAIContent(parsedData)) return 'OpenAIContent';
  if (isLegacyImport(parsedData)) return 'LegacyImport';
  if (isSingleChatImport(parsedData)) return 'SingleChat';
  return '';
};

const buildSuccessResult = (message: string): ImportResult => ({
  success: true,
  message,
});

const buildFailureResult = (message: string): ImportResult => ({
  success: false,
  message,
});

const importLegacyChats = (
  chatsToImport: unknown[],
  removedChatsCount: number,
  originalParsedData: unknown[],
  t: Translator
): ImportResult => {
  if (!validateAndFixChats(chatsToImport)) {
    warnUnsupportedModels(chatsToImport, t);
    return buildFailureResult(
      t('notifications.invalidChatsDataFormat', { ns: 'import' })
    );
  }

  warnUnsupportedModels(originalParsedData, t);

  const folderNameToIdMap: Record<string, string> = {};
  const parsedFolders: string[] = [];

  chatsToImport.forEach((chat) => {
    const folder = chat.folder;
    if (!folder) return;
    if (!parsedFolders.includes(folder)) {
      parsedFolders.push(folder);
      folderNameToIdMap[folder] = uuidv4();
    }
    chat.folder = folderNameToIdMap[folder];
  });

  const newFolders: FolderCollection = parsedFolders.reduce((acc, folderName, index) => {
    const id = folderNameToIdMap[folderName];
    const nextFolder: Folder = {
      id,
      name: folderName,
      expanded: false,
      order: index,
    };
    return { [id]: nextFolder, ...acc };
  }, {} as FolderCollection);

  shiftAndMergeFolders(newFolders);

  const contentStore = { ...useStore.getState().contentStore };
  for (const chat of chatsToImport) {
    if (!chat.branchTree) {
      chat.branchTree = flatMessagesToBranchTree(chat.messages, contentStore);
    }
  }
  useStore.setState({ contentStore });

  mergeChats(chatsToImport);

  if (removedChatsCount > 0) {
    showToast(
      `${t('reduceMessagesSuccess', { count: removedChatsCount })}. ${t('notifications.chatsImported', {
        ns: 'import',
        imported: chatsToImport.length,
        total: originalParsedData.length,
      })}`,
      'info',
      15000
    );
  }

  return chatsToImport.length > 0
    ? buildSuccessResult(t('notifications.successfulImport', { ns: 'import' }))
    : buildFailureResult(t('notifications.nothingImported', { ns: 'import' }));
};

const importExportV3 = (
  parsedData: ExportV3,
  t: Translator,
  mode: ImportMode,
  includeSettings: boolean
): ImportResult => {
  if (!validateExportV3(parsedData)) {
    return buildFailureResult(
      t('notifications.invalidFormatForVersion', { ns: 'import' })
    );
  }
  const chats = parsedData.chats ?? [];

  clearMissingFolderReferences(chats, parsedData.folders);

  shiftAndMergeFolders(parsedData.folders);

  const existingContentStore = { ...useStore.getState().contentStore };
  const importedContentStore = parsedData.contentStore as ContentStoreData;
  for (const [hash, entry] of Object.entries(importedContentStore)) {
    if (existingContentStore[hash]) {
      existingContentStore[hash].refCount += entry.refCount;
    } else {
      existingContentStore[hash] = { ...entry };
    }
  }
  useStore.setState({ contentStore: existingContentStore });
  const chatIdMap = mergeChats(chats);

  if (parsedData.evaluationResults) {
    const remapped = remapEvaluationResultKeys(parsedData.evaluationResults, chatIdMap);
    const existingResults = useStore.getState().evaluationResults;
    useStore.setState({
      evaluationResults: { ...existingResults, ...remapped },
    });
  }

  if (includeSettings && mode === 'replace' && parsedData.evaluationSettings) {
    useStore.setState({
      evaluationSettings: parsedData.evaluationSettings,
    });
  }

  return chats.length > 0
    ? buildSuccessResult(t('notifications.successfulImport', { ns: 'import' }))
    : buildFailureResult(t('notifications.quotaExceeded', { ns: 'import' }));
};

const importExportV2 = (parsedData: ExportV2, t: Translator): ImportResult => {
  if (!validateExportV2(parsedData)) {
    return buildFailureResult(
      t('notifications.invalidFormatForVersion', { ns: 'import' })
    );
  }

  clearMissingFolderReferences(parsedData.chats, parsedData.folders);
  shiftAndMergeFolders(parsedData.folders);

  const contentStore = { ...useStore.getState().contentStore };
  if (parsedData.chats) {
    type LegacyBranchNodeWithHash = Omit<BranchNodeLegacy, 'content'> & {
      content?: BranchNodeLegacy['content'];
      contentHash?: string;
    };
    for (const chat of parsedData.chats) {
      if (chat.branchTree) {
        for (const node of Object.values(chat.branchTree.nodes) as LegacyBranchNodeWithHash[]) {
          if (node.content && !node.contentHash) {
            node.contentHash = addContent(contentStore, node.content);
            delete node.content;
          }
        }
      } else {
        chat.branchTree = flatMessagesToBranchTree(chat.messages, contentStore);
      }
    }
  }

  useStore.setState({ contentStore });
  if (parsedData.chats) {
    mergeChats(parsedData.chats);
  }

  return parsedData.chats && parsedData.chats.length > 0
    ? buildSuccessResult(t('notifications.successfulImport', { ns: 'import' }))
    : buildFailureResult(t('notifications.quotaExceeded', { ns: 'import' }));
};

const importExportV1 = (
  parsedData: ExportV1,
  removedChatsCount: number,
  originalParsedData: ExportV1,
  t: Translator
): ImportResult => {
  if (!validateExportV1(parsedData)) {
    return buildFailureResult(
      t('notifications.invalidFormatForVersion', { ns: 'import' })
    );
  }

  clearMissingFolderReferences(parsedData.chats, parsedData.folders);
  shiftAndMergeFolders(parsedData.folders);

  if (parsedData.chats) {
    const contentStore = { ...useStore.getState().contentStore };
    for (const chat of parsedData.chats) {
      if (!chat.branchTree) {
        chat.branchTree = flatMessagesToBranchTree(chat.messages, contentStore);
      }
    }
    useStore.setState({ contentStore });
    mergeChats(parsedData.chats);
  }

  if (removedChatsCount > 0 && parsedData.chats && parsedData.chats.length > 0) {
    const originalChats = originalParsedData.chats ?? [];
    showToast(
      `${t('reduceMessagesSuccess', { count: removedChatsCount })}. ${t('notifications.chatsImported', {
        ns: 'import',
        imported: originalChats.length - removedChatsCount,
        total: originalChats.length,
      })}`,
      'info',
      15000
    );
  }

  return parsedData.chats && parsedData.chats.length > 0
    ? buildSuccessResult(t('notifications.successfulImport', { ns: 'import' }))
    : buildFailureResult(t('notifications.quotaExceeded', { ns: 'import' }));
};

const importOpenAIData = (
  chatsToImport: OpenAIChat | OpenAIPlaygroundJSON | OpenAIChat[],
  shouldAllowPartialImport: boolean,
  removedChatsCount: number,
  originalParsedData: OpenAIChat[],
  t: Translator
): ImportResult => {
  const chats = importOpenAIChatExport(chatsToImport, shouldAllowPartialImport);

  const contentStore = { ...useStore.getState().contentStore };
  for (const chat of chats) {
    if (!chat.branchTree) {
      chat.branchTree = flatMessagesToBranchTree(chat.messages, contentStore);
    }
  }
  useStore.setState({ contentStore });

  mergeChats(chats);

  if (removedChatsCount > 0) {
    showToast(
      `${t('reduceMessagesSuccess', { count: removedChatsCount })}. ${t('notifications.chatsImported', {
        ns: 'import',
        imported: chats.length,
        total: originalParsedData.length,
      })}`,
      'info',
      15000
    );
  }

  return chats.length > 0
    ? buildSuccessResult(t('notifications.successfulImport', { ns: 'import' }))
    : buildFailureResult(t('notifications.quotaExceeded', { ns: 'import' }));
};

const importParsedData = async (
  parsedData: unknown,
  originalParsedData: unknown,
  type: ImportType,
  t: Translator,
  shouldAllowPartialImport: boolean,
  mode: ImportMode,
  includeSettings: boolean = true
): Promise<ImportResult> => {
  let chatsToImport = parsedData;
  let removedChatsCount = 0;
  let reduceImport = false;

  while (true) {
    try {
      if (mode === 'replace') {
        if (includeSettings) {
          resetPersistedStateForReplace();
        } else {
          resetChatsOnlyForReplace();
        }
      }

      switch (type) {
        case 'OpenAIContent':
          return importOpenAIData(
            chatsToImport as OpenAIChat | OpenAIPlaygroundJSON | OpenAIChat[],
            shouldAllowPartialImport,
            removedChatsCount,
            originalParsedData as OpenAIChat[],
            t
          );
        case 'SingleChat':
          return importLegacyChats(
            [chatsToImport],
            removedChatsCount,
            [originalParsedData],
            t
          );
        case 'LegacyImport':
          return importLegacyChats(
            chatsToImport as unknown[],
            removedChatsCount,
            originalParsedData as unknown[],
            t
          );
        case 'ExportV3':
          return importExportV3(parsedData as ExportV3, t, mode, includeSettings);
        case 'ExportV2':
          return importExportV2(parsedData as ExportV2, t);
        case 'ExportV1':
          return importExportV1(
            parsedData as ExportV1,
            removedChatsCount,
            originalParsedData as ExportV1,
            t
          );
        default:
          return buildFailureResult(
            t('notifications.unrecognisedDataFormat', { ns: 'import' })
          );
      }
    } catch (error: unknown) {
      if ((error as DOMException).name === 'QuotaExceededError') {
        if (type === 'ExportV1') {
          if (!isRecord(chatsToImport) || !Array.isArray(chatsToImport.chats) || !chatsToImport.chats.length) {
            return buildFailureResult(t('notifications.quotaExceeded', { ns: 'import' }));
          }
          if (reduceImport) {
            chatsToImport.chats.pop();
            removedChatsCount++;
            continue;
          }
        } else {
          if (!Array.isArray(chatsToImport) || !chatsToImport.length) {
            return buildFailureResult(t('notifications.quotaExceeded', { ns: 'import' }));
          }
          if (reduceImport) {
            chatsToImport.pop();
            removedChatsCount++;
            continue;
          }
        }

        const confirmMessage = t('reduceMessagesFailedImportWarning');
        if (window.confirm(confirmMessage)) {
          reduceImport = true;
          continue;
        }
        return buildFailureResult(t('notifications.quotaExceeded', { ns: 'import' }));
      }

      if (error instanceof PartialImportError) {
        const confirmMessage = t('partialImportWarning', { message: error.message });
        if (window.confirm(confirmMessage)) {
          shouldAllowPartialImport = true;
          reduceImport = true;
          continue;
        }
        return buildFailureResult(t('notifications.nothingImported', { ns: 'import' }));
      }

      return buildFailureResult((error as Error).message);
    }
  }
};

export const importChatFromFile = async (
  file: File,
  t: Translator,
  mode: ImportMode = 'append',
  includeSettings: boolean = true
): Promise<ImportResult> => {
  const snapshot = takeSnapshot();

  try {
    const data = await readImportFile(file);
    const parsedData = JSON.parse(data);
    const originalParsedData = JSON.parse(data);
    const type = detectImportType(parsedData);
    const result = await importParsedData(
      parsedData,
      originalParsedData,
      type,
      t,
      false,
      mode,
      includeSettings
    );

    if (!result.success) {
      restoreSnapshot(snapshot);
    } else if (mode === 'replace') {
      const chats = useStore.getState().chats;
      useStore.getState().setCurrentChatIndex(chats && chats.length > 0 ? 0 : -1);
    }

    return result;
  } catch (error: unknown) {
    restoreSnapshot(snapshot);
    return buildFailureResult((error as Error).message);
  }
};
