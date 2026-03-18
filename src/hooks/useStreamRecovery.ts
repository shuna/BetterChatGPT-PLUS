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

/** Try to recover additional text from the proxy's KV cache */
async function tryProxyRecovery(
  record: StreamRecord,
  currentText: string
): Promise<string | null> {
  const { proxyEndpoint, proxyAuthToken } = useStore.getState();
  if (!proxyEndpoint || !record.proxySessionId) return null;

  const config: ProxyConfig = {
    endpoint: proxyEndpoint.replace(/\/+$/, ''),
    authToken: proxyAuthToken || undefined,
  };

  const stream = await recoverFromProxy(
    config,
    record.proxySessionId,
    record.lastProxyEventId ?? 0
  );
  if (!stream) return null;

  // Read the recovery SSE stream and extract text
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let partial = '';
  let llmPartial = '';
  let recoveredText = record.bufferedText;

  try {
    while (true) {
      const { done, value } = await reader.read();
      const chunk = partial + decoder.decode(value, { stream: !done });
      const proxySse = parseProxySse(chunk, done);
      partial = proxySse.partial;

      for (const evt of proxySse.events) {
        if (evt.eventType === 'done' || evt.eventType === 'error' || evt.eventType === 'interrupted') {
          break;
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

      if (done) break;
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

  // ACK the proxy to free KV
  sendAck(config, record.proxySessionId);

  return recoveredText.length > currentText.length ? recoveredText : null;
}

async function recoverPending() {
  let records: StreamRecord[];
  try {
    records = await getAllPending();
  } catch {
    return;
  }

  if (records.length === 0) return;

  const { setChats } = useStore.getState();

  for (const record of records) {
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
    let bestText = bufferedText;
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
      // Still actively streaming, don't notify yet
      continue;
    }

    // Second: try proxy recovery for interrupted/failed streams
    if (
      (effectiveStatus === 'interrupted' || effectiveStatus === 'failed') &&
      record.proxySessionId
    ) {
      try {
        const proxyText = await tryProxyRecovery(
          record,
          getCurrentMessageText(
            useStore.getState().chats?.[chatIndex]?.messages[messageIndex]
          )
        );
        if (proxyText) {
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
        // Proxy recovery failed — use IndexedDB data
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
}
