import React, { useEffect, useRef, useState } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useTranslation } from 'react-i18next';

import useStore from '@store/store';
import useGStore from '@store/cloud-auth-store';

import {
  createDriveFile,
  deleteDriveFile,
  updateDriveFile,
  updateDriveFileName,
  validateGoogleOath2AccessToken,
} from '@api/google-api';
import { getFiles, stateToFile } from '@utils/google-api';
import createGoogleCloudStorage from '@store/storage/GoogleCloudStorage';

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

const SILENT_REFRESH_INTERVAL = 3000000; // 50 minutes

type SyncOperation =
  | 'connect'
  | 'reconnect'
  | 'create'
  | 'pull'
  | 'push'
  | 'disconnect';

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

  const [isModalOpen, setIsModalOpen] = useState<boolean>(cloudSync);
  const [files, setFiles] = useState<GoogleFileResource[]>([]);

  const initialiseState = async (_googleAccessToken: string) => {
    const validated = await validateGoogleOath2AccessToken(_googleAccessToken);
    if (validated) {
      try {
        const _files = await getFiles(_googleAccessToken);
        if (_files) {
          setFiles(_files);
          if (_files.length === 0) {
            // _files is empty, create new file in google drive and set the file id
            const googleFile = await createDriveFile(
              stateToFile(),
              _googleAccessToken
            );
            setFileId(googleFile.id);
          } else {
            if (_files.findIndex((f) => f.id === fileId) !== -1) {
              // local storage file id matches one of the file ids returned
              setFileId(fileId);
            } else {
              // default set file id to the latest one
              setFileId(_files[0].id);
            }
          }
          useStore.persist.setOptions({
            storage: createGoogleCloudStorage(),
          });
          useStore.persist.rehydrate();
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
      initialiseState(googleAccessToken);
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
        />
      )}
    </GoogleOAuthProvider>
  );
};

