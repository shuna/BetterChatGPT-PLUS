import { saveRequest, cleanupStale } from './streamDb';

let registration: ServiceWorkerRegistration | null = null;
let controllerReady: Promise<void> | null = null;

export async function register(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  try {
    registration = await navigator.serviceWorker.register('./sw-stream.js', {
      scope: './',
    });

    // If no controller yet (first install), wait for it to claim
    if (!navigator.serviceWorker.controller) {
      controllerReady = new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          resolve();
        }, { once: true });
      });
    }

    // Cleanup stale IndexedDB records on startup
    cleanupStale().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export function isAvailable(): boolean {
  return !!(
    'serviceWorker' in navigator && navigator.serviceWorker.controller
  );
}

export async function waitForController(): Promise<boolean> {
  if (isAvailable()) return true;
  if (controllerReady) {
    await controllerReady;
    return isAvailable();
  }
  return false;
}

export interface SwStreamHandle {
  cancel: () => void;
}

export interface StartStreamParams {
  requestId: string;
  endpoint: string;
  headers: Record<string, string>;
  body: object;
  chatIndex: number;
  messageIndex: number;
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export async function startStream(params: StartStreamParams): Promise<SwStreamHandle> {
  const {
    requestId,
    endpoint,
    headers,
    body,
    chatIndex,
    messageIndex,
    onChunk,
    onDone,
    onError,
  } = params;

  // Save initial record to IndexedDB (client side too, in case SW dies before writing)
  await saveRequest({
    requestId,
    chatIndex,
    messageIndex,
    bufferedText: '',
    status: 'streaming',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    acknowledged: false,
  });

  const sw = navigator.serviceWorker;

  function handler(event: MessageEvent) {
    const data = event.data;
    if (!data || data.requestId !== requestId) return;

    switch (data.type) {
      case 'sw-chunk':
        onChunk(data.text);
        break;
      case 'sw-done':
        cleanup();
        onDone();
        break;
      case 'sw-error':
        cleanup();
        onError(data.error || 'Unknown error');
        break;
      case 'sw-cancelled':
        cleanup();
        break;
    }
  }

  function cleanup() {
    sw.removeEventListener('message', handler);
  }

  sw.addEventListener('message', handler);

  const controller = sw.controller;
  if (!controller) {
    cleanup();
    throw new Error('Service Worker controller not available');
  }

  // Send startStream to SW
  controller.postMessage({
    type: 'startStream',
    requestId,
    endpoint,
    headers,
    body,
    chatIndex,
    messageIndex,
  });

  return {
    cancel: () => {
      sw.controller?.postMessage({
        type: 'cancelStream',
        requestId,
      });
      cleanup();
    },
  };
}
