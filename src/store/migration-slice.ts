import { StoreSlice } from './store';

export interface MigrationUiState {
  visible: boolean;
  status: 'needs-export-import' | 'done';
}

export interface MigrationSlice {
  migrationUiState: MigrationUiState | null;
  setMigrationUiState: (state: MigrationUiState | null) => void;
}

export const createMigrationSlice: StoreSlice<MigrationSlice> = (set) => ({
  migrationUiState: null,
  setMigrationUiState: (migrationUiState) => {
    set((prev) => ({ ...prev, migrationUiState }));
  },
});
