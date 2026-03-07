import { defaultAPIEndpoint } from '@constants/auth';
import { StoreSlice } from './store';

export interface AuthSlice {
  apiKey?: string;
  apiEndpoint: string;
  apiVersion?: string;
  firstVisit: boolean;
  setApiKey: (apiKey: string) => void;
  setApiEndpoint: (apiEndpoint: string) => void;
  setApiVersion: (apiVersion: string) => void;
  setFirstVisit: (firstVisit: boolean) => void;
}

export const createAuthSlice: StoreSlice<AuthSlice> = (set, get) => ({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY || undefined,
  apiEndpoint: defaultAPIEndpoint,
  apiVersion: undefined,
  firstVisit: true,
  setApiKey: (apiKey: string) => {
    if (get().apiKey === apiKey) return;
    set((prev: AuthSlice) => ({
      ...prev,
      apiKey: apiKey,
    }));
  },
  setApiEndpoint: (apiEndpoint: string) => {
    if (get().apiEndpoint === apiEndpoint) return;
    set((prev: AuthSlice) => ({
      ...prev,
      apiEndpoint: apiEndpoint,
    }));
  },
  setApiVersion: (apiVersion: string) => {
    if (get().apiVersion === apiVersion) return;
    set((prev: AuthSlice) => ({
      ...prev,
      apiVersion: apiVersion,
    }));
  },
  setFirstVisit: (firstVisit: boolean) => {
    if (get().firstVisit === firstVisit) return;
    set((prev: AuthSlice) => ({
      ...prev,
      firstVisit: firstVisit,
    }));
  },
});
