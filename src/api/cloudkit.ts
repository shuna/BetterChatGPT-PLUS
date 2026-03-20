export const CLOUDKIT_RECORD_TYPE = 'WeaveletSnapshot';
export const CLOUDKIT_DEFAULT_RECORD_NAME = 'weavelet-default-snapshot';

export interface CloudKitConfig {
  containerId: string;
  environment: 'development' | 'production';
  apiToken: string;
}

export const getCloudKitConfig = (): CloudKitConfig | null => {
  const containerId = import.meta.env.VITE_CLOUDKIT_CONTAINER_ID;
  const apiToken = import.meta.env.VITE_CLOUDKIT_API_TOKEN;
  if (!containerId || !apiToken) return null;

  const environment =
    (import.meta.env.VITE_CLOUDKIT_ENVIRONMENT as 'development' | 'production') ||
    'development';

  return { containerId, environment, apiToken };
};

// --- Auth ---

const buildBaseUrl = (config: CloudKitConfig, database: string = 'private') =>
  `https://api.apple-cloudkit.com/database/1/${config.containerId}/${config.environment}/${database}`;

export const getCloudKitAuthUrl = (
  config: CloudKitConfig,
  redirectURL: string
): string =>
  `https://api.apple-cloudkit.com/database/1/${config.containerId}/${config.environment}/private/users/current?ckAPIToken=${encodeURIComponent(config.apiToken)}&ckWebAuthToken=&ckRedirectURL=${encodeURIComponent(redirectURL)}`;

// --- Error classification ---

const AUTH_ERROR_REASONS = new Set([
  'AUTHENTICATION_REQUIRED',
  'NOT_AUTHENTICATED',
  'AUTHENTICATION_FAILED',
]);

export class CloudKitConflictError extends Error {
  constructor(
    message: string,
    public readonly serverRecord: CloudKitRecord | null
  ) {
    super(message);
    this.name = 'CloudKitConflictError';
  }
}

export const isCloudKitAuthError = (error: unknown): boolean => {
  if (error instanceof Error) {
    return AUTH_ERROR_REASONS.has(error.message) ||
      /AUTHENTICATION_REQUIRED|NOT_AUTHENTICATED|AUTHENTICATION_FAILED/.test(error.message);
  }
  return false;
};

// --- Types ---

export interface CloudKitRecord {
  recordName: string;
  recordType: string;
  recordChangeTag?: string;
  fields: {
    payload?: { value: string; type?: string };
    snapshotVersion?: { value: number; type?: string };
    updatedAt?: { value: number; type?: string };
    deviceId?: { value: string; type?: string };
  };
}

interface CloudKitResponse {
  records?: CloudKitRecord[];
  ckWebAuthToken?: string;
}

interface CloudKitUserRecord {
  userRecordName: string;
}

interface CloudKitUserResponse {
  users?: CloudKitUserRecord[];
  ckWebAuthToken?: string;
}

interface CloudKitErrorRecord {
  recordName?: string;
  reason?: string;
  serverErrorCode?: string;
  serverRecord?: CloudKitRecord;
}

// --- Helpers ---

const extractNewWebAuthToken = (
  response: CloudKitResponse
): string | undefined => response.ckWebAuthToken || undefined;

