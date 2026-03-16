import { beforeEach, describe, expect, it, vi } from 'vitest';

import { _defaultChatConfig, _defaultImageDetail } from '@constants/chat';
import type { ChatInterface, FolderCollection } from '@type/chat';
import { PartialImportError } from '@utils/import';

const testContext = vi.hoisted(() => {
  const toastInfo = vi.fn();
  const toastWarning = vi.fn();
  const initialStoreState = {
    chats: [] as ChatInterface[],
    folders: {} as FolderCollection,
    contentStore: {} as Record<string, unknown>,
    apiKey: undefined as string | undefined,
    theme: 'dark',
    currentChatIndex: -1,
  };
  const storeState: {
    chats: ChatInterface[];
    folders: FolderCollection;
    contentStore: Record<string, unknown>;
    apiKey?: string;
    theme: string;
    currentChatIndex: number;
  } & Record<string, unknown> = {
    ...initialStoreState,
  };
  const setChats = vi.fn((chats: ChatInterface[]) => {
    storeState.chats = chats;
  });
  const setFolders = vi.fn((folders: FolderCollection) => {
    storeState.folders = folders;
  });
  const setCurrentChatIndex = vi.fn((currentChatIndex: number) => {
    storeState.currentChatIndex = currentChatIndex;
  });
  const setState = vi.fn((patch: Record<string, unknown>) => {
    Object.assign(storeState, patch);
  });
  const importOpenAIChatExportMock = vi.fn();
  const createPartializedState = vi.fn((state: typeof storeState) => ({
    chats: state.chats,
    folders: state.folders,
    contentStore: state.contentStore,
    apiKey: state.apiKey,
    theme: state.theme,
  }));

  return {
    toastInfo,
    toastWarning,
    initialStoreState,
    storeState,
    setChats,
    setFolders,
    setCurrentChatIndex,
    setState,
    importOpenAIChatExportMock,
    createPartializedState,
  };
});

vi.mock('react-toastify', () => ({
  toast: {
    info: testContext.toastInfo,
    warning: testContext.toastWarning,
  },
}));

vi.mock('@store/store', () => ({
  default: {
    getState: () => ({
      chats: testContext.storeState.chats,
      folders: testContext.storeState.folders,
      contentStore: testContext.storeState.contentStore,
      apiKey: testContext.storeState.apiKey,
      theme: testContext.storeState.theme,
      currentChatIndex: testContext.storeState.currentChatIndex,
      providerCustomModels: {},
      setChats: testContext.setChats,
      setFolders: testContext.setFolders,
      setCurrentChatIndex: testContext.setCurrentChatIndex,
    }),
    getInitialState: () => ({
      ...testContext.initialStoreState,
    }),
    setState: testContext.setState,
  },
  createPartializedState: testContext.createPartializedState,
}));

vi.mock('@utils/import', async () => {
  const actual = await vi.importActual<typeof import('@utils/import')>('@utils/import');
  return {
    ...actual,
    importOpenAIChatExport: testContext.importOpenAIChatExportMock,
  };
});

class MockFileReader {
  public onload: ((event: { target: { result: string } }) => void) | null = null;

  readAsText(file: File) {
    file.text().then((text) => {
      this.onload?.({ target: { result: text } });
    });
  }
}

Object.defineProperty(globalThis, 'FileReader', {
  value: MockFileReader,
  configurable: true,
});

Object.defineProperty(globalThis, 'window', {
  value: {
    confirm: vi.fn(),
  },
  configurable: true,
});

const { importChatFromFile } = await import('./importService');

const t = (key: string) => key;

const createChat = (id: string, title = 'Chat'): ChatInterface => ({
  id,
  title,
  titleSet: true,
  config: { ..._defaultChatConfig },
  imageDetail: _defaultImageDetail,
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
});

