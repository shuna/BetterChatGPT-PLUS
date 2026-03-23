import { StoreSlice } from './store';
import { ChatInterface, FolderCollection, GeneratingSession, MessageInterface } from '@type/chat';
import { notifyStorageError, setLocalStorageItem } from './storage/storageErrors';

export interface ChatSlice {
  messages: MessageInterface[];
  chats?: ChatInterface[];
  collapsedNodeMaps: Record<string, Record<string, boolean>>;
  omittedNodeMaps: Record<string, Record<string, boolean>>;
  protectedNodeMaps: Record<string, Record<string, boolean>>;
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
  toggleOmitNode: (chatIndex: number, messageIndex: number) => void;
  toggleProtectNode: (chatIndex: number, messageIndex: number) => void;
  setAllOmitted: (chatIndex: number, omitted: boolean) => void;
}

const getMapKey = (chatIndex: number) => String(chatIndex);

const getNodesForChat = (
  chats: ChatInterface[] | undefined,
  maps: Record<string, Record<string, boolean>>,
  chatIndex: number,
  field: 'collapsedNodes' | 'omittedNodes' | 'protectedNodes'
) => {
  const mapKey = getMapKey(chatIndex);
  return maps[mapKey] ?? chats?.[chatIndex]?.[field] ?? {};
};

const buildNodeMaps = (
  chats: ChatInterface[] | undefined,
  field: 'collapsedNodes' | 'omittedNodes' | 'protectedNodes'
) => {
  const next: Record<string, Record<string, boolean>> = {};
  chats?.forEach((chat, index) => {
    const nodes = chat[field];
    if (nodes && Object.keys(nodes).length > 0) {
      next[getMapKey(index)] = { ...nodes };
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
    omittedNodeMaps: {},
    protectedNodeMaps: {},
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
        set((prev: ChatSlice) => {
          const sameOrder = hasSameChatOrder(prev.chats, chats);
          return {
            ...prev,
            chats: chats,
            collapsedNodeMaps: sameOrder
              ? prev.collapsedNodeMaps
              : buildNodeMaps(chats, 'collapsedNodes'),
            omittedNodeMaps: sameOrder
              ? prev.omittedNodeMaps
              : buildNodeMaps(chats, 'omittedNodes'),
            protectedNodeMaps: sameOrder
              ? prev.protectedNodeMaps
              : buildNodeMaps(chats, 'protectedNodes'),
          };
        });
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
      const prev = getNodesForChat(chats, get().collapsedNodeMaps, chatIndex, 'collapsedNodes');
      const next = { ...prev };
      if (next[nodeId]) {
        delete next[nodeId];
      } else {
        next[nodeId] = true;
      }
      const mapKey = getMapKey(chatIndex);
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
      const mapKey = getMapKey(chatIndex);
      set((prev: ChatSlice) => ({
        ...prev,
        collapsedNodeMaps: {
          ...prev.collapsedNodeMaps,
          [mapKey]: newCollapsed,
        },
      }));
    },
    toggleOmitNode: (chatIndex: number, messageIndex: number) => {
      const chats = get().chats;
      if (!chats) return;
      const chat = chats[chatIndex];
      if (!chat) return;
      const nodeId = chat.branchTree?.activePath?.[messageIndex] ?? String(messageIndex);
      const prev = getNodesForChat(chats, get().omittedNodeMaps, chatIndex, 'omittedNodes');
      const next = { ...prev };
      if (next[nodeId]) {
        delete next[nodeId];
      } else {
        next[nodeId] = true;
      }
      const mapKey = getMapKey(chatIndex);
      set((prev: ChatSlice) => ({
        ...prev,
        omittedNodeMaps: {
          ...prev.omittedNodeMaps,
          [mapKey]: next,
        },
      }));
    },
    toggleProtectNode: (chatIndex: number, messageIndex: number) => {
      const chats = get().chats;
      if (!chats) return;
      const chat = chats[chatIndex];
      if (!chat) return;
      const nodeId = chat.branchTree?.activePath?.[messageIndex] ?? String(messageIndex);
      const prev = getNodesForChat(chats, get().protectedNodeMaps, chatIndex, 'protectedNodes');
      const next = { ...prev };
      if (next[nodeId]) {
        delete next[nodeId];
      } else {
        next[nodeId] = true;
      }
      const mapKey = getMapKey(chatIndex);
      set((prev: ChatSlice) => ({
        ...prev,
        protectedNodeMaps: {
          ...prev.protectedNodeMaps,
          [mapKey]: next,
        },
      }));
    },
    setAllOmitted: (chatIndex: number, omitted: boolean) => {
      const chats = get().chats;
      if (!chats) return;
      const chat = chats[chatIndex];
      if (!chat) return;
      let newOmitted: Record<string, boolean>;
      if (omitted) {
        newOmitted = {};
        if (chat.branchTree?.activePath) {
          chat.branchTree.activePath.forEach((nodeId) => {
            newOmitted[nodeId] = true;
          });
        } else {
          chat.messages.forEach((_, idx) => {
            newOmitted[String(idx)] = true;
          });
        }
      } else {
        newOmitted = {};
      }
      const mapKey = getMapKey(chatIndex);
      set((prev: ChatSlice) => ({
        ...prev,
        omittedNodeMaps: {
          ...prev.omittedNodeMaps,
          [mapKey]: newOmitted,
        },
      }));
    },
  };
};
