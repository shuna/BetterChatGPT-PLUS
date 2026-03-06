import { StoreApi, create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import compressedStorage from './storage/CompressedStorage';
import { ChatSlice, createChatSlice } from './chat-slice';
import { InputSlice, createInputSlice } from './input-slice';
import { AuthSlice, createAuthSlice } from './auth-slice';
import { ConfigSlice, createConfigSlice } from './config-slice';
import { PromptSlice, createPromptSlice } from './prompt-slice';
import { ToastSlice, createToastSlice } from './toast-slice';
import { CustomModelsSlice, createCustomModelsSlice } from './custom-models-slice';
import { ProviderSlice, createProviderSlice } from './provider-slice';
import { BranchSlice, createBranchSlice } from './branch-slice';
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
} from '@type/chat';
import {
  migrateV10,
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
} from './migrate';

export type StoreState = ChatSlice &
  InputSlice &
  AuthSlice &
  ConfigSlice &
  PromptSlice &
  ToastSlice &
  CustomModelsSlice &
  ProviderSlice &
  BranchSlice;

export type StoreSlice<T> = (
  set: StoreApi<StoreState>['setState'],
  get: StoreApi<StoreState>['getState']
) => T;

export const createPartializedState = (state: StoreState) => ({
  chats: state.chats,
  currentChatIndex: state.currentChatIndex,
  apiKey: state.apiKey,
  apiVersion: state.apiVersion,
  apiEndpoint: state.apiEndpoint,
  theme: state.theme,
  autoTitle: state.autoTitle,
  advancedMode: state.advancedMode,
  prompts: state.prompts,
  defaultChatConfig: state.defaultChatConfig,
  defaultSystemMessage: state.defaultSystemMessage,
  hideMenuOptions: state.hideMenuOptions,
  firstVisit: state.firstVisit,
  hideSideMenu: state.hideSideMenu,
  folders: state.folders,
  enterToSubmit: state.enterToSubmit,
  inlineLatex: state.inlineLatex,
  markdownMode: state.markdownMode,
  totalTokenUsed: state.totalTokenUsed,
  countTotalTokens: state.countTotalTokens,
  displayChatSize: state.displayChatSize,
  menuWidth: state.menuWidth,
  defaultImageDetail: state.defaultImageDetail,
  autoScroll: state.autoScroll,
  hideShareGPT: state.hideShareGPT,
  customModels: state.customModels,
  providers: state.providers,
  favoriteModels: state.favoriteModels,
  branchClipboard: state.branchClipboard,
});

const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      ...createChatSlice(set, get),
      ...createInputSlice(set, get),
      ...createAuthSlice(set, get),
      ...createConfigSlice(set, get),
      ...createPromptSlice(set, get),
      ...createToastSlice(set, get),
      ...createCustomModelsSlice(set, get),
      ...createProviderSlice(set, get),
      ...createBranchSlice(set, get),
    }),
    {
      name: 'free-chat-gpt',
      storage: createJSONStorage(() => compressedStorage),
      partialize: (state) => createPartializedState(state),
      version: 11,
      migrate: (persistedState, version) => {
        switch (version) {
          case 0:
            migrateV0(persistedState as LocalStorageInterfaceV0ToV1);
          case 1:
            migrateV1(persistedState as LocalStorageInterfaceV1ToV2);
          case 2:
            migrateV2(persistedState as LocalStorageInterfaceV2ToV3);
          case 3:
            migrateV3(persistedState as LocalStorageInterfaceV3ToV4);
          case 4:
            migrateV4(persistedState as LocalStorageInterfaceV4ToV5);
          case 5:
            migrateV5(persistedState as LocalStorageInterfaceV5ToV6);
          case 6:
            migrateV6(persistedState as LocalStorageInterfaceV6ToV7);
          case 7:
            migrateV7(persistedState as LocalStorageInterfaceV7oV8);
          case 8:
            migrateV8_1(persistedState as LocalStorageInterfaceV8oV8_1);
          case 8.1:
            migrateV8_1_fix(persistedState as LocalStorageInterfaceV8_1ToV8_2);
          case 8.2:
            migrateV8_2(persistedState as LocalStorageInterfaceV8_2ToV9);
          case 9:
            migrateV9(persistedState as LocalStorageInterfaceV9ToV10);
          case 10:
            migrateV10(persistedState as LocalStorageInterfaceV10ToV11);
            break;
        }
        return persistedState as StoreState;
      },
    }
  )
);

export default useStore;
