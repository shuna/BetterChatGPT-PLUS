export interface AssetsPathConfig {
  'single-thread/wllama.wasm': string;
  'multi-thread/wllama.wasm'?: string;
}

export interface WllamaLogger {
  debug: typeof console.debug;
  log: typeof console.log;
  info?: typeof console.info;
  warn: typeof console.warn;
  error: typeof console.error;
}

export interface WllamaConfig {
  suppressNativeLog?: boolean;
  logger?: WllamaLogger;
}

export interface LoadModelConfig {
  n_ctx?: number;
  n_threads?: number;
}

export interface LoadedContextInfo {
  n_ctx: number;
  n_vocab: number;
  n_layer: number;
}

export interface CompletionChunk {
  token: number;
  piece: Uint8Array;
  currentText: string;
}

export interface CompletionOptions {
  nPredict?: number;
  sampling?: {
    temp?: number;
  };
  abortSignal?: AbortSignal;
  stream?: boolean;
}

export class Wllama {
  constructor(pathConfig: AssetsPathConfig, config?: WllamaConfig);
  loadModel(files: Blob[], config?: LoadModelConfig): Promise<void>;
  getLoadedContextInfo(): LoadedContextInfo;
  isModelLoaded(): boolean;
  createCompletion(
    prompt: string,
    options?: CompletionOptions,
  ): Promise<AsyncIterable<CompletionChunk>>;
  exit(): Promise<void>;
}
