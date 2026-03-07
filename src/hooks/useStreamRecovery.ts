import { useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import useStore from '@store/store';
import { TextContentInterface } from '@type/chat';
import { getAllPending, deleteRequest, StreamRecord } from '@utils/streamDb';
import { upsertActivePathMessage } from '@utils/branchUtils';
import { cloneChatAtIndex } from '@utils/chatShallowClone';
import { register } from '@utils/swBridge';

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
    window.addEventListener('pageshow', () => {
      if (hiddenAtRef.current) {
        hiddenAtRef.current = null;
        recoverPending();
      }
    });

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
}

async function recoverPending() {
  let records: StreamRecord[];
  try {
    records = await getAllPending();
  } catch {
    return;
  }

  if (records.length === 0) return;

  const { setChats, setGenerating } = useStore.getState();

  for (const record of records) {
    const { requestId, chatIndex, messageIndex, bufferedText, status } = record;

    // Re-read latest state each iteration to avoid overwriting prior recoveries
    const chats = useStore.getState().chats;
    if (!chats) return;

    // Validate indices
    if (chatIndex < 0 || chatIndex >= chats.length) {
      await deleteRequest(requestId);
      continue;
    }
    const messages = chats[chatIndex].messages;
    if (messageIndex < 0 || messageIndex >= messages.length) {
      await deleteRequest(requestId);
      continue;
    }

    const currentText =
      (messages[messageIndex].content[0] as TextContentInterface)?.text ?? '';

    // Only apply if SW captured more text than what's currently displayed
    if (bufferedText.length > currentText.length) {
      const updatedChats = cloneChatAtIndex(chats, chatIndex);
      const updatedMessages = updatedChats[chatIndex].messages;
      const oldMsg = updatedMessages[messageIndex];
      const newContent0 = {
        ...(oldMsg.content[0] as TextContentInterface),
        text: bufferedText,
      };
      const newMsg = {
        ...oldMsg,
        content: [newContent0, ...oldMsg.content.slice(1)],
      };
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
    let effectiveStatus = status;
    if (status === 'streaming') {
      const staleSec = (Date.now() - record.updatedAt) / 1000;
      if (staleSec > 30) {
        effectiveStatus = 'interrupted';
      } else {
        // Still actively streaming, don't notify yet
        continue;
      }
    }

    // Stop generating state
    if (effectiveStatus !== 'streaming') {
      setGenerating(false);
    }

    // Show toast
    if (effectiveStatus === 'completed') {
      toast.info('バックグラウンド中に応答が完了しました', { autoClose: 4000 });
    } else if (effectiveStatus === 'interrupted' || effectiveStatus === 'failed') {
      toast.warning('バックグラウンド中に応答が途切れました', { autoClose: 6000 });
    }

    await deleteRequest(requestId);
  }
}
