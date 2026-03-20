import { toast, type ToastOptions } from 'react-toastify';

import type { ChatInterface, MessageInterface, TextContentInterface } from '@type/chat';
import { isTextContent } from '@type/chat';
import type { StreamRecord } from '@utils/streamDb';

export type RecoveryStatus = Exclude<StreamRecord['status'], 'streaming'> | 'streaming-with-proxy';

const STREAM_STALE_THRESHOLD_MS = 30_000;

export const getCurrentMessageText = (message: MessageInterface | undefined): string => {
  const firstContent = message?.content[0];
  return isTextContent(firstContent) ? firstContent.text : '';
};

export const shouldApplyRecoveredText = (
  currentText: string,
  bufferedText: string
): boolean => bufferedText.length > currentText.length;

export const buildRecoveredMessage = (
  message: MessageInterface,
  bufferedText: string
): MessageInterface => {
  const firstContent = message.content[0];
  const recoveredContent: TextContentInterface = isTextContent(firstContent)
    ? { ...firstContent, text: bufferedText }
    : { type: 'text', text: bufferedText };

  return {
    ...message,
    content: [recoveredContent, ...message.content.slice(1)],
  };
};

export const resolveRecoveryStatus = (
  record: StreamRecord,
  now: number = Date.now()
): StreamRecord['status'] | 'streaming-with-proxy' => {
  if (record.status !== 'streaming') return record.status;
  // If proxy is configured, allow recovery even during active streaming
  if (record.proxySessionId) return 'streaming-with-proxy';
  return now - record.updatedAt > STREAM_STALE_THRESHOLD_MS
    ? 'interrupted'
    : 'streaming';
};

export const findRecoverableChat = (
  chats: ChatInterface[] | undefined,
  chatIndex: number
): ChatInterface | null => {
  if (!chats || chatIndex < 0 || chatIndex >= chats.length) return null;
  return chats[chatIndex];
};

export const hasRecoverableMessage = (
  chat: ChatInterface,
  messageIndex: number
): boolean => messageIndex >= 0 && messageIndex < chat.messages.length;

const RECOVERY_TOASTS: Record<
  RecoveryStatus,
  { message: string; options: ToastOptions; show: () => void }
> = {
  completed: {
    message: 'バックグラウンド中に応答が完了しました',
    options: { autoClose: 4000 },
    show: () => {
      toast.info('バックグラウンド中に応答が完了しました', { autoClose: 4000 });
    },
  },
  interrupted: {
    message: 'バックグラウンド中に応答が途切れました',
    options: { autoClose: 6000 },
    show: () => {
      toast.warning('バックグラウンド中に応答が途切れました', { autoClose: 6000 });
    },
  },
  failed: {
    message: 'バックグラウンド中に応答が途切れました',
    options: { autoClose: 6000 },
    show: () => {
      toast.warning('バックグラウンド中に応答が途切れました', { autoClose: 6000 });
    },
  },
  'streaming-with-proxy': {
    message: 'プロキシ経由でストリームを復元中…',
    options: { autoClose: 4000 },
    show: () => {
      toast.info('プロキシ経由でストリームを復元中…', { autoClose: 4000 });
    },
  },
};

export const showRecoveryToast = (status: RecoveryStatus) => {
  RECOVERY_TOASTS[status].show();
};
