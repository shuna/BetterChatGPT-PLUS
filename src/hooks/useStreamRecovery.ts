import { useEffect, useRef } from 'react';
import useStore from '@store/store';
import { getAllPending, deleteRequest, StreamRecord } from '@utils/streamDb';
import { upsertActivePathMessage } from '@utils/branchUtils';
import { cloneChatAtIndex } from '@utils/chatShallowClone';
import { register } from '@utils/swBridge';
import {
  recoverFromProxy,
  sendAck,
  parseProxySse,
  type ProxyConfig,
} from '@utils/proxyClient';
import { parseEventSource } from '@api/helper';
import { debugReport } from '@store/debug-store';
import { toast } from 'react-toastify';
import {
  buildRecoveredMessage,
  findRecoverableChat,
  getCurrentMessageText,
  hasRecoverableMessage,
  resolveRecoveryStatus,
  shouldApplyRecoveredText,
  showRecoveryToast,
} from './streamRecoveryHelpers';

const VISIBILITY_THRESHOLD_MS = 3000;

/** Module-level lock to prevent concurrent recoverPending calls (e.g. StrictMode double-mount) */
let recoveryInProgress = false;

/** Module-level AbortController for cancelling in-flight proxy recovery */
let activeRecoveryAbort: AbortController | null = null;

/** Cancel any in-flight proxy recovery. Called externally for manual stop. */
export function cancelActiveRecovery() {
  if (activeRecoveryAbort) {
    activeRecoveryAbort.abort();
    activeRecoveryAbort = null;
  }
}

export default function useStreamRecovery() {
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    // Register SW on mount
    register();
    // Recover any pending records from a previous session (cold start)
    recoverPending();
  }, []);

  useEffect(() => {
    const onPageShow = () => {
      if (hiddenAtRef.current) {
        hiddenAtRef.current = null;
        recoverPending();
      }
    };

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }

      // Foreground
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;

      // Suppress for short background durations
      if (hiddenAt && Date.now() - hiddenAt < VISIBILITY_THRESHOLD_MS) return;

      recoverPending();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);
}

/** Max retry attempts when proxy returns an 'interrupted' event (Worker may still be writing) */
const PROXY_RECOVERY_MAX_RETRIES = 3;
const PROXY_RECOVERY_RETRY_DELAY_MS = 2000;

/** Timeout for the entire proxy recovery SSE stream read (ms) */
const PROXY_RECOVERY_STREAM_TIMEOUT_MS = 120_000; // 2 minutes

/** Max time to wait for store hydration before giving up (ms) */
const HYDRATION_TIMEOUT_MS = 10_000;

/** Wait for Zustand store hydration to complete (proxy credentials aren't available until then) */
async function waitForStoreHydration(): Promise<boolean> {
  if (useStore.persist.hasHydrated()) return true;

  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      unsub();
      resolve(false);
    }, HYDRATION_TIMEOUT_MS);

    const unsub = useStore.persist.onFinishHydration(() => {
      clearTimeout(timer);
      unsub();
      resolve(true);
    });
  });
}

/** Try to recover additional text from the proxy's KV cache */
async function tryProxyRecovery(
  record: StreamRecord,
  currentText: string,
  signal: AbortSignal
): Promise<string | null> {
  const { proxyEndpoint, proxyAuthToken } = useStore.getState();
  if (!proxyEndpoint || !record.proxySessionId) return null;

  const config: ProxyConfig = {
    endpoint: proxyEndpoint.replace(/\/+$/, ''),
    authToken: proxyAuthToken || undefined,
  };

  let bestText: string | null = null;

  for (let attempt = 0; attempt <= PROXY_RECOVERY_MAX_RETRIES; attempt++) {
    if (signal.aborted) break;

    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, PROXY_RECOVERY_RETRY_DELAY_MS));
    }

    if (signal.aborted) break;

    const result = await readProxyRecoveryStream(config, record, signal);
    if (!result) break;

    if (result.text.length > (bestText?.length ?? 0)) {
      bestText = result.text;
    }

    // If the stream completed or errored, no point retrying
    if (!result.interrupted) break;
  }

  // ACK the proxy to free KV
  sendAck(config, record.proxySessionId);

  return bestText && bestText.length > currentText.length ? bestText : null;
}

