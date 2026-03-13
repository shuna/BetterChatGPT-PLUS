import { StoreSlice } from './store';
import { ChatInterface, FolderCollection, GeneratingSession, MessageInterface } from '@type/chat';
import { notifyStorageError, setLocalStorageItem } from './storage/storageErrors';

export interface ChatSlice {
  messages: MessageInterface[];
  chats?: ChatInterface[];
  collapsedNodeMaps: Record<string, Record<string, boolean>>;
  currentChatIndex: number;
  generatingSessions: Record<string, GeneratingSession>;
  error: string;
  lastSubmitMode: 'append' | 'midchat' | null;
  lastSubmitIndex: number | null;
  lastSubmitChatIndex: number | null;
  lastSubmitChatId: string | null;
  folders: FolderCollection;
  setMessages: (messages: MessageInterface[]) => void;
  setChats: (chats: ChatInterface[]) => void;
  setCurrentChatIndex: (currentChatIndex: number) => void;
  setError: (error: string) => void;
  setLastSubmitContext: (
    mode: 'append' | 'midchat' | null,
    index: number | null,
    chatIndex: number | null,
    chatId?: string | null
  ) => void;
  setFolders: (folders: FolderCollection) => void;
  addSession: (session: GeneratingSession) => void;
  removeSession: (sessionId: string) => void;
  updateSession: (sessionId: string, patch: Partial<GeneratingSession>) => void;
  removeSessionsForChat: (chatId: string) => void;
  toggleCollapseNode: (chatIndex: number, messageIndex: number) => void;
  setAllCollapsed: (chatIndex: number, collapsed: boolean) => void;
}

const getCollapsedMapKey = (chatIndex: number) => String(chatIndex);

const getCollapsedNodesForChat = (
  chats: ChatInterface[] | undefined,
  collapsedNodeMaps: Record<string, Record<string, boolean>>,
  chatIndex: number
) => {
  const mapKey = getCollapsedMapKey(chatIndex);
  return collapsedNodeMaps[mapKey] ?? chats?.[chatIndex]?.collapsedNodes ?? {};
};

const buildCollapsedNodeMaps = (chats: ChatInterface[] | undefined) => {
  const next: Record<string, Record<string, boolean>> = {};
  chats?.forEach((chat, index) => {
    if (chat.collapsedNodes && Object.keys(chat.collapsedNodes).length > 0) {
      next[getCollapsedMapKey(index)] = { ...chat.collapsedNodes };
    }
  });
  return next;
};

const hasSameChatOrder = (
  prevChats: ChatInterface[] | undefined,
  nextChats: ChatInterface[]
) => {
  if (!prevChats || prevChats.length !== nextChats.length) return false;
  return prevChats.every((chat, index) => chat.id === nextChats[index]?.id);
};

export const createChatSlice: StoreSlice<ChatSlice> = (set, get) => {
  return {
    messages: [],
    collapsedNodeMaps: {},
    currentChatIndex: -1,
    generatingSessions: {},
    error: '',
    lastSubmitMode: null,
    lastSubmitIndex: null,
    lastSubmitChatIndex: null,
    lastSubmitChatId: null,
    folders: {},
    setMessages: (messages: MessageInterface[]) => {
      set((prev: ChatSlice) => ({
        ...prev,
        messages: messages,
      }));
    },
    setChats: (chats: ChatInterface[]) => {
      try {
        set((prev: ChatSlice) => ({
          ...prev,
          chats: chats,
          collapsedNodeMaps: hasSameChatOrder(prev.chats, chats)
            ? prev.collapsedNodeMaps
            : buildCollapsedNodeMaps(chats),
        }));
      } catch (e: unknown) {
        notifyStorageError(e);
        throw e;
      }
    },
    setCurrentChatIndex: (currentChatIndex: number) => {
      if (get().currentChatIndex === currentChatIndex) return;
      set((prev: ChatSlice) => ({
        ...prev,
        currentChatIndex: currentChatIndex,
      }));
      // Persist separately to avoid triggering heavy main-store serialization
      setLocalStorageItem('currentChatIndex', String(currentChatIndex));
    },
    setLastSubmitContext: (
      mode: 'append' | 'midchat' | null,
      index: number | null,
      chatIndex: number | null,
      chatId?: string | null
    ) => {
      set((prev: ChatSlice) => ({
        ...prev,
        lastSubmitMode: mode,
        lastSubmitIndex: index,
        lastSubmitChatIndex: chatIndex,
        lastSubmitChatId: chatId ?? null,
      }));
    },
    setError: (error: string) => {
      set((prev: ChatSlice) => ({
        ...prev,
        error: error,
      }));
    },
    setFolders: (folders: FolderCollection) => {
      set((prev: ChatSlice) => ({
        ...prev,
        folders: folders,
      }));
    },
    addSession: (session: GeneratingSession) => {
      set((prev: ChatSlice) => ({
        ...prev,
        generatingSessions: {
          ...prev.generatingSessions,
          [session.sessionId]: session,
        },
      }));
    },
    removeSession: (sessionId: string) => {
      set((prev: ChatSlice) => {
        const next = { ...prev.generatingSessions };
        delete next[sessionId];
        return { ...prev, generatingSessions: next };
      });
    },
    updateSession: (sessionId: string, patch: Partial<GeneratingSession>) => {
      set((prev: ChatSlice) => {
        const session = prev.generatingSessions[sessionId];
        if (!session) return prev;
        return {
          ...prev,
          generatingSessions: {
            ...prev.generatingSessions,
            [sessionId]: { ...session, ...patch },
          },
        };
      });
    },
    removeSessionsForChat: (chatId: string) => {
      set((prev: ChatSlice) => {
        const next: Record<string, GeneratingSession> = {};
        for (const [k, v] of Object.entries(prev.generatingSessions)) {
          if (v.chatId !== chatId) next[k] = v;
        }
        return { ...prev, generatingSessions: next };
      });
    },
    toggleCollapseNode: (chatIndex: number, messageIndex: number) => {
      const chats = get().chats;
      if (!chats) return;
      const chat = chats[chatIndex];
      if (!chat) return;
      const nodeId = chat.branchTree?.activePath?.[messageIndex] ?? String(messageIndex);
      const prev = getCollapsedNodesForChat(chats, get().collapsedNodeMaps, chatIndex);
      const next = { ...prev };
      if (next[nodeId]) {
        delete next[nodeId];
      } else {
        next[nodeId] = true;
      }
      const mapKey = getCollapsedMapKey(chatIndex);
      set((prev: ChatSlice) => ({
        ...prev,
        collapsedNodeMaps: {
          ...prev.collapsedNodeMaps,
          [mapKey]: next,
        },
      }));
    },
    setAllCollapsed: (chatIndex: number, collapsed: boolean) => {
      const chats = get().chats;
      if (!chats) return;
      const chat = chats[chatIndex];
      if (!chat) return;
      let newCollapsed: Record<string, boolean>;
      if (collapsed) {
        newCollapsed = {};
        if (chat.branchTree?.activePath) {
          chat.branchTree.activePath.forEach((nodeId) => {
            newCollapsed[nodeId] = true;
          });
        } else {
          chat.messages.forEach((_, idx) => {
            newCollapsed[String(idx)] = true;
          });
        }
      } else {
        newCollapsed = {};
      }
      const mapKey = getCollapsedMapKey(chatIndex);
      set((prev: ChatSlice) => ({
        ...prev,
        collapsedNodeMaps: {
          ...prev.collapsedNodeMaps,
          [mapKey]: newCollapsed,
        },
      }));
    },
  };
};
