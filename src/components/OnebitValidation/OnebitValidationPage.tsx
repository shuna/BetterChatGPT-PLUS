import React, { useEffect, useMemo, useState } from 'react';
import { downloadModelFiles, type DownloadProgress } from '@src/local-llm/download';
import { localModelRuntime, type RuntimeDiagnosticEvent, type RuntimeLogEvent } from '@src/local-llm/runtime';
import { OpfsFileProvider, readFile, saveFile, verifyStoredModel } from '@src/local-llm/storage';
import {
  FIXED_VALIDATION_MODEL,
  VALIDATION_PROMPTS,
  VALIDATION_RUNS_STORAGE_KEY,
  DIAGNOSIS_PROMPT_IDS,
  appendValidationRun,
  createInitialValidationSteps,
  getValidationModelDefinition,
  inspectOnebitMetadata,
  summarizeOutputComparison,
  type OnebitMetadataSummary,
  type OutputComparisonSummary,
  type ValidationRunRecord,
  type ValidationStepState,
  type ValidationVariant,
} from '@src/local-llm/onebit/validation';
import {
  OnebitConversionManager,
  generateOnebitFilename,
  isOnebitModelId,
} from '@src/local-llm/onebit';
import { ONEBIT_CONVERT_MODES, type OnebitConvertMode, type TensorConvertRecord } from '@src/local-llm/onebit/tensorFilter';
import { computeOutputQuality, type OutputQualityMetrics } from '@src/local-llm/onebit/qualityMetrics';
import { buildDiagnosisExport, summarizeTensorRecords, type DiagnosisRunExport } from '@src/local-llm/onebit/diagnosisExport';

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
  onebitOutput: string;
  onebitQuality: OutputQualityMetrics;
}

