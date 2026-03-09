import useStore from '@store/store';
import {
  isImageContent,
  isTextContent,
  MessageInterface,
  TotalTokenUsed,
} from '@type/chat';
import { ModelOptions } from '@type/chat';

type WorkerPayload =
  | { type: 'init' }
  | {
      type: 'countTokens';
      messages: MessageInterface[];
      model: ModelOptions;
    }
  | {
      type: 'limitMessages';
      messages: MessageInterface[];
      model: ModelOptions;
      limit: number;
    };

type WorkerRequest = WorkerPayload & { id: number };

type WorkerResponse =
  | { id: number; type: 'ready' }
  | { id: number; type: 'countTokensResult'; count: number }
  | { id: number; type: 'limitMessagesResult'; messages: MessageInterface[] }
  | { id: number; type: 'error'; message: string };

let worker: Worker | null = null;
let requestId = 0;
let ready = false;
let unavailable = false;
let initPromise: Promise<void> | null = null;
const listeners: Set<() => void> = new Set();
const INIT_TIMEOUT_MS = 5000;

const pendingRequests = new Map<
  number,
  {
    resolve: (value: WorkerResponse) => void;
    reject: (reason?: unknown) => void;
  }
>();

const failPendingRequests = (reason: Error) => {
  pendingRequests.forEach(({ reject }) => reject(reason));
  pendingRequests.clear();
};

const markWorkerUnavailable = (reason: Error) => {
  ready = false;
  unavailable = true;
  initPromise = null;
  listeners.clear();
  failPendingRequests(reason);
  worker?.terminate();
  worker = null;
};

const getWorker = (): Worker => {
  if (unavailable) {
    throw new Error('Tokenizer worker is unavailable');
  }

  if (!worker) {
    worker = new Worker(new URL('../workers/tokenizerWorker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      if (response.type === 'ready') {
        ready = true;
        listeners.forEach((fn) => fn());
        listeners.clear();
      }

      const pending = pendingRequests.get(response.id);
      if (!pending) return;
      pendingRequests.delete(response.id);

      if (response.type === 'error') {
        pending.reject(new Error(response.message));
        return;
      }

      pending.resolve(response);
    };
    worker.onerror = () => {
      markWorkerUnavailable(new Error('Tokenizer worker failed to initialize'));
    };
    worker.onmessageerror = () => {
      markWorkerUnavailable(new Error('Tokenizer worker message handling failed'));
    };
  }

  return worker;
};

const postToWorker = (message: WorkerPayload): Promise<WorkerResponse> => {
  const currentWorker = getWorker();
  const id = requestId++;

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    currentWorker.postMessage({ ...message, id });
  });
};

export const loadEncoder = async (): Promise<void> => {
  if (unavailable) return;
  if (ready) return;
  if (!initPromise) {
    initPromise = Promise.race([
      postToWorker({ type: 'init' }).then(() => undefined),
      new Promise<void>((_, reject) => {
        window.setTimeout(() => {
          reject(new Error('Tokenizer worker initialization timed out'));
        }, INIT_TIMEOUT_MS);
      }),
    ]).catch(() => {
      markWorkerUnavailable(new Error('Tokenizer worker initialization failed'));
    });
  }
  await initPromise;
};

export const isEncoderReady = (): boolean => ready || unavailable;

export const onEncoderReady = (fn: () => void): (() => void) => {
  if (ready) {
    fn();
    return () => {};
  }
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const countTokens = async (
  messages: MessageInterface[],
  model: ModelOptions
): Promise<number> => {
  if (!messages || messages.length === 0) return 0;
  await loadEncoder();
  if (unavailable) return 0;
  try {
    const response = await postToWorker({ type: 'countTokens', messages, model });
    return response.type === 'countTokensResult' ? response.count : 0;
  } catch {
    unavailable = true;
    return 0;
  }
};

export const limitMessageTokens = async (
  messages: MessageInterface[],
  limit: number = 4096,
  model: ModelOptions
): Promise<MessageInterface[]> => {
  await loadEncoder();
  if (unavailable) return messages;
  try {
    const response = await postToWorker({
      type: 'limitMessages',
      messages,
      model,
      limit,
    });
    return response.type === 'limitMessagesResult' ? response.messages : messages;
  } catch {
    unavailable = true;
    return messages;
  }
};

export const updateTotalTokenUsed = async (
  model: ModelOptions,
  promptMessages: MessageInterface[],
  completionMessage: MessageInterface,
  providerId?: string
): Promise<void> => {
  const setTotalTokenUsed = useStore.getState().setTotalTokenUsed;
  const updatedTotalTokenUsed: TotalTokenUsed = JSON.parse(
    JSON.stringify(useStore.getState().totalTokenUsed)
  );

  const textPrompts = promptMessages.filter(
    (e) => Array.isArray(e.content) && e.content.some(isTextContent)
  );

  const imgPrompts = promptMessages.filter(
    (e) => Array.isArray(e.content) && e.content.some(isImageContent)
  );

  const [newPromptTokens, newImageTokens, newCompletionTokens] = await Promise.all([
    countTokens(textPrompts, model),
    countTokens(imgPrompts, model),
    countTokens([completionMessage], model),
  ]);

  const tokenKey = providerId ? `${model}:::${providerId}` : model;
  const {
    promptTokens = 0,
    completionTokens = 0,
    imageTokens = 0,
  } = updatedTotalTokenUsed[tokenKey] ?? {};

  updatedTotalTokenUsed[tokenKey] = {
    promptTokens: promptTokens + newPromptTokens,
    completionTokens: completionTokens + newCompletionTokens,
    imageTokens: imageTokens + newImageTokens,
  };

  setTotalTokenUsed(updatedTotalTokenUsed);
};

export default countTokens;