async function readProxyRecoveryStream(
  config: ProxyConfig,
  record: StreamRecord,
  signal: AbortSignal
): Promise<{ text: string; interrupted: boolean } | null> {
  const stream = await recoverFromProxy(
    config,
    record.proxySessionId!,
    record.lastProxyEventId ?? 0,
    signal
  );
  if (!stream) return null;

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let partial = '';
  let llmPartial = '';
  let recoveredText = record.bufferedText;
  let interrupted = false;

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (signal.aborted) {
        interrupted = true;
        break;
      }

      const { done, value } = await reader.read();
      const chunk = partial + decoder.decode(done ? undefined : value, { stream: !done });
      const proxySse = parseProxySse(chunk, done);
      partial = proxySse.partial;

      let shouldBreak = false;
      for (const evt of proxySse.events) {
        if (evt.eventType === 'interrupted') {
          interrupted = true;
          shouldBreak = true;
          break;
        }
        if (evt.eventType === 'done' || evt.eventType === 'error') {
          shouldBreak = true;
          break;
        }
        if (evt.eventType === 'waiting') {
          // Server is still streaming — continue reading
          continue;
        }
        if (evt.rawText) {
          const llmChunk = llmPartial + evt.rawText;
          const llmParsed = parseEventSource(llmChunk, false);
          llmPartial = llmParsed.partial;

          for (const llmEvt of llmParsed.events) {
            const content = llmEvt.choices?.[0]?.delta?.content;
            if (content) recoveredText += content;
          }
        }
      }

      if (shouldBreak || done) break;
    }

    // Flush remaining LLM partial
    if (llmPartial) {
      const flushed = parseEventSource(llmPartial, true);
      for (const llmEvt of flushed.events) {
        const content = llmEvt.choices?.[0]?.delta?.content;
        if (content) recoveredText += content;
      }
    }
  } catch {
    // Network error during recovery — use what we have
  } finally {
    reader.cancel().catch(() => {});
  }

  return { text: recoveredText, interrupted };
}

export async function recoverPending(opts?: { manual?: boolean }) {
  // Prevent concurrent calls (StrictMode double-mount, rapid visibility changes)
  if (recoveryInProgress) return;
  recoveryInProgress = true;

  const manual = opts?.manual ?? false;
  const debugId = `recovery-${Date.now()}`;
  debugReport(debugId, { label: 'Stream Recovery', status: 'active', detail: 'Checking pending records…' });

  try {
    await recoverPendingInner(manual, debugId);
  } finally {
    recoveryInProgress = false;
  }
}

