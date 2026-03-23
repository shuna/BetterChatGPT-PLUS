import { debugReport } from '@store/debug-store';
import { saveRequest, cleanupStale } from './streamDb';

let registration: ServiceWorkerRegistration | null = null;
let controllerReady: Promise<void> | null = null;

const formatDebugTime = (time = Date.now()): string =>
  new Date(time).toISOString().slice(11, 23);

export async function register(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  debugReport('sw', { label: 'Service Worker', status: 'active', detail: 'registering' });
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
    debugReport('sw', { status: 'done', detail: 'registered' });
    return true;
  } catch {
    debugReport('sw', { status: 'error', detail: 'registration failed' });
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

export interface ProxyStreamConfig {
  endpoint: string;
  authToken?: string;
  sessionId: string;
}

export interface StartStreamParams {
  requestId: string;
  endpoint: string;
  headers: Record<string, string>;
  body: object;
  chatIndex: number;
  messageIndex: number;
  onChunk: (text: string, meta?: { generationId?: string; reasoning?: string }) => void;
  onDone: (meta?: { proxySessionId?: string; lastProxyEventId?: number; generationId?: string; finishReason?: string }) => void;
  onError: (error: string, meta?: { proxySessionId?: string; lastProxyEventId?: number; generationId?: string }) => void;
  /** When set, SW routes the request through the proxy worker */
  proxyConfig?: ProxyStreamConfig;
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
    proxyConfig,
  } = params;

  debugReport('streaming', { label: 'Streaming', status: 'active', detail: requestId });
  debugReport(`stream:${requestId}`, {
    label: 'SW Stream',
    status: 'active',
    detail: `${formatDebugTime()} start`,
  });
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

  // Use a dedicated MessageChannel so responses travel over a private port,
  // immune to interference from browser extensions listening on
  // navigator.serviceWorker.onmessage.
  const channel = new MessageChannel();
  let cleanedUp = false;

  channel.port1.onmessage = (event: MessageEvent) => {
    const data = event.data;
    if (!data) return;

    switch (data.type) {
      case 'sw-debug':
        debugReport(`sw-pipeline:${requestId}`, {
          label: 'SW Pipeline',
          status: data.status || 'active',
          detail: data.detail,
        });
        break;
      case 'sw-chunk':
        onChunk(data.text, { generationId: data.generationId, reasoning: data.reasoning });
        break;
      case 'sw-done':
        cleanup();
        debugReport('streaming', { status: 'done' });
        debugReport(`stream:${requestId}`, {
          status: 'done',
          detail: `${formatDebugTime()} sw-done`,
        });
        debugReport(`sw-pipeline:${requestId}`, {
          label: 'SW Pipeline',
          status: 'done',
          detail: `${formatDebugTime()} sw-done delivered`,
        });
        onDone({
          proxySessionId: data.proxySessionId,
          lastProxyEventId: data.lastProxyEventId,
          generationId: data.generationId,
          finishReason: data.finishReason,
        });
        break;
      case 'sw-error':
        cleanup();
        debugReport('streaming', { status: 'error', detail: data.error });
        debugReport(`stream:${requestId}`, {
          status: 'error',
          detail: `${formatDebugTime()} sw-error ${data.error || 'unknown'}`,
        });
        debugReport(`sw-pipeline:${requestId}`, {
          label: 'SW Pipeline',
          status: 'error',
          detail: `${formatDebugTime()} sw-error delivered`,
        });
        onError(data.error || 'Unknown error', {
          proxySessionId: data.proxySessionId,
          lastProxyEventId: data.lastProxyEventId,
          generationId: data.generationId,
        });
        break;
      case 'sw-cancelled':
        cleanup();
        debugReport('streaming', {
          label: 'Streaming',
          status: 'done',
          detail: requestId,
        });
        debugReport(`stream:${requestId}`, {
          status: 'done',
          detail: `${formatDebugTime()} sw-cancelled`,
        });
        debugReport(`sw-pipeline:${requestId}`, {
          label: 'SW Pipeline',
          status: 'done',
          detail: `${formatDebugTime()} sw-cancelled delivered`,
        });
        break;
    }
  };

  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    channel.port1.close();
  }

  const controller = sw.controller;
  if (!controller) {
    cleanup();
    throw new Error('Service Worker controller not available');
  }

  // Send startStream to SW with port2 transferred
  controller.postMessage(
    {
      type: 'startStream',
      requestId,
      endpoint,
      headers,
      body,
      chatIndex,
      messageIndex,
      proxyMode: !!proxyConfig,
      proxyConfig: proxyConfig || undefined,
    },
    [channel.port2],
  );

  return {
    cancel: () => {
      debugReport(`stream:${requestId}`, {
        label: 'SW Stream',
        status: 'done',
        detail: `${formatDebugTime()} cancel requested`,
      });
      debugReport(`sw-pipeline:${requestId}`, {
        label: 'SW Pipeline',
        status: 'done',
        detail: `${formatDebugTime()} cancel requested`,
      });
      debugReport('streaming', {
        label: 'Streaming',
        status: 'done',
        detail: requestId,
      });
      sw.controller?.postMessage({
        type: 'cancelStream',
        requestId,
      });
      cleanup();
    },
  };
}
