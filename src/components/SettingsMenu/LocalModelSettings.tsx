import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import Toggle from '@components/Toggle';
import { SettingsGroup } from './SettingsMenu';
import { localModelRuntime } from '@src/local-llm/runtime';
import { OpfsFileProvider, deleteModel, getTempFileSize, readFile, saveFile, sha256Blob } from '@src/local-llm/storage';
import { rehydrateSavedModels } from '@src/local-llm/storage';
import { CURATED_MODELS } from '@src/local-llm/catalog';
import type { CatalogModel } from '@src/local-llm/catalog';
import { downloadCatalogModel, downloadModelFiles } from '@src/local-llm/download';
import { detectWebGpuCapability, estimateDeviceTier, getModelFit } from '@src/local-llm/device';
import type { DeviceTier } from '@src/local-llm/device';
import { localAnalyze, localFormat } from '@api/localGeneration';
import type {
  LocalModelDefinition,
  LocalModelStatus,
  LocalModelTask,
  HfSearchResult,
  GgufVariant,
} from '@src/local-llm/types';
import {
  resolveGgufFiles,
  resolveSearchCandidate,
  generateSearchModelId,
} from '@src/local-llm/hfSearch';
import OpfsFileBrowser from './OpfsFileBrowser';

import { ASSIGNABLE_TASKS, EPHEMERAL_MODEL_ID, getModelStatusLabel } from './localModelConstants';
import { StatusBadge, FitBadge, SortableColumnHeader, FilterInfoButton } from './LocalModelBadges';
import { CatalogCard, DownloadedModelRow, DownloadingModelRow, TaskAssignmentRow } from './LocalModelCards';
import SearchResultCard from './SearchResultCard';
import { useModelDownload } from '@src/hooks/useModelDownload';
import { useModelDeletion } from '@src/hooks/useModelDeletion';
import { useHfSearch } from '@src/hooks/useHfSearch';

const IMPORTED_MODEL_PREFIX = 'local-file';

function sanitizeModelIdSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'model';
}

// Helper: build a fake HfSearchResult from a persisted model definition
function buildFakeSearchResult(model: LocalModelDefinition, variant: { size: number }): HfSearchResult {
  return {
    repoId: model.origin!,
    repoUrl: `https://huggingface.co/${model.origin}`,
    description: '',
    tags: [],
    downloads: 0,
    lastModified: '',
    bestCandidateSize: variant.size,
    supportStatus: 'supported',
    supportReason: '',
    engine: model.engine,
  };
}

