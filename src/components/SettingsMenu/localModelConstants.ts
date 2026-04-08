import type { LocalModelStatus, LocalModelTask, HfSearchResult, GgufVariant, GgufRepoResolution, HfSearchQuery } from '@src/local-llm/types';
import type { SavedModelMeta } from '@src/local-llm/storage';
import type { CatalogModel } from '@src/local-llm/catalog';
import type { DownloadProgress } from '@src/local-llm/download';
import type { DeviceTier, ModelFitLabel } from '@src/local-llm/device';

// Color maps
export const statusColors: Record<LocalModelStatus, string> = {
  idle: 'bg-gray-300 dark:bg-gray-600',
  loading: 'bg-yellow-400 animate-pulse',
  ready: 'bg-green-500',
  busy: 'bg-blue-500 animate-pulse',
  error: 'bg-red-500',
  unloaded: 'bg-gray-300 dark:bg-gray-600',
};

export const fitColors: Record<ModelFitLabel, string> = {
  lightweight: 'text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
  recommended: 'text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30',
  heavy: 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30',
  'very-heavy': 'text-orange-700 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30',
  extreme: 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
  'not-recommended': 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
};

export const supportColors: Record<string, string> = {
  supported: 'text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30',
  'needs-manual-review': 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30',
  unsupported: 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
};

export const variantStatusColors: Record<string, string> = {
  supported: 'text-green-700 dark:text-green-400',
  'not-recommended': 'text-amber-700 dark:text-amber-400',
  unsupported: 'text-red-700 dark:text-red-400',
};

// Constants
export const ASSIGNABLE_TASKS: LocalModelTask[] = ['generation', 'analysis'];
export const EPHEMERAL_MODEL_ID = '__wllama_test__';

// Utility functions
export function getModelStatusLabel(
  modelId: string,
  source: string,
  runtimeStatus: LocalModelStatus,
): 'loaded' | 'saved' | 'imported' | 'notLoaded' {
  if (runtimeStatus === 'ready' || runtimeStatus === 'busy') return 'loaded';
  if (source === 'ephemeral-file') return 'imported';
  if (source === 'opfs') return 'saved';
  return 'notLoaded';
}

export function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M DL`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 1 : 2)}K DL`;
  return `${n} DL`;
}

// Interfaces
export interface CatalogCardProps {
  model: CatalogModel;
  deviceTier: DeviceTier;
  meta: SavedModelMeta | undefined;
  runtimeStatus: LocalModelStatus;
  downloadProgress: DownloadProgress | null;
  resumeFallbackMessage: string | null;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onDownload: (model: CatalogModel) => void;
  onCancel: (modelId: string) => void;
  onResume: (model: CatalogModel) => void;
  onRetry: (model: CatalogModel) => void;
  onDelete: (modelId: string) => void;
  onLoad: (model: CatalogModel) => void;
  onUnload: (modelId: string) => void;
}

export interface TaskAssignmentRowProps {
  task: LocalModelTask;
  taskLabel: string;
  currentModelId: string | undefined;
  candidates: Array<{
    id: string;
    label: string;
    statusLabel: string;
  }>;
  isCurrentLoaded: boolean;
  onAssign: (task: LocalModelTask, modelId: string | null) => void;
  requiresLoadText: string;
}

export interface SearchResultCardProps {
  result: HfSearchResult;
  variants: GgufRepoResolution | null;
  variantsLoading: boolean;
  selectedFileName: string | null;
  deviceTier: DeviceTier;
  savedMetas: Record<string, SavedModelMeta>;
  progresses: Record<string, DownloadProgress>;
  statuses: Record<string, LocalModelStatus>;
  resumeFallbackMessage: string | null;
  existingModelId: string | null;
  existingModelState?: 'saved' | 'downloading' | 'partial' | null;
  onSelectVariant: (repoId: string, fileName: string) => void;
  onDownload: (result: HfSearchResult, variant: GgufVariant) => void;
  onResume: (result: HfSearchResult, variant: GgufVariant) => void;
  onRetry: (result: HfSearchResult, variant: GgufVariant) => void;
  onCancel: (modelId: string) => void;
  onLoad: (result: HfSearchResult, variant: GgufVariant) => void;
  onUnload: (modelId: string) => void;
  onDelete: (modelId: string) => void;
}
