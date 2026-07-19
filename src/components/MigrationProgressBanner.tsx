import React, { useState } from 'react';
import useStore, { type StoreState } from '@store/store';
import { clearNeedsDataMigration } from '@store/persistence';
import {
  buildRecoveryExportPayload,
  getRecoveryExportFilename,
} from '@store/recoveryExport';
import downloadFile from '@utils/downloadFile';
import { notifyStorageError } from '@store/storage/storageErrors';

const MigrationProgressBanner = () => {
  const migrationUiState = useStore((s: StoreState) => s.migrationUiState);
  const [exporting, setExporting] = useState(false);

  if (!migrationUiState || !migrationUiState.visible) return null;

  const handleDismiss = () => {
    clearNeedsDataMigration();
    useStore.getState().setMigrationUiState(null);
  };

  const recoveryRequired = migrationUiState.status === 'storage-recovery-required';

  const handleRecoveryExport = async () => {
    setExporting(true);
    try {
      const payload = await buildRecoveryExportPayload();
      downloadFile(payload, `${getRecoveryExportFilename()}.json`);
    } catch (error) {
      notifyStorageError(error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className='fixed top-0 left-0 right-0 z-[1000] bg-yellow-600 text-white px-4 py-3 shadow-md'>
      <div className='flex items-center justify-between gap-4'>
        <div className='flex-1 text-sm'>
          <strong>
            {recoveryRequired
              ? '会話データの安全な読み込みに失敗しました'
              : 'データ形式が古い可能性があります'}
          </strong>
          {' '}
          {recoveryRequired
            ? '既存データを保護するため保存と圧縮を停止しています。復旧用データを保存してください。'
            : '問題がある場合は、設定からデータをエクスポートし、再インポートしてください。'}
        </div>
        {recoveryRequired ? (
          <button
            onClick={handleRecoveryExport}
            disabled={exporting}
            className='px-3 py-1 text-sm bg-yellow-800 text-white rounded hover:bg-yellow-900 whitespace-nowrap disabled:opacity-60'
          >
            {exporting ? '保存中…' : '復旧用データを保存'}
          </button>
        ) : (
          <button
            onClick={handleDismiss}
            className='px-3 py-1 text-sm bg-yellow-800 text-white rounded hover:bg-yellow-900 whitespace-nowrap'
          >
            閉じる
          </button>
        )}
      </div>
    </div>
  );
};

export default MigrationProgressBanner;