async function recoverPendingInner(manual: boolean, debugId: string) {
  // Wait for store hydration so proxy credentials are available
  const hydrated = await waitForStoreHydration();
  if (!hydrated) {
    debugReport(debugId, { status: 'error', detail: 'Store hydration timeout' });
    if (manual) toast.error('ストアの初期化がタイムアウトしました');
    return;
  }

  let records: StreamRecord[];
  try {
    records = await getAllPending();
  } catch {
    debugReport(debugId, { status: 'error', detail: 'Failed to read pending records' });
    if (manual) toast.error('リカバリに失敗しました', { autoClose: false });
    return;
  }

  if (records.length === 0) {
    debugReport(debugId, { status: 'done', detail: 'No pending records' });
    if (manual) toast.info('リカバリ対象のレコードがありません');
    return;
  }

  debugReport(debugId, { detail: `Found ${records.length} pending record(s)` });

  // Create an AbortController for this recovery session
  const abort = new AbortController();
  activeRecoveryAbort = abort;

  // Auto-timeout for the entire recovery session
  const timeoutId = setTimeout(() => abort.abort(), PROXY_RECOVERY_STREAM_TIMEOUT_MS);

  const { setChats } = useStore.getState();
  let recoveredCount = 0;
  let failedCount = 0;

  try {
    for (const record of records) {
      if (abort.signal.aborted) break;

      const { requestId, chatIndex, messageIndex, bufferedText } = record;

      // Re-read latest state each iteration to avoid overwriting prior recoveries
      const chats = useStore.getState().chats;
      if (!chats) return;

      const chat = findRecoverableChat(chats, chatIndex);
      if (!chat) {
        await deleteRequest(requestId);
        continue;
      }
      if (!hasRecoverableMessage(chat, messageIndex)) {
        await deleteRequest(requestId);
        continue;
      }

      const currentText = getCurrentMessageText(chat.messages[messageIndex]);

      // First: apply IndexedDB buffered text (fast, local)
      const bestText = bufferedText;
      if (shouldApplyRecoveredText(currentText, bestText)) {
        const updatedChats = cloneChatAtIndex(chats, chatIndex);
        const updatedMessages = updatedChats[chatIndex].messages;
        const oldMsg = updatedMessages[messageIndex];
        const newMsg = buildRecoveredMessage(oldMsg, bestText);
        updatedMessages[messageIndex] = newMsg;
        upsertActivePathMessage(
          updatedChats[chatIndex],
          messageIndex,
          newMsg,
          useStore.getState().contentStore
        );
        setChats(updatedChats);
      }

      // Determine if stream is stale (SW probably died)
      const effectiveStatus = resolveRecoveryStatus(record);
      if (effectiveStatus === 'streaming') {
        // Still actively streaming without proxy, don't notify yet
        continue;
      }

      // Second: try proxy recovery for interrupted/failed/streaming-with-proxy streams
      if (
        (effectiveStatus === 'interrupted' || effectiveStatus === 'failed' || effectiveStatus === 'streaming-with-proxy') &&
        record.proxySessionId
      ) {
        debugReport(debugId, { detail: `Proxy recovery for session ${record.proxySessionId.slice(0, 8)}…` });
        try {
          const proxyText = await tryProxyRecovery(
            record,
            getCurrentMessageText(
              useStore.getState().chats?.[chatIndex]?.messages[messageIndex]
            ),
            abort.signal
          );
          if (proxyText) {
            debugReport(debugId, { detail: `Proxy recovered ${proxyText.length} chars` });
            recoveredCount++;
            const latestChats = useStore.getState().chats;
            if (latestChats) {
              const updatedChats = cloneChatAtIndex(latestChats, chatIndex);
              const updatedMessages = updatedChats[chatIndex].messages;
              const oldMsg = updatedMessages[messageIndex];
              const newMsg = buildRecoveredMessage(oldMsg, proxyText);
              updatedMessages[messageIndex] = newMsg;
              upsertActivePathMessage(
                updatedChats[chatIndex],
                messageIndex,
                newMsg,
                useStore.getState().contentStore
              );
              setChats(updatedChats);
            }
          }
        } catch {
          debugReport(debugId, { detail: 'Proxy recovery failed, using IndexedDB data' });
          failedCount++;
        }
      }

      // Clear any generating sessions for this chat
      useStore.getState().removeSessionsForChat(
        useStore.getState().chats?.[chatIndex]?.id ?? ''
      );

      // Show toast
      showRecoveryToast(effectiveStatus);

      await deleteRequest(requestId);
    }
  } finally {
    clearTimeout(timeoutId);
    if (activeRecoveryAbort === abort) {
      activeRecoveryAbort = null;
    }
  }

  debugReport(debugId, { status: 'done', detail: `Processed ${records.length} record(s)` });

  if (manual) {
    if (recoveredCount > 0) {
      toast.success(`リカバリ成功: ${recoveredCount}件のメッセージを復元しました`);
    } else if (failedCount > 0) {
      toast.error('プロキシからのリカバリに失敗しました', { autoClose: false });
    }
  }
}
