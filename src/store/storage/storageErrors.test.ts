import { describe, expect, it, vi, beforeEach } from 'vitest';

const { showToastMock, tMock } = vi.hoisted(() => ({
  showToastMock: vi.fn(),
  tMock: vi.fn((key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key),
}));

vi.mock('@utils/showToast', () => ({
  showToast: showToastMock,
}));

vi.mock('@src/i18n', () => ({
  default: {
    t: tMock,
  },
}));

import {
  getStorageQuotaExceededMessage,
  isQuotaExceededError,
  notifyStorageError,
} from './storageErrors';

describe('storageErrors', () => {
  beforeEach(() => {
    showToastMock.mockClear();
    tMock.mockClear();
  });

  it('detects quota errors from browser-specific names and messages', () => {
    expect(isQuotaExceededError(new DOMException('quota', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaExceededError(new DOMException('quota', 'NS_ERROR_DOM_QUOTA_REACHED'))).toBe(true);
    expect(isQuotaExceededError(new Error('The quota has been exceeded.'))).toBe(true);
    expect(isQuotaExceededError(new Error('Something else'))).toBe(false);
  });

  it('uses a localized quota message for quota errors', () => {
    const message = getStorageQuotaExceededMessage();

    expect(message).toBe('保存容量の上限に達したため、保存できませんでした');
    expect(tMock).toHaveBeenCalledWith('storageQuotaExceeded', {
      defaultValue: '保存容量の上限に達したため、保存できませんでした',
    });
  });

  it('shows localized toast for quota errors and raw message otherwise', () => {
    notifyStorageError(new Error('The quota has been exceeded.'));
    notifyStorageError(new Error('boom'));

    expect(showToastMock).toHaveBeenNthCalledWith(1, '保存容量の上限に達したため、保存できませんでした', 'error');
    expect(showToastMock).toHaveBeenNthCalledWith(2, 'boom', 'error');
  });
});
