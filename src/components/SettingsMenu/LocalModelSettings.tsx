import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import Toggle from '@components/Toggle';
import { SettingsGroup } from './SettingsMenu';
import { localModelRuntime } from '@src/local-llm/runtime';
import { EphemeralFileProvider } from '@src/local-llm/fileProvider';
import { OpfsFileProvider } from '@src/local-llm/storage';
import { rehydrateSavedModels, deleteModel } from '@src/local-llm/storage';
import { CURATED_MODELS } from '@src/local-llm/catalog';
import type { CatalogModel } from '@src/local-llm/catalog';
import { downloadCatalogModel } from '@src/local-llm/download';
import type { DownloadProgress } from '@src/local-llm/download';
import { estimateDeviceTier, getModelFit, formatBytes } from '@src/local-llm/device';
import type { DeviceTier, ModelFitLabel } from '@src/local-llm/device';
import { localAnalyze, localFormat } from '@api/localGeneration';
import type { LocalModelStatus, LocalModelTask } from '@src/local-llm/types';
import type { SavedModelMeta } from '@src/local-llm/storage';

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const statusColors: Record<LocalModelStatus, string> = {
  idle: 'bg-gray-300 dark:bg-gray-600',
  loading: 'bg-yellow-400 animate-pulse',
  ready: 'bg-green-500',
  busy: 'bg-blue-500 animate-pulse',
  error: 'bg-red-500',
  unloaded: 'bg-gray-300 dark:bg-gray-600',
};

const StatusBadge = ({ status }: { status: LocalModelStatus }) => {
  const { t } = useTranslation('main');
  return (
    <span className='inline-flex items-center gap-1.5 text-xs'>
      <span className={`inline-block w-2 h-2 rounded-full ${statusColors[status]}`} />
      <span className='text-gray-600 dark:text-gray-400'>
        {t(`localModel.modelStatus.${status}`)}
      </span>
    </span>
  );
};

// ---------------------------------------------------------------------------
// Fit label badge
// ---------------------------------------------------------------------------

const fitColors: Record<ModelFitLabel, string> = {
  recommended: 'text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30',
  heavy: 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30',
  'not-recommended': 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
};

