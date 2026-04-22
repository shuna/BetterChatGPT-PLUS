import React, { useEffect, useMemo, useState } from 'react';
import { downloadModelFiles, type DownloadProgress } from '@src/local-llm/download';
import { localModelRuntime, promptAsInput, type RuntimeDiagnosticEvent, type RuntimeLogEvent, type RuntimeLoadProgressEvent } from '@src/local-llm/runtime';
import { OpfsFileProvider, readFile, saveFile, createOPFSWritable, verifyStoredModel, deleteModelFile } from '@src/local-llm/storage';
import {
  FIXED_VALIDATION_MODEL,
  VALIDATION_PROMPTS,
  VALIDATION_RUNS_STORAGE_KEY,
  DIAGNOSIS_PROMPT_IDS,
  appendValidationRun,
  createInitialValidationSteps,
  getValidationModelDefinition,
  inspectLowbitQMetadata,
  summarizeOutputComparison,
  type LowbitQMetadataSummary,
  type OutputComparisonSummary,
  type ValidationRunRecord,
  type ValidationStepState,
  type ValidationVariant,
} from '@src/local-llm/lowbit-q/validation';
import {
  LowbitQConversionManager,
  generateLowbitQFilename,
  isLowbitQModelId,
} from '@src/local-llm/lowbit-q';
import { LOWBIT_Q_CONVERT_MODES, type LowbitQConvertMode, type TensorConvertRecord } from '@src/local-llm/lowbit-q/tensorFilter';
import {
  DEFAULT_ALLOCATOR_CONFIG,
  AGGRESSIVE_ALLOCATOR_CONFIG,
  CONSERVATIVE_ALLOCATOR_CONFIG,
  Q4_0_ONLY_ALLOCATOR_CONFIG,
  Q3_K_ONLY_ALLOCATOR_CONFIG,
  Q2_K_ONLY_ALLOCATOR_CONFIG,
  PASSTHROUGH_ONLY_ALLOCATOR_CONFIG,
} from '@src/local-llm/lowbit-q/allocator';
import type { BitwidthAllocatorConfig } from '@src/local-llm/lowbit-q/types';
import { computeOutputQuality, type OutputQualityMetrics } from '@src/local-llm/lowbit-q/qualityMetrics';
import { buildDiagnosisExport, summarizeTensorRecords, type DiagnosisRunExport } from '@src/local-llm/lowbit-q/diagnosisExport';

function statusClasses(status: ValidationStepState['status']): string {
  switch (status) {
    case 'pass':
      return 'border-emerald-300 bg-emerald-50 text-emerald-900';
    case 'fail':
      return 'border-rose-300 bg-rose-50 text-rose-900';
    case 'running':
      return 'border-amber-300 bg-amber-50 text-amber-900';
    default:
      return 'border-slate-200 bg-white text-slate-700';
  }
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || !Number.isFinite(bytes)) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

// ---------------------------------------------------------------------------
// Batch diagnosis types
// ---------------------------------------------------------------------------

interface BatchRunResult {
  promptId: string;
  prompt: string;
  originalOutput: string;
  originalQuality: OutputQualityMetrics;
  lowbitQOutput: string;
  lowbitQQuality: OutputQualityMetrics;
}