const LocalModelSettings = () => {
  const { t } = useTranslation('main');

  // Store state
  const localModelEnabled = useStore((s) => s.localModelEnabled);
  const setLocalModelEnabled = useStore((s) => s.setLocalModelEnabled);
  const savedModelMeta = useStore((s) => s.savedModelMeta);
  const localModels = useStore((s) => s.localModels);
  const activeLocalModels = useStore((s) => s.activeLocalModels);
  const favoriteLocalModelIds = useStore((s) => s.favoriteLocalModelIds);
  const toggleFavoriteLocalModel = useStore((s) => s.toggleFavoriteLocalModel);

  // Local UI state
  const [enabled, setEnabled] = useState(localModelEnabled);
  const [rehydrated, setRehydrated] = useState(false);
  const [webGpuEnabled, setWebGpuEnabled] = useState<boolean | null>(() => localModelRuntime.getWebGpuEnabled());
  const [webGpuCapable, setWebGpuCapable] = useState<boolean | null>(null);
  const [webGpuPreflighting, setWebGpuPreflighting] = useState(false);

  // Ephemeral model state
  const [ephemeralStatus, setEphemeralStatus] = useState<LocalModelStatus>('idle');
  const [prompt, setPrompt] = useState('');
  const [output, setOutput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ephemeralLoadError, setEphemeralLoadError] = useState<string | null>(null);
  const [importedModelId, setImportedModelId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [contextLength, setContextLength] = useState<number | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [testMode, setTestMode] = useState<'generate' | 'analyze' | 'format'>('generate');
  const [analyzeInstruction, setAnalyzeInstruction] = useState('');
  const [formatPreset, setFormatPreset] = useState<'summarize' | 'rewrite' | 'bullets'>('summarize');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // OPFS browser refresh trigger: increment on every storage mutation.
  const [opfsBrowserRefresh, setOpfsBrowserRefresh] = useState(0);
  const bumpOpfsBrowser = useCallback(() => setOpfsBrowserRefresh((n) => n + 1), []);

  // Hooks
  const { downloadProgresses, resumeFallbacks, abortControllers, startDownload, cancelDownload, clearProgress, clearResumeFallback } = useModelDownload(bumpOpfsBrowser);
  const { deleteWithConfirm } = useModelDeletion();
  const hfSearch = useHfSearch(rehydrated);

  // Runtime statuses for all known models
  const [runtimeStatuses, setRuntimeStatuses] = useState<Record<string, LocalModelStatus>>(() => {
    const initial: Record<string, LocalModelStatus> = {};
    initial[EPHEMERAL_MODEL_ID] = localModelRuntime.getStatus(EPHEMERAL_MODEL_ID);
    for (const model of CURATED_MODELS) {
      initial[model.id] = localModelRuntime.getStatus(model.id);
    }
    for (const m of useStore.getState().localModels) {
      if (!(m.id in initial)) {
        initial[m.id] = localModelRuntime.getStatus(m.id);
      }
    }
    return initial;
  });

  const deviceTier = useMemo(() => estimateDeviceTier(), []);
  const resolvedWebGpuEnabled = webGpuEnabled ?? webGpuCapable === true;
  const webGpuStatusText = webGpuPreflighting
    ? t('localModel.webgpuPreflightChecking')
    : webGpuEnabled === false
      ? t('localModel.webgpuDisabled')
      : webGpuCapable === null
        ? t('localModel.webgpuChecking')
        : webGpuCapable
          ? t('localModel.webgpuAvailable')
          : t('localModel.webgpuUnavailable');

  // Derive active test model from task assignments
  const generationModelId = activeLocalModels.generation ?? null;
  const analysisModelId = activeLocalModels.analysis ?? null;

  const getTestModelId = useCallback((mode: 'generate' | 'analyze' | 'format'): string | null => {
    if (mode === 'generate') return generationModelId;
    return analysisModelId ?? generationModelId;
  }, [generationModelId, analysisModelId]);

  const hasAnyAssignment = generationModelId !== null || analysisModelId !== null;

  const isTestModelLoaded = useCallback((mode: 'generate' | 'analyze' | 'format'): boolean => {
    const modelId = getTestModelId(mode);
    if (!modelId) return false;
    const status = runtimeStatuses[modelId] ?? 'idle';
    return status === 'ready' || status === 'busy';
  }, [getTestModelId, runtimeStatuses]);

  // Sync toggle to store
  useEffect(() => { setLocalModelEnabled(enabled); }, [enabled]);

  const runWebGpuPreflight = useCallback(async (): Promise<boolean> => {
    setWebGpuPreflighting(true);
    try {
      const ok = await localModelRuntime.preflightWllamaWebGPU();
      setWebGpuCapable(ok);
      return ok;
    } finally {
      setWebGpuPreflighting(false);
    }
  }, []);

  const setEnabledWithPreflight = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((action) => {
    setEnabled((prev) => {
      const next = typeof action === 'function'
        ? (action as (value: boolean) => boolean)(prev)
        : action;
      if (!prev && next && webGpuEnabled !== false) {
        void runWebGpuPreflight();
      }
      return next;
    });
  }, [runWebGpuPreflight, webGpuEnabled]);

  const handleWebGpuToggle = useCallback(() => {
    const next = !resolvedWebGpuEnabled;
    setWebGpuEnabled(next);
    localModelRuntime.setWebGpuEnabled(next);
    if (next) void runWebGpuPreflight();
  }, [resolvedWebGpuEnabled, runWebGpuPreflight]);

  useEffect(() => {
    let cancelled = false;
    detectWebGpuCapability()
      .then((capable) => {
        if (!cancelled) setWebGpuCapable(capable);
      })
      .catch(() => {
        if (!cancelled) setWebGpuCapable(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Subscribe to runtime status changes
  useEffect(() => {
    const unsubscribe = localModelRuntime.subscribe(() => {
      const newStatuses: Record<string, LocalModelStatus> = {};
      newStatuses[EPHEMERAL_MODEL_ID] = localModelRuntime.getStatus(EPHEMERAL_MODEL_ID);
      for (const model of CURATED_MODELS) {
        newStatuses[model.id] = localModelRuntime.getStatus(model.id);
      }
      for (const m of useStore.getState().localModels) {
        if (!(m.id in newStatuses)) {
          newStatuses[m.id] = localModelRuntime.getStatus(m.id);
        }
      }
      setRuntimeStatuses(newStatuses);
      setEphemeralStatus(newStatuses[EPHEMERAL_MODEL_ID]);
    });
    return unsubscribe;
  }, []);

  // Rehydrate OPFS state on first mount and after storage mutations.
  const [rehydrationEpoch, setRehydrationEpoch] = useState(0);
  const rehydratedRef = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    if (rehydratedRef.current && rehydrationEpoch === 0) return;
    rehydratedRef.current = true;

    const searchModels = useStore.getState().localModels
      .filter((m) => m.source === 'opfs' && !CURATED_MODELS.some((c) => c.id === m.id))
      .map((m) => ({ id: m.id, manifest: m.manifest }));
    const entries = [...CURATED_MODELS, ...searchModels];

    rehydrateSavedModels(entries).then((meta) => {
      const store = useStore.getState();
      for (const [id, m] of Object.entries(meta)) {
        store.updateSavedModelMeta(id, m);
        if (m.storageState === 'saved' && !store.localModels.some((lm) => lm.id === id)) {
          const catalog = CURATED_MODELS.find((c) => c.id === id);
          if (catalog) {
            store.addLocalModel({
              id: catalog.id, engine: catalog.engine, tasks: catalog.tasks,
              label: catalog.label, origin: catalog.huggingFaceRepo, source: 'opfs',
              manifest: catalog.manifest, fileSize: m.storedBytes || catalog.expectedDownloadSize,
              displayMeta: catalog.displayMeta,
            });
          }
        }
      }
      setRehydrated(true);
    }).catch(() => { setRehydrated(true); });
  }, [enabled, rehydrationEpoch]);

  // Sync partial model storedBytes on section mount
  useEffect(() => {
    if (!rehydrated) return;
    const metas = useStore.getState().savedModelMeta;
    for (const [id, meta] of Object.entries(metas)) {
      if (meta.storageState === 'partial') {
        const model = CURATED_MODELS.find((c) => c.id === id)
          ?? useStore.getState().localModels.find((m) => m.id === id);
        if (!model) continue;
        const file = model.manifest.kind === 'single-file'
          ? model.manifest.entrypoint
          : model.manifest.requiredFiles[0];
        if (!file) continue;
        getTempFileSize(id, file).then((size) => {
          if (size > 0) {
            useStore.getState().updateSavedModelMeta(id, { storedBytes: size });
          }
        });
      }
    }
  }, [rehydrated]);

  // ----- Auto-assignment helper -----
  const autoAssignIfUnset = useCallback((modelId: string, tasks: LocalModelTask[]) => {
    const store = useStore.getState();
    for (const task of tasks) {
      if (!store.activeLocalModels[task]) {
        store.setActiveLocalModel(task, modelId);
      }
    }
  }, []);

  const findStoredModelWithHash = useCallback(async (fileHash: string, fileSize: number, excludeModelId?: string): Promise<LocalModelDefinition | null> => {
    const store = useStore.getState();
    const candidates = [
      ...CURATED_MODELS.map((model) => ({
        id: model.id,
        engine: model.engine,
        tasks: model.tasks,
        label: model.label,
        origin: model.huggingFaceRepo,
        source: 'opfs' as const,
        manifest: model.manifest,
        fileSize: model.expectedDownloadSize,
        displayMeta: model.displayMeta,
      })),
      ...store.localModels,
    ];

    for (const model of candidates) {
      if (model.id === excludeModelId) continue;
      if (model.engine !== 'wllama' || model.manifest.kind !== 'single-file') continue;
      const meta = store.savedModelMeta[model.id];
      if (meta?.storageState !== 'saved') continue;
      if (meta.storedBytes && meta.storedBytes !== fileSize) continue;

      const entrypoint = model.manifest.entrypoint;
      let storedHash = meta.fileHashes?.[entrypoint];
      if (!storedHash) {
        try {
          const storedFile = await readFile(model.id, entrypoint);
          if (storedFile.size !== fileSize) continue;
          storedHash = await sha256Blob(storedFile);
          store.updateSavedModelMeta(model.id, {
            fileHashes: { ...(meta.fileHashes ?? {}), [entrypoint]: storedHash },
          });
        } catch {
          continue;
        }
      }
      if (storedHash === fileHash) return model;
    }

    return null;
  }, []);

  const registerDownloadedOrUseDuplicate = useCallback(async (model: LocalModelDefinition, totalBytes: number) => {
    if (model.engine !== 'wllama' || model.manifest.kind !== 'single-file') {
      useStore.getState().addLocalModel(model);
      return;
    }

    const store = useStore.getState();
    const entrypoint = model.manifest.entrypoint;
    try {
      const storedFile = await readFile(model.id, entrypoint);
      const fileHash = await sha256Blob(storedFile);
      store.updateSavedModelMeta(model.id, {
        fileHashes: { ...(store.savedModelMeta[model.id]?.fileHashes ?? {}), [entrypoint]: fileHash },
      });
      const duplicate = await findStoredModelWithHash(fileHash, totalBytes, model.id);
      if (duplicate) {
        await deleteModel(model.id);
        store.removeSavedModelMeta(model.id);
        store.removeLocalModel(model.id);
        if (!store.favoriteLocalModelIds.includes(duplicate.id)) store.toggleFavoriteLocalModel(duplicate.id);
        autoAssignIfUnset(duplicate.id, duplicate.tasks);
        bumpOpfsBrowser();
        return;
      }
    } catch {
      // Keep the just-downloaded model if hashing or duplicate lookup fails.
    }

    store.addLocalModel(model);
  }, [autoAssignIfUnset, bumpOpfsBrowser, findStoredModelWithHash]);

  // ----- Catalog download handlers (thin wrappers using useModelDownload) -----
  const handleDownload = useCallback((model: CatalogModel) => {
    const store = useStore.getState();
    store.updateSavedModelMeta(model.id, { storedBytes: 0, storedFiles: [], downloadRevision: model.revision });
    startDownload(model.id, (cb, sig) => downloadCatalogModel(model, cb, sig), {
      storedFiles: [...model.downloadFiles],
      onComplete: (totalBytes) => {
        void registerDownloadedOrUseDuplicate({
          id: model.id, engine: model.engine, tasks: model.tasks, label: model.label,
          origin: model.huggingFaceRepo, source: 'opfs', manifest: model.manifest,
          fileSize: totalBytes, displayMeta: model.displayMeta,
        }, totalBytes);
      },
    });
  }, [registerDownloadedOrUseDuplicate, startDownload]);

  const handleResumeCatalog = useCallback((model: CatalogModel) => {
    clearResumeFallback(model.id);
    startDownload(model.id, (cb, sig) => downloadCatalogModel(model, cb, sig, true), {
      resume: true,
      storedFiles: [...model.downloadFiles],
      resumeFallbackMsg: t('localModel.resumeFallback') as string,
    });
  }, [startDownload, clearResumeFallback, t]);

  const handleCancelDownload = useCallback((modelId: string) => {
    cancelDownload(modelId);
  }, [cancelDownload]);

  const handleRetry = useCallback((model: CatalogModel) => {
    handleDownload(model);
  }, [handleDownload]);

  // ----- Catalog deletion / load / unload -----
  const handleDeleteCatalogModel = useCallback(async (modelId: string) => {
    await deleteWithConfirm(modelId, { abortControllers, clearProgress, onDeleted: bumpOpfsBrowser });
  }, [deleteWithConfirm, clearProgress, bumpOpfsBrowser]);

  const handleLoadCatalogModel = useCallback(async (model: CatalogModel) => {
    const provider = new OpfsFileProvider(model.id, model.manifest);
    try {
      if (localModelRuntime.isLoaded(model.id)) {
        await localModelRuntime.unloadModel(model.id);
      }
      await localModelRuntime.loadModel(
        { id: model.id, engine: model.engine, tasks: model.tasks, label: model.label,
          origin: model.huggingFaceRepo, source: 'opfs', manifest: model.manifest },
        provider,
      );
      const store = useStore.getState();
      store.addLocalModel({
        id: model.id, engine: model.engine, tasks: model.tasks, label: model.label,
        origin: model.huggingFaceRepo, source: 'opfs', manifest: model.manifest,
      });
      autoAssignIfUnset(model.id, model.tasks);
      if (!store.favoriteLocalModelIds.includes(model.id)) {
        store.toggleFavoriteLocalModel(model.id);
      }
      const caps = localModelRuntime.getCapabilities(model.id);
      if (caps?.contextLength) setContextLength(caps.contextLength);
      setOutput('');
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [autoAssignIfUnset]);

  const handleUnloadCatalogModel = useCallback(async (modelId: string) => {
    await localModelRuntime.unloadModel(modelId);
  }, []);

  // ----- Ephemeral file handlers -----
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEphemeralLoadError(null);
    setFileName(file.name);
    setOutput('');
    setContextLength(null);

    try {
      const fileHash = await sha256Blob(file);
      const existingModel = await findStoredModelWithHash(fileHash, file.size);
      const manifest = { kind: 'single-file' as const, entrypoint: file.name };
      const store = useStore.getState();
      const model: LocalModelDefinition = existingModel ?? {
        id: `${IMPORTED_MODEL_PREFIX}--${fileHash.slice(0, 16)}--${sanitizeModelIdSegment(file.name)}`,
        engine: 'wllama',
        tasks: ['generation', 'analysis'],
        label: file.name,
        origin: file.name,
        source: 'opfs',
        manifest,
        fileSize: file.size,
        lastFileName: file.name,
      };

      if (!existingModel) {
        await saveFile(model.id, file.name, file);
        store.updateSavedModelMeta(model.id, {
          storageState: 'saved',
          storedBytes: file.size,
          storedFiles: [file.name],
          fileHashes: { [file.name]: fileHash },
          lastVerifiedAt: Date.now(),
          lastError: undefined,
        });
        store.addLocalModel(model);
      }

      if (localModelRuntime.isLoaded(EPHEMERAL_MODEL_ID)) await localModelRuntime.unloadModel(EPHEMERAL_MODEL_ID);
      if (localModelRuntime.isLoaded(model.id)) await localModelRuntime.unloadModel(model.id);

      await localModelRuntime.loadModel(
        model,
        new OpfsFileProvider(model.id, model.manifest),
      );
      const caps = localModelRuntime.getCapabilities(model.id);
      if (caps?.contextLength) setContextLength(caps.contextLength);
      setImportedModelId(model.id);
      store.addLocalModel(model);
      autoAssignIfUnset(model.id, model.tasks);
      if (!store.favoriteLocalModelIds.includes(model.id)) store.toggleFavoriteLocalModel(model.id);
      setSelectedModelId(null);
      bumpOpfsBrowser();
    } catch (err) {
      setEphemeralLoadError((err as Error).message);
    }
    e.target.value = '';
  }, [autoAssignIfUnset, bumpOpfsBrowser, findStoredModelWithHash]);

  const handleUnloadEphemeral = useCallback(async () => {
    if (importedModelId) await localModelRuntime.unloadModel(importedModelId);
    setContextLength(null);
    setFileName(null);
    setImportedModelId(null);
    setOutput('');
  }, [importedModelId]);

  // ----- Task assignment -----
  const handleTaskAssign = useCallback((task: LocalModelTask, modelId: string | null) => {
    useStore.getState().setActiveLocalModel(task, modelId);
  }, []);

  const getTaskCandidates = useCallback((task: LocalModelTask) => {
    const seen = new Set<string>();
    const candidates: Array<{ id: string; label: string; statusLabel: string }> = [];
    for (const m of localModels) {
      if (!m.tasks.includes(task)) continue;
      seen.add(m.id);
      const status = runtimeStatuses[m.id] ?? 'idle';
      const statusLabel = getModelStatusLabel(m.id, m.source, status);
      candidates.push({ id: m.id, label: m.label, statusLabel: t(`localModel.${statusLabel}`) });
    }
    for (const cm of CURATED_MODELS) {
      if (seen.has(cm.id)) continue;
      if (!cm.tasks.includes(task)) continue;
      const meta = savedModelMeta[cm.id];
      if (!meta || meta.storageState !== 'saved') continue;
      candidates.push({ id: cm.id, label: cm.label, statusLabel: t('localModel.saved') });
    }
    return candidates;
  }, [localModels, runtimeStatuses, savedModelMeta, t]);

  // ----- Generation / Testing -----
  const handleGenerate = useCallback(async () => {
    const modelId = getTestModelId('generate');
    if (!prompt.trim() || !modelId) return;
    const engine = localModelRuntime.getWllamaEngine(modelId);
    if (!engine) return;
    setGenerating(true);
    setOutput('');
    try {
      await engine.generate(prompt, { maxTokens: 256, temperature: 0.7 }, (text) => {
        setOutput(text);
        if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
      }, 'test');
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
      const result = await localAnalyze(prompt, analyzeInstruction, 'test');
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
      const result = await localFormat(prompt, formatPreset, 'test');
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
    localModelRuntime.getWllamaEngine(modelId)?.abort();
  }, [getTestModelId, testMode]);

  // ----- Search model download/resume/load/delete (thin wrappers) -----
  const handleDownloadSearchResult = useCallback((result: HfSearchResult, variant: GgufVariant) => {
    const existingId = hfSearch.findExistingModelForVariant(result.repoId, variant.fileName);
    if (existingId) {
      const meta = useStore.getState().savedModelMeta[existingId];
      if (meta?.storageState === 'saved' || meta?.storageState === 'downloading' || abortControllers.current[existingId]) return;
    }
    const candidate = resolveSearchCandidate(result, variant);
    if (!candidate) return;
    const modelId = generateSearchModelId(result.repoId, variant);
    if (abortControllers.current[modelId]) return;

    hfSearch.setActiveSearchDownloads((prev) => ({ ...prev, [modelId]: { result, variant, modelId } }));

    const store = useStore.getState();
    if (!store.localModels.some((m) => m.id === modelId)) {
      store.addLocalModel({
        id: modelId, engine: candidate.engine, tasks: candidate.tasks, label: candidate.label,
        origin: result.repoId, source: 'opfs', manifest: candidate.manifest, fileSize: candidate.estimatedSize,
      });
    }

    startDownload(modelId, (cb, sig) => downloadModelFiles({
      modelId, repo: result.repoId, revision: 'main', files: candidate.downloadFiles,
    }, cb, sig), {
      storedFiles: [...candidate.downloadFiles],
      onComplete: () => {
        hfSearch.setActiveSearchDownloads((prev) => { const { [modelId]: _, ...rest } = prev; return rest; });
        void registerDownloadedOrUseDuplicate({
          id: modelId, engine: candidate.engine, tasks: candidate.tasks, label: candidate.label,
          origin: result.repoId, source: 'opfs', manifest: candidate.manifest, fileSize: candidate.estimatedSize,
        }, candidate.estimatedSize);
      },
    });
  }, [registerDownloadedOrUseDuplicate, startDownload, hfSearch.findExistingModelForVariant, hfSearch.setActiveSearchDownloads]);

  const handleResumeSearchModel = useCallback((result: HfSearchResult, variant: GgufVariant) => {
    const candidate = resolveSearchCandidate(result, variant);
    if (!candidate) return;
    const modelId = generateSearchModelId(result.repoId, variant);
    if (abortControllers.current[modelId]) return;

    hfSearch.setActiveSearchDownloads((prev) => ({ ...prev, [modelId]: { result, variant, modelId } }));
    clearResumeFallback(modelId);

    startDownload(modelId, (cb, sig) => downloadModelFiles({
      modelId, repo: result.repoId, revision: 'main', files: candidate.downloadFiles, resume: true,
    }, cb, sig), {
      resume: true,
      storedFiles: [...candidate.downloadFiles],
      resumeFallbackMsg: t('localModel.resumeFallback') as string,
      onComplete: () => {
        hfSearch.setActiveSearchDownloads((prev) => { const { [modelId]: _, ...rest } = prev; return rest; });
      },
    });
  }, [startDownload, clearResumeFallback, hfSearch.setActiveSearchDownloads, t]);

  const handleRetrySearchModel = useCallback((result: HfSearchResult, variant: GgufVariant) => {
    handleDownloadSearchResult(result, variant);
  }, [handleDownloadSearchResult]);

  const handleCancelSearchDownload = useCallback((modelId: string) => {
    cancelDownload(modelId);
  }, [cancelDownload]);

  const handleLoadSearchModel = useCallback(async (result: HfSearchResult, variant: GgufVariant) => {
    const candidate = resolveSearchCandidate(result, variant);
    if (!candidate) return;
    const modelId = generateSearchModelId(result.repoId, variant);
    const provider = new OpfsFileProvider(modelId, candidate.manifest);
    try {
      if (localModelRuntime.isLoaded(modelId)) await localModelRuntime.unloadModel(modelId);
      await localModelRuntime.loadModel(
        { id: modelId, engine: candidate.engine, tasks: candidate.tasks, label: candidate.label,
          origin: result.repoId, source: 'opfs', manifest: candidate.manifest, fileSize: candidate.estimatedSize },
        provider,
      );
      const store = useStore.getState();
      if (!store.localModels.some((m) => m.id === modelId)) {
        store.addLocalModel({
          id: modelId, engine: candidate.engine, tasks: candidate.tasks, label: candidate.label,
          origin: result.repoId, source: 'opfs', manifest: candidate.manifest, fileSize: candidate.estimatedSize,
        });
      }
      autoAssignIfUnset(modelId, candidate.tasks);
      if (!store.favoriteLocalModelIds.includes(modelId)) store.toggleFavoriteLocalModel(modelId);
      setOutput('');
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [autoAssignIfUnset]);

  const handleUnloadSearchModel = useCallback(async (modelId: string) => {
    await localModelRuntime.unloadModel(modelId);
  }, []);

  const handleDeleteSearchModel = useCallback(async (modelId: string) => {
    await deleteWithConfirm(modelId, {
      abortControllers, clearProgress,
      onDeleted: () => {
        hfSearch.setActiveSearchDownloads((prev) => { const { [modelId]: _, ...rest } = prev; return rest; });
        bumpOpfsBrowser();
      },
    });
  }, [deleteWithConfirm, clearProgress, hfSearch.setActiveSearchDownloads, bumpOpfsBrowser]);

  // ----- Downloading section handlers -----
  const handleLoadSelected = useCallback(async () => {
    if (!selectedModelId) return;
    setLoadError(null);
    try {
      await localModelRuntime.ensureLoaded(selectedModelId);
      const store = useStore.getState();
      if (!store.localModels.some((m) => m.id === selectedModelId)) {
        const catalog = CURATED_MODELS.find((c) => c.id === selectedModelId);
        if (catalog) {
          store.addLocalModel({
            id: catalog.id, engine: catalog.engine, tasks: catalog.tasks, label: catalog.label,
            origin: catalog.huggingFaceRepo, source: 'opfs', manifest: catalog.manifest,
            fileSize: catalog.expectedDownloadSize, displayMeta: catalog.displayMeta,
          });
        }
      }
      const def = store.localModels.find((m) => m.id === selectedModelId);
      if (def) {
        autoAssignIfUnset(selectedModelId, def.tasks);
        if (!store.favoriteLocalModelIds.includes(selectedModelId)) store.toggleFavoriteLocalModel(selectedModelId);
      }
      setSelectedModelId(null);
      setOutput('');
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [selectedModelId, autoAssignIfUnset]);

  const handleResumeDownloadingModel = useCallback(async (modelId: string) => {
    const model = localModels.find((m) => m.id === modelId);
    const catalogModel = CURATED_MODELS.find((c) => c.id === modelId);
    if (catalogModel) { handleResumeCatalog(catalogModel); return; }
    if (!model?.origin) return;
    const fileName = model.manifest?.kind === 'single-file' ? model.manifest.entrypoint : model.manifest?.requiredFiles?.[0];
    if (!fileName) return;
    try {
      const resolution = await resolveGgufFiles(model.origin);
      if (!resolution) return;
      const variant = resolution.variants.find((v) => v.fileName === fileName);
      if (!variant) return;
      handleResumeSearchModel(buildFakeSearchResult(model, variant), variant);
    } catch {
      handleRetryDownloadingModel(modelId);
    }
  }, [localModels, handleResumeSearchModel]);

  const handleRetryDownloadingModel = useCallback(async (modelId: string) => {
    const model = localModels.find((m) => m.id === modelId);
    const catalogModel = CURATED_MODELS.find((c) => c.id === modelId);
    if (catalogModel) { handleDownload(catalogModel); return; }
    if (!model?.origin) return;
    const fileName = model.manifest?.kind === 'single-file' ? model.manifest.entrypoint : model.manifest?.requiredFiles?.[0];
    if (!fileName) return;
    try {
      const resolution = await resolveGgufFiles(model.origin);
      if (!resolution) return;
      const variant = resolution.variants.find((v) => v.fileName === fileName);
      if (!variant) return;
      handleDownloadSearchResult(buildFakeSearchResult(model, variant), variant);
    } catch {
      useStore.getState().updateSavedModelMeta(modelId, {
        storageState: 'partial', lastError: 'Failed to resolve model files for retry',
      });
    }
  }, [localModels, handleDownloadSearchResult]);

  const handleDeleteDownloadingModel = useCallback(async (modelId: string) => {
    await deleteWithConfirm(modelId, {
      abortControllers, clearProgress,
      onDeleted: () => {
        hfSearch.setActiveSearchDownloads((prev) => { const { [modelId]: _, ...rest } = prev; return rest; });
        bumpOpfsBrowser();
      },
    });
  }, [deleteWithConfirm, clearProgress, hfSearch.setActiveSearchDownloads, bumpOpfsBrowser]);

  const handleCancelDownloadingModel = useCallback((modelId: string) => {
    cancelDownload(modelId);
  }, [cancelDownload]);

  // ----- Derived state -----
  const importedStatus = importedModelId ? (runtimeStatuses[importedModelId] ?? localModelRuntime.getStatus(importedModelId)) : ephemeralStatus;
  const isEphemeralReady = importedStatus === 'ready' || importedStatus === 'busy';
  const canTestGenerate = isTestModelLoaded('generate');
  const canTestAnalyze = isTestModelLoaded('analyze') || isTestModelLoaded('generate');
  const showTestArea = canTestGenerate || canTestAnalyze;
  const analysisFallsBack = !analysisModelId && !!generationModelId;

  const tierLabels: Record<DeviceTier, string> = {
    low: t('localModel.deviceTierLow'),
    standard: t('localModel.deviceTierStandard'),
    high: t('localModel.deviceTierHigh'),
  };
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

      {/* 1. Enable toggle + device tier */}
      <SettingsGroup label=''>
        <div>
          <Toggle label={t('localModel.enabled')} isChecked={enabled} setIsChecked={setEnabledWithPreflight} />
          {enabled && (
            <div className='px-4 pb-3 -mt-1 flex flex-col gap-3 text-xs text-gray-500 dark:text-gray-400'>
              <div>
                {t('localModel.deviceTier')}: <span className='font-medium text-gray-700 dark:text-gray-300'>{tierLabels[deviceTier]}</span>
              </div>
              <label className='flex cursor-pointer items-center justify-between gap-3 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2'>
                <span className='flex flex-col gap-0.5'>
                  <span className='text-sm font-medium text-gray-900 dark:text-gray-200'>{t('localModel.webgpuEnabled')}</span>
                  <span>{webGpuStatusText}</span>
                </span>
                <input
                  type='checkbox'
                  className='sr-only peer'
                  checked={resolvedWebGpuEnabled}
                  onChange={handleWebGpuToggle}
                />
                <span className="relative flex-shrink-0 w-9 h-5 bg-gray-200 dark:bg-gray-600 rounded-full peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-green-500/70" />
              </label>
            </div>
          )}
        </div>
      </SettingsGroup>

      {enabled && (
        <>
          {/* Task Assignment */}
          {(localModels.length > 0 || Object.values(savedModelMeta).some((m) => m.storageState === 'saved')) && (
            <SettingsGroup label={t('localModel.taskAssignment')}>
              {ASSIGNABLE_TASKS.map((task) => {
                const currentId = activeLocalModels[task];
                const currentStatus = currentId ? (runtimeStatuses[currentId] ?? 'idle') : 'idle';
                const isCurrentLoaded = currentStatus === 'ready' || currentStatus === 'busy';
                return (
                  <TaskAssignmentRow
                    key={task} task={task} taskLabel={taskLabels[task] ?? task}
                    currentModelId={currentId} candidates={getTaskCandidates(task)}
                    isCurrentLoaded={isCurrentLoaded} onAssign={handleTaskAssign}
                    requiresLoadText={t('localModel.assignmentRequiresLoad') as string}
                  />
                );
              })}
              {analysisFallsBack && (
                <div className='px-4 py-2'>
                  <span className='text-xs text-gray-500 dark:text-gray-400 italic'>{t('localModel.analysisFallsBackToGeneration')}</span>
                </div>
              )}
            </SettingsGroup>
          )}

          {/* Test generation area */}
          {showTestArea && (
            <SettingsGroup label={t('localModel.testGenerate')}>
              <div className='px-4 py-3 flex flex-col gap-3'>
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

                <textarea
                  className='w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500'
                  rows={3}
                  placeholder={testMode === 'generate' ? (t('localModel.testPromptPlaceholder') as string) : 'Enter text...'}
                  value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={generating}
                />

                {testMode === 'analyze' && (
                  <input
                    type='text'
                    className='w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500'
                    placeholder='Instruction (e.g. "Identify the key themes")'
                    value={analyzeInstruction} onChange={(e) => setAnalyzeInstruction(e.target.value)} disabled={generating}
                  />
                )}

                {testMode === 'format' && (
                  <select
                    className='w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500'
                    value={formatPreset} onChange={(e) => setFormatPreset(e.target.value as typeof formatPreset)} disabled={generating}
                  >
                    <option value='summarize'>Summarize</option>
                    <option value='rewrite'>Rewrite</option>
                    <option value='bullets'>Bullet Points</option>
                  </select>
                )}

                <div className='flex gap-2'>
                  <button
                    className='btn btn-primary text-sm px-4 py-1.5'
                    onClick={testMode === 'generate' ? handleGenerate : testMode === 'analyze' ? handleAnalyze : handleFormat}
                    disabled={generating || !prompt.trim() || !isTestModelLoaded(testMode) || (testMode === 'analyze' && !analyzeInstruction.trim())}
                  >
                    {generating ? t('localModel.generating') : (testMode === 'generate' ? t('localModel.testGenerate') : testMode === 'analyze' ? 'Analyze' : 'Format')}
                  </button>
                  {generating && (
                    <button className='btn btn-neutral text-sm px-4 py-1.5' onClick={handleAbort}>Stop</button>
                  )}
                </div>

                {output && (
                  <div className='flex flex-col gap-1'>
                    <span className='text-xs font-medium text-gray-500 dark:text-gray-400'>{t('localModel.output')}</span>
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

          {/* 2. Downloaded models list */}
          {(() => {
            const catalogIds = new Set(CURATED_MODELS.map((m) => m.id));
            const completedCatalog = CURATED_MODELS.filter((m) => savedModelMeta[m.id]?.storageState === 'saved');
            const completedSearch = localModels.filter((m) =>
              m.source === 'opfs' && !catalogIds.has(m.id) && savedModelMeta[m.id]?.storageState === 'saved');
            const hasAnyDownloaded = completedCatalog.length > 0 || completedSearch.length > 0;
            const anyLoading = selectedModelId ? (runtimeStatuses[selectedModelId] ?? 'idle') === 'loading' : false;
            const selectedAlreadyLoaded = selectedModelId ? ['ready', 'busy'].includes(runtimeStatuses[selectedModelId] ?? 'idle') : false;

            return (
              <SettingsGroup label={
                <div className='flex items-center justify-between w-full'>
                  <span>{t('localModel.downloadedModels')}</span>
                  {hasAnyDownloaded && (
                    <button
                      className='btn btn-primary text-xs px-3 py-1 normal-case tracking-normal font-normal disabled:opacity-50 disabled:cursor-not-allowed'
                      onClick={handleLoadSelected} disabled={!selectedModelId || anyLoading || selectedAlreadyLoaded}
                    >
                      {anyLoading ? t('localModel.modelStatus.loading') : t('localModel.load')}
                    </button>
                  )}
                </div>
              }>
                {!hasAnyDownloaded && (
                  <div className='px-4 py-6 text-center'>
                    <p className='text-xs text-gray-400 dark:text-gray-500'>{t('localModel.noDownloadedModels')}</p>
                  </div>
                )}
                {loadError && (
                  <div className='px-4 py-2 text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap'>
                    {t('localModel.loadError')}: {loadError}
                  </div>
                )}
                {completedCatalog.map((model) => (
                  <DownloadedModelRow
                    key={model.id} modelId={model.id} label={model.label} tasks={model.tasks}
                    fileSize={model.expectedDownloadSize}
                    fitBadge={<FitBadge fit={getModelFit(model.recommendedDeviceTier, deviceTier)} />}
                    runtimeStatus={runtimeStatuses[model.id] ?? 'idle'}
                    isSelected={selectedModelId === model.id} onSelect={() => setSelectedModelId(model.id)}
                    isFavorite={favoriteLocalModelIds.includes(model.id)}
                    onToggleFavorite={() => toggleFavoriteLocalModel(model.id)}
                    onUnload={handleUnloadCatalogModel} onDelete={handleDeleteCatalogModel}
                  />
                ))}
                {completedSearch.map((model) => (
                  <DownloadedModelRow
                    key={model.id} modelId={model.id} label={model.label} tasks={model.tasks}
                    fileSize={model.fileSize}
                    runtimeStatus={runtimeStatuses[model.id] ?? 'idle'}
                    isSelected={selectedModelId === model.id} onSelect={() => setSelectedModelId(model.id)}
                    isFavorite={favoriteLocalModelIds.includes(model.id)}
                    onToggleFavorite={() => toggleFavoriteLocalModel(model.id)}
                    onUnload={handleUnloadSearchModel} onDelete={handleDeleteSearchModel}
                  />
                ))}
              </SettingsGroup>
            );
          })()}

          {/* 2.5. Downloading / partial models */}
          {(() => {
            const catalogIds = new Set(CURATED_MODELS.map((m) => m.id));
            const downloadingCatalog = CURATED_MODELS.filter((m) =>
              savedModelMeta[m.id]?.storageState === 'downloading' || savedModelMeta[m.id]?.storageState === 'partial');
            const downloadingSearch = localModels.filter((m) =>
              m.source === 'opfs' && !catalogIds.has(m.id) &&
              (savedModelMeta[m.id]?.storageState === 'downloading' || savedModelMeta[m.id]?.storageState === 'partial'));
            if (downloadingCatalog.length === 0 && downloadingSearch.length === 0) return null;

            return (
              <SettingsGroup label={t('localModel.downloadingModels')}>
                {downloadingCatalog.map((model) => (
                  <DownloadingModelRow
                    key={model.id} modelId={model.id} label={model.label} tasks={model.tasks}
                    fileSize={model.expectedDownloadSize} progress={downloadProgresses[model.id] ?? null}
                    meta={savedModelMeta[model.id]} isFavorite={favoriteLocalModelIds.includes(model.id)}
                    onToggleFavorite={() => toggleFavoriteLocalModel(model.id)}
                    onCancel={handleCancelDownloadingModel} onResume={handleResumeDownloadingModel}
                    onRetry={handleRetryDownloadingModel} onDelete={handleDeleteDownloadingModel}
                  />
                ))}
                {downloadingSearch.map((model) => (
                  <DownloadingModelRow
                    key={model.id} modelId={model.id} label={model.label} tasks={model.tasks}
                    fileSize={model.fileSize} progress={downloadProgresses[model.id] ?? null}
                    meta={savedModelMeta[model.id]} isFavorite={favoriteLocalModelIds.includes(model.id)}
                    onToggleFavorite={() => toggleFavoriteLocalModel(model.id)}
                    onCancel={handleCancelDownloadingModel} onResume={handleResumeDownloadingModel}
                    onRetry={handleRetryDownloadingModel} onDelete={handleDeleteDownloadingModel}
                  />
                ))}
              </SettingsGroup>
            );
          })()}

          {/* 3. Manual import */}
          <SettingsGroup label={t('localModel.importedFiles')}>
            <div className='px-4 py-3 flex flex-col gap-3'>
              <p className='text-xs text-gray-500 dark:text-gray-400'>{t('localModel.selectGgufHint')}</p>
              <div className='flex items-center gap-3'>
                <button
                  className='btn btn-neutral text-sm px-4 py-1.5'
                  onClick={() => fileInputRef.current?.click()} disabled={importedStatus === 'loading'}
                >
                  {importedStatus === 'loading' ? t('localModel.modelStatus.loading') : t('localModel.selectGgufFile')}
                </button>
                <input ref={fileInputRef} type='file' accept='.gguf' className='hidden' onChange={handleFileSelect} />
                {importedStatus !== 'idle' && <StatusBadge status={importedStatus} />}
              </div>
              {fileName && <div className='text-xs text-gray-600 dark:text-gray-400 truncate'>{fileName}</div>}
              {ephemeralLoadError && (
                <div className='text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap'>
                  {t('localModel.loadError')}: {ephemeralLoadError}
                </div>
              )}
              {isEphemeralReady && (
                <div className='flex items-center gap-2'>
                  {contextLength !== null && (
                    <span className='text-xs text-gray-500 dark:text-gray-400'>{t('localModel.contextLength')}: {contextLength.toLocaleString()}</span>
                  )}
                  <button className='btn btn-neutral text-xs px-3 py-1 ml-auto' onClick={handleUnloadEphemeral} disabled={generating}>
                    {t('localModel.unload')}
                  </button>
                </div>
              )}
            </div>
          </SettingsGroup>

          {/* Recommended models */}
          {CURATED_MODELS.filter((m) => savedModelMeta[m.id]?.storageState !== 'saved').length > 0 && (
            <SettingsGroup label={t('localModel.recommendedModels')}>
              {CURATED_MODELS.filter((m) => savedModelMeta[m.id]?.storageState !== 'saved').map((model) => (
                <CatalogCard
                  key={model.id} model={model} deviceTier={deviceTier} meta={savedModelMeta[model.id]}
                  runtimeStatus={runtimeStatuses[model.id] ?? 'idle'}
                  downloadProgress={downloadProgresses[model.id] ?? null}
                  resumeFallbackMessage={resumeFallbacks[model.id] ?? null}
                  isFavorite={favoriteLocalModelIds.includes(model.id)}
                  onToggleFavorite={() => toggleFavoriteLocalModel(model.id)}
                  onDownload={handleDownload} onCancel={handleCancelDownload}
                  onResume={handleResumeCatalog} onRetry={handleRetry}
                  onDelete={handleDeleteCatalogModel} onLoad={handleLoadCatalogModel}
                  onUnload={handleUnloadCatalogModel}
                />
              ))}
            </SettingsGroup>
          )}

          {/* OPFS Storage Management */}
          <SettingsGroup label={t('localModel.opfsBrowser.title')}>
            <div className='px-4 py-2 text-xs text-gray-500 dark:text-gray-400'>{t('localModel.opfsBrowser.description')}</div>
            <OpfsFileBrowser
              refreshTrigger={opfsBrowserRefresh}
              onStorageChanged={() => {
                setRehydrationEpoch((n) => n + 1);
                bumpOpfsBrowser();
              }}
            />
          </SettingsGroup>

          {/* 4. Hugging Face Search */}
          <SettingsGroup label=''>
            <div className='sticky -top-6 z-10 bg-gray-50 dark:bg-gray-700 rounded-t-lg'>
              <div className='flex items-center justify-between px-3 pt-2 pb-1'>
                <span className='text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider'>{t('localModel.hfSearch')}</span>
                <FilterInfoButton />
              </div>
              <div className='px-3 pb-2 flex items-center gap-2'>
                <div className='flex-1 relative'>
                  <input
                    type='text'
                    className='w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 pl-3 pr-8 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
                    placeholder={t('localModel.hfSearchPlaceholder') as string}
                    value={hfSearch.searchQuery} onChange={(e) => hfSearch.setSearchQuery(e.target.value)}
                  />
                  {hfSearch.searchQuery && (
                    <button
                      className='absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                      onClick={() => { hfSearch.setSearchQuery(''); }}
                      type='button'
                    >&times;</button>
                  )}
                </div>
                <select
                  className='rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
                  value={hfSearch.searchEngine} onChange={(e) => hfSearch.setSearchEngine(e.target.value as any)}
                >
                  <option value='all'>{t('localModel.engineAll')}</option>
                  <option value='wllama'>{t('localModel.engineWllama')}</option>
                  <option value='transformers.js'>{t('localModel.engineTransformersJs')}</option>
                </select>
                {hfSearch.searching && (
                  <span className='text-xs text-gray-500 animate-pulse whitespace-nowrap'>{t('localModel.hfSearching')}</span>
                )}
              </div>
              {hfSearch.hasSearchedOnce && hfSearch.searchResults.length > 0 && (
                <>
                  <div className='hidden sm:flex items-center gap-2 px-3 py-1 border-t border-gray-200 dark:border-gray-600'>
                    <span className='flex-1' />
                    <span className='text-[10px] font-medium text-gray-500 dark:text-gray-400'>{t('localModel.quantization')}</span>
                    <SortableColumnHeader className='inline' label={t('localModel.hfLastModified')} field='lastModified' width='w-20' currentSort={hfSearch.searchSort} currentDir={hfSearch.searchSortDir} onSort={(f, d) => { hfSearch.setSearchSort(f as any); hfSearch.setSearchSortDir(d); }} />
                    <SortableColumnHeader className='inline' label='DL' field='downloads' width='w-14' currentSort={hfSearch.searchSort} currentDir={hfSearch.searchSortDir} onSort={(f, d) => { hfSearch.setSearchSort(f as any); hfSearch.setSearchSortDir(d); }} />
                    <SortableColumnHeader className='inline' label='Size' field='size' width='w-16' currentSort={hfSearch.searchSort} currentDir={hfSearch.searchSortDir} onSort={(f, d) => { hfSearch.setSearchSort(f as any); hfSearch.setSearchSortDir(d); }} />
                  </div>
                  <div className='sm:hidden flex items-center justify-end gap-3 px-3 py-1 ml-5 border-t border-gray-200 dark:border-gray-600'>
                    <SortableColumnHeader className='inline' label={t('localModel.hfLastModified')} field='lastModified' width='' currentSort={hfSearch.searchSort} currentDir={hfSearch.searchSortDir} onSort={(f, d) => { hfSearch.setSearchSort(f as any); hfSearch.setSearchSortDir(d); }} />
                    <SortableColumnHeader className='inline' label='DL' field='downloads' width='' currentSort={hfSearch.searchSort} currentDir={hfSearch.searchSortDir} onSort={(f, d) => { hfSearch.setSearchSort(f as any); hfSearch.setSearchSortDir(d); }} />
                    <SortableColumnHeader className='inline' label='Size' field='size' width='' currentSort={hfSearch.searchSort} currentDir={hfSearch.searchSortDir} onSort={(f, d) => { hfSearch.setSearchSort(f as any); hfSearch.setSearchSortDir(d); }} />
                  </div>
                </>
              )}
              {hfSearch.hasSearchedOnce && !hfSearch.searching && hfSearch.searchResults.length === 0 && hfSearch.searchQuery.trim() && Object.keys(hfSearch.activeSearchDownloads).length === 0 && (
                <div className='px-4 py-3 text-xs text-gray-500 dark:text-gray-400 text-center'>{t('localModel.hfSearchNoResults')}</div>
              )}
            </div>

            <div style={hfSearch.hasSearchedOnce ? { minHeight: '800px' } : undefined}>
              {Object.values(hfSearch.activeSearchDownloads)
                .filter((d) => !hfSearch.searchResults.some((r) => r.repoId === d.result.repoId))
                .map((d) => {
                  const repoMetas: Record<string, any> = {};
                  const repoProgresses: Record<string, any> = {};
                  const repoStatuses: Record<string, any> = {};
                  if (savedModelMeta[d.modelId]) repoMetas[d.modelId] = savedModelMeta[d.modelId];
                  if (downloadProgresses[d.modelId]) repoProgresses[d.modelId] = downloadProgresses[d.modelId];
                  if (runtimeStatuses[d.modelId]) repoStatuses[d.modelId] = runtimeStatuses[d.modelId];
                  return (
                    <SearchResultCard
                      key={`active-${d.modelId}`} result={d.result}
                      variants={hfSearch.variantMap[d.result.repoId] ?? null} variantsLoading={false}
                      selectedFileName={d.variant.fileName} deviceTier={deviceTier}
                      savedMetas={repoMetas} progresses={repoProgresses} statuses={repoStatuses}
                      resumeFallbackMessage={resumeFallbacks[d.modelId] ?? null}
                      existingModelId={null} existingModelState={null}
                      onSelectVariant={hfSearch.handleSelectVariant}
                      onDownload={handleDownloadSearchResult} onResume={handleResumeSearchModel}
                      onRetry={handleRetrySearchModel} onCancel={handleCancelSearchDownload}
                      onLoad={handleLoadSearchModel} onUnload={handleUnloadSearchModel}
                      onDelete={handleDeleteSearchModel}
                    />
                  );
                })
              }

              {hfSearch.searchResults.map((result) => {
                const repoPrefix = `hf--${result.repoId.split('/').map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')).join('--')}--`;
                const repoMetas: Record<string, any> = {};
                const repoProgresses: Record<string, any> = {};
                const repoStatuses: Record<string, any> = {};
                for (const [id, meta] of Object.entries(savedModelMeta)) {
                  if (id.startsWith(repoPrefix)) repoMetas[id] = meta;
                }
                for (const [id, prog] of Object.entries(downloadProgresses)) {
                  if (id.startsWith(repoPrefix)) repoProgresses[id] = prog;
                }
                for (const [id, status] of Object.entries(runtimeStatuses)) {
                  if (id.startsWith(repoPrefix)) repoStatuses[id] = status;
                }
                const selectedFile = hfSearch.selectedVariants[result.repoId] ?? null;
                const selectedVar = hfSearch.variantMap[result.repoId]?.variants.find((v) => v.fileName === selectedFile);
                const selectedMid = selectedVar ? generateSearchModelId(result.repoId, selectedVar) : null;
                const fallbackMsg = selectedMid ? (resumeFallbacks[selectedMid] ?? null) : null;
                const existingId = selectedFile ? hfSearch.findExistingModelForVariant(result.repoId, selectedFile) : null;
                const existingState = existingId ? savedModelMeta[existingId]?.storageState : undefined;
                const isExistingActive = existingId != null && (
                  existingState === 'saved' || existingState === 'downloading' || !!abortControllers.current[existingId]
                );

                return (
                  <SearchResultCard
                    key={result.repoId} result={result}
                    variants={hfSearch.variantMap[result.repoId] ?? null}
                    variantsLoading={hfSearch.variantLoading[result.repoId] ?? false}
                    selectedFileName={selectedFile} deviceTier={deviceTier}
                    savedMetas={repoMetas} progresses={repoProgresses} statuses={repoStatuses}
                    resumeFallbackMessage={fallbackMsg}
                    existingModelId={isExistingActive ? existingId : null}
                    existingModelState={isExistingActive ? (existingState as 'saved' | 'downloading' | 'partial' | null) ?? null : null}
                    onSelectVariant={hfSearch.handleSelectVariant}
                    onDownload={handleDownloadSearchResult} onResume={handleResumeSearchModel}
                    onRetry={handleRetrySearchModel} onCancel={handleCancelSearchDownload}
                    onLoad={handleLoadSearchModel} onUnload={handleUnloadSearchModel}
                    onDelete={handleDeleteSearchModel}
                  />
                );
              })}

              {hfSearch.searchHasMore && hfSearch.searchResults.length > 0 && (
                <div ref={hfSearch.searchSentinelRef} className='px-4 py-2 text-center'>
                  {hfSearch.loadingMore && (
                    <span className='text-xs text-gray-500 animate-pulse'>{t('localModel.hfSearching')}</span>
                  )}
                </div>
              )}
            </div>
          </SettingsGroup>
        </>
      )}
    </div>
  );
};

export default LocalModelSettings;