const handleCloudKitResponse = async (
  res: Response
): Promise<CloudKitResponse> => {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`CloudKit request failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<CloudKitResponse>;
};

const checkRecordErrors = (
  records: Array<CloudKitRecord | CloudKitErrorRecord>
): void => {
  for (const record of records) {
    const errorRecord = record as CloudKitErrorRecord;
    if (!errorRecord.serverErrorCode) continue;

    const code = errorRecord.serverErrorCode;
    const reason = errorRecord.reason || code;

    if (code === 'RECORD_DOES_NOT_EXIST') return; // handled by caller
    if (code === 'SERVER_RECORD_CHANGED') {
      throw new CloudKitConflictError(
        reason,
        errorRecord.serverRecord ?? null
      );
    }
    if (AUTH_ERROR_REASONS.has(code)) {
      throw new Error(code);
    }
    throw new Error(reason);
  }
};

// --- API ---

export const fetchCloudKitCurrentUser = async (
  config: CloudKitConfig,
  ckWebAuthToken: string
): Promise<{ userRecordName: string; newWebAuthToken?: string }> => {
  const url =
    `${buildBaseUrl(config)}/users/current` +
    `?ckAPIToken=${encodeURIComponent(config.apiToken)}` +
    `&ckWebAuthToken=${encodeURIComponent(ckWebAuthToken)}`;

  const res = await fetch(url, { method: 'GET' });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Distinguish auth failures from config/environment errors so the UI
    // can surface specific messages instead of always showing "reconnect".
    if (res.status === 401 || res.status === 403) {
      throw new Error('AUTHENTICATION_REQUIRED');
    }
    throw new Error(`CloudKit users/current failed: ${res.status} ${text}`);
  }

  // CloudKit users/current returns { users: [{ userRecordName, ... }] }
  const data = (await res.json()) as CloudKitUserResponse;
  const userRecord = data.users?.[0];
  if (!userRecord?.userRecordName) {
    throw new Error('AUTHENTICATION_REQUIRED');
  }

  return {
    userRecordName: userRecord.userRecordName,
    newWebAuthToken: data.ckWebAuthToken || undefined,
  };
};

const buildAuthenticatedUrl = (
  config: CloudKitConfig,
  path: string,
  ckWebAuthToken: string
): string =>
  `${buildBaseUrl(config)}/${path}` +
  `?ckAPIToken=${encodeURIComponent(config.apiToken)}` +
  `&ckWebAuthToken=${encodeURIComponent(ckWebAuthToken)}`;

export const saveCloudKitRecord = async (
  config: CloudKitConfig,
  ckWebAuthToken: string,
  recordName: string,
  payload: string,
  snapshotVersion: number,
  deviceId: string,
  recordChangeTag?: string,
  updatedAt?: number
): Promise<{ record: CloudKitRecord; newWebAuthToken?: string }> => {
  const url = buildAuthenticatedUrl(config, 'records/modify', ckWebAuthToken);

  const record: Record<string, unknown> = {
    recordType: CLOUDKIT_RECORD_TYPE,
    recordName,
    fields: {
      payload: { value: payload, type: 'BYTES' },
      snapshotVersion: { value: snapshotVersion, type: 'INT64' },
      updatedAt: { value: updatedAt ?? Date.now(), type: 'INT64' },
      deviceId: { value: deviceId, type: 'STRING' },
    },
  };

  if (recordChangeTag) {
    record.recordChangeTag = recordChangeTag;
  }

  const body = {
    operations: [
      {
        operationType: recordChangeTag ? 'update' : 'create',
        record,
      },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await handleCloudKitResponse(res);
  const records = data.records ?? [];
  checkRecordErrors(records);

  const savedRecord = records[0] as CloudKitRecord;
  return {
    record: savedRecord,
    newWebAuthToken: extractNewWebAuthToken(data),
  };
};

export const fetchCloudKitRecord = async (
  config: CloudKitConfig,
  ckWebAuthToken: string,
  recordName: string
): Promise<{ record: CloudKitRecord | null; newWebAuthToken?: string }> => {
  const url = buildAuthenticatedUrl(config, 'records/lookup', ckWebAuthToken);

  const body = {
    records: [{ recordName }],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await handleCloudKitResponse(res);
  const records = data.records ?? [];

  // Check for NOT_FOUND
  const errorRecord = records[0] as CloudKitErrorRecord | undefined;
  if (errorRecord?.serverErrorCode === 'RECORD_DOES_NOT_EXIST') {
    return { record: null, newWebAuthToken: extractNewWebAuthToken(data) };
  }

  checkRecordErrors(records);

  return {
    record: (records[0] as CloudKitRecord) ?? null,
    newWebAuthToken: extractNewWebAuthToken(data),
  };
};

export const deleteCloudKitRecord = async (
  config: CloudKitConfig,
  ckWebAuthToken: string,
  recordName: string
): Promise<{ newWebAuthToken?: string }> => {
  const url = buildAuthenticatedUrl(config, 'records/modify', ckWebAuthToken);

  const body = {
    operations: [
      {
        operationType: 'delete',
        record: {
          recordType: CLOUDKIT_RECORD_TYPE,
          recordName,
        },
      },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await handleCloudKitResponse(res);
  const records = data.records ?? [];
  checkRecordErrors(records);

  return { newWebAuthToken: extractNewWebAuthToken(data) };
};
