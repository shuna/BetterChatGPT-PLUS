import useStore from '@store/store';
import { DEFAULT_TOAST_DURATION } from '@store/toast-slice';
import type { ToastStatus } from '@components/Toast/Toast';

/**
 * Show a toast notification.
 * @param message  - Text to display
 * @param status   - 'success' | 'info' | 'error' | 'warning'
 * @param duration - Auto-dismiss ms. Omit for defaults (success/info: 5s, error/warning: manual).
 */
export const showToast = (
  message: string,
  status: ToastStatus = 'success',
  duration?: number,
) => {
  const state = useStore.getState();
  state.setToastStatus(status);
  state.setToastMessage(message);
  state.setToastDuration(duration ?? DEFAULT_TOAST_DURATION[status]);
  state.setToastShow(true);
};
