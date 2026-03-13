import { StoreApi, create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import compressedStorage from './storage/CompressedStorage';
import { ChatSlice, createChatSlice } from './chat-slice';
import { InputSlice, createInputSlice } from './input-slice';
import { AuthSlice, createAuthSlice } from './auth-slice';
import { ConfigSlice, createConfigSlice } from './config-slice';
import { PromptSlice, createPromptSlice } from './prompt-slice';
import { ToastSlice, createToastSlice } from './toast-slice';
import { ProviderSlice, createProviderSlice } from './provider-slice';
import { BranchSlice, createBranchSlice } from './branch-slice';
import { STORE_VERSION } from './version';
import {
  createLocalStoragePartializedState,
  createPartializedState,
  migratePersistedState,
  rehydrateStoreState,
} from './persistence';
export { createPartializedState } from './persistence';

export type StoreState = ChatSlice &
  InputSlice &
  AuthSlice &
  ConfigSlice &
  PromptSlice &
  ToastSlice &
  ProviderSlice &
  BranchSlice;

export type StoreSlice<T> = (
  set: StoreApi<StoreState>['setState'],
  get: StoreApi<StoreState>['getState']
) => T;

const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      ...createChatSlice(set, get),
      ...createInputSlice(set, get),
      ...createAuthSlice(set, get),
      ...createConfigSlice(set, get),
      ...createPromptSlice(set, get),
      ...createToastSlice(set, get),
      ...createProviderSlice(set, get),
      ...createBranchSlice(set, get),
    }),
    {
      name: 'free-chat-gpt',
      storage: createJSONStorage(() => compressedStorage),
      partialize: (state) => createLocalStoragePartializedState(state),
      version: STORE_VERSION,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const repaired = rehydrateStoreState(state as StoreState);
        if (repaired && state.chats) {
          state.setChats(state.chats.slice());
        }
      },
      migrate: migratePersistedState,
    }
  )
);

export default useStore;
