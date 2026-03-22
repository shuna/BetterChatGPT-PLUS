import i18n from '@src/i18n';
import { showToast } from '@utils/showToast';

const QUOTA_EXCEEDED_MESSAGE = 'storageQuotaExceeded';

export const getStorageQuotaExceededMessage = () =>
  i18n.t(QUOTA_EXCEEDED_MESSAGE, {
    defaultValue: '保存容量の上限に達したため、保存できませんでした',
  });

export const isQuotaExceededError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;

  const maybeDomError = error as DOMException & { code?: number; message?: string };
  if (
    maybeDomError.name === 'QuotaExceededError' ||
    maybeDomError.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    maybeDomError.code === 22 ||
    maybeDomError.code === 1014
  ) {
    return true;
  }

  if (typeof maybeDomError.message === 'string' && /quota/i.test(maybeDomError.message)) {
    return true;
  }

  return false;
};

export const notifyStorageError = (error: unknown) => {
  if (isQuotaExceededError(error)) {
    showToast(getStorageQuotaExceededMessage(), 'error');
    return;
  }

  showToast(error instanceof Error ? error.message : String(error), 'error');
};

export const setLocalStorageItem = (name: string, value: string) => {
  try {
    localStorage.setItem(name, value);
  } catch (error) {
    notifyStorageError(error);
    throw error;
  }
};
