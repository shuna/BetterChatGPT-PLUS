import { ToastStatus } from '@components/Toast/Toast';
import { StoreSlice } from './store';

const TOAST_DEDUP_WINDOW_MS = 3000;

export const DEFAULT_TOAST_DURATION: Record<ToastStatus, number> = {
  success: 5000,
  info: 5000,
  error: 0,
  warning: 0,
};

export interface ToastSlice {
  toastShow: boolean;
  toastMessage: string;
  toastStatus: ToastStatus;
  toastDuration: number;
  _toastLastKey: string;
  _toastLastShownAt: number;
  setToastShow: (toastShow: boolean) => void;
  setToastMessage: (toastMessage: string) => void;
  setToastStatus: (toastStatus: ToastStatus) => void;
  setToastDuration: (duration: number) => void;
}

export const createToastSlice: StoreSlice<ToastSlice> = (set, get) => ({
  toastShow: false,
  toastMessage: '',
  toastStatus: 'success',
  toastDuration: 5000,
  _toastLastKey: '',
  _toastLastShownAt: 0,
  setToastShow: (toastShow: boolean) => {
    if (toastShow) {
      const state = get();
      const currentKey = `${state.toastMessage}::${state.toastStatus}`;
      const now = Date.now();
      if (
        currentKey === state._toastLastKey &&
        now - state._toastLastShownAt < TOAST_DEDUP_WINDOW_MS
      ) {
        return;
      }
      set((prev) => ({
        ...prev,
        toastShow: true,
        _toastLastKey: currentKey,
        _toastLastShownAt: now,
      }));
    } else {
      set((prev) => ({ ...prev, toastShow: false }));
    }
  },
  setToastMessage: (toastMessage: string) => {
    set((prev: ToastSlice) => ({ ...prev, toastMessage }));
  },
  setToastStatus: (toastStatus: ToastStatus) => {
    set((prev: ToastSlice) => ({ ...prev, toastStatus }));
  },
  setToastDuration: (duration: number) => {
    set((prev: ToastSlice) => ({ ...prev, toastDuration: duration }));
  },
});
