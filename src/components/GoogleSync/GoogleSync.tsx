import React, { useEffect, useRef, useState } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useTranslation } from 'react-i18next';

import useStore from '@store/store';
import useGStore from '@store/cloud-auth-store';

import {
  createDriveFile,
  deleteDriveFile,
  getDriveFileTyped,
  isGoogleAuthError,
  updateDriveFile,
  updateDriveFileName,
  validateGoogleOath2AccessToken,
} from '@api/google-api';
import { getFiles, stateToFile } from '@utils/google-api';
import createGoogleCloudStorage from '@store/storage/GoogleCloudStorage';
import {
  createPersistedChatDataState,
  createLocalStoragePartializedState,
  createPartializedState,
  hydrateFromPersistedStoreState,
  migratePersistedState,
  PersistedStoreState,
} from '@store/persistence';
import { saveChatData } from '@store/storage/IndexedDbStorage';
import { STORE_VERSION } from '@store/version';

import GoogleSyncButton, { GoogleSyncButtonHandle } from './GoogleSyncButton';
import PopupModal from '@components/PopupModal';

import GoogleIcon from '@icon/GoogleIcon';
import TickIcon from '@icon/TickIcon';
import RefreshIcon from '@icon/RefreshIcon';
import DownArrow from '@icon/DownArrow';
import EditIcon from '@icon/EditIcon';
import CrossIcon from '@icon/CrossIcon';
import DeleteIcon from '@icon/DeleteIcon';

import { GoogleFileResource, SyncStatus } from '@type/google-api';
import { createJSONStorage } from 'zustand/middleware';
import compressedStorage from '@store/storage/CompressedStorage';

const SILENT_REFRESH_INTERVAL = 3000000; // 50 minutes

type SyncOperation =
  | 'connect'
  | 'reconnect'
  | 'create'
  | 'pull'
  | 'push'
  | 'disconnect';

type SyncActivity =
  | 'checking'
  | 'syncing'
  | 'downloading'
  | 'authenticating'
  | null;

