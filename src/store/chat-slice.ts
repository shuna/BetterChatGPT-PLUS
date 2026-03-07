import { StoreSlice } from './store';
import { ChatInterface, FolderCollection, MessageInterface } from '@type/chat';
import { toast } from 'react-toastify';

export interface ChatSlice {
  messages: MessageInterface[];
  chats?: ChatInterface[];
  collapsedNodeMaps: Record<string, Record<string, boolean>>;
  currentChatIndex: number;
  generating: boolean;
  error: string;
  folders: FolderCollection;
  setMessages: (messages: MessageInterface[]) => void;
  setChats: (chats: ChatInterface[]) => void;
  setCurrentChatIndex: (currentChatIndex: number) => void;
  setGenerating: (generating: boolean) => void;
  setError: (error: string) => void;
  setFolders: (folders: FolderCollection) => void;
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
    generating: false,
    error: '',
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
        // Notify if storage quota exceeded
        toast((e as Error).message);
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
      localStorage.setItem('currentChatIndex', String(currentChatIndex));
    },
    setGenerating: (generating: boolean) => {
      set((prev: ChatSlice) => ({
        ...prev,
        generating: generating,
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
    toggleCollapseNode: (chatIndex: number, messageIndex: number) => {
      const chats = get().chats;
      if (!chats) return;
      const chat = chats[chatIndex];
      if (!chat) return;
      const nodeId = chat.branchTree?.activePath?.[messageIndex] ?? String(messageIndex);
      const prev = getCollapsedNodesForChat(chats, get().collapsedNodeMaps, chatIndex);
      const next = { ...prev };
      const wasCollapsed = !!next[nodeId];
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