function OnebitValidationPage() {
  const originalDef = useMemo(() => getValidationModelDefinition('original'), []);
  const onebitDef = useMemo(() => getValidationModelDefinition('onebit'), []);
  const [steps, setSteps] = useState<ValidationStepState[]>(() => createInitialValidationSteps());
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [conversionProgressText, setConversionProgressText] = useState<string>('');
  const [metadataSummary, setMetadataSummary] = useState<OnebitMetadataSummary | null>(null);
  const [runtimeLogs, setRuntimeLogs] = useState<RuntimeLogEvent[]>([]);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnosticEvent[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState<string>(VALIDATION_PROMPTS[0].id);
  const [maxTokens, setMaxTokens] = useState<number>(96);
  const [temperature, setTemperature] = useState<number>(0.2);
  const [outputs, setOutputs] = useState<Record<ValidationVariant, string>>({
    original: '',
    onebit: '',
  });
  const [comparisonSummary, setComparisonSummary] = useState<OutputComparisonSummary | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<ValidationRunRecord[]>([]);
  const [downloadedOriginalBytes, setDownloadedOriginalBytes] = useState<number | null>(null);
  const [savedOnebitBytes, setSavedOnebitBytes] = useState<number | null>(null);

  // --- Diagnosis state ---
  const [selectedConvertMode, setSelectedConvertMode] = useState<OnebitConvertMode>('all');
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
      if (event.modelId !== originalDef.id && event.modelId !== onebitDef.id) return;
      setRuntimeLogs((prev) => [event, ...prev].slice(0, 200));
    });
    const unsubDiagnostics = localModelRuntime.subscribeDiagnostics((event) => {
      if (event.modelId !== originalDef.id && event.modelId !== onebitDef.id) return;
      setDiagnostics((prev) => [event, ...prev].slice(0, 100));
    });
    return () => {
      unsubLogs();
      unsubDiagnostics();
    };
  }, [onebitDef.id, originalDef.id]);

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
    await saveFile(originalDef.id, FIXED_VALIDATION_MODEL.fileName, file);
    setDownloadedOriginalBytes(file.size);
    const verify = await verifyStoredModel(originalDef.id, originalDef.manifest);
    if (verify !== 'saved') {
      updateStep('download-original', 'fail', `verifyStoredModel=${verify}`);
      throw new Error(`OPFS保存検証に失敗: ${verify}`);
    }
    updateStep('download-original', 'pass', `${formatBytes(file.size)} をローカルから保存済み`);
  };

  const handleConvertOnebit = async () => {
    updateStep('convert-onebit', 'running', `onebit 変換中 (mode: ${selectedConvertMode})`);
    updateStep('save-opfs', 'running', 'OPFS 書き込み待機');
    updateStep('detect-onebit-metadata', 'running', 'GGUF metadata 確認待機');
    setConversionProgressText('');
    setTensorRecords([]);

    const manager = new OnebitConversionManager();
    const result = await manager.convertFromOpfs(
      originalDef.id,
      FIXED_VALIDATION_MODEL.fileName,
      FIXED_VALIDATION_MODEL.sourceLabel,
      {
        onProgress: (progress) => {
          setConversionProgressText(
            `${progress.stage} ${progress.percent}% ${progress.currentTensorName}`.trim(),
          );
        },
        convertMode: selectedConvertMode,
        computeQuality: true,
      },
    );

    updateStep(
      'convert-onebit',
      'pass',
      `${formatBytes(result.originalSize)} -> ${formatBytes(result.convertedSize)} (${selectedConvertMode})`,
    );
    setSavedOnebitBytes(result.convertedSize);
    setLastConvertedSize(result.convertedSize);
    setLastCompressionRatio(result.compressionRatio);

    if (result.tensorRecords) {
      setTensorRecords(result.tensorRecords);
    }

    const onebitFile = await readFile(onebitDef.id, generateOnebitFilename(FIXED_VALIDATION_MODEL.fileName));
    const verify = await verifyStoredModel(onebitDef.id, onebitDef.manifest);
    if (verify !== 'saved') {
      updateStep('save-opfs', 'fail', `verifyStoredModel=${verify}`);
      throw new Error(`onebit GGUF の OPFS 保存検証に失敗しました: ${verify}`);
    }

    updateStep('save-opfs', 'pass', `${onebitFile.name} / ${formatBytes(onebitFile.size)}`);

    const summary = await inspectOnebitMetadata(onebitFile);
    setMetadataSummary(summary);
    if (!summary.hasOnebitVersion) {
      updateStep('detect-onebit-metadata', 'fail', 'onebit.version が見つかりません');
      throw new Error('onebit metadata を検出できませんでした');
    }
    updateStep(
      'detect-onebit-metadata',
      'pass',
      `version=${summary.onebitVersion ?? '-'} sign=${summary.signPacking ?? '-'}`,
    );
  };

  const runVariant = async (variant: ValidationVariant): Promise<string> => {
    const def = variant === 'original' ? originalDef : onebitDef;
    const stepKey = variant === 'original' ? 'load-generate-original' : 'load-generate-onebit';
    const provider = new OpfsFileProvider(def.id, def.manifest);

    updateStep(stepKey, 'running', 'モデルをロード中');

    if (localModelRuntime.isLoaded(originalDef.id)) {
      await localModelRuntime.unloadModel(originalDef.id);
    }
    if (localModelRuntime.isLoaded(onebitDef.id)) {
      await localModelRuntime.unloadModel(onebitDef.id);
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
        selectedPrompt.prompt,
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
    const def = variant === 'original' ? originalDef : onebitDef;
    const provider = new OpfsFileProvider(def.id, def.manifest);

    // Load if not already loaded
    if (!localModelRuntime.isLoaded(def.id)) {
      await localModelRuntime.loadModel(def, provider);
    }

    const engine = localModelRuntime.getWllamaEngine(def.id);
    if (!engine) throw new Error(`${variant} engine unavailable`);

    let latestText = '';
    const output = await engine.generate(
      prompt,
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
      if (localModelRuntime.isLoaded(onebitDef.id)) {
        await localModelRuntime.unloadModel(onebitDef.id);
      }

      // Phase 1: Run all prompts for original
      const originalOutputs: Record<string, string> = {};
      for (let i = 0; i < prompts.length; i++) {
        setBatchProgress(`Original ${i + 1}/${prompts.length}: ${prompts[i].label}`);
        originalOutputs[prompts[i].id] = await runVariantForPrompt('original', prompts[i].prompt);
      }

      // Unload original, prepare for onebit
      if (localModelRuntime.isLoaded(originalDef.id)) {
        await localModelRuntime.unloadModel(originalDef.id);
      }

      // Phase 2: Run all prompts for onebit
      const results: BatchRunResult[] = [];
      for (let i = 0; i < prompts.length; i++) {
        setBatchProgress(`Onebit ${i + 1}/${prompts.length}: ${prompts[i].label}`);
        const onebitOutput = await runVariantForPrompt('onebit', prompts[i].prompt);
        const originalOutput = originalOutputs[prompts[i].id];

        results.push({
          promptId: prompts[i].id,
          prompt: prompts[i].prompt,
          originalOutput,
          originalQuality: computeOutputQuality(originalOutput, 'stop'),
          onebitOutput,
          onebitQuality: computeOutputQuality(onebitOutput, 'stop', originalOutput),
        });
      }

      // Unload onebit
      if (localModelRuntime.isLoaded(onebitDef.id)) {
        await localModelRuntime.unloadModel(onebitDef.id);
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
    const onebitOutput = await runVariant('onebit');

    const summary = summarizeOutputComparison(originalOutput, onebitOutput);
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

      const onebitRuns: DiagnosisRunExport[] = batchResults.map((r) => ({
        promptId: r.promptId,
        prompt: r.prompt,
        output: r.onebitOutput,
        quality: r.onebitQuality,
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
            runs: onebitRuns,
          },
        ],
      });

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `onebit-diagnosis-${selectedConvertMode}-${Date.now()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } else {
      // Fallback: export run history
      const blob = new Blob([JSON.stringify(runHistory, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'onebit-validation-results.json';
      anchor.click();
      URL.revokeObjectURL(url);
    }
  };

  const workerInitOnebit = diagnostics.find((event) =>
    event.modelId === onebitDef.id && event.phase === 'worker-init',
  );
  const runtimeInitOnebit = diagnostics.find((event) =>
    event.modelId === onebitDef.id && event.phase === 'runtime-init-request',
  );
  const nativeDetectedOnebit = runtimeLogs.some((event) =>
    event.modelId === onebitDef.id && event.text.toLowerCase().includes('detected onebit format'),
  );
  const workerUsesVendorWasm = String(
    workerInitOnebit?.payload?.wasmPaths &&
    JSON.stringify(workerInitOnebit.payload.wasmPaths),
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
              <p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-500'>Onebit Quality Diagnosis</p>
              <h1 className='text-2xl font-semibold'>wllama onebit 品質診断UI</h1>
            </div>
            <a className='text-sm text-slate-600 underline' href='/'>通常UIに戻る</a>
          </div>
          <p className='max-w-4xl text-sm leading-6 text-slate-600'>
            固定モデルをダウンロードし、onebit 変換、OPFS 保存、GGUF metadata 検査、原本/onebit 推論比較を
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
              <div className='text-slate-500'>onebitサイズ</div>
              <div className='font-medium'>{formatBytes(savedOnebitBytes)}</div>
            </div>
            <div className='rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm'>
              <div className='text-slate-500'>onebit modelId 認識</div>
              <div className='font-medium'>{isOnebitModelId(onebitDef.id) ? 'PASS' : 'FAIL'}</div>
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
                  onClick={() => void setAction('convert', handleConvertOnebit)}
                >
                  onebit変換
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
                  onClick={() => void setAction('onebit-run', () => runVariant('onebit'))}
                >
                  onebitを実行
                </button>
                <button
                  className='rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-50'
                  disabled={runningAction !== null || batchRunning}
                  onClick={() => void setAction('compare', handleCompare)}
                >
                  原本 vs onebit 比較
                </button>
                <button
                  className='rounded-xl border border-indigo-400 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50'
                  disabled={runningAction !== null || batchRunning}
                  onClick={() => void setAction('batch', handleDiagnosisBatch)}
                >
                  診断バッチ実行 ({DIAGNOSIS_PROMPT_IDS.length}p)
                </button>
              </div>

              <div className='mt-4 grid gap-4 md:grid-cols-[1fr_1fr_0.6fr_0.6fr]'>
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
                  <span className='font-medium'>変換モード</span>
                  <select
                    className='rounded-xl border border-slate-300 bg-white px-3 py-2'
                    value={selectedConvertMode}
                    onChange={(event) => setSelectedConvertMode(event.target.value as OnebitConvertMode)}
                  >
                    {ONEBIT_CONVERT_MODES.map((mode) => (
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

              {(downloadProgress || conversionProgressText || actionError || batchProgress) && (
                <div className='mt-4 space-y-2 text-sm text-slate-600'>
                  {downloadProgress && (
                    <div>
                      download: {formatBytes(downloadProgress.bytesDownloaded)} / {formatBytes(downloadProgress.bytesTotal)}
                    </div>
                  )}
                  {conversionProgressText && <div>convert: {conversionProgressText}</div>}
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
                            className={`border-b border-slate-100 ${r.onebitQuality.collapsed ? 'bg-rose-50' : ''}`}
                          >
                            <td className='py-2 pr-3 font-medium'>{prompt?.label ?? r.promptId}</td>
                            <td className='py-2 pr-3 text-right'>{r.originalQuality.charCount}</td>
                            <td className='py-2 pr-3 text-right'>{r.onebitQuality.charCount}</td>
                            <td className='py-2 pr-3 text-right'>
                              {r.onebitQuality.diffFromOriginal?.charDelta ?? '-'}
                            </td>
                            <td className='py-2 pr-3 text-right'>{r.onebitQuality.consecutiveRepeatCount}</td>
                            <td className='py-2 pr-3 text-right'>
                              {r.onebitQuality.trigramRepeatScore.toFixed(2)}
                            </td>
                            <td className='py-2 pr-3'>
                              {r.onebitQuality.collapsed ? (
                                <span className='text-rose-700'>{r.onebitQuality.collapseReason}</span>
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
                    <div className='text-slate-500'>onebit length</div>
                    <div className='font-medium'>{comparisonSummary.onebitLength}</div>
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
                  <div className='mb-2 text-sm font-medium text-slate-600'>onebit</div>
                  <pre className='min-h-[220px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100'>
                    {outputs.onebit || '(not run yet)'}
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
                            <td className='py-1 pr-2 text-right'>{r.onebitSizeBytes ? formatBytes(r.onebitSizeBytes) : '-'}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Onebit evidence */}
            <div className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
              <h2 className='text-lg font-semibold'>onebit 経路の証跡</h2>
              <div className='mt-4 grid gap-3'>
                <div className={`rounded-xl border p-4 ${runtimeInitOnebit?.payload?.isOnebit ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                  <div className='text-sm font-medium'>`runtime.ts` が `isOnebit` を worker init に渡したか</div>
                  <div className='mt-2 text-sm text-slate-700'>
                    {runtimeInitOnebit?.payload?.isOnebit ? 'PASS' : '未検出'}
                  </div>
                </div>
                <div className={`rounded-xl border p-4 ${workerUsesVendorWasm ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                  <div className='text-sm font-medium'>`wllamaWorker.ts` が `vendor/wllama/*.wasm` を選んだか</div>
                  <div className='mt-2 break-all text-sm text-slate-700'>
                    {workerInitOnebit?.payload?.wasmPaths ? JSON.stringify(workerInitOnebit.payload.wasmPaths) : '未検出'}
                  </div>
                </div>
                <div className={`rounded-xl border p-4 ${metadataSummary?.hasOnebitVersion ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                  <div className='text-sm font-medium'>GGUF metadata に `onebit.version` があるか</div>
                  <div className='mt-2 text-sm text-slate-700'>
                    {metadataSummary
                      ? `version=${metadataSummary.onebitVersion ?? '-'} sign=${metadataSummary.signPacking ?? '-'} onebit tensors=${metadataSummary.onebitTensorCount}`
                      : '未検査'}
                  </div>
                </div>
                <div className={`rounded-xl border p-4 ${nativeDetectedOnebit ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                  <div className='text-sm font-medium'>native log に `detected onebit format` が出たか</div>
                  <div className='mt-2 text-sm text-slate-700'>{nativeDetectedOnebit ? 'PASS' : '未検出'}</div>
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

export default OnebitValidationPage;