const FitBadge = ({ fit }: { fit: ModelFitLabel }) => {
  const { t } = useTranslation('main');
  const labels: Record<ModelFitLabel, string> = {
    recommended: t('localModel.modelFit.recommended'),
    heavy: t('localModel.modelFit.heavy'),
    'not-recommended': t('localModel.modelFit.notRecommended'),
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${fitColors[fit]}`}>
      {labels[fit]}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Task badges
// ---------------------------------------------------------------------------

const TaskBadges = ({ tasks }: { tasks: string[] }) => (
  <div className='flex gap-1'>
    {tasks.map((task) => (
      <span key={task} className='text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'>
        {task}
      </span>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

const ProgressBar = ({ progress }: { progress: DownloadProgress }) => {
  const pct = progress.bytesTotal > 0
    ? Math.round((progress.bytesDownloaded / progress.bytesTotal) * 100)
    : 0;
  return (
    <div className='flex flex-col gap-1'>
      <div className='w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2'>
        <div
          className='bg-blue-500 h-2 rounded-full transition-all duration-300'
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className='text-xs text-gray-500 dark:text-gray-400'>
        {formatBytes(progress.bytesDownloaded)} / {formatBytes(progress.bytesTotal)}
        {progress.fileCount > 1 && ` (${progress.fileIndex + 1}/${progress.fileCount})`}
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Catalog model card
// ---------------------------------------------------------------------------

interface CatalogCardProps {
  model: CatalogModel;
  deviceTier: DeviceTier;
  meta: SavedModelMeta | undefined;
  runtimeStatus: LocalModelStatus;
  downloadProgress: DownloadProgress | null;
  onDownload: (model: CatalogModel) => void;
  onCancel: (modelId: string) => void;
  onRetry: (model: CatalogModel) => void;
  onDelete: (modelId: string) => void;
  onLoad: (model: CatalogModel) => void;
  onUnload: (modelId: string) => void;
}

const CatalogCard = ({
  model, deviceTier, meta, runtimeStatus, downloadProgress,
  onDownload, onCancel, onRetry, onDelete, onLoad, onUnload,
}: CatalogCardProps) => {
  const { t } = useTranslation('main');
  const fit = getModelFit(model.recommendedDeviceTier, deviceTier);
  const storageState = meta?.storageState ?? 'none';
  const isLoaded = runtimeStatus === 'ready' || runtimeStatus === 'busy';
  const isLoading = runtimeStatus === 'loading';

  return (
    <div className='px-4 py-3 flex flex-col gap-2'>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex items-center gap-2 min-w-0'>
          <span className='text-sm font-medium text-gray-900 dark:text-gray-100 truncate'>
            {model.label}
          </span>
          <FitBadge fit={fit} />
        </div>
        <span className='text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap'>
          {formatBytes(model.expectedDownloadSize)}
        </span>
      </div>

      <TaskBadges tasks={model.tasks} />

      {model.notes && (
        <p className='text-xs text-gray-500 dark:text-gray-400'>{model.notes}</p>
      )}

      {/* Actions based on state */}
      <div className='flex items-center gap-2 mt-1'>
        {storageState === 'none' && !downloadProgress && (
          <button
            className='btn btn-primary text-xs px-3 py-1'
            onClick={() => onDownload(model)}
          >
            {t('localModel.download')}
          </button>
        )}

        {(storageState === 'downloading' || downloadProgress) && (
          <>
            <div className='flex-1'>
              {downloadProgress && <ProgressBar progress={downloadProgress} />}
              {!downloadProgress && (
                <span className='text-xs text-gray-500'>{t('localModel.downloading')}</span>
              )}
            </div>
            <button
              className='btn btn-neutral text-xs px-3 py-1'
              onClick={() => onCancel(model.id)}
            >
              {t('localModel.cancel')}
            </button>
          </>
        )}

        {storageState === 'partial' && !downloadProgress && (
          <>
            <span className='text-xs text-amber-600 dark:text-amber-400'>
              {t('localModel.storageState.partial')}
            </span>
            <button
              className='btn btn-primary text-xs px-3 py-1'
              onClick={() => onRetry(model)}
            >
              {t('localModel.retry')}
            </button>
            <button
              className='btn btn-neutral text-xs px-3 py-1'
              onClick={() => onDelete(model.id)}
            >
              {t('localModel.delete')}
            </button>
          </>
        )}

        {storageState === 'saved' && !isLoaded && !isLoading && (
          <>
            <span className='text-xs text-green-600 dark:text-green-400'>
              {t('localModel.storageState.saved')}
            </span>
            <button
              className='btn btn-primary text-xs px-3 py-1'
              onClick={() => onLoad(model)}
            >
              {t('localModel.load')}
            </button>
            <button
              className='btn btn-neutral text-xs px-3 py-1'
              onClick={() => onDelete(model.id)}
            >
              {t('localModel.delete')}
            </button>
          </>
        )}

        {storageState === 'saved' && isLoading && (
          <StatusBadge status='loading' />
        )}

        {storageState === 'saved' && isLoaded && (
          <>
            <StatusBadge status={runtimeStatus} />
            <button
              className='btn btn-neutral text-xs px-3 py-1'
              onClick={() => onUnload(model.id)}
              disabled={runtimeStatus === 'busy'}
            >
              {t('localModel.unload')}
            </button>
          </>
        )}

        {meta?.lastError && storageState !== 'downloading' && (
          <span className='text-xs text-red-600 dark:text-red-400 truncate'>
            {meta.lastError}
          </span>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Task assignment helpers
// ---------------------------------------------------------------------------

/** Tasks that are assignable in the UI. Order matters for rendering. */
const ASSIGNABLE_TASKS: LocalModelTask[] = ['generation', 'analysis'];

function getModelStatusLabel(
  modelId: string,
  source: string,
  runtimeStatus: LocalModelStatus,
): 'loaded' | 'saved' | 'imported' | 'notLoaded' {
  if (runtimeStatus === 'ready' || runtimeStatus === 'busy') return 'loaded';
  if (source === 'ephemeral-file') return 'imported';
  if (source === 'opfs') return 'saved';
  return 'notLoaded';
}

// ---------------------------------------------------------------------------
// Task assignment dropdown
// ---------------------------------------------------------------------------

interface TaskAssignmentRowProps {
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

const TaskAssignmentRow = ({
  task, taskLabel, currentModelId, candidates,
  isCurrentLoaded, onAssign, requiresLoadText,
}: TaskAssignmentRowProps) => {
  return (
    <div className='px-4 py-3 flex flex-col gap-1.5'>
      <div className='flex items-center justify-between gap-4'>
        <span className='text-sm font-medium text-gray-900 dark:text-gray-300'>
          {taskLabel}
        </span>
        <select
          className='rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[240px]'
          value={currentModelId ?? ''}
          onChange={(e) => onAssign(task, e.target.value || null)}
        >
          <option value=''>—</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} ({c.statusLabel})
            </option>
          ))}
        </select>
      </div>
      {currentModelId && !isCurrentLoaded && (
        <span className='text-xs text-amber-600 dark:text-amber-400'>
          {requiresLoadText}
        </span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const EPHEMERAL_MODEL_ID = '__wllama_test__';

const LocalModelSettings = () => {
  const { t } = useTranslation('main');

  // Store state
  const localModelEnabled = useStore((s) => s.localModelEnabled);
  const setLocalModelEnabled = useStore((s) => s.setLocalModelEnabled);
  const savedModelMeta = useStore((s) => s.savedModelMeta);
  const localModels = useStore((s) => s.localModels);
  const activeLocalModels = useStore((s) => s.activeLocalModels);

  // Local UI state
  const [enabled, setEnabled] = useState(localModelEnabled);
  const [rehydrated, setRehydrated] = useState(false);

  // Ephemeral model state (manual file picker)
  const [ephemeralStatus, setEphemeralStatus] = useState<LocalModelStatus>('idle');
  const [prompt, setPrompt] = useState('');
  const [output, setOutput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [contextLength, setContextLength] = useState<number | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [testMode, setTestMode] = useState<'generate' | 'analyze' | 'format'>('generate');
  const [analyzeInstruction, setAnalyzeInstruction] = useState('');
  const [formatPreset, setFormatPreset] = useState<'summarize' | 'rewrite' | 'bullets'>('summarize');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // Download state
  const [downloadProgresses, setDownloadProgresses] = useState<Record<string, DownloadProgress>>({});
  const abortControllers = useRef<Record<string, AbortController>>({});

  // Runtime statuses for all known models (catalog + ephemeral)
  const [runtimeStatuses, setRuntimeStatuses] = useState<Record<string, LocalModelStatus>>({});

  // Device tier (computed once)
  const deviceTier = useMemo(() => estimateDeviceTier(), []);

  // Derive active test model from task assignments
  const generationModelId = activeLocalModels.generation ?? null;
  const analysisModelId = activeLocalModels.analysis ?? null;

  // For test generation: which model to use per tab
  const getTestModelId = useCallback((mode: 'generate' | 'analyze' | 'format'): string | null => {
    if (mode === 'generate') {
      return generationModelId;
    }
    // analyze/format: prefer analysis assignment, fall back to generation
    return analysisModelId ?? generationModelId;
  }, [generationModelId, analysisModelId]);

  const hasAnyAssignment = generationModelId !== null || analysisModelId !== null;

  // Check if any assigned model is actually loaded
  const isTestModelLoaded = useCallback((mode: 'generate' | 'analyze' | 'format'): boolean => {
    const modelId = getTestModelId(mode);
    if (!modelId) return false;
    const status = runtimeStatuses[modelId] ?? 'idle';
    return status === 'ready' || status === 'busy';
  }, [getTestModelId, runtimeStatuses]);

  // Sync toggle to store
  useEffect(() => {
    setLocalModelEnabled(enabled);
  }, [enabled]);

  // Subscribe to runtime status changes
  useEffect(() => {
    const unsubscribe = localModelRuntime.subscribe(() => {
      const newStatuses: Record<string, LocalModelStatus> = {};
      newStatuses[EPHEMERAL_MODEL_ID] = localModelRuntime.getStatus(EPHEMERAL_MODEL_ID);
      for (const model of CURATED_MODELS) {
        newStatuses[model.id] = localModelRuntime.getStatus(model.id);
      }
      setRuntimeStatuses(newStatuses);
      setEphemeralStatus(newStatuses[EPHEMERAL_MODEL_ID]);
    });
    return unsubscribe;
  }, []);

  // Rehydrate OPFS state on first mount
  const rehydratedRef = useRef(false);
  useEffect(() => {
    if (!enabled || rehydratedRef.current) return;
    rehydratedRef.current = true;

    rehydrateSavedModels(CURATED_MODELS).then((meta) => {
      const store = useStore.getState();
      for (const [id, m] of Object.entries(meta)) {
        store.updateSavedModelMeta(id, m);
      }
      setRehydrated(true);
    }).catch(() => {
      setRehydrated(true);
    });
  }, [enabled]);

  // ----- Auto-assignment helper (only-if-unset) -----
  const autoAssignIfUnset = useCallback((modelId: string, tasks: LocalModelTask[]) => {
    const store = useStore.getState();
    for (const task of tasks) {
      if (!store.activeLocalModels[task]) {
        store.setActiveLocalModel(task, modelId);
      }
    }
  }, []);

  // ----- Catalog model actions -----

  const handleDownload = useCallback((model: CatalogModel) => {
    const controller = new AbortController();
    abortControllers.current[model.id] = controller;

    const store = useStore.getState();
    store.updateSavedModelMeta(model.id, {
      storageState: 'downloading',
      storedBytes: 0,
      storedFiles: [],
      lastError: undefined,
      downloadRevision: model.revision,
    });

    downloadCatalogModel(model, {
      onProgress: (p) => {
        setDownloadProgresses((prev) => ({ ...prev, [model.id]: p }));
      },
      onFileComplete: (_fileName, fileSize) => {
        const currentMeta = useStore.getState().savedModelMeta[model.id];
        useStore.getState().updateSavedModelMeta(model.id, {
          storedBytes: (currentMeta?.storedBytes ?? 0) + fileSize,
          storedFiles: [...(currentMeta?.storedFiles ?? []), _fileName],
        });
      },
      onComplete: (totalBytes) => {
        useStore.getState().updateSavedModelMeta(model.id, {
          storageState: 'saved',
          storedBytes: totalBytes,
          storedFiles: [...model.downloadFiles],
          lastVerifiedAt: Date.now(),
        });
        setDownloadProgresses((prev) => {
          const { [model.id]: _, ...rest } = prev;
          return rest;
        });
        delete abortControllers.current[model.id];
      },
      onError: (error, _modelId, _fileName) => {
        useStore.getState().updateSavedModelMeta(model.id, {
          storageState: 'partial',
          lastError: error.message,
        });
        setDownloadProgresses((prev) => {
          const { [model.id]: _, ...rest } = prev;
          return rest;
        });
        delete abortControllers.current[model.id];
      },
    }, controller.signal);
  }, []);

  const handleCancelDownload = useCallback((modelId: string) => {
    abortControllers.current[modelId]?.abort();
    delete abortControllers.current[modelId];
    setDownloadProgresses((prev) => {
      const { [modelId]: _, ...rest } = prev;
      return rest;
    });
    useStore.getState().updateSavedModelMeta(modelId, {
      storageState: 'partial',
      lastError: undefined,
    });
  }, []);

  const handleRetry = useCallback((model: CatalogModel) => {
    handleDownload(model);
  }, [handleDownload]);

  const handleDeleteCatalogModel = useCallback(async (modelId: string) => {
    if (!window.confirm(t('localModel.confirmDelete') as string)) return;

    if (localModelRuntime.isLoaded(modelId)) {
      await localModelRuntime.unloadModel(modelId);
    }

    // Clear task assignments pointing to this model
    const store = useStore.getState();
    for (const task of ASSIGNABLE_TASKS) {
      if (store.activeLocalModels[task] === modelId) {
        store.setActiveLocalModel(task, null);
      }
    }

    await deleteModel(modelId);
    store.removeSavedModelMeta(modelId);
    store.removeLocalModel(modelId);
  }, [t]);

  const handleLoadCatalogModel = useCallback(async (model: CatalogModel) => {
    const provider = new OpfsFileProvider(model.id, model.manifest);

    try {
      if (localModelRuntime.isLoaded(model.id)) {
        await localModelRuntime.unloadModel(model.id);
      }

      await localModelRuntime.loadModel(
        {
          id: model.id,
          engine: model.engine,
          tasks: model.tasks,
          label: model.label,
          origin: model.huggingFaceRepo,
          source: 'opfs',
          manifest: model.manifest,
        },
        provider,
      );

      const caps = localModelRuntime.getCapabilities(model.id);
      const store = useStore.getState();
      store.addLocalModel({
        id: model.id,
        engine: model.engine,
        tasks: model.tasks,
        label: model.label,
        origin: model.huggingFaceRepo,
        source: 'opfs',
        manifest: model.manifest,
      });

      // Auto-assign only to tasks that are currently unset
      autoAssignIfUnset(model.id, model.tasks);

      if (caps?.contextLength) setContextLength(caps.contextLength);
      setOutput('');
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [autoAssignIfUnset]);

  const handleUnloadCatalogModel = useCallback(async (modelId: string) => {
    await localModelRuntime.unloadModel(modelId);
    // Assignments remain — model is still in store, just not loaded
  }, []);

  // ----- Ephemeral file selection & model load -----
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoadError(null);
    setFileName(file.name);
    setOutput('');
    setContextLength(null);

    const provider = new EphemeralFileProvider(
      new Map([[file.name, file]]),
      { kind: 'single-file', entrypoint: file.name },
      EPHEMERAL_MODEL_ID,
    );

    try {
      if (localModelRuntime.isLoaded(EPHEMERAL_MODEL_ID)) {
        await localModelRuntime.unloadModel(EPHEMERAL_MODEL_ID);
      }
      await localModelRuntime.loadModel(
        {
          id: EPHEMERAL_MODEL_ID,
          engine: 'wllama',
          tasks: ['generation', 'analysis'],
          label: file.name,
          origin: file.name,
          source: 'ephemeral-file',
          manifest: { kind: 'single-file', entrypoint: file.name },
          fileSize: file.size,
          lastFileName: file.name,
        },
        provider,
      );
      const caps = localModelRuntime.getCapabilities(EPHEMERAL_MODEL_ID);
      if (caps?.contextLength) setContextLength(caps.contextLength);

      const store = useStore.getState();
      store.addLocalModel({
        id: EPHEMERAL_MODEL_ID,
        engine: 'wllama',
        tasks: ['generation', 'analysis'],
        label: file.name,
        origin: file.name,
        source: 'ephemeral-file',
        manifest: { kind: 'single-file', entrypoint: file.name },
        fileSize: file.size,
        lastFileName: file.name,
      });

      // Auto-assign only to tasks that are currently unset
      autoAssignIfUnset(EPHEMERAL_MODEL_ID, ['generation', 'analysis']);
    } catch (err) {
      setLoadError((err as Error).message);
    }

    e.target.value = '';
  }, [autoAssignIfUnset]);

  // ----- Task assignment -----
  const handleTaskAssign = useCallback((task: LocalModelTask, modelId: string | null) => {
    useStore.getState().setActiveLocalModel(task, modelId);
  }, []);

  // Build assignment candidates for a given task.
  // Includes both loaded models (from localModels) and saved catalog models
  // (from CURATED_MODELS + savedModelMeta) that support the task.
  const getTaskCandidates = useCallback((task: LocalModelTask) => {
    const seen = new Set<string>();
    const candidates: Array<{ id: string; label: string; statusLabel: string }> = [];

    // 1. Models already in localModels (loaded or previously registered)
    for (const m of localModels) {
      if (!m.tasks.includes(task)) continue;
      seen.add(m.id);
      const status = runtimeStatuses[m.id] ?? 'idle';
      const statusLabel = getModelStatusLabel(m.id, m.source, status);
      candidates.push({
        id: m.id,
        label: m.label,
        statusLabel: t(`localModel.${statusLabel}`),
      });
    }

    // 2. Saved catalog models not yet in localModels
    for (const cm of CURATED_MODELS) {
      if (seen.has(cm.id)) continue;
      if (!cm.tasks.includes(task)) continue;
      const meta = savedModelMeta[cm.id];
      if (!meta || meta.storageState !== 'saved') continue;
      candidates.push({
        id: cm.id,
        label: cm.label,
        statusLabel: t('localModel.saved'),
      });
    }

    return candidates;
  }, [localModels, runtimeStatuses, savedModelMeta, t]);

  // ----- Generation -----
  const handleGenerate = useCallback(async () => {
    const modelId = getTestModelId('generate');
    if (!prompt.trim() || !modelId) return;
    const engine = localModelRuntime.getWllamaEngine(modelId);
    if (!engine) return;

    setGenerating(true);
    setOutput('');

    try {
      await engine.generate(
        prompt,
        { maxTokens: 256, temperature: 0.7 },
        (text) => {
          setOutput(text);
          if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
          }
        },
      );
    } catch (err) {
      setOutput((prev) => prev + `\n[Error: ${(err as Error).message}]`);
    } finally {
      setGenerating(false);
    }
  }, [prompt, getTestModelId]);

  const handleAnalyze = useCallback(async () => {
    if (!prompt.trim() || !analyzeInstruction.trim()) return;
    setGenerating(true);
    setOutput('');
    try {
      const result = await localAnalyze(prompt, analyzeInstruction);
      setOutput(result);
    } catch (err) {
      setOutput(`[Error: ${(err as Error).message}]`);
    } finally {
      setGenerating(false);
    }
  }, [prompt, analyzeInstruction]);

  const handleFormat = useCallback(async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setOutput('');
    try {
      const result = await localFormat(prompt, formatPreset);
      setOutput(result);
    } catch (err) {
      setOutput(`[Error: ${(err as Error).message}]`);
    } finally {
      setGenerating(false);
    }
  }, [prompt, formatPreset]);

  const handleAbort = useCallback(() => {
    const modelId = getTestModelId(testMode);
    if (!modelId) return;
    const engine = localModelRuntime.getWllamaEngine(modelId);
    engine?.abort();
  }, [getTestModelId, testMode]);

  const handleUnloadEphemeral = useCallback(async () => {
    await localModelRuntime.unloadModel(EPHEMERAL_MODEL_ID);
    setContextLength(null);
    setFileName(null);
    setOutput('');
    // Assignments remain — user can reassign via dropdown
  }, []);

  const isEphemeralReady = ephemeralStatus === 'ready' || ephemeralStatus === 'busy';

  // Whether test area should show: need at least one assignment that is loaded
  const canTestGenerate = isTestModelLoaded('generate');
  const canTestAnalyze = isTestModelLoaded('analyze') || isTestModelLoaded('generate');
  const showTestArea = canTestGenerate || canTestAnalyze;

  // Analysis fallback indicator
  const analysisFallsBack = !analysisModelId && !!generationModelId;

  // Device tier label
  const tierLabels: Record<DeviceTier, string> = {
    low: t('localModel.deviceTierLow'),
    standard: t('localModel.deviceTierStandard'),
    high: t('localModel.deviceTierHigh'),
  };

  // Task labels
  const taskLabels: Record<string, string> = {
    generation: t('localModel.taskGeneration'),
    analysis: t('localModel.taskAnalysis'),
  };

  return (
    <div className='flex flex-col gap-5'>
      {/* Experimental notice */}
      <div className='flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-800 dark:text-amber-300'>
        <span className='font-semibold whitespace-nowrap'>{t('localModel.experimental')}</span>
        <span>{t('localModel.experimentalNote')}</span>
      </div>

      {/* Enable toggle */}
      <SettingsGroup label=''>
        <Toggle
          label={t('localModel.enabled')}
          isChecked={enabled}
          setIsChecked={setEnabled}
        />
      </SettingsGroup>

      {enabled && (
        <>
          {/* Device info */}
          <div className='px-1 text-xs text-gray-500 dark:text-gray-400'>
            {t('localModel.deviceTier')}: <span className='font-medium text-gray-700 dark:text-gray-300'>{tierLabels[deviceTier]}</span>
          </div>

          {/* Recommended Models */}
          <SettingsGroup label={t('localModel.recommendedModels')}>
            {CURATED_MODELS.map((model) => (
              <CatalogCard
                key={model.id}
                model={model}
                deviceTier={deviceTier}
                meta={savedModelMeta[model.id]}
                runtimeStatus={runtimeStatuses[model.id] ?? 'idle'}
                downloadProgress={downloadProgresses[model.id] ?? null}
                onDownload={handleDownload}
                onCancel={handleCancelDownload}
                onRetry={handleRetry}
                onDelete={handleDeleteCatalogModel}
                onLoad={handleLoadCatalogModel}
                onUnload={handleUnloadCatalogModel}
              />
            ))}
          </SettingsGroup>

          {/* Imported Local Files */}
          <SettingsGroup label={t('localModel.importedFiles')}>
            <div className='px-4 py-3 flex flex-col gap-3'>
              <p className='text-xs text-gray-500 dark:text-gray-400'>
                {t('localModel.selectGgufHint')}
              </p>
              <div className='flex items-center gap-3'>
                <button
                  className='btn btn-neutral text-sm px-4 py-1.5'
                  onClick={() => fileInputRef.current?.click()}
                  disabled={ephemeralStatus === 'loading'}
                >
                  {ephemeralStatus === 'loading' ? t('localModel.modelStatus.loading') : t('localModel.selectGgufFile')}
                </button>
                <input
                  ref={fileInputRef}
                  type='file'
                  accept='.gguf'
                  className='hidden'
                  onChange={handleFileSelect}
                />
                {ephemeralStatus !== 'idle' && <StatusBadge status={ephemeralStatus} />}
              </div>

              {fileName && (
                <div className='text-xs text-gray-600 dark:text-gray-400 truncate'>
                  {fileName}
                </div>
              )}

              {loadError && (
                <div className='text-xs text-red-600 dark:text-red-400'>
                  {t('localModel.loadError')}: {loadError}
                </div>
              )}

              {isEphemeralReady && (
                <div className='flex items-center gap-2'>
                  {contextLength !== null && (
                    <span className='text-xs text-gray-500 dark:text-gray-400'>
                      {t('localModel.contextLength')}: {contextLength.toLocaleString()}
                    </span>
                  )}
                  <button
                    className='btn btn-neutral text-xs px-3 py-1 ml-auto'
                    onClick={handleUnloadEphemeral}
                    disabled={generating}
                  >
                    {t('localModel.unload')}
                  </button>
                </div>
              )}
            </div>
          </SettingsGroup>

          {/* Task Assignment */}
          {(localModels.length > 0 || Object.values(savedModelMeta).some((m) => m.storageState === 'saved')) && (
            <SettingsGroup label={t('localModel.taskAssignment')}>
              {ASSIGNABLE_TASKS.map((task) => {
                const currentId = activeLocalModels[task];
                const currentStatus = currentId ? (runtimeStatuses[currentId] ?? 'idle') : 'idle';
                const isCurrentLoaded = currentStatus === 'ready' || currentStatus === 'busy';

                return (
                  <TaskAssignmentRow
                    key={task}
                    task={task}
                    taskLabel={taskLabels[task] ?? task}
                    currentModelId={currentId}
                    candidates={getTaskCandidates(task)}
                    isCurrentLoaded={isCurrentLoaded}
                    onAssign={handleTaskAssign}
                    requiresLoadText={t('localModel.assignmentRequiresLoad') as string}
                  />
                );
              })}
              {analysisFallsBack && (
                <div className='px-4 py-2'>
                  <span className='text-xs text-gray-500 dark:text-gray-400 italic'>
                    {t('localModel.analysisFallsBackToGeneration')}
                  </span>
                </div>
              )}
            </SettingsGroup>
          )}

          {/* Test generation area */}
          {showTestArea && (
            <SettingsGroup label={t('localModel.testGenerate')}>
              <div className='px-4 py-3 flex flex-col gap-3'>
                {/* Mode tabs */}
                <div className='flex gap-1 rounded-md bg-gray-100 dark:bg-gray-700 p-0.5'>
                  {(['generate', 'analyze', 'format'] as const).map((mode) => (
                    <button
                      key={mode}
                      className={`flex-1 text-xs py-1.5 rounded transition-colors ${
                        testMode === mode
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                      }`}
                      onClick={() => setTestMode(mode)}
                    >
                      {mode === 'generate' ? 'Generate' : mode === 'analyze' ? 'Analyze' : 'Format'}
                    </button>
                  ))}
                </div>

                {/* Input area */}
                <textarea
                  className='w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500'
                  rows={3}
                  placeholder={testMode === 'generate'
                    ? (t('localModel.testPromptPlaceholder') as string)
                    : 'Enter text...'
                  }
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={generating}
                />

                {testMode === 'analyze' && (
                  <input
                    type='text'
                    className='w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500'
                    placeholder='Instruction (e.g. "Identify the key themes")'
                    value={analyzeInstruction}
                    onChange={(e) => setAnalyzeInstruction(e.target.value)}
                    disabled={generating}
                  />
                )}

                {testMode === 'format' && (
                  <select
                    className='w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500'
                    value={formatPreset}
                    onChange={(e) => setFormatPreset(e.target.value as typeof formatPreset)}
                    disabled={generating}
                  >
                    <option value='summarize'>Summarize</option>
                    <option value='rewrite'>Rewrite</option>
                    <option value='bullets'>Bullet Points</option>
                  </select>
                )}

                {/* Action buttons */}
                <div className='flex gap-2'>
                  <button
                    className='btn btn-primary text-sm px-4 py-1.5'
                    onClick={
                      testMode === 'generate' ? handleGenerate
                        : testMode === 'analyze' ? handleAnalyze
                        : handleFormat
                    }
                    disabled={
                      generating || !prompt.trim() ||
                      !isTestModelLoaded(testMode) ||
                      (testMode === 'analyze' && !analyzeInstruction.trim())
                    }
                  >
                    {generating ? t('localModel.generating') : (
                      testMode === 'generate' ? t('localModel.testGenerate')
                        : testMode === 'analyze' ? 'Analyze'
                        : 'Format'
                    )}
                  </button>
                  {generating && (
                    <button
                      className='btn btn-neutral text-sm px-4 py-1.5'
                      onClick={handleAbort}
                    >
                      Stop
                    </button>
                  )}
                </div>

                {/* Output */}
                {output && (
                  <div className='flex flex-col gap-1'>
                    <span className='text-xs font-medium text-gray-500 dark:text-gray-400'>
                      {t('localModel.output')}
                    </span>
                    <div
                      ref={outputRef}
                      className='max-h-64 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 p-3 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono'
                    >
                      {output}
                    </div>
                  </div>
                )}
              </div>
            </SettingsGroup>
          )}

          {/* No model loaded hint */}
          {!hasAnyAssignment && ephemeralStatus === 'idle' && (
            <p className='text-xs text-gray-400 dark:text-gray-500 text-center'>
              {t('localModel.noModelLoaded')}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default LocalModelSettings;
