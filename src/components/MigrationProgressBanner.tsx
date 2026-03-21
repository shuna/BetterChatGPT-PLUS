import React from 'react';
import useStore, { type StoreState } from '@store/store';
import { clearNeedsDataMigration } from '@store/persistence';

const MigrationProgressBanner = () => {
  const migrationUiState = useStore((s: StoreState) => s.migrationUiState);

  if (!migrationUiState || !migrationUiState.visible) return null;

  const handleDismiss = () => {
    clearNeedsDataMigration();
    useStore.getState().setMigrationUiState(null);
  };

  return (
    <div className='fixed top-0 left-0 right-0 z-[1000] bg-yellow-600 text-white px-4 py-3 shadow-md'>
      <div className='flex items-center justify-between gap-4'>
        <div className='flex-1 text-sm'>
          <strong>データ形式が古い可能性があります</strong>
          {' '}問題がある場合は、設定からデータをエクスポートし、再インポートしてください。
        </div>
        <button
          onClick={handleDismiss}
          className='px-3 py-1 text-sm bg-yellow-800 text-white rounded hover:bg-yellow-900 whitespace-nowrap'
        >
          閉じる
        </button>
      </div>
    </div>
  );
};

export default MigrationProgressBanner;