const GooglePopup = ({
  setIsModalOpen,
  files,
  setFiles,
}: {
  setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  files: GoogleFileResource[];
  setFiles: React.Dispatch<React.SetStateAction<GoogleFileResource[]>>;
}) => {
  const { t } = useTranslation(['drive']);

  const syncStatus = useGStore((state) => state.syncStatus);
  const setSyncStatus = useGStore((state) => state.setSyncStatus);
  const cloudSync = useGStore((state) => state.cloudSync);
  const googleAccessToken = useGStore((state) => state.googleAccessToken);
  const setFileId = useGStore((state) => state.setFileId);
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

  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        window.clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  const [_fileId, _setFileId] = useState<string>(
    useGStore.getState().fileId || ''
  );
  const [selectedOperation, setSelectedOperation] =
    useState<SyncOperation>('connect');

  useEffect(() => {
    if (!_fileId && files.length > 0) {
      _setFileId(files[0].id);
    }
  }, [_fileId, files]);

  const selectSyncTarget = (fileId: string) => {
    setFileId(fileId);
    _setFileId(fileId);
  };

  const selectedFile = files.find((file) => file.id === _fileId);
  const disableCloudSelection = selectedOperation === 'create';

  const applyRemoteToLocal = async () => {
    if (!_fileId) return;
    try {
      setSyncStatus('syncing');
      selectSyncTarget(_fileId);
      await useStore.persist.rehydrate();
      setToastStatus('success');
      setToastMessage(t('toast.pull'));
      setToastShow(true);
      setIsModalOpen(false);
      setSyncStatus('synced');
    } catch (e: unknown) {
      setSyncStatus('unauthenticated');
      setToastMessage((e as Error).message);
      setToastShow(true);
      setToastStatus('error');
    }
  };

  const overwriteRemoteWithLocal = async () => {
    if (!_fileId || !googleAccessToken) return;
    try {
      setSyncStatus('syncing');
      selectSyncTarget(_fileId);
      await updateDriveFile(stateToFile(), _fileId, googleAccessToken);
      const _files = await getFiles(googleAccessToken);
      if (_files) setFiles(_files);
      setToastStatus('success');
      setToastMessage(t('toast.push'));
      setToastShow(true);
      setSyncStatus('synced');
    } catch (e: unknown) {
      setSyncStatus('unauthenticated');
      setToastMessage((e as Error).message);
      setToastShow(true);
      setToastStatus('error');
    }
  };

  const createSyncFile = async () => {
    if (!googleAccessToken) return;
    try {
      setSyncStatus('syncing');
      const createdFile = await createDriveFile(stateToFile(), googleAccessToken);
      const _files = await getFiles(googleAccessToken);
      if (_files) setFiles(_files);
      selectSyncTarget(createdFile.id);
      setSyncStatus('synced');
    } catch (e: unknown) {
      setSyncStatus('unauthenticated');
      setToastMessage((e as Error).message);
      setToastShow(true);
      setToastStatus('error');
    }
  };

  const stopSyncing = () => {
    syncButtonRef.current?.disconnect();
    setIsModalOpen(false);
  };

  const startSyncing = () => {
    syncButtonRef.current?.connect();
  };

  const needsReconnect = cloudSync && syncStatus === 'unauthenticated';
  const connected = cloudSync && syncStatus !== 'unauthenticated';

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

  return (
    <PopupModal
      title={t('name') as string}
      setIsModalOpen={setIsModalOpen}
      cancelButton={false}
    >
      <div className='p-6 border-b border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-300 text-sm flex flex-col items-center gap-4 text-center'>
        <div className='w-full max-w-2xl rounded-lg border border-gray-300 bg-gray-50/90 px-4 py-4 text-left dark:border-gray-600 dark:bg-gray-800/50'>
          <p className='text-sm text-gray-900 dark:text-gray-100'>{t('tagline')}</p>
          <p className='mt-3 text-xs text-gray-700 dark:text-gray-300'>{t('privacy')}</p>
          <p className='mt-3 text-xs text-gray-700 dark:text-gray-300'>{t('notice')}</p>
        </div>
        <GoogleSyncButton
          ref={syncButtonRef}
          showDisconnectButton={false}
          showDisconnectNotice={false}
          loginHandler={() => {
            setIsModalOpen(false);
            startSilentRefreshInterval();
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
            disabled={syncStatus === 'syncing'}
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
                <div className='mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400'>
                  {t('labels.localState')}
                </div>
                <div className='text-sm text-gray-900 dark:text-gray-100'>
                  {t('labels.fileSize')}:{' '}
                  {localFileSize === 'Unknown' ? t('labels.unknownSize') : localFileSize}
                </div>
                <div className='text-xs text-gray-600 dark:text-gray-400 break-all'>
                  {t('labels.syncingFileId')}:{' '}
                  {currentFileId ? currentFileId : '-'}
                </div>
              </div>
              <div className='order-1 rounded-lg border border-gray-200 bg-gray-100/80 p-3 md:order-2 dark:border-gray-600 dark:bg-gray-800/60'>
                <div className='mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400'>
                  {t('labels.selectedFile')}
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
                        syncing={syncStatus === 'syncing'}
                        selectionDisabled={disableCloudSelection}
                        onSelect={_setFileId}
                        onFilesChange={setFiles}
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
            <button
              type='button'
              className='btn btn-primary self-center'
              onClick={runSelectedOperation}
              disabled={
                syncStatus === 'syncing' ||
                ((selectedOperation === 'pull' || selectedOperation === 'push') &&
                  !_fileId)
              }
            >
              {t(operationLabelKey[selectedOperation])}
            </button>
            <div className='h-4 w-4'>
              {syncStatus === 'syncing' && <SyncIcon status='syncing' />}
            </div>
          </div>
        )}
        {!connected && (
          <button
            type='button'
            className='btn btn-primary self-center'
            onClick={runSelectedOperation}
            disabled={syncStatus === 'syncing'}
          >
            {t(operationLabelKey[selectedOperation])}
          </button>
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
}: {
  file: GoogleFileResource;
  selected: boolean;
  current: boolean;
  syncing: boolean;
  selectionDisabled: boolean;
  onSelect: React.Dispatch<React.SetStateAction<string>>;
  onFilesChange: React.Dispatch<React.SetStateAction<GoogleFileResource[]>>;
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
      setSyncStatus('syncing');
      const newFileName = _name.endsWith('.json') ? _name : `${_name}.json`;
      await updateDriveFileName(newFileName, file.id, accessToken);
      const updatedFiles = await getFiles(accessToken);
      if (updatedFiles) onFilesChange(updatedFiles);
      setSyncStatus('synced');
    } catch (e: unknown) {
      setSyncStatus('unauthenticated');
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
      setSyncStatus('syncing');
      await deleteDriveFile(file.id, accessToken);
      const updatedFiles = await getFiles(accessToken);
      if (updatedFiles) onFilesChange(updatedFiles);
      if (selected) {
        onSelect(updatedFiles?.[0]?.id ?? '');
      }
      setSyncStatus('synced');
    } catch (e: unknown) {
      setSyncStatus('unauthenticated');
      setToastMessage((e as Error).message);
      setToastShow(true);
      setToastStatus('error');
    }
  };

  return (
    <label
      className={`mb-2 flex w-full min-w-0 items-start gap-3 overflow-hidden rounded-lg border px-3 py-3 text-sm ${
        selected
          ? 'border-emerald-400 bg-emerald-50/70 dark:border-emerald-700 dark:bg-emerald-950/20'
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
        <div className='mt-1 break-all text-xs text-gray-600 dark:text-gray-300'>
          {t('labels.fileId')}: {file.id}
        </div>
        <div className='mt-1 break-all text-xs text-gray-600 dark:text-gray-300'>
          {t('labels.fileName')}: {file.name}
        </div>
        <div className='mt-1 text-xs text-gray-600 dark:text-gray-300'>
          {t('labels.fileSize')}:{' '}
          {formattedSize === 'Unknown' ? t('labels.unknownSize') : formattedSize}
        </div>
        <div className='mt-1 text-xs text-gray-600 dark:text-gray-300'>
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
      <div className='bg-gray-600/80 rounded-full p-1 animate-spin'>
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