function LowbitQValidationPage() {
  const originalDef = useMemo(() => getValidationModelDefinition('original'), []);
  const lowbitQDef = useMemo(() => getValidationModelDefinition('lowbit-q'), []);
  const [steps, setSteps] = useState<ValidationStepState[]>(() => createInitialValidationSteps());
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [conversionProgressText, setConversionProgressText] = useState<string>('');
  const [metadataSummary, setMetadataSummary] = useState<LowbitQMetadataSummary | null>(null);
  const [runtimeLogs, setRuntimeLogs] = useState<RuntimeLogEvent[]>([]);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnosticEvent[]>([]);
  const [loadProgress, setLoadProgress] = useState<RuntimeLoadProgressEvent | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState<string>(VALIDATION_PROMPTS[0].id);
  const [maxTokens, setMaxTokens] = useState<number>(96);
  const [temperature, setTemperature] = useState<number>(0.2);
  const [outputs, setOutputs] = useState<Record<ValidationVariant, string>>({
    original: '',
    'lowbit-q': '',
  });
  const [comparisonSummary, setComparisonSummary] = useState<OutputComparisonSummary | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<ValidationRunRecord[]>([]);
  const [downloadedOriginalBytes, setDownloadedOriginalBytes] = useState<number | null>(null);
  const [savedLowbitQBytes, setSavedLowbitQBytes] = useState<number | null>(null);

  // --- Diagnosis state ---
  const [selectedConvertMode, setSelectedConvertMode] = useState<LowbitQConvertMode>('all');
  const [selectedAllocatorPreset, setSelectedAllocatorPreset] = useState<'v2-default' | 'v2-aggressive' | 'v2-conservative' | 'v2-q4only' | 'v2-q3konly' | 'v2-q2konly' | 'v2-native-direct'>('v2-default');
  const [tensorRecords, setTensorRecords] = useState<TensorConvertRecord[]>([]);
  const [batchResults, setBatchResults] = useState<BatchRunResult[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);
  const [lastConvertedSize, setLastConvertedSize] = useState<number>(0);
  const [lastCompressionRatio, setLastCompressionRatio] = useState<number>(0);

  const selectedPrompt = useMemo(
    () => VALIDATION_PROMPTS.find((prompt) => prompt.id === selectedPromptId) ?? VALIDATION_PROMPTS[0],
    [selectedPromptId],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VALIDATION_RUNS_STORAGE_KEY);
      if (raw) {
        setRunHistory(JSON.parse(raw) as ValidationRunRecord[]);
      }
    } catch {
      // Ignore malformed saved results and start clean.
    }
  }, []);

  useEffect(() => {
    const unsubLogs = localModelRuntime.subscribeLogs((event) => {
      if (event.modelId !== originalDef.id && event.modelId !== lowbitQDef.id) return;
      setRuntimeLogs((prev) => [event, ...prev].slice(0, 200));
    });
    const unsubDiagnostics = localModelRuntime.subscribeDiagnostics((event) => {
      if (event.modelId !== originalDef.id && event.modelId !== lowbitQDef.id) return;
      setDiagnostics((prev) => [event, ...prev].slice(0, 100));
    });
    const unsubLoadProgress = localModelRuntime.subscribeLoadProgress((event) => {
      if (event.modelId !== originalDef.id && event.modelId !== lowbitQDef.id) return;
      setLoadProgress(event);
    });
    return () => {
      unsubLogs();
      unsubDiagnostics();
      unsubLoadProgress();
    };
  }, [lowbitQDef.id, originalDef.id]);

  const updateStep = (key: string, status: ValidationStepState['status'], detail?: string) => {
    setSteps((prev) => prev.map((step) => step.key === key ? { ...step, status, detail } : step));
  };

  const setAction = async (name: string, fn: () => Promise<unknown>) => {
    setRunningAction(name);
    setActionError(null);
    try {
      await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[LowbitQValidation] action "${name}" failed:`, message);
      setActionError(message);
    } finally {
      setRunningAction(null);
    }
  };

  const persistRun = (record: ValidationRunRecord) => {
    setRunHistory((prev) => {
      const next = appendValidationRun(prev, record);
      localStorage.setItem(VALIDATION_RUNS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleDownloadOriginal = async () => {
    updateStep('download-original', 'running', 'Hugging Face から取得中');
    setDownloadProgress(null);

    await new Promise<void>((resolve, reject) => {
      void downloadModelFiles(
        {
          modelId: originalDef.id,
          repo: FIXED_VALIDATION_MODEL.origin,
          revision: FIXED_VALIDATION_MODEL.revision,
          files: [FIXED_VALIDATION_MODEL.fileName],
        },
        {
          onProgress: (progress) => setDownloadProgress(progress),
          onFileComplete: () => undefined,
          onComplete: async (totalBytes) => {
            try {
              setDownloadedOriginalBytes(totalBytes);
              const verify = await verifyStoredModel(originalDef.id, originalDef.manifest);
              if (verify !== 'saved') {
                updateStep('download-original', 'fail', `verifyStoredModel=${verify}`);
                reject(new Error(`元GGUFの保存検証に失敗しました: ${verify}`));
                return;
              }
              updateStep('download-original', 'pass', `${formatBytes(totalBytes)} を保存済み`);
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          onError: (error) => {
            updateStep('download-original', 'fail', error.message);
            reject(error);
          },
        },
      ).catch(reject);
    });
  };

  const handleImportLocal = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gguf';
    const file = await new Promise<File | null>((resolve) => {
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.click();
    });
    if (!file) return;

    updateStep('download-original', 'running', `ローカルファイル ${file.name} をOPFSに保存中`);

    // Stream large files in chunks to avoid memory pressure.
    // saveFile(blob) buffers the entire file; for files >500 MB we use
    // createOPFSWritable and write in 16 MB chunks with progress updates.
    // Each chunk write has a 30s timeout to detect OPFS stalls (e.g. quota).
    const CHUNK_SIZE = 16 * 1024 * 1024; // 16 MB
    const CHUNK_WRITE_TIMEOUT = 30_000;
    if (file.size > 500 * 1024 * 1024) {
      console.info(`[LowbitQValidation] streaming ${formatBytes(file.size)} to OPFS in ${Math.ceil(file.size / CHUNK_SIZE)} chunks`);
      const writable = await createOPFSWritable(originalDef.id, FIXED_VALIDATION_MODEL.fileName);
      let written = 0;
      try {
        for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
          const chunk = file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size));
          const buf = await chunk.arrayBuffer();
          const writePromise = writable.write(buf);
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(
              `OPFS write timed out after ${CHUNK_WRITE_TIMEOUT / 1000}s at offset ${formatBytes(offset)}. ` +
              `Written so far: ${formatBytes(written)}/${formatBytes(file.size)}. ` +
              'Possible storage quota exceeded or OPFS stall.',
            )), CHUNK_WRITE_TIMEOUT),
          );
          await Promise.race([writePromise, timeoutPromise]);
          written += chunk.size;
          const pct = Math.round((written / file.size) * 100);
          updateStep('download-original', 'running', `OPFSに保存中... ${formatBytes(written)} / ${formatBytes(file.size)} (${pct}%)`);
        }
        await writable.close();
        console.info(`[LowbitQValidation] OPFS write complete: ${formatBytes(written)}`);
      } catch (e) {
        console.error('[LowbitQValidation] OPFS write failed:', (e as Error).message);
        await writable.abort().catch(() => {});
        throw e;
      }
    } else {
      await saveFile(originalDef.id, FIXED_VALIDATION_MODEL.fileName, file);
    }

    setDownloadedOriginalBytes(file.size);
    const verify = await verifyStoredModel(originalDef.id, originalDef.manifest);
    if (verify !== 'saved') {
      updateStep('download-original', 'fail', `verifyStoredModel=${verify}`);
      throw new Error(`OPFS保存検証に失敗: ${verify}`);
    }
    updateStep('download-original', 'pass', `${formatBytes(file.size)} をローカルから保存済み`);
  };

  const handleConvertLowbitQ = async () => {
    const allocatorConfigMap: Record<string, BitwidthAllocatorConfig> = {
      'v2-default': DEFAULT_ALLOCATOR_CONFIG,
      'v2-aggressive': AGGRESSIVE_ALLOCATOR_CONFIG,
      'v2-conservative': CONSERVATIVE_ALLOCATOR_CONFIG,
      'v2-q4only': Q4_0_ONLY_ALLOCATOR_CONFIG,
      'v2-q3konly': Q3_K_ONLY_ALLOCATOR_CONFIG,
      'v2-q2konly': Q2_K_ONLY_ALLOCATOR_CONFIG,
      'v2-native-direct': PASSTHROUGH_ONLY_ALLOCATOR_CONFIG,
    };
    const allocatorConfig = allocatorConfigMap[selectedAllocatorPreset];
    updateStep('convert-lowbit-q', 'running', `lowbit-Q 変換中 (preset: ${selectedAllocatorPreset})`);
    updateStep('save-opfs', 'running', 'OPFS 書き込み待機');
    updateStep('detect-lowbit-q-metadata', 'running', 'GGUF metadata 確認待機');
    setConversionProgressText('');
    setTensorRecords([]);

    let result;
    const manager = new LowbitQConversionManager();

    // Source resolution: check for test-injected URL first (for files > 2 GB
    // that can't be stored in OPFS due to Chromium per-file limit), then try
    // OPFS with large-file memory-copy strategy.
    let useFileDirectly: File | null = null;
    let sourceUrl: string | undefined;

    // Test hook: window.__testSourceUrl is set by Playwright for files > 2 GB.
    // The Worker fetches directly from this URL, avoiding OPFS and postMessage limits.
    const testUrl = (window as any).__testSourceUrl as string | undefined;
    if (testUrl) {
      console.info(`[LowbitQValidation] Using test source URL: ${testUrl}`);
      sourceUrl = testUrl;
      delete (window as any).__testSourceUrl;
      // Create a minimal dummy File for the manager API (actual data comes from URL)
      useFileDirectly = new File([], FIXED_VALIDATION_MODEL.fileName, { type: 'application/octet-stream' });
    } else {
      // For large source files (>2 GB), read into memory chunks then delete
      // OPFS entry to free quota.
      const LARGE_FILE_THRESHOLD = 2 * 1024 * 1024 * 1024;
      try {
        const srcFile = await readFile(originalDef.id, FIXED_VALIDATION_MODEL.fileName);
        if (srcFile.size > LARGE_FILE_THRESHOLD) {
          console.info(`[LowbitQValidation] Large source (${formatBytes(srcFile.size)}) — reading into memory...`);
          const chunks: Uint8Array[] = [];
          const reader = srcFile.stream().getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          useFileDirectly = new File(chunks, srcFile.name, { type: srcFile.type });
          await deleteModelFile(originalDef.id, FIXED_VALIDATION_MODEL.fileName);
          console.info('[LowbitQValidation] OPFS source deleted — quota freed');
        }
      } catch {
        // Source not in OPFS or already deleted; proceed via convertFromOpfs
      }
    }

    try {
      const conversionCallbacks = {
        onProgress: (progress: { stage: string; percent: number; currentTensorName: string }) => {
          setConversionProgressText(
            `${progress.stage} ${progress.percent}% ${progress.currentTensorName}`.trim(),
          );
        },
        allocatorConfig,
        sourceModelName: FIXED_VALIDATION_MODEL.sourceLabel,
        computeQuality: true,
        sourceUrl,
      };

      if (useFileDirectly) {
        result = await manager.convertFromFile(
          useFileDirectly,
          originalDef.id,
          FIXED_VALIDATION_MODEL.sourceLabel,
          conversionCallbacks,
        );
      } else {
        result = await manager.convertFromOpfs(
          originalDef.id,
          FIXED_VALIDATION_MODEL.fileName,
          FIXED_VALIDATION_MODEL.sourceLabel,
          conversionCallbacks,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateStep('convert-lowbit-q', 'fail', msg);
      updateStep('save-opfs', 'fail', '変換失敗のためスキップ');
      updateStep('detect-lowbit-q-metadata', 'fail', '変換失敗のためスキップ');
      throw err;
    }

    updateStep(
      'convert-lowbit-q',
      'pass',
      `${formatBytes(result.originalSize)} -> ${formatBytes(result.convertedSize)} (${selectedConvertMode})`,
    );
    setSavedLowbitQBytes(result.convertedSize);
    setLastConvertedSize(result.convertedSize);
    setLastCompressionRatio(result.compressionRatio);

    if (result.tensorRecords) {
      setTensorRecords(result.tensorRecords);
    }

    const lowbitQFile = await readFile(lowbitQDef.id, generateLowbitQFilename(FIXED_VALIDATION_MODEL.fileName));
    const verify = await verifyStoredModel(lowbitQDef.id, lowbitQDef.manifest);
    if (verify !== 'saved') {
      updateStep('save-opfs', 'fail', `verifyStoredModel=${verify}`);
      throw new Error(`lowbit-Q GGUF の OPFS 保存検証に失敗しました: ${verify}`);
    }

    updateStep('save-opfs', 'pass', `${lowbitQFile.name} / ${formatBytes(lowbitQFile.size)}`);

    const summary = await inspectLowbitQMetadata(lowbitQFile);
    setMetadataSummary(summary);
    if (!summary.hasLowbitQVersion) {
      updateStep('detect-lowbit-q-metadata', 'fail', 'lowbit-Q.version が見つかりません');
      throw new Error('lowbit-Q metadata を検出できませんでした');
    }
    updateStep(
      'detect-lowbit-q-metadata',
      'pass',
      `version=${summary.lowbitQVersion ?? '-'} sign=${summary.signPacking ?? '-'}`,
    );
  };

  const runVariant = async (variant: ValidationVariant): Promise<string> => {
    const def = variant === 'original' ? originalDef : lowbitQDef;
    const stepKey = variant === 'original' ? 'load-generate-original' : 'load-generate-lowbit-q';
    const provider = new OpfsFileProvider(def.id, def.manifest);

    setLoadProgress(null);
    updateStep(stepKey, 'running', 'モデルをロード中');

    if (localModelRuntime.isLoaded(originalDef.id)) {
      await localModelRuntime.unloadModel(originalDef.id);
    }
    if (localModelRuntime.isLoaded(lowbitQDef.id)) {
      await localModelRuntime.unloadModel(lowbitQDef.id);
    }

    try {
      await localModelRuntime.loadModel(def, provider);
      const engine = localModelRuntime.getWllamaEngine(def.id);
      if (!engine) {
        updateStep(stepKey, 'fail', 'engine unavailable');
        throw new Error(`${variant} の wllama engine を取得できませんでした`);
      }

      let latestText = '';
      const output = await engine.generate(
        promptAsInput(selectedPrompt.prompt),
        { maxTokens, temperature },
        (text) => {
          latestText = text;
          setOutputs((prev) => ({ ...prev, [variant]: text }));
        },
        'test',
      );

      const finalOutput = output || latestText;
      setOutputs((prev) => ({ ...prev, [variant]: finalOutput }));
      persistRun({
        id: `${variant}-${Date.now()}`,
        promptId: selectedPrompt.id,
        prompt: selectedPrompt.prompt,
        variant,
        modelId: def.id,
        maxTokens,
        temperature,
        output: finalOutput,
        createdAt: new Date().toISOString(),
      });
      updateStep(stepKey, 'pass', `${finalOutput.length} chars`);
      return finalOutput;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateStep(stepKey, 'fail', msg);
      throw err;
    } finally {
      if (localModelRuntime.isLoaded(def.id)) {
        await localModelRuntime.unloadModel(def.id);
      }
    }
  };

  /** Run a single prompt for a variant (no UI step update, for batch use) */
  const runVariantForPrompt = async (
    variant: ValidationVariant,
    prompt: string,
  ): Promise<string> => {
    const def = variant === 'original' ? originalDef : lowbitQDef;
    const provider = new OpfsFileProvider(def.id, def.manifest);

    // Load if not already loaded
    if (!localModelRuntime.isLoaded(def.id)) {
      await localModelRuntime.loadModel(def, provider);
    }

    const engine = localModelRuntime.getWllamaEngine(def.id);
    if (!engine) throw new Error(`${variant} engine unavailable`);

    let latestText = '';
    const output = await engine.generate(
      promptAsInput(prompt),
      { maxTokens, temperature },
      (text) => { latestText = text; },
      'test',
    );
    return output || latestText;
  };

  const handleDiagnosisBatch = async () => {
    setBatchRunning(true);
    setBatchResults([]);
    setBatchProgress('Preparing...');

    const prompts = DIAGNOSIS_PROMPT_IDS.map(
      (id) => VALIDATION_PROMPTS.find((p) => p.id === id)!,
    );

    try {
      // Unload any loaded models
      if (localModelRuntime.isLoaded(originalDef.id)) {
        await localModelRuntime.unloadModel(originalDef.id);
      }
      if (localModelRuntime.isLoaded(lowbitQDef.id)) {
        await localModelRuntime.unloadModel(lowbitQDef.id);
      }

      // Phase 1: Run all prompts for original
      const originalOutputs: Record<string, string> = {};
      for (let i = 0; i < prompts.length; i++) {
        setBatchProgress(`Original ${i + 1}/${prompts.length}: ${prompts[i].label}`);
        originalOutputs[prompts[i].id] = await runVariantForPrompt('original', prompts[i].prompt);
      }

      // Unload original, prepare for lowbit-Q
      if (localModelRuntime.isLoaded(originalDef.id)) {
        await localModelRuntime.unloadModel(originalDef.id);
      }

      // Phase 2: Run all prompts for lowbit-Q
      const results: BatchRunResult[] = [];
      for (let i = 0; i < prompts.length; i++) {
        setBatchProgress(`Lowbit-Q ${i + 1}/${prompts.length}: ${prompts[i].label}`);
        const lowbitQOutput = await runVariantForPrompt('lowbit-q', prompts[i].prompt);
        const originalOutput = originalOutputs[prompts[i].id];

        results.push({
          promptId: prompts[i].id,
          prompt: prompts[i].prompt,
          originalOutput,
          originalQuality: computeOutputQuality(originalOutput, 'stop'),
          lowbitQOutput,
          lowbitQQuality: computeOutputQuality(lowbitQOutput, 'stop', originalOutput),
        });
      }

      // Unload lowbit-Q
      if (localModelRuntime.isLoaded(lowbitQDef.id)) {
        await localModelRuntime.unloadModel(lowbitQDef.id);
      }

      setBatchResults(results);
      setBatchProgress(`Complete: ${results.length} prompts`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setBatchProgress(`Error: ${msg}`);
    } finally {
      setBatchRunning(false);
    }
  };

  const handleCompare = async () => {
    updateStep('compare-outputs', 'running', '同一条件で順次実行');
    const originalOutput = await runVariant('original');
    const lowbitQOutput = await runVariant('lowbit-q');

    const summary = summarizeOutputComparison(originalOutput, lowbitQOutput);
    setComparisonSummary(summary);
    updateStep(
      'compare-outputs',
      'pass',
      `len delta=${summary.lengthDelta}, exact=${summary.exactMatch ? 'yes' : 'no'}`,
    );
  };

  const handleExportDiagnosis = () => {
    if (batchResults.length > 0) {
      // Export full diagnosis payload
      const originalRuns: DiagnosisRunExport[] = batchResults.map((r) => ({
        promptId: r.promptId,
        prompt: r.prompt,
        output: r.originalOutput,
        quality: r.originalQuality,
      }));

      const lowbitQRuns: DiagnosisRunExport[] = batchResults.map((r) => ({
        promptId: r.promptId,
        prompt: r.prompt,
        output: r.lowbitQOutput,
        quality: r.lowbitQQuality,
      }));

      const payload = buildDiagnosisExport({
        model: {
          source: FIXED_VALIDATION_MODEL.origin,
          fileName: FIXED_VALIDATION_MODEL.fileName,
          originalSizeBytes: downloadedOriginalBytes ?? FIXED_VALIDATION_MODEL.expectedDownloadSize,
        },
        generationParams: { maxTokens, temperature },
        originalRuns,
        variants: [
          {
            convertMode: selectedConvertMode,
            convertedSizeBytes: lastConvertedSize,
            compressionRatio: lastCompressionRatio,
            tensorRecords,
            runs: lowbitQRuns,
          },
        ],
      });

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `lowbit-q-diagnosis-${selectedConvertMode}-${Date.now()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } else {
      // Fallback: export run history
      const blob = new Blob([JSON.stringify(runHistory, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'lowbit-q-validation-results.json';
      anchor.click();
      URL.revokeObjectURL(url);
    }
  };

  const workerInitLowbitQ = diagnostics.find((event) =>
    event.modelId === lowbitQDef.id && event.phase === 'worker-init',
  );
  const runtimeInitLowbitQ = diagnostics.find((event) =>
    event.modelId === lowbitQDef.id && event.phase === 'runtime-init-request',
  );
  const nativeDetectedLowbitQ = runtimeLogs.some((event) =>
    event.modelId === lowbitQDef.id && event.text.toLowerCase().includes('detected lowbit-q format'),
  );
  const workerUsesVendorWasm = String(
    workerInitLowbitQ?.payload?.wasmPaths &&
    JSON.stringify(workerInitLowbitQ.payload.wasmPaths),
  ).includes('/vendor/wllama/');

  // Tensor summary
  const tensorSummary = useMemo(
    () => tensorRecords.length > 0 ? summarizeTensorRecords(tensorRecords) : null,
    [tensorRecords],
  );

  return (
    <div className='h-full overflow-auto bg-slate-100 text-slate-900'>
      <div className='mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8'>
        <header className='flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
          <div className='flex items-center justify-between gap-4'>
            <div>
              <p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-500'>Lowbit-Q Quality Diagnosis</p>
              <h1 className='text-2xl font-semibold'>wllama lowbit-Q 品質診断UI</h1>
            </div>
            <a className='text-sm text-slate-600 underline' href='/'>通常UIに戻る</a>
          </div>
          <p className='max-w-4xl text-sm leading-6 text-slate-600'>
            固定モデルをダウンロードし、lowbit-Q 変換、OPFS 保存、GGUF metadata 検査、原本/lowbit-Q 推論比較を
            同一条件で切り分け確認するための独立ページです。品質劣化の原因をテンソル/層単位で診断できます。
          </p>
          <div className='grid gap-3 md:grid-cols-4'>
            <div className='rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm'>
              <div className='text-slate-500'>固定モデル</div>
              <div className='font-medium'>{FIXED_VALIDATION_MODEL.origin}</div>
              <div className='text-slate-500'>{FIXED_VALIDATION_MODEL.fileName}</div>
            </div>
            <div className='rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm'>
              <div className='text-slate-500'>原本サイズ</div>
              <div className='font-medium'>{formatBytes(downloadedOriginalBytes ?? FIXED_VALIDATION_MODEL.expectedDownloadSize)}</div>
            </div>
            <div className='rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm'>
              <div className='text-slate-500'>lowbit-Qサイズ</div>
              <div className='font-medium'>{formatBytes(savedLowbitQBytes)}</div>
            </div>
            <div className='rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm'>
              <div className='text-slate-500'>lowbit-Q modelId 認識</div>
              <div className='font-medium'>{isLowbitQModelId(lowbitQDef.id) ? 'PASS' : 'FAIL'}</div>
            </div>
          </div>
        </header>

        <section className='grid gap-6 lg:grid-cols-[1.1fr_0.9fr]'>
          <div className='flex flex-col gap-6'>
            {/* Actions panel */}
            <div className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
              <h2 className='text-lg font-semibold'>操作</h2>
              <div className='mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
                <button
                  className='rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-50'
                  disabled={runningAction !== null || batchRunning}
                  onClick={() => void setAction('download', handleDownloadOriginal)}
                >
                  元GGUFをダウンロード
                </button>
                <button
                  className='rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-50'
                  disabled={runningAction !== null || batchRunning}
                  onClick={() => void setAction('import', handleImportLocal)}
                >
                  ローカルGGUFを読込
                </button>
                <button
                  className='rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-50'
                  disabled={runningAction !== null || batchRunning}
                  onClick={() => void setAction('convert', handleConvertLowbitQ)}
                >
                  lowbit-Q変換
                </button>
                <button
                  className='rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-50'
                  disabled={runningAction !== null || batchRunning}
                  onClick={() => void setAction('original-run', () => runVariant('original'))}
                >
                  原本を実行
                </button>
                <button
                  className='rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-50'
                  disabled={runningAction !== null || batchRunning}
                  onClick={() => void setAction('lowbit-q-run', () => runVariant('lowbit-q'))}
                >
                  lowbit-Qを実行
                </button>
                <button
                  className='rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-50'
                  disabled={runningAction !== null || batchRunning}
                  onClick={() => void setAction('compare', handleCompare)}
                >
                  原本 vs lowbit-Q 比較
                </button>
                <button
                  className='rounded-xl border border-indigo-400 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50'
                  disabled={runningAction !== null || batchRunning}
                  onClick={() => void setAction('batch', handleDiagnosisBatch)}
                >
                  診断バッチ実行 ({DIAGNOSIS_PROMPT_IDS.length}p)
                </button>
              </div>

              <div className='mt-4 grid gap-4 md:grid-cols-[1fr_1fr_1fr_0.6fr_0.6fr]'>
                <label className='flex flex-col gap-2 text-sm'>
                  <span className='font-medium'>固定プロンプト</span>
                  <select
                    className='rounded-xl border border-slate-300 bg-white px-3 py-2'
                    value={selectedPromptId}
                    onChange={(event) => setSelectedPromptId(event.target.value)}
                  >
                    {VALIDATION_PROMPTS.map((prompt) => (
                      <option key={prompt.id} value={prompt.id}>{prompt.label}</option>
                    ))}
                  </select>
                </label>
                <label className='flex flex-col gap-2 text-sm'>
                  <span className='font-medium'>Allocator Preset (v2)</span>
                  <select
                    className='rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-2 text-indigo-900'
                    data-testid='allocator-preset-select'
                    value={selectedAllocatorPreset}
                    onChange={(event) => setSelectedAllocatorPreset(event.target.value as typeof selectedAllocatorPreset)}
                  >
                    <option value='v2-default'>DEFAULT (attnQK=Q4, VO+FFN=SVID)</option>
                    <option value='v2-aggressive'>AGGRESSIVE (all=SVID exc 1st/last)</option>
                    <option value='v2-conservative'>CONSERVATIVE (attn=Q4, FFN=SVID)</option>
                    <option value='v2-q4only'>Q4_0-ONLY (native baseline, ~53%)</option>
                    <option value='v2-q3konly'>Q3_K-ONLY (native 3-bit baseline, ~40%)</option>
                    <option value='v2-q2konly'>Q2_K-ONLY (native 2-bit baseline, ~31%)</option>
                    <option value='v2-native-direct'>NATIVE-DIRECT (PASSTHROUGH: pre-quantized GGUF)</option>
                  </select>
                </label>
                <label className='flex flex-col gap-2 text-sm'>
                  <span className='font-medium'>変換モード (v1 legacy)</span>
                  <select
                    className='rounded-xl border border-slate-300 bg-white px-3 py-2'
                    value={selectedConvertMode}
                    onChange={(event) => setSelectedConvertMode(event.target.value as LowbitQConvertMode)}
                  >
                    {LOWBIT_Q_CONVERT_MODES.map((mode) => (
                      <option key={mode.id} value={mode.id}>{mode.label}</option>
                    ))}
                  </select>
                </label>
                <label className='flex flex-col gap-2 text-sm'>
                  <span className='font-medium'>maxTokens</span>
                  <input
                    className='rounded-xl border border-slate-300 px-3 py-2'
                    type='number'
                    min={8}
                    max={2048}
                    value={maxTokens}
                    onChange={(event) => setMaxTokens(Number(event.target.value))}
                  />
                </label>
                <label className='flex flex-col gap-2 text-sm'>
                  <span className='font-medium'>temperature</span>
                  <input
                    className='rounded-xl border border-slate-300 px-3 py-2'
                    type='number'
                    min={0}
                    max={1}
                    step={0.1}
                    value={temperature}
                    onChange={(event) => setTemperature(Number(event.target.value))}
                  />
                </label>
              </div>

              <pre className='mt-4 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100'>
                {selectedPrompt.prompt}
              </pre>

              {(downloadProgress || conversionProgressText || loadProgress || actionError || batchProgress) && (
                <div className='mt-4 space-y-2 text-sm text-slate-600'>
                  {downloadProgress && (
                    <div>
                      download: {formatBytes(downloadProgress.bytesDownloaded)} / {formatBytes(downloadProgress.bytesTotal)}
                    </div>
                  )}
                  {conversionProgressText && <div>convert: {conversionProgressText}</div>}
                  {loadProgress && loadProgress.phase !== 'complete' && (
                    <div className='text-blue-700'>
                      load: {loadProgress.detail} ({loadProgress.percent}%)
                    </div>
                  )}
                  {loadProgress && loadProgress.phase === 'complete' && (
                    <div className='text-emerald-700'>
                      load: {loadProgress.detail}
                    </div>
                  )}
                  {batchProgress && <div className='text-indigo-700'>batch: {batchProgress}</div>}
                  {actionError && <div className='text-rose-700'>error: {actionError}</div>}
                </div>
              )}
            </div>

            {/* PASS / FAIL */}
            <div className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
              <h2 className='text-lg font-semibold'>PASS / FAIL</h2>
              <div className='mt-4 grid gap-3'>
                {steps.map((step) => (
                  <div key={step.key} className={`rounded-xl border p-4 ${statusClasses(step.status)}`}>
                    <div className='flex items-center justify-between gap-4'>
                      <div className='font-medium'>{step.label}</div>
                      <div className='text-xs font-semibold uppercase tracking-wide'>{step.status}</div>
                    </div>
                    {step.detail && <div className='mt-2 text-sm opacity-80'>{step.detail}</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* Batch Quality Metrics */}
            {batchResults.length > 0 && (
              <div className='rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm'>
                <div className='flex items-center justify-between gap-4'>
                  <h2 className='text-lg font-semibold'>品質診断結果</h2>
                  <button
                    className='rounded-xl border border-indigo-300 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50'
                    onClick={handleExportDiagnosis}
                  >
                    JSON export
                  </button>
                </div>
                <div className='mt-4 overflow-x-auto'>
                  <table className='w-full text-left text-xs'>
                    <thead>
                      <tr className='border-b border-slate-200 text-slate-500'>
                        <th className='pb-2 pr-3 font-medium'>Prompt</th>
                        <th className='pb-2 pr-3 font-medium text-right'>Orig chars</th>
                        <th className='pb-2 pr-3 font-medium text-right'>1bit chars</th>
                        <th className='pb-2 pr-3 font-medium text-right'>Delta</th>
                        <th className='pb-2 pr-3 font-medium text-right'>Repeat ×</th>
                        <th className='pb-2 pr-3 font-medium text-right'>3gram</th>
                        <th className='pb-2 pr-3 font-medium'>Collapsed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchResults.map((r) => {
                        const prompt = VALIDATION_PROMPTS.find((p) => p.id === r.promptId);
                        return (
                          <tr
                            key={r.promptId}
                            className={`border-b border-slate-100 ${r.lowbitQQuality.collapsed ? 'bg-rose-50' : ''}`}
                          >
                            <td className='py-2 pr-3 font-medium'>{prompt?.label ?? r.promptId}</td>
                            <td className='py-2 pr-3 text-right'>{r.originalQuality.charCount}</td>
                            <td className='py-2 pr-3 text-right'>{r.lowbitQQuality.charCount}</td>
                            <td className='py-2 pr-3 text-right'>
                              {r.lowbitQQuality.diffFromOriginal?.charDelta ?? '-'}
                            </td>
                            <td className='py-2 pr-3 text-right'>{r.lowbitQQuality.consecutiveRepeatCount}</td>
                            <td className='py-2 pr-3 text-right'>
                              {r.lowbitQQuality.trigramRepeatScore.toFixed(2)}
                            </td>
                            <td className='py-2 pr-3'>
                              {r.lowbitQQuality.collapsed ? (
                                <span className='text-rose-700'>{r.lowbitQQuality.collapseReason}</span>
                              ) : (
                                <span className='text-emerald-700'>OK</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Single comparison result */}
            <div className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
              <div className='flex items-center justify-between gap-4'>
                <h2 className='text-lg font-semibold'>比較結果</h2>
                <button
                  className='rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:opacity-50'
                  disabled={runHistory.length === 0 && batchResults.length === 0}
                  onClick={handleExportDiagnosis}
                >
                  JSONを書き出す
                </button>
              </div>
              {comparisonSummary && (
                <div className='mt-4 grid gap-3 md:grid-cols-4'>
                  <div className='rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm'>
                    <div className='text-slate-500'>exact match</div>
                    <div className='font-medium'>{comparisonSummary.exactMatch ? 'yes' : 'no'}</div>
                  </div>
                  <div className='rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm'>
                    <div className='text-slate-500'>original length</div>
                    <div className='font-medium'>{comparisonSummary.originalLength}</div>
                  </div>
                  <div className='rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm'>
                    <div className='text-slate-500'>lowbit-Q length</div>
                    <div className='font-medium'>{comparisonSummary.lowbitQLength}</div>
                  </div>
                  <div className='rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm'>
                    <div className='text-slate-500'>length delta</div>
                    <div className='font-medium'>{comparisonSummary.lengthDelta}</div>
                  </div>
                </div>
              )}

              <div className='mt-4 grid gap-4 xl:grid-cols-2'>
                <div>
                  <div className='mb-2 text-sm font-medium text-slate-600'>original</div>
                  <pre className='min-h-[220px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100'>
                    {outputs.original || '(not run yet)'}
                  </pre>
                </div>
                <div>
                  <div className='mb-2 text-sm font-medium text-slate-600'>lowbit-Q</div>
                  <pre className='min-h-[220px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100'>
                    {outputs['lowbit-q'] || '(not run yet)'}
                  </pre>
                </div>
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className='flex flex-col gap-6'>
            {/* Tensor metrics */}
            {tensorRecords.length > 0 && (
              <div className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
                <h2 className='text-lg font-semibold'>テンソル変換メトリクス</h2>
                {tensorSummary && (
                  <div className='mt-3 grid gap-2 md:grid-cols-3 text-xs'>
                    <div className='rounded-lg border border-slate-200 bg-slate-50 p-2'>
                      <div className='text-slate-500'>変換済み</div>
                      <div className='font-medium'>{tensorSummary.convertedCount} / {tensorSummary.totalTensors}</div>
                    </div>
                    <div className='rounded-lg border border-slate-200 bg-slate-50 p-2'>
                      <div className='text-slate-500'>Avg NMSE</div>
                      <div className='font-medium'>{tensorSummary.avgNMSE?.toFixed(4) ?? '-'}</div>
                    </div>
                    <div className='rounded-lg border border-slate-200 bg-slate-50 p-2'>
                      <div className='text-slate-500'>Max NMSE</div>
                      <div className='font-medium'>
                        {tensorSummary.maxNMSE?.toFixed(4) ?? '-'}
                        {tensorSummary.worstTensor && (
                          <span className='ml-1 text-slate-400'>({tensorSummary.worstTensor.replace(/^blk\.\d+\./, '')})</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {tensorSummary?.nmseByFamily && Object.keys(tensorSummary.nmseByFamily).length > 0 && (
                  <div className='mt-3'>
                    <div className='text-xs font-medium text-slate-500 mb-1'>NMSE by family</div>
                    <div className='grid gap-1 text-xs'>
                      {Object.entries(tensorSummary.nmseByFamily).map(([family, data]) => (
                        <div key={family} className='flex justify-between rounded-lg border border-slate-100 bg-slate-50 px-2 py-1'>
                          <span className='font-medium'>{family}</span>
                          <span>
                            avg={data.avg.toFixed(4)} max={data.max.toFixed(4)} (×{data.count})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className='mt-4 max-h-[400px] overflow-auto'>
                  <table className='w-full text-left text-xs'>
                    <thead>
                      <tr className='border-b border-slate-200 text-slate-500'>
                        <th className='pb-2 pr-2 font-medium'>Layer</th>
                        <th className='pb-2 pr-2 font-medium'>Tensor</th>
                        <th className='pb-2 pr-2 font-medium'>Family</th>
                        <th className='pb-2 pr-2 font-medium'>Conv</th>
                        <th className='pb-2 pr-2 font-medium text-right'>NMSE</th>
                        <th className='pb-2 pr-2 font-medium text-right'>Orig</th>
                        <th className='pb-2 pr-2 font-medium text-right'>1bit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tensorRecords
                        .filter((r) => r.layerIndex !== null)
                        .sort((a, b) => (a.layerIndex ?? 0) - (b.layerIndex ?? 0))
                        .map((r) => (
                          <tr
                            key={r.name}
                            className={`border-b border-slate-50 ${r.nmse !== null && r.nmse > 0.6 ? 'bg-amber-50' : ''}`}
                          >
                            <td className='py-1 pr-2 text-slate-400'>{r.layerIndex}</td>
                            <td className='py-1 pr-2 font-mono'>{r.name.replace(/^blk\.\d+\./, '')}</td>
                            <td className='py-1 pr-2'>{r.family}</td>
                            <td className='py-1 pr-2'>{r.converted ? '✓' : '-'}</td>
                            <td className='py-1 pr-2 text-right'>{r.nmse?.toFixed(4) ?? '-'}</td>
                            <td className='py-1 pr-2 text-right'>{formatBytes(r.originalSizeBytes)}</td>
                            <td className='py-1 pr-2 text-right'>{r.lowbitQSizeBytes ? formatBytes(r.lowbitQSizeBytes) : '-'}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Lowbit-Q evidence */}
            <div className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
              <h2 className='text-lg font-semibold'>lowbit-Q 経路の証跡</h2>
              <div className='mt-4 grid gap-3'>
                <div className={`rounded-xl border p-4 ${runtimeInitLowbitQ?.payload?.isLowbitQ ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                  <div className='text-sm font-medium'>`runtime.ts` が `isLowbitQ` を worker init に渡したか</div>
                  <div className='mt-2 text-sm text-slate-700'>
                    {runtimeInitLowbitQ?.payload?.isLowbitQ ? 'PASS' : '未検出'}
                  </div>
                </div>
                <div className={`rounded-xl border p-4 ${workerUsesVendorWasm ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                  <div className='text-sm font-medium'>`wllamaWorker.ts` が `vendor/wllama/*.wasm` を選んだか</div>
                  <div className='mt-2 break-all text-sm text-slate-700'>
                    {workerInitLowbitQ?.payload?.wasmPaths ? JSON.stringify(workerInitLowbitQ.payload.wasmPaths) : '未検出'}
                  </div>
                </div>
                <div className={`rounded-xl border p-4 ${metadataSummary?.hasLowbitQVersion ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                  <div className='text-sm font-medium'>GGUF metadata に `lowbit-q.version` があるか</div>
                  <div className='mt-2 text-sm text-slate-700'>
                    {metadataSummary
                      ? `version=${metadataSummary.lowbitQVersion ?? '-'} sign=${metadataSummary.signPacking ?? '-'} lowbit-Q tensors=${metadataSummary.lowbitQTensorCount}`
                      : '未検査'}
                  </div>
                  {metadataSummary?.v2 && (
                    <div className='mt-2 grid grid-cols-2 gap-1 text-xs text-slate-600'>
                      <div>SVID_1BIT: <span className='font-medium text-indigo-700'>{metadataSummary.v2.svidCount}</span></div>
                      <div>Q4_0: <span className='font-medium text-slate-800'>{metadataSummary.v2.q4_0Count}</span></div>
                      <div>Q3_K: <span className='font-medium text-emerald-700'>{metadataSummary.v2.q3_kCount}</span></div>
                      <div>Q2_K: <span className='font-medium text-teal-700'>{metadataSummary.v2.q2_kCount}</span></div>
                      <div>passthrough: <span className='font-medium'>{metadataSummary.v2.passthroughCount}</span></div>
                      <div>total: <span className='font-medium'>{metadataSummary.v2.totalCount}</span></div>
                      {metadataSummary.v2.nmseMean !== undefined && (
                        <div>NMSE mean: <span className='font-medium'>{metadataSummary.v2.nmseMean.toFixed(4)}</span></div>
                      )}
                      {metadataSummary.v2.nmseMax !== undefined && (
                        <div>NMSE max: <span className='font-medium'>{metadataSummary.v2.nmseMax.toFixed(4)}</span></div>
                      )}
                      {metadataSummary.v2.sizeBudget !== undefined && (
                        <div>size budget: <span className='font-medium'>{(metadataSummary.v2.sizeBudget * 100).toFixed(0)}%</span></div>
                      )}
                    </div>
                  )}
                </div>
                <div className={`rounded-xl border p-4 ${nativeDetectedLowbitQ ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                  <div className='text-sm font-medium'>native log に `detected lowbit-Q format` が出たか</div>
                  <div className='mt-2 text-sm text-slate-700'>{nativeDetectedLowbitQ ? 'PASS' : '未検出'}</div>
                </div>
              </div>
            </div>

            <div className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
              <h2 className='text-lg font-semibold'>metadata</h2>
              <pre className='mt-4 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100'>
                {metadataSummary ? JSON.stringify(metadataSummary, null, 2) : '(not inspected yet)'}
              </pre>
            </div>

            <div className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
              <h2 className='text-lg font-semibold'>diagnostics</h2>
              <pre className='mt-4 max-h-[260px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100'>
                {diagnostics.length > 0
                  ? JSON.stringify(diagnostics, null, 2)
                  : '(no diagnostics yet)'}
              </pre>
            </div>

            <div className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
              <h2 className='text-lg font-semibold'>native / worker logs</h2>
              <pre className='mt-4 max-h-[300px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100'>
                {runtimeLogs.length > 0
                  ? runtimeLogs.map((log) => `[${log.modelId}] ${log.text}`).join('\n')
                  : '(no logs yet)'}
              </pre>
            </div>

            <div className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
              <h2 className='text-lg font-semibold'>保存済み実行履歴</h2>
              <pre className='mt-4 max-h-[260px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100'>
                {runHistory.length > 0 ? JSON.stringify(runHistory, null, 2) : '(no saved runs yet)'}
              </pre>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default LowbitQValidationPage;
