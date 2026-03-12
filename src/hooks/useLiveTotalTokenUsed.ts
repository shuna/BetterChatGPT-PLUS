import { useEffect, useMemo, useState } from 'react';
import useStore from '@store/store';
import countTokens from '@utils/messageUtils';
import useTokenEncoder from '@hooks/useTokenEncoder';
import {
  buildTokenUsageKey,
  countImageInputs,
  mergeTotalTokenUsed,
} from '@utils/cost';
import type { TotalTokenUsed } from '@type/chat';
import { isTextContent } from '@type/chat';

const useLiveTotalTokenUsed = (): TotalTokenUsed => {
  const encoderReady = useTokenEncoder();
  const totalTokenUsed = useStore((state) => state.totalTokenUsed);
  const chats = useStore((state) => state.chats);
  const generatingSessions = useStore((state) => state.generatingSessions);
  const [liveTokenUsed, setLiveTokenUsed] = useState<TotalTokenUsed>({});

  useEffect(() => {
    let cancelled = false;

    const calculateLiveUsage = async () => {
      const sessions = Object.values(generatingSessions);
      if (!chats || sessions.length === 0) {
        if (!cancelled) setLiveTokenUsed({});
        return;
      }

      const chatMap = new Map(chats.map((chat) => [chat.id, chat]));
      const liveUsageEntries = await Promise.all(
        sessions.map(async (session) => {
          const chat = chatMap.get(session.chatId);
          if (!chat) return null;

          const completionMessage = chat.messages[session.messageIndex];
          if (!completionMessage) return null;

          const promptMessages = chat.messages.slice(0, session.messageIndex);
          const [promptTokens, completionTokens] = await Promise.all([
            countTokens(promptMessages, chat.config.model),
            isTextContent(completionMessage.content[0])
              ? countTokens([completionMessage], chat.config.model)
              : Promise.resolve(0),
          ]);

          return {
            key: buildTokenUsageKey(chat.config.model, chat.config.providerId),
            usage: {
              promptTokens,
              completionTokens,
              imageTokens: countImageInputs(promptMessages),
            },
          };
        })
      );

      if (cancelled) return;

      const nextLiveUsage = liveUsageEntries.reduce<TotalTokenUsed>((acc, entry) => {
        if (!entry) return acc;
        const current = acc[entry.key] ?? {
          promptTokens: 0,
          completionTokens: 0,
          imageTokens: 0,
        };

        acc[entry.key] = {
          promptTokens: current.promptTokens + entry.usage.promptTokens,
          completionTokens: current.completionTokens + entry.usage.completionTokens,
          imageTokens: current.imageTokens + entry.usage.imageTokens,
        };
        return acc;
      }, {});

      setLiveTokenUsed(nextLiveUsage);
    };

    calculateLiveUsage();

    return () => {
      cancelled = true;
    };
  }, [chats, generatingSessions, encoderReady]);

  return useMemo(
    () => mergeTotalTokenUsed(totalTokenUsed, liveTokenUsed),
    [totalTokenUsed, liveTokenUsed]
  );
};

export default useLiveTotalTokenUsed;
