import { StoreSlice } from './store';
import { ChatInterface, FolderCollection, MessageInterface } from '@type/chat';
import { toast } from 'react-toastify';

export interface ChatSlice {
  messages: MessageInterface[];
  chats?: ChatInterface[];
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

export const createChatSlice: StoreSlice<ChatSlice> = (set, get) => {
  return {
    messages: [],
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
      // Determine the node key: use nodeId from branchTree if available, else messageIndex string
      const nodeId = chat.branchTree?.activePath?.[messageIndex] ?? String(messageIndex);
      const updatedChats: ChatInterface[] = JSON.parse(JSON.stringify(chats));
      const collapsed = updatedChats[chatIndex].collapsedNodes ?? {};
      collapsed[nodeId] = !collapsed[nodeId];
      if (!collapsed[nodeId]) delete collapsed[nodeId];
      updatedChats[chatIndex].collapsedNodes = collapsed;
      set((prev: ChatSlice) => ({ ...prev, chats: updatedChats }));
    },
    setAllCollapsed: (chatIndex: number, collapsed: boolean) => {
      const chats = get().chats;
      if (!chats) return;
      const chat = chats[chatIndex];
      if (!chat) return;
      const updatedChats: ChatInterface[] = JSON.parse(JSON.stringify(chats));
      if (collapsed) {
        const newCollapsed: Record<string, boolean> = {};
        if (chat.branchTree?.activePath) {
          chat.branchTree.activePath.forEach((nodeId) => {
            newCollapsed[nodeId] = true;
          });
        } else {
          chat.messages.forEach((_, idx) => {
            newCollapsed[String(idx)] = true;
          });
        }
        updatedChats[chatIndex].collapsedNodes = newCollapsed;
      } else {
        updatedChats[chatIndex].collapsedNodes = {};
      }
      set((prev: ChatSlice) => ({ ...prev, chats: updatedChats }));
    },
  };
};
