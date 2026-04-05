import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import Toggle from '@components/Toggle';
import { SettingsGroup } from './SettingsMenu';
import { localModelRuntime } from '@src/local-llm/runtime';
import { EphemeralFileProvider } from '@src/local-llm/fileProvider';
import { localAnalyze, localFormat } from '@api/localGeneration';
import type { LocalModelStatus } from '@src/local-llm/types';

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
// Main component
// ---------------------------------------------------------------------------

const MODEL_ID = '__wllama_test__';

const LocalModelSettings = () => {
  const { t } = useTranslation('main');

  // Store state
  const localModelEnabled = useStore((s) => s.localModelEnabled);
  const setLocalModelEnabled = useStore((s) => s.setLocalModelEnabled);

  // Local UI state
  const [enabled, setEnabled] = useState(localModelEnabled);
  const [status, setStatus] = useState<LocalModelStatus>('idle');
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

  // Sync toggle to store
  useEffect(() => {
    setLocalModelEnabled(enabled);
  }, [enabled]);

  // Subscribe to runtime status changes
  useEffect(() => {
    const unsubscribe = localModelRuntime.subscribe(() => {
      setStatus(localModelRuntime.getStatus(MODEL_ID));
    });
    return unsubscribe;
  }, []);

  // ----- File selection & model load -----
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
      MODEL_ID,
    );

    try {
      // Unload previous if any
      if (localModelRuntime.isLoaded(MODEL_ID)) {
        await localModelRuntime.unloadModel(MODEL_ID);
      }
      await localModelRuntime.loadModel(
        {
          id: MODEL_ID,
          engine: 'wllama',
          tasks: ['generation'],
          label: file.name,
          origin: file.name,
          source: 'ephemeral-file',
          manifest: { kind: 'single-file', entrypoint: file.name },
          fileSize: file.size,
          lastFileName: file.name,
        },
        provider,
      );
      const caps = localModelRuntime.getCapabilities(MODEL_ID);
      if (caps?.contextLength) setContextLength(caps.contextLength);

      // Register in store so localGeneration API can find it
      const store = useStore.getState();
      store.addLocalModel({
        id: MODEL_ID,
        engine: 'wllama',
        tasks: ['generation', 'analysis'],
        label: file.name,
        origin: file.name,
        source: 'ephemeral-file',
        manifest: { kind: 'single-file', entrypoint: file.name },
        fileSize: file.size,
        lastFileName: file.name,
      });
      store.setActiveLocalModel('generation', MODEL_ID);
      store.setActiveLocalModel('analysis', MODEL_ID);
    } catch (err) {
      setLoadError((err as Error).message);
    }

    // Reset file input so the same file can be re-selected
    e.target.value = '';
  }, []);

  // ----- Generation -----
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    const engine = localModelRuntime.getWllamaEngine(MODEL_ID);
    if (!engine) return;

    setGenerating(true);
    setOutput('');

    try {
      await engine.generate(
        prompt,
        { maxTokens: 256, temperature: 0.7 },
        (text) => {
          setOutput(text);
          // Auto-scroll output
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
  }, [prompt]);

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
    const engine = localModelRuntime.getWllamaEngine(MODEL_ID);
    engine?.abort();
  }, []);

  // ----- Unload -----
  const handleUnload = useCallback(async () => {
    await localModelRuntime.unloadModel(MODEL_ID);
    setContextLength(null);
    setFileName(null);
    setOutput('');
  }, []);

  const isReady = status === 'ready' || status === 'busy';

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
          {/* Model file selection */}
          <SettingsGroup label={t('localModel.selectGgufFile')}>
            <div className='px-4 py-3 flex flex-col gap-3'>
              <p className='text-xs text-gray-500 dark:text-gray-400'>
                {t('localModel.selectGgufHint')}
              </p>
              <div className='flex items-center gap-3'>
                <button
                  className='btn btn-neutral text-sm px-4 py-1.5'
                  onClick={() => fileInputRef.current?.click()}
                  disabled={status === 'loading'}
                >
                  {status === 'loading' ? t('localModel.modelStatus.loading') : t('localModel.selectGgufFile')}
                </button>
                <input
                  ref={fileInputRef}
                  type='file'
                  accept='.gguf'
                  className='hidden'
                  onChange={handleFileSelect}
                />
                <StatusBadge status={status} />
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

              {contextLength !== null && (
                <div className='text-xs text-gray-500 dark:text-gray-400'>
                  {t('localModel.contextLength')}: {contextLength.toLocaleString()}
                </div>
              )}
            </div>
          </SettingsGroup>

          {/* Test generation area */}
          {isReady && (
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

                {/* Analyze: instruction input */}
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

                {/* Format: preset selector */}
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
                  <button
                    className='btn btn-neutral text-sm px-4 py-1.5 ml-auto'
                    onClick={handleUnload}
                    disabled={generating}
                  >
                    {t('localModel.unload')}
                  </button>
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
          {status === 'idle' && (
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
