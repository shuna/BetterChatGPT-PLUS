import { useEffect, useMemo, useRef, useState } from 'react';
import { throttle } from 'lodash';
import useStore from '@store/store';
import countTokens from '@utils/messageUtils';
import useTokenEncoder from '@hooks/useTokenEncoder';
import {
  buildTokenUsageKey,
  countImageInputs,
  mergeTotalTokenUsed,
} from '@utils/cost';
import {
  LIVE_TOKEN_RECOUNT_THROTTLE_MS,
  buildPromptCountCacheKey,
} from '@utils/liveTokenUsage';
import type { MessageInterface, TotalTokenUsed } from '@type/chat';
import { isTextContent } from '@type/chat';
import { peekBufferedContent } from '@utils/streamingBuffer';

const useLiveTotalTokenUsed = (): TotalTokenUsed => {
  const encoderReady = useTokenEncoder();
  const totalTokenUsed = useStore((state) => state.totalTokenUsed);
  const chats = useStore((state) => state.chats);
  const generatingSessions = useStore((state) => state.generatingSessions);
  const [liveTokenUsed, setLiveTokenUsed] = useState<TotalTokenUsed>({});
  const latestInputRef = useRef({ chats, generatingSessions });
  const requestVersionRef = useRef(0);
  const mountedRef = useRef(true);
  const throttledCalculationRef = useRef<ReturnType<typeof throttle> | null>(null);
  const promptCacheRef = useRef<
    Map<string, { promptTokens: number; imageTokens: number }>
  >(new Map());

  const calculateCurrentLiveUsage = async (version: number) => {
    const snapshot = latestInputRef.current;
    const sessions = Object.values(snapshot.generatingSessions);

    if (!snapshot.chats || sessions.length === 0) {
      if (mountedRef.current && version === requestVersionRef.current) {
        setLiveTokenUsed({});
      }
      return;
    }

    const activeCacheKeys = new Set<string>();
    const chatMap = new Map(snapshot.chats.map((chat) => [chat.id, chat]));
    const liveUsageEntries = await Promise.all(
      sessions.map(async (session) => {
        const chat = chatMap.get(session.chatId);
        if (!chat) return null;

        const completionMessage = chat.messages[session.messageIndex];
        if (!completionMessage) return null;

        const promptMessages = chat.messages.slice(0, session.messageIndex);
        const promptCacheKey = buildPromptCountCacheKey(
          session.sessionId,
          chat.config.model,
          session.messageIndex
        );
        activeCacheKeys.add(promptCacheKey);

        let cachedPrompt = promptCacheRef.current.get(promptCacheKey);
        if (!cachedPrompt) {
          const promptTokens = await countTokens(promptMessages, chat.config.model);
          cachedPrompt = {
            promptTokens,
            imageTokens: countImageInputs(promptMessages),
          };
          promptCacheRef.current.set(promptCacheKey, cachedPrompt);
        }

        // Read live streaming buffer content if available, since
        // chat.messages is only updated on the first chunk and becomes stale.
        const liveContent = peekBufferedContent(session.targetNodeId);
        const liveCompletionMessage: MessageInterface | undefined = liveContent
          ? { role: 'assistant', content: liveContent }
          : completionMessage;

        const completionTokens =
          liveCompletionMessage && isTextContent(liveCompletionMessage.content[0])
            ? await countTokens([liveCompletionMessage], chat.config.model)
            : 0;

        return {
          key: buildTokenUsageKey(chat.config.model, chat.config.providerId),
          usage: {
            promptTokens: cachedPrompt.promptTokens,
            completionTokens,
            imageTokens: cachedPrompt.imageTokens,
          },
        };
      })
    );

    if (!mountedRef.current || version !== requestVersionRef.current) return;

    promptCacheRef.current.forEach((_, cacheKey) => {
      if (!activeCacheKeys.has(cacheKey)) {
        promptCacheRef.current.delete(cacheKey);
      }
    });

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

  latestInputRef.current = { chats, generatingSessions };

  useEffect(() => {
    throttledCalculationRef.current = throttle(
      () => {
        const version = requestVersionRef.current;
        void calculateCurrentLiveUsage(version).finally(() => {
          // Always re-chain while generating — streaming buffer content
          // changes without triggering a store update, so we must poll.
          if (
            mountedRef.current &&
            Object.keys(latestInputRef.current.generatingSessions).length > 0
          ) {
            throttledCalculationRef.current?.();
          }
        });
      },
      LIVE_TOKEN_RECOUNT_THROTTLE_MS,
      { leading: true, trailing: true }
    );

    return () => {
      mountedRef.current = false;
      throttledCalculationRef.current?.cancel();
    };
  }, []);

  useEffect(() => {
    if (!encoderReady) return;

    requestVersionRef.current += 1;
    const sessions = Object.values(generatingSessions);

    if (!chats || sessions.length === 0) {
      throttledCalculationRef.current?.cancel();
      promptCacheRef.current.clear();
      setLiveTokenUsed({});
      return;
    }

    throttledCalculationRef.current?.();
  }, [chats, generatingSessions, encoderReady]);

  return useMemo(
    () => mergeTotalTokenUsed(totalTokenUsed, liveTokenUsed),
    [totalTokenUsed, liveTokenUsed]
  );
};

export default useLiveTotalTokenUsed;