const formatDateTime = (value: string | undefined, locale?: string): string => {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const formatFileSize = (value: string | undefined, locale?: string): string => {
  if (!value) return 'Unknown';
  const size = Number(value);
  if (!Number.isFinite(size)) return 'Unknown';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let normalized = size;

  while (normalized >= 1024 && unitIndex < units.length - 1) {
    normalized /= 1024;
    unitIndex += 1;
  }

  const digits =
    normalized >= 100 || unitIndex === 0 ? 0 : normalized >= 10 ? 1 : 2;

  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(normalized)} ${units[unitIndex]}`;
};

const actionButtonClass =
  'btn btn-primary disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:saturate-50';

const resolveGoogleSyncErrorStatus = (error: unknown): SyncStatus =>
  isGoogleAuthError(error) ? 'unauthenticated' : 'synced';

const normalizeRemotePersistedState = (
  snapshot: unknown
): {
  state: Partial<PersistedStoreState>;
  version: number;
} => {
  if (!snapshot || typeof snapshot !== 'object') {
    return { state: {}, version: 0 };
  }

  if ('state' in snapshot) {
    const wrapped = snapshot as {
      state?: Partial<PersistedStoreState>;
      version?: number;
    };
    return {
      state: (wrapped.state ?? {}) as Partial<PersistedStoreState>,
      version: wrapped.version ?? 0,
    };
  }

  return {
    state: snapshot as Partial<PersistedStoreState>,
    version: STORE_VERSION,
  };
};

const SyncDirectionOverlay = ({
  direction,
}: {
  direction: 'left' | 'right' | 'up' | 'down';
}) => {
  const rotationClass =
    direction === 'right'
      ? '-rotate-90'
      : direction === 'left'
        ? 'rotate-90'
        : direction === 'up'
          ? 'rotate-180'
          : '';

  const positionClass =
    direction === 'left' || direction === 'right'
      ? 'left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:flex'
      : 'left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 md:hidden';

  return (
    <div className={`pointer-events-none absolute z-10 ${positionClass}`}>
      <div className='rounded-full border border-gray-300 bg-white/95 px-2 py-1.5 text-emerald-700 shadow-sm dark:border-gray-600 dark:bg-gray-800/95 dark:text-emerald-300'>
        <DownArrow
          className={`m-0 h-7 w-7 ${rotationClass}`}
        />
      </div>
    </div>
  );
};

const SyncDirectionInline = ({
  direction,
}: {
  direction: 'up' | 'down';
}) => {
  const rotationClass = direction === 'up' ? 'rotate-180' : '';

  return (
    <div className='flex justify-center md:hidden'>
      <div className='rounded-full border border-gray-300 bg-white/95 px-2 py-1.5 text-emerald-700 shadow-sm dark:border-gray-600 dark:bg-gray-800/95 dark:text-emerald-300'>
        <DownArrow className={`m-0 h-7 w-7 ${rotationClass}`} />
      </div>
    </div>
  );
};

const GoogleSync = ({ clientId }: { clientId: string }) => {
  const { t } = useTranslation(['drive']);

  const fileId = useGStore((state) => state.fileId);
  const setFileId = useGStore((state) => state.setFileId);
  const googleAccessToken = useGStore((state) => state.googleAccessToken);
  const syncStatus = useGStore((state) => state.syncStatus);
  const cloudSync = useGStore((state) => state.cloudSync);
  const setSyncStatus = useGStore((state) => state.setSyncStatus);
  const syncTargetConfirmed = useGStore((state) => state.syncTargetConfirmed);

  const enableCloudPersistence = () => {
    useStore.persist.setOptions({
      storage: createGoogleCloudStorage(),
      partialize: (state) => createPartializedState(state),
    });
  };

  const enableLocalPersistence = () => {
    useStore.persist.setOptions({
      storage: createJSONStorage(() => compressedStorage),
      partialize: (state) => createLocalStoragePartializedState(state),
    });
  };

  const [isModalOpen, setIsModalOpen] = useState<boolean>(cloudSync);
  const [files, setFiles] = useState<GoogleFileResource[]>([]);
  const isSilentRefresh = useRef(false);

  const initialiseState = async (_googleAccessToken: string, options?: { openModal?: boolean }) => {
    const validated = await validateGoogleOath2AccessToken(_googleAccessToken);
    if (validated) {
      try {
        const _files = await getFiles(_googleAccessToken);
        if (_files) {
          setFiles(_files);
          if (_files.length === 0) {
            // _files is empty, create new file in google drive and push local state
            const googleFile = await createDriveFile(
              stateToFile(),
              _googleAccessToken
            );
            setFileId(googleFile.id);
          } else {
            if (_files.findIndex((f) => f.id === fileId) !== -1) {
              setFileId(fileId);
            } else {
              setFileId(_files[0].id);
            }
          }
          if (syncTargetConfirmed) {
            enableCloudPersistence();
          } else {
            enableLocalPersistence();
          }
          setSyncStatus('synced');
          // Open modal so user can choose Pull/Push direction (skip for silent refresh)
          if (options?.openModal) {
            setIsModalOpen(true);
          }
        }
      } catch (e: unknown) {
        console.log(e);
      }
    } else {
      setSyncStatus('unauthenticated');
    }
  };

  useEffect(() => {
    if (googleAccessToken) {
      setSyncStatus('syncing');
      const openModal = !isSilentRefresh.current;
      isSilentRefresh.current = false;
      initialiseState(googleAccessToken, { openModal });
    }
  }, [googleAccessToken]);

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <div
        className='flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-gray-700 transition-colors duration-200 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-500/10'
        onClick={() => {
          setIsModalOpen(true);
        }}
      >
        <GoogleIcon /> {t('name')}
        {cloudSync && <SyncIcon status={syncStatus} />}
      </div>
      {isModalOpen && (
        <GooglePopup
          setIsModalOpen={setIsModalOpen}
          files={files}
          setFiles={setFiles}
          isSilentRefresh={isSilentRefresh}
        />
      )}
    </GoogleOAuthProvider>
  );
};

const GooglePopup = ({
  setIsModalOpen,
  files,
  setFiles,
  isSilentRefresh,
}: {
  setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  files: GoogleFileResource[];
  setFiles: React.Dispatch<React.SetStateAction<GoogleFileResource[]>>;
  isSilentRefresh: React.MutableRefObject<boolean>;
}) => {
  const { t } = useTranslation(['drive']);

  const syncStatus = useGStore((state) => state.syncStatus);
  const setSyncStatus = useGStore((state) => state.setSyncStatus);
  const cloudSync = useGStore((state) => state.cloudSync);
  const googleAccessToken = useGStore((state) => state.googleAccessToken);
  const setFileId = useGStore((state) => state.setFileId);
  const setSyncTargetConfirmed = useGStore((state) => state.setSyncTargetConfirmed);
  const syncTargetConfirmed = useGStore((state) => state.syncTargetConfirmed);
  const currentFileId = useGStore((state) => state.fileId);
  const localFileSize = formatFileSize(String(stateToFile().size), navigator.language);

  const setToastStatus = useStore((state) => state.setToastStatus);
  const setToastMessage = useStore((state) => state.setToastMessage);
  const setToastShow = useStore((state) => state.setToastShow);

  const syncButtonRef = useRef<GoogleSyncButtonHandle>(null);
  const refreshIntervalRef = useRef<number>();

  const startSilentRefreshInterval = () => {
    if (refreshIntervalRef.current) {
      window.clearInterval(refreshIntervalRef.current);
    }
    refreshIntervalRef.current = window.setInterval(() => {
      syncButtonRef.current?.attemptSilentRefresh();
    }, SILENT_REFRESH_INTERVAL);
  };

  const stopSilentRefreshInterval = () => {
    if (refreshIntervalRef.current) {
      window.clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = undefined;
    }
  };

  useEffect(() => {
    return () => {
      stopSilentRefreshInterval();
    };
  }, []);

  const [_fileId, _setFileId] = useState<string>(
    useGStore.getState().fileId || ''
  );
  const [selectedOperation, setSelectedOperation] =
    useState<SyncOperation>('connect');
  const [activity, setActivity] = useState<SyncActivity>(null);

  const isBusy = syncStatus === 'syncing';

  const setBusyActivity = (nextActivity: Exclude<SyncActivity, null>) => {
    setActivity(nextActivity);
  };

  useEffect(() => {
    if (!_fileId && files.length > 0) {
      _setFileId(files[0].id);
    }
  }, [_fileId, files]);

  useEffect(() => {
    if (!isBusy) {
      setActivity(null);
    }
  }, [isBusy]);

  const selectSyncTarget = (fileId: string) => {
    setFileId(fileId);
    _setFileId(fileId);
  };

  const activateCloudSyncTarget = (fileId: string) => {
    selectSyncTarget(fileId);
    setSyncTargetConfirmed(true);
    useStore.persist.setOptions({
      storage: createGoogleCloudStorage(),
      partialize: (state) => createPartializedState(state),
    });
  };

  const selectedFile = files.find((file) => file.id === _fileId);
  const disableCloudSelection = selectedOperation === 'create';

  const refreshCloudFiles = async () => {
    if (!googleAccessToken || isBusy) return;
    try {
      setBusyActivity('checking');
      setSyncStatus('syncing');
      const nextFiles = await getFiles(googleAccessToken);
      if (nextFiles) {
        setFiles(nextFiles);
        if (_fileId && !nextFiles.some((file) => file.id === _fileId)) {
          _setFileId(nextFiles[0]?.id ?? '');
        }
      }
      setSyncStatus('synced');
    } catch (e: unknown) {
      setSyncStatus(resolveGoogleSyncErrorStatus(e));
      setToastMessage((e as Error).message);
      setToastShow(true);
      setToastStatus('error');
    }
  };

  const applyRemoteToLocal = async () => {
    if (!_fileId || !googleAccessToken) return;
    try {
      setBusyActivity('downloading');
      setSyncStatus('syncing');
      const remoteStorageValue = await getDriveFileTyped(_fileId, googleAccessToken);
      const normalizedRemote = normalizeRemotePersistedState(remoteStorageValue);
      const remotePersistedState = migratePersistedState(
        structuredClone(normalizedRemote.state),
        normalizedRemote.version
      ) as Partial<PersistedStoreState>;
      const hydratedState = hydrateFromPersistedStoreState(
        useStore.getState(),
        remotePersistedState
      );

      useStore.setState(hydratedState);
      await saveChatData(createPersistedChatDataState(useStore.getState()));
      activateCloudSyncTarget(_fileId);
      setToastStatus('success');
      setToastMessage(t('toast.pull'));
      setToastShow(true);
      setIsModalOpen(false);
      setSyncStatus('synced');
    } catch (e: unknown) {
      setSyncStatus(resolveGoogleSyncErrorStatus(e));
      setToastMessage((e as Error).message);
      setToastShow(true);
      setToastStatus('error');
    }
  };

  const overwriteRemoteWithLocal = async () => {
    if (!_fileId || !googleAccessToken) return;
    try {
      setBusyActivity('syncing');
      setSyncStatus('syncing');
      activateCloudSyncTarget(_fileId);
      await updateDriveFile(stateToFile(), _fileId, googleAccessToken);
      const _files = await getFiles(googleAccessToken);
      if (_files) setFiles(_files);
      setToastStatus('success');
      setToastMessage(t('toast.push'));
      setToastShow(true);
      setSyncStatus('synced');
    } catch (e: unknown) {
      setSyncStatus(resolveGoogleSyncErrorStatus(e));
      setToastMessage((e as Error).message);
      setToastShow(true);
      setToastStatus('error');
    }
  };

  const createSyncFile = async () => {
    if (!googleAccessToken) return;
    try {
      setBusyActivity('syncing');
      setSyncStatus('syncing');
      const createdFile = await createDriveFile(stateToFile(), googleAccessToken);
      const _files = await getFiles(googleAccessToken);
      if (_files) setFiles(_files);
      activateCloudSyncTarget(createdFile.id);
      setSyncStatus('synced');
    } catch (e: unknown) {
      setSyncStatus(resolveGoogleSyncErrorStatus(e));
      setToastMessage((e as Error).message);
      setToastShow(true);
      setToastStatus('error');
    }
  };

  const stopSyncing = () => {
    if (isBusy) return;
    syncButtonRef.current?.disconnect();
    setIsModalOpen(false);
  };

  const startSyncing = () => {
    setBusyActivity('authenticating');
    syncButtonRef.current?.connect();
  };

  const needsReconnect = cloudSync && syncStatus === 'unauthenticated';
  const connected = cloudSync && syncStatus !== 'unauthenticated';

  useEffect(() => {
    if (connected && syncTargetConfirmed && googleAccessToken) {
      startSilentRefreshInterval();
      return;
    }
    stopSilentRefreshInterval();
  }, [connected, googleAccessToken, syncTargetConfirmed]);

  const availableOperations: SyncOperation[] = !cloudSync
    ? ['connect']
    : needsReconnect
      ? ['reconnect']
      : ['create', 'pull', 'push', 'disconnect'];

  useEffect(() => {
    const fallbackOperation = availableOperations[0];
    if (!availableOperations.includes(selectedOperation) && fallbackOperation) {
      setSelectedOperation(fallbackOperation);
    }
  }, [availableOperations, selectedOperation]);

  const runSelectedOperation = async () => {
    if (isBusy) return;
    if (selectedOperation === 'connect' || selectedOperation === 'reconnect') {
      startSyncing();
      return;
    }
    if (selectedOperation === 'create') {
      await createSyncFile();
      return;
    }
    if (selectedOperation === 'pull') {
      await applyRemoteToLocal();
      return;
    }
    if (selectedOperation === 'push') {
      await overwriteRemoteWithLocal();
      return;
    }
    stopSyncing();
  };

  const operationDescriptionKey = {
    connect: 'actions.connectDescription',
    reconnect: 'actions.reconnectDescription',
    create: 'actions.createDescription',
    pull: 'actions.pullDescription',
    push: 'actions.pushDescription',
    disconnect: 'actions.disconnectDescription',
  } satisfies Record<SyncOperation, string>;

  const operationLabelKey = {
    connect: 'operations.connect',
    reconnect: 'operations.reconnect',
    create: 'operations.create',
    pull: 'operations.pull',
    push: 'operations.push',
    disconnect: 'operations.disconnect',
  } satisfies Record<SyncOperation, string>;

  const syncDirection =
    selectedOperation === 'pull'
      ? ({ mobile: 'down', desktop: 'left' } as const)
      : selectedOperation === 'push'
        ? ({ mobile: 'up', desktop: 'right' } as const)
        : null;

  const statusMessageKey =
    activity === 'downloading'
      ? 'status.downloading'
      : activity === 'authenticating'
        ? 'status.authenticating'
        : activity === 'checking'
          ? 'status.checking'
          : isBusy
            ? 'status.syncing'
            : syncTargetConfirmed
              ? 'status.idleConnected'
              : connected
                ? 'status.idleAwaitingChoice'
                : 'status.idleDisconnected';

  return (
    <PopupModal
      title={t('name') as string}
      setIsModalOpen={setIsModalOpen}
      cancelButton={false}
      disableClose={isBusy}
      footerStartContent={
        <div className='flex min-h-[1.5rem] items-center gap-3 text-left'>
          {isBusy ? <SyncIcon status='syncing' /> : <div className='h-4 w-4' />}
          <span className='text-sm text-gray-600 dark:text-gray-300'>
            {t(statusMessageKey)}
          </span>
        </div>
      }
      footerEndContent={
        connected ? (
          <button
            type='button'
            className={actionButtonClass}
            onClick={runSelectedOperation}
            disabled={
              isBusy ||
              ((selectedOperation === 'pull' || selectedOperation === 'push') &&
                !_fileId)
            }
          >
            {t(operationLabelKey[selectedOperation])}
          </button>
        ) : (
          <button
            type='button'
            className={actionButtonClass}
            onClick={runSelectedOperation}
            disabled={isBusy}
          >
            {t(operationLabelKey[selectedOperation])}
          </button>
        )
      }
    >
      <div
        aria-busy={isBusy}
        className={`border-b border-gray-200 p-6 text-sm text-gray-900 dark:border-gray-600 dark:text-gray-300 ${
          isBusy ? 'pointer-events-none select-none opacity-60' : ''
        } flex flex-col items-center gap-4 text-center`}
      >
        <div className='w-full max-w-2xl rounded-lg border border-gray-300 bg-gray-50/90 px-4 py-4 text-left dark:border-gray-600 dark:bg-gray-800/50'>
          <p className='text-sm text-gray-900 dark:text-gray-100'>{t('tagline')}</p>
          <p className='mt-3 text-xs text-gray-700 dark:text-gray-300'>{t('privacy')}</p>
          <p className='mt-3 text-xs text-gray-700 dark:text-gray-300'>{t('notice')}</p>
        </div>
        <GoogleSyncButton
          ref={syncButtonRef}
          showDisconnectButton={false}
          showDisconnectNotice={false}
          loginHandler={() => {}}
          onBeforeSilentRefresh={() => {
            isSilentRefresh.current = true;
            setBusyActivity('checking');
          }}
          onSilentRefreshFail={() => {
            if (refreshIntervalRef.current) {
              window.clearInterval(refreshIntervalRef.current);
            }
            setIsModalOpen(true);
          }}
        />
        <div className='w-full max-w-2xl rounded-lg border border-gray-200 bg-white/80 p-4 text-left dark:border-gray-600 dark:bg-gray-800/40'>
          <div className='mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400'>
            {t('labels.operation')}
          </div>
          <select
            className='w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-500 dark:bg-gray-700 dark:text-white'
            value={selectedOperation}
            onChange={(e) => setSelectedOperation(e.target.value as SyncOperation)}
            disabled={isBusy}
          >
            {availableOperations.map((operation) => (
              <option key={operation} value={operation}>
                {t(operationLabelKey[operation])}
              </option>
            ))}
          </select>
          <div className='mt-3 min-h-[5.5rem] rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-800/60 dark:text-gray-300'>
            {t(operationDescriptionKey[selectedOperation])}
          </div>
        </div>
        {connected && (
          <div className='flex w-full max-w-2xl flex-col gap-4 items-stretch text-left'>
            <div className='relative flex flex-col gap-3 md:grid md:grid-cols-2'>
              {syncDirection && <SyncDirectionOverlay direction={syncDirection.desktop} />}
              <div className='order-3 rounded-lg border border-gray-200 bg-gray-100/80 p-3 md:order-1 dark:border-gray-600 dark:bg-gray-800/60'>
                <div className='mb-2 flex h-8 items-center'>
                  <div className='text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400'>
                    {t('labels.localState')}
                  </div>
                </div>
                <div className='text-sm text-gray-900 dark:text-gray-100'>
                  {t('labels.fileSize')}:{' '}
                  {localFileSize === 'Unknown' ? t('labels.unknownSize') : localFileSize}
                </div>
                <div className='text-xs text-gray-600 dark:text-gray-400 break-all'>
                  {t('labels.syncingFileId')}:{' '}
                  {syncTargetConfirmed && currentFileId ? currentFileId : '-'}
                </div>
              </div>
              <div className='order-1 rounded-lg border border-gray-200 bg-gray-100/80 p-3 md:order-2 dark:border-gray-600 dark:bg-gray-800/60'>
                <div className='mb-2 flex items-center justify-between gap-3'>
                  <div className='text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400'>
                    {t('labels.selectedFile')}
                  </div>
                  <button
                    type='button'
                    className='inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 bg-white/80 text-gray-600 transition-colors hover:border-emerald-400 hover:text-emerald-600 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-500 dark:bg-gray-700 dark:text-gray-200 dark:hover:border-emerald-400 dark:hover:text-emerald-300'
                    onClick={() => {
                      void refreshCloudFiles();
                    }}
                    disabled={isBusy || !googleAccessToken}
                    aria-label={t('button.refreshFiles') as string}
                    title={t('button.refreshFiles') as string}
                  >
                    <RefreshIcon className={isBusy ? 'animate-spin' : ''} />
                  </button>
                </div>
                <div className='max-h-72 overflow-y-auto pr-1'>
                  {files.length === 0 ? (
                    <div className='rounded-md border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400'>
                      {t('labels.noFiles')}
                    </div>
                  ) : (
                    files.map((file) => (
                      <FileSelector
                        key={file.id}
                        file={file}
                        selected={!disableCloudSelection && _fileId === file.id}
                        current={currentFileId === file.id}
                        syncing={isBusy}
                        selectionDisabled={disableCloudSelection}
                        onSelect={_setFileId}
                        onFilesChange={setFiles}
                        onActivityChange={setBusyActivity}
                      />
                    ))
                  )}
                </div>
              </div>
              {syncDirection && (
                <div className='order-2 md:hidden'>
                  <SyncDirectionInline direction={syncDirection.mobile} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PopupModal>
  );
};

const FileSelector = ({
  file,
  selected,
  current,
  syncing,
  selectionDisabled,
  onSelect,
  onFilesChange,
  onActivityChange,
}: {
  file: GoogleFileResource;
  selected: boolean;
  current: boolean;
  syncing: boolean;
  selectionDisabled: boolean;
  onSelect: React.Dispatch<React.SetStateAction<string>>;
  onFilesChange: React.Dispatch<React.SetStateAction<GoogleFileResource[]>>;
  onActivityChange: (activity: Exclude<SyncActivity, null>) => void;
}) => {
  const { t, i18n } = useTranslation(['drive']);
  const setSyncStatus = useGStore((state) => state.setSyncStatus);
  const setToastStatus = useStore((state) => state.setToastStatus);
  const setToastMessage = useStore((state) => state.setToastMessage);
  const setToastShow = useStore((state) => state.setToastShow);

  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [_name, _setName] = useState(file.name);

  const formattedUpdatedAt = formatDateTime(file.modifiedTime, i18n.language);
  const formattedSize = formatFileSize(file.size, i18n.language);

  const updateFileName = async () => {
    if (syncing) return;
    setIsEditing(false);
    const accessToken = useGStore.getState().googleAccessToken;
    if (!accessToken) return;

    try {
      onActivityChange('syncing');
      setSyncStatus('syncing');
      const newFileName = _name.endsWith('.json') ? _name : `${_name}.json`;
      await updateDriveFileName(newFileName, file.id, accessToken);
      const updatedFiles = await getFiles(accessToken);
      if (updatedFiles) onFilesChange(updatedFiles);
      setSyncStatus('synced');
    } catch (e: unknown) {
      setSyncStatus(resolveGoogleSyncErrorStatus(e));
      setToastMessage((e as Error).message);
      setToastShow(true);
      setToastStatus('error');
    }
  };

  const deleteFile = async () => {
    if (syncing) return;
    setIsDeleting(false);
    const accessToken = useGStore.getState().googleAccessToken;
    if (!accessToken) return;

    try {
      onActivityChange('checking');
      setSyncStatus('syncing');
      await deleteDriveFile(file.id, accessToken);
      const updatedFiles = await getFiles(accessToken);
      if (updatedFiles) onFilesChange(updatedFiles);
      if (selected) {
        onSelect(updatedFiles?.[0]?.id ?? '');
      }
      setSyncStatus('synced');
    } catch (e: unknown) {
      setSyncStatus(resolveGoogleSyncErrorStatus(e));
      setToastMessage((e as Error).message);
      setToastShow(true);
      setToastStatus('error');
    }
  };

  return (
    <label
      className={`mb-2 flex w-full min-w-0 items-start gap-3 overflow-hidden rounded-lg border px-3 py-3 text-sm ${
        selected
          ? 'border-emerald-400 bg-emerald-50/80 ring-1 ring-emerald-400/70 dark:border-emerald-500/70 dark:bg-gray-800/90 dark:ring-emerald-500/60'
          : 'border-gray-200 bg-white/80 dark:border-gray-600 dark:bg-gray-800/40'
      } ${syncing ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <input
        type='radio'
        checked={selected}
        className='mt-1 h-4 w-4'
        onChange={() => {
          if (!syncing && !selectionDisabled) onSelect(file.id);
        }}
        disabled={syncing || selectionDisabled}
      />
      <div className='min-w-0 flex-1 text-left'>
        {isEditing ? (
          <input
            type='text'
            className='h-8 w-full rounded-md bg-gray-200 px-3 text-sm text-gray-800 focus:outline-none dark:bg-gray-600 dark:text-white'
            value={_name}
            onChange={(e) => _setName(e.target.value)}
          />
        ) : (
          current && (
            <div className='font-semibold text-emerald-700 dark:text-emerald-300'>
              {t('labels.currentTarget')}
            </div>
          )
        )}
        <div className='mt-1 break-all text-xs text-gray-600 dark:text-gray-100'>
          {t('labels.fileId')}: {file.id}
        </div>
        <div className='mt-1 break-all text-xs text-gray-600 dark:text-gray-100'>
          {t('labels.fileName')}: {file.name}
        </div>
        <div className='mt-1 text-xs text-gray-600 dark:text-gray-100'>
          {t('labels.fileSize')}:{' '}
          {formattedSize === 'Unknown' ? t('labels.unknownSize') : formattedSize}
        </div>
        <div className='mt-1 text-xs text-gray-600 dark:text-gray-100'>
          {t('labels.updatedAt')}:{' '}
          {formattedUpdatedAt === 'Unknown' ? t('labels.unknownDate') : formattedUpdatedAt}
        </div>
      </div>
      {isEditing || isDeleting ? (
        <div className='shrink-0 flex gap-1'>
          <button
            type='button'
            className={syncing ? 'cursor-not-allowed' : 'cursor-pointer'}
            onClick={() => {
              if (isEditing) updateFileName();
              if (isDeleting) deleteFile();
            }}
          >
            <TickIcon />
          </button>
          <button
            type='button'
            className={syncing ? 'cursor-not-allowed' : 'cursor-pointer'}
            onClick={() => {
              if (!syncing) {
                setIsEditing(false);
                setIsDeleting(false);
                _setName(file.name);
              }
            }}
          >
            <CrossIcon />
          </button>
        </div>
      ) : (
        <div className='shrink-0 flex gap-1'>
          <button
            type='button'
            className={syncing ? 'cursor-not-allowed' : 'cursor-pointer'}
            onClick={() => {
              if (!syncing) setIsEditing(true);
            }}
          >
            <EditIcon />
          </button>
          <button
            type='button'
            className={syncing ? 'cursor-not-allowed' : 'cursor-pointer'}
            onClick={() => {
              if (!syncing) setIsDeleting(true);
            }}
          >
            <DeleteIcon />
          </button>
        </div>
      )}
    </label>
  );
};

const SyncIcon = ({ status }: { status: SyncStatus }) => {
  const statusToIcon = {
    unauthenticated: (
      <div className='bg-red-600/80 rounded-full w-4 h-4 text-xs flex justify-center items-center'>
        !
      </div>
    ),
    syncing: (
      <div className='rounded-full bg-gray-600/80 p-1 animate-spin'>
        <RefreshIcon className='h-2 w-2' />
      </div>
    ),
    synced: (
      <div className='bg-gray-600/80 rounded-full p-1'>
        <TickIcon className='h-2 w-2' />
      </div>
    ),
  };
  return statusToIcon[status] || null;
};

export default GoogleSync;