describe('importService', () => {
  beforeEach(() => {
    testContext.storeState.chats = [createChat('existing-chat', 'Existing')];
    testContext.storeState.folders = {};
    testContext.storeState.contentStore = {};
    testContext.storeState.apiKey = 'existing-key';
    testContext.storeState.theme = 'light';
    testContext.storeState.currentChatIndex = 0;
    testContext.setChats.mockClear();
    testContext.setFolders.mockClear();
    testContext.setCurrentChatIndex.mockClear();
    testContext.setState.mockClear();
    testContext.toastInfo.mockClear();
    testContext.toastWarning.mockClear();
    testContext.importOpenAIChatExportMock.mockReset();
    testContext.createPartializedState.mockClear();
    vi.mocked(window.confirm).mockReset();
  });

  it('restores snapshot when import format is unrecognized', async () => {
    const file = new File([JSON.stringify({ foo: 'bar' })], 'import.json', {
      type: 'application/json',
    });

    const result = await importChatFromFile(file, t);

    expect(result).toEqual({
      success: false,
      message: 'notifications.unrecognisedDataFormat',
    });
    expect(testContext.storeState.chats).toEqual([createChat('existing-chat', 'Existing')]);
  });

  it('retries partial OpenAI import after confirmation', async () => {
    const importedChat = createChat('imported-chat', 'Imported');
    const openAIExport = [
      {
        title: 'Imported',
        current_node: 'node-1',
        mapping: {
          'node-1': {
            id: 'node-1',
            parent: null,
            children: [],
            message: {
              author: { role: 'user' },
              content: { parts: ['hello'] },
            },
          },
        },
      },
    ];

    testContext.importOpenAIChatExportMock
      .mockImplementationOnce(() => {
        throw new PartialImportError('partial', importedChat);
      })
      .mockReturnValueOnce([importedChat]);
    vi.mocked(window.confirm).mockReturnValue(true);

    const file = new File([JSON.stringify(openAIExport)], 'openai.json', {
      type: 'application/json',
    });

    const result = await importChatFromFile(file, t);

    expect(result).toEqual({
      success: true,
      message: 'notifications.successfulImport',
    });
    expect(testContext.importOpenAIChatExportMock).toHaveBeenCalledTimes(2);
    expect(testContext.storeState.chats[0].id).not.toBe('imported-chat');
    expect(testContext.storeState.chats[0].title).toBe('Imported');
    expect(testContext.storeState.chats[1].id).toBe('existing-chat');
  });

  it('fails and restores snapshot when quota retry is declined', async () => {
    const openAIExport = [
      {
        title: 'Imported',
        current_node: 'node-1',
        mapping: {
          'node-1': {
            id: 'node-1',
            parent: null,
            children: [],
            message: {
              author: { role: 'user' },
              content: { parts: ['hello'] },
            },
          },
        },
      },
    ];

    testContext.importOpenAIChatExportMock.mockImplementation(() => {
      const error = new Error('quota');
      (error as Error & { name: string }).name = 'QuotaExceededError';
      throw error;
    });
    vi.mocked(window.confirm).mockReturnValue(false);

    const file = new File([JSON.stringify(openAIExport)], 'quota.json', {
      type: 'application/json',
    });

    const result = await importChatFromFile(file, t);

    expect(result).toEqual({
      success: false,
      message: 'notifications.quotaExceeded',
    });
    expect(testContext.storeState.chats).toEqual([createChat('existing-chat', 'Existing')]);
  });

  it('deduplicates chat ids when importing export v3 data', async () => {
    const file = new File([
      JSON.stringify({
        version: 3,
        folders: {},
        contentStore: {},
        chats: [createChat('dup-chat', 'Imported A'), createChat('dup-chat', 'Imported B')],
      }),
    ], 'export-v3.json', {
      type: 'application/json',
    });

    const result = await importChatFromFile(file, t);

    expect(result).toEqual({
      success: true,
      message: 'notifications.successfulImport',
    });
    expect(testContext.storeState.chats[0].id).not.toBe('dup-chat');
    expect(testContext.storeState.chats[1].id).not.toBe('dup-chat');
    expect(testContext.storeState.chats[0].id).not.toBe(testContext.storeState.chats[1].id);
  });

  it('clears orphaned folder references when importing a single-chat export v3 file', async () => {
    const orphanedFolderChat: ChatInterface = {
      ...createChat('orphaned-folder-chat', 'Imported Folderless'),
      folder: 'missing-folder-id',
    };
    const file = new File([
      JSON.stringify({
        version: 3,
        folders: {},
        contentStore: {},
        chats: [orphanedFolderChat],
      }),
    ], 'orphaned-folder-v3.json', {
      type: 'application/json',
    });

    const result = await importChatFromFile(file, t);

    expect(result).toEqual({
      success: true,
      message: 'notifications.successfulImport',
    });
    expect(testContext.storeState.chats[0].folder).toBeUndefined();
  });

  it('replaces local conversations and settings when mode is replace', async () => {
    const file = new File([
      JSON.stringify({
        version: 3,
        folders: {},
        contentStore: { abc: { value: 'hello', refCount: 1 } },
        chats: [createChat('imported-chat', 'Imported')],
      }),
    ], 'replace-v3.json', {
      type: 'application/json',
    });

    const result = await importChatFromFile(file, t, 'replace');

    expect(result).toEqual({
      success: true,
      message: 'notifications.successfulImport',
    });
    expect(testContext.storeState.chats).toHaveLength(1);
    expect(testContext.storeState.chats[0].title).toBe('Imported');
    expect(testContext.storeState.chats[0].id).not.toBe('imported-chat');
    expect(testContext.storeState.apiKey).toBeUndefined();
    expect(testContext.storeState.theme).toBe('dark');
    expect(testContext.storeState.currentChatIndex).toBe(0);
  });

  it('quota retry for OpenAI array pops chats until success', async () => {
    const openAIExport = [
      {
        title: 'Chat1',
        current_node: 'n1',
        mapping: { n1: { id: 'n1', parent: null, children: [], message: { author: { role: 'user' }, content: { parts: ['a'] } } } },
      },
      {
        title: 'Chat2',
        current_node: 'n2',
        mapping: { n2: { id: 'n2', parent: null, children: [], message: { author: { role: 'user' }, content: { parts: ['b'] } } } },
      },
    ];

    let callCount = 0;
    testContext.importOpenAIChatExportMock.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        throw new DOMException('quota', 'QuotaExceededError');
      }
      return [createChat('survived')];
    });
    vi.mocked(window.confirm).mockReturnValue(true);

    const file = new File([JSON.stringify(openAIExport)], 'quota-array.json', {
      type: 'application/json',
    });

    const result = await importChatFromFile(file, t);

    expect(result.success).toBe(true);
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(testContext.toastInfo).toHaveBeenCalled();
  });

  it('quota retry for ExportV1 pops chats from .chats array', async () => {
    const exportV1 = {
      version: 1,
      folders: {},
      chats: [
        createChat('v1-chat-1'),
        createChat('v1-chat-2'),
        createChat('v1-chat-3'),
      ],
    };

    let callCount = 0;
    testContext.setChats.mockImplementation((chats: ChatInterface[]) => {
      callCount++;
      if (callCount <= 2) {
        testContext.storeState.chats = chats;
        throw new DOMException('quota', 'QuotaExceededError');
      }
      testContext.storeState.chats = chats;
    });
    vi.mocked(window.confirm).mockReturnValue(true);

    const file = new File([JSON.stringify(exportV1)], 'quota-v1.json', {
      type: 'application/json',
    });

    const result = await importChatFromFile(file, t);

    expect(result.success).toBe(true);
    expect(window.confirm).toHaveBeenCalledTimes(1);
  });

  it('imports a single chat object (not wrapped in array)', async () => {
    const singleChat = createChat('single-chat', 'My Single Chat');
    const file = new File([JSON.stringify(singleChat)], 'single.json', {
      type: 'application/json',
    });

    const result = await importChatFromFile(file, t);

    expect(result).toEqual({
      success: true,
      message: 'notifications.successfulImport',
    });
    expect(testContext.storeState.chats[0].id).not.toBe('single-chat');
    expect(testContext.storeState.chats[0].title).toBe('My Single Chat');
    expect(testContext.storeState.chats[1].id).toBe('existing-chat');
  });

  it('quota retry returns failure when all chats are exhausted', async () => {
    const openAIExport = [
      {
        title: 'Only',
        current_node: 'n1',
        mapping: { n1: { id: 'n1', parent: null, children: [], message: { author: { role: 'user' }, content: { parts: ['x'] } } } },
      },
    ];

    testContext.importOpenAIChatExportMock.mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    vi.mocked(window.confirm).mockReturnValue(true);

    const file = new File([JSON.stringify(openAIExport)], 'quota-exhaust.json', {
      type: 'application/json',
    });

    const result = await importChatFromFile(file, t);

    expect(result).toEqual({
      success: false,
      message: 'notifications.quotaExceeded',
    });
  });
});
