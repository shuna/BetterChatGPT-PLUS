import { ToastStatus } from '@components/Toast/Toast';
import { StoreSlice } from './store';

const TOAST_DEDUP_WINDOW_MS = 3000;

export interface ToastSlice {
  toastShow: boolean;
  toastMessage: string;
  toastStatus: ToastStatus;
  _toastLastKey: string;
  _toastLastShownAt: number;
  setToastShow: (toastShow: boolean) => void;
  setToastMessage: (toastMessage: string) => void;
  setToastStatus: (toastStatus: ToastStatus) => void;
}

export const createToastSlice: StoreSlice<ToastSlice> = (set, get) => ({
  toastShow: false,
  toastMessage: '',
  toastStatus: 'success',
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
});
