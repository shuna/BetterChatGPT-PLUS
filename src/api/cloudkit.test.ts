import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock import.meta.env before importing the module
const mockEnv = vi.hoisted(() => ({
  VITE_CLOUDKIT_CONTAINER_ID: 'iCloud.com.example.weavelet',
  VITE_CLOUDKIT_ENVIRONMENT: 'development',
  VITE_CLOUDKIT_API_TOKEN: 'test-api-token',
}));

vi.stubEnv('VITE_CLOUDKIT_CONTAINER_ID', mockEnv.VITE_CLOUDKIT_CONTAINER_ID);
vi.stubEnv('VITE_CLOUDKIT_ENVIRONMENT', mockEnv.VITE_CLOUDKIT_ENVIRONMENT);
vi.stubEnv('VITE_CLOUDKIT_API_TOKEN', mockEnv.VITE_CLOUDKIT_API_TOKEN);

import {
  CloudKitConflictError,
  deleteCloudKitRecord,
  fetchCloudKitCurrentUser,
  fetchCloudKitRecord,
  getCloudKitAuthUrl,
  getCloudKitConfig,
  isCloudKitAuthError,
  saveCloudKitRecord,
} from './cloudkit';

const mockFetch = vi.fn();

describe('CloudKit API', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getCloudKitConfig', () => {
    it('returns config when env vars are set', () => {
      const config = getCloudKitConfig();
      expect(config).toEqual({
        containerId: 'iCloud.com.example.weavelet',
        environment: 'development',
        apiToken: 'test-api-token',
      });
    });
  });

  describe('getCloudKitAuthUrl', () => {
    it('builds auth URL with container, environment, and redirect', () => {
      const config = getCloudKitConfig()!;
      const redirectURL = 'https://example.com/cloudkit-auth-callback.html';
      const url = getCloudKitAuthUrl(config, redirectURL);

      expect(url).toContain(config.containerId);
      expect(url).toContain(config.environment);
      expect(url).toContain(encodeURIComponent(config.apiToken));
      expect(url).toContain(encodeURIComponent(redirectURL));
    });
  });

  describe('fetchCloudKitCurrentUser', () => {
    it('extracts userRecordName from users collection', async () => {
      const config = getCloudKitConfig()!;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [{ userRecordName: '_user-123' }] }),
      });

      const result = await fetchCloudKitCurrentUser(config, 'ck-token');
      expect(result.userRecordName).toBe('_user-123');
    });

    it('passes auth via query parameters, not headers', async () => {
      const config = getCloudKitConfig()!;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [{ userRecordName: '_user-123' }] }),
      });

      await fetchCloudKitCurrentUser(config, 'ck-token');
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('ckAPIToken=');
      expect(url).toContain('ckWebAuthToken=ck-token');
      // Should not use custom auth headers
      const options = mockFetch.mock.calls[0][1] as RequestInit;
      expect(options.headers).toBeUndefined();
    });

    it('returns newWebAuthToken when present', async () => {
      const config = getCloudKitConfig()!;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          users: [{ userRecordName: '_user-123' }],
          ckWebAuthToken: 'new-token',
        }),
      });

      const result = await fetchCloudKitCurrentUser(config, 'ck-token');
      expect(result.newWebAuthToken).toBe('new-token');
    });

    it('does not return newWebAuthToken when absent', async () => {
      const config = getCloudKitConfig()!;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [{ userRecordName: '_user-123' }] }),
      });

      const result = await fetchCloudKitCurrentUser(config, 'ck-token');
      expect(result.newWebAuthToken).toBeUndefined();
    });

    it('throws AUTHENTICATION_REQUIRED when users collection is empty', async () => {
      const config = getCloudKitConfig()!;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [] }),
      });

      await expect(
        fetchCloudKitCurrentUser(config, 'ck-token')
      ).rejects.toThrow('AUTHENTICATION_REQUIRED');
    });

    it('throws AUTHENTICATION_REQUIRED when users is missing', async () => {
      const config = getCloudKitConfig()!;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await expect(
        fetchCloudKitCurrentUser(config, 'ck-token')
      ).rejects.toThrow('AUTHENTICATION_REQUIRED');
    });

    it('throws AUTHENTICATION_REQUIRED on 401 response', async () => {
      const config = getCloudKitConfig()!;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(
        fetchCloudKitCurrentUser(config, 'ck-token')
      ).rejects.toThrow('AUTHENTICATION_REQUIRED');
    });

    it('throws AUTHENTICATION_REQUIRED on 403 response', async () => {
      const config = getCloudKitConfig()!;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      await expect(
        fetchCloudKitCurrentUser(config, 'ck-token')
      ).rejects.toThrow('AUTHENTICATION_REQUIRED');
    });

    it('preserves non-auth errors for config/environment failures', async () => {
      const config = getCloudKitConfig()!;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(
        fetchCloudKitCurrentUser(config, 'ck-token')
      ).rejects.toThrow('CloudKit users/current failed: 500 Internal Server Error');
    });
  });

  describe('saveCloudKitRecord', () => {
    it('saves a record and returns it', async () => {
      const config = getCloudKitConfig()!;
      const savedRecord = {
        recordName: 'weavelet-default-snapshot',
        recordType: 'WeaveletSnapshot',
        recordChangeTag: 'tag-1',
        fields: {
          payload: { value: 'base64data' },
          snapshotVersion: { value: 17 },
          updatedAt: { value: 1234567890 },
          deviceId: { value: 'device-1' },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ records: [savedRecord] }),
      });

      const result = await saveCloudKitRecord(
        config,
        'ck-token',
        'weavelet-default-snapshot',
        'base64data',
        17,
        'device-1'
      );

      expect(result.record).toEqual(savedRecord);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.operations[0].operationType).toBe('create');
    });

    it('sends update operationType when recordChangeTag is provided', async () => {
      const config = getCloudKitConfig()!;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          records: [{ recordName: 'rec', recordChangeTag: 'tag-2', fields: {} }],
        }),
      });

      await saveCloudKitRecord(
        config,
        'ck-token',
        'rec',
        'payload',
        17,
        'device-1',
        'tag-1'
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.operations[0].operationType).toBe('update');
      expect(body.operations[0].record.recordChangeTag).toBe('tag-1');
    });

    it('throws CloudKitConflictError on SERVER_RECORD_CHANGED', async () => {
      const config = getCloudKitConfig()!;
      const serverRecord = {
        recordName: 'rec',
        recordChangeTag: 'server-tag',
        fields: { payload: { value: 'server-data' } },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          records: [
            {
              recordName: 'rec',
              serverErrorCode: 'SERVER_RECORD_CHANGED',
              reason: 'Conflict',
              serverRecord,
            },
          ],
        }),
      });

      try {
        await saveCloudKitRecord(config, 'ck-token', 'rec', 'payload', 17, 'device-1', 'old-tag');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(CloudKitConflictError);
        expect((e as CloudKitConflictError).serverRecord).toEqual(serverRecord);
      }
    });

    it('throws on auth errors', async () => {
      const config = getCloudKitConfig()!;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          records: [
            {
              recordName: 'rec',
              serverErrorCode: 'AUTHENTICATION_REQUIRED',
              reason: 'AUTHENTICATION_REQUIRED',
            },
          ],
        }),
      });

      await expect(
        saveCloudKitRecord(config, 'ck-token', 'rec', 'payload', 17, 'device-1')
      ).rejects.toThrow('AUTHENTICATION_REQUIRED');
    });
  });

  describe('fetchCloudKitRecord', () => {
    it('returns a record on success', async () => {
      const config = getCloudKitConfig()!;
      const record = {
        recordName: 'rec',
        recordType: 'WeaveletSnapshot',
        recordChangeTag: 'tag-1',
        fields: { payload: { value: 'data' } },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ records: [record] }),
      });

      const result = await fetchCloudKitRecord(config, 'ck-token', 'rec');
      expect(result.record).toEqual(record);
    });

    it('returns null when record does not exist', async () => {
      const config = getCloudKitConfig()!;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          records: [
            {
              recordName: 'rec',
              serverErrorCode: 'RECORD_DOES_NOT_EXIST',
              reason: 'Record not found',
            },
          ],
        }),
      });

      const result = await fetchCloudKitRecord(config, 'ck-token', 'rec');
      expect(result.record).toBeNull();
    });

    it('throws on auth error', async () => {
      const config = getCloudKitConfig()!;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          records: [
            {
              recordName: 'rec',
              serverErrorCode: 'NOT_AUTHENTICATED',
              reason: 'NOT_AUTHENTICATED',
            },
          ],
        }),
      });

      await expect(
        fetchCloudKitRecord(config, 'ck-token', 'rec')
      ).rejects.toThrow('NOT_AUTHENTICATED');
    });
  });

  describe('deleteCloudKitRecord', () => {
    it('deletes successfully', async () => {
      const config = getCloudKitConfig()!;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ records: [{ recordName: 'rec' }] }),
      });

      const result = await deleteCloudKitRecord(config, 'ck-token', 'rec');
      expect(result).toBeDefined();
    });
  });

  describe('isCloudKitAuthError', () => {
    it.each([
      'AUTHENTICATION_REQUIRED',
      'NOT_AUTHENTICATED',
      'AUTHENTICATION_FAILED',
    ])('returns true for %s', (code) => {
      expect(isCloudKitAuthError(new Error(code))).toBe(true);
    });

    it('returns false for non-auth errors', () => {
      expect(isCloudKitAuthError(new Error('QUOTA_EXCEEDED'))).toBe(false);
      expect(isCloudKitAuthError(new Error('random error'))).toBe(false);
      expect(isCloudKitAuthError('string error')).toBe(false);
    });

    it('returns false for non-Error values', () => {
      expect(isCloudKitAuthError(null)).toBe(false);
      expect(isCloudKitAuthError(undefined)).toBe(false);
      expect(isCloudKitAuthError(42)).toBe(false);
    });
  });
});
