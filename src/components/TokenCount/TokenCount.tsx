import React, { useEffect, useMemo, useRef, useState } from 'react';
import { throttle } from 'lodash';
import useStore from '@store/store';
import { shallow } from 'zustand/shallow';
import { useTranslation } from 'react-i18next';

import countTokens from '@utils/messageUtils';
import useTokenEncoder from '@hooks/useTokenEncoder';
import { filterOmittedMessages } from '@hooks/submitHelpers';
import { countImageInputs, calculateUsageCost } from '@utils/cost';
import {
  LIVE_TOKEN_RECOUNT_THROTTLE_MS,
  buildPromptCountCacheKey,
} from '@utils/liveTokenUsage';
import { isTextContent, type MessageInterface } from '@type/chat';
import { peekBufferedContent } from '@utils/streamingBuffer';
import type {
  PendingOpenRouterVerification,
  VerifiedStats,
} from '@store/openrouter-stats-slice';
import { buildVerifiedStatsKey } from '@utils/openrouterVerification';

type TokenCounts = {
  promptTokenCount: number;
  completionTokenCount: number;
  imageTokenCount: number;
};

const DISPLAY_REFRESH_MS = 180;
const tokenCountCache = new Map<string, TokenCounts>();

const TokenCount = React.memo(() => {
  const { t } = useTranslation();
  const currentChatId = useStore((state) => state.chats?.[state.currentChatIndex]?.id ?? '');
  const cachedCounts = tokenCountCache.get(currentChatId) ?? {
    promptTokenCount: 0,
    completionTokenCount: 0,
    imageTokenCount: 0,
  };
  const [{ promptTokenCount, completionTokenCount, imageTokenCount }, setTokenCounts] =
    useState<TokenCounts>({
      promptTokenCount: cachedCounts.promptTokenCount,
      completionTokenCount: cachedCounts.completionTokenCount,
      imageTokenCount: cachedCounts.imageTokenCount,
    });
  const [isDisplayRefreshing, setIsDisplayRefreshing] = useState(false);
  const encoderReady = useTokenEncoder();
  const generatingSession = useStore((state) => {
    const chatId = state.chats?.[state.currentChatIndex]?.id ?? '';
    return Object.values(state.generatingSessions).find((s) => s.chatId === chatId);
  });
  const currentChatIndex = useStore((state) => state.currentChatIndex);
  const messages = useStore(
    (state) => (state.chats?.[state.currentChatIndex]?.messages ?? []),
    shallow
  );
  // Subscribe to the actual omitted node map so any change triggers a recount
  const omittedNodes = useStore((state) => {
    const mapKey = String(state.currentChatIndex);
    return state.omittedNodeMaps[mapKey] ?? state.chats?.[state.currentChatIndex]?.omittedNodes ?? null;
  });

  const { model, providerId, modelSource } = useStore((state) =>
    state.chats?.[state.currentChatIndex]
      ? {
          model: state.chats[state.currentChatIndex].config.model,
          providerId: state.chats[state.currentChatIndex].config.providerId,
          modelSource: state.chats[state.currentChatIndex].config.modelSource,
        }
      : { model: '', providerId: undefined, modelSource: undefined as 'remote' | 'local' | undefined }
  );

  const favoriteModels = useStore((state) => state.favoriteModels) || [];
  const providerCustomModels = useStore((state) => state.providerCustomModels);
  const providerModelCache = useStore((state) => state.providerModelCache);

  // Look up verified stats for the last assistant message's node
  const {
    verifiedStats,
    pendingVerification,
  }: {
    verifiedStats?: VerifiedStats;
    pendingVerification?: PendingOpenRouterVerification;
  } = useStore((state) => {
    const chat = state.chats?.[state.currentChatIndex];
    if (!chat?.branchTree) {
      return { verifiedStats: undefined, pendingVerification: undefined };
    }
    const path = chat.branchTree.activePath;
    for (let i = path.length - 1; i >= 0; i--) {
      const node = chat.branchTree.nodes[path[i]];
      if (node?.role === 'assistant') {
        const key = buildVerifiedStatsKey(chat.id, node.id);
        return {
          verifiedStats: state.verifiedStats[key],
          pendingVerification: state.pendingVerifications[key],
        };
      }
    }
    return { verifiedStats: undefined, pendingVerification: undefined };
  });
  const latestInputRef = useRef({ messages, generatingSession, model, currentChatIndex, omittedNodes });
  const currentCountsRef = useRef<TokenCounts>({
    promptTokenCount,
    completionTokenCount,
    imageTokenCount,
  });
  const requestVersionRef = useRef(0);
  const throttledCountRef = useRef<ReturnType<typeof throttle> | null>(null);
  const mountedRef = useRef(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptCacheRef = useRef<{
    key: string;
    promptTokenCount: number;
    imageTokenCount: number;
  } | null>(null);

  const applyTokenCounts = (nextCounts: TokenCounts) => {
    const currentCounts = currentCountsRef.current;
    const hasChanged =
      currentCounts.promptTokenCount !== nextCounts.promptTokenCount ||
      currentCounts.completionTokenCount !== nextCounts.completionTokenCount ||
      currentCounts.imageTokenCount !== nextCounts.imageTokenCount;

    if (!hasChanged) return;

    currentCountsRef.current = nextCounts;
    if (currentChatId) {
      tokenCountCache.set(currentChatId, nextCounts);
    }
    setTokenCounts(nextCounts);
    setIsDisplayRefreshing(true);

    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setIsDisplayRefreshing(false);
      }
    }, DISPLAY_REFRESH_MS);
  };

  const countCurrentSnapshot = async (version: number) => {
    const snapshot = latestInputRef.current;
    let nextCounts: TokenCounts;
    if (snapshot.generatingSession) {
      const promptMessages = filterOmittedMessages(
        snapshot.messages.slice(0, snapshot.generatingSession.messageIndex),
        snapshot.currentChatIndex
      );
      const completionMessage = snapshot.messages[snapshot.generatingSession.messageIndex];
      const promptCacheKey = buildPromptCountCacheKey(
        snapshot.generatingSession.sessionId,
        snapshot.model,
        snapshot.generatingSession.messageIndex
      );
      let cachedPrompt = promptCacheRef.current;

      if (!cachedPrompt || cachedPrompt.key !== promptCacheKey) {
        const nextPromptTokenCount = await countTokens(promptMessages, snapshot.model);
        cachedPrompt = {
          key: promptCacheKey,
          promptTokenCount: nextPromptTokenCount,
          imageTokenCount: countImageInputs(promptMessages),
        };
        promptCacheRef.current = cachedPrompt;
      }

      // Read live streaming buffer content if available, since
      // chat.messages is only updated on the first chunk and becomes stale.
      const liveContent = peekBufferedContent(snapshot.generatingSession.targetNodeId);
      const liveCompletionMessage: MessageInterface | undefined = liveContent
        ? { role: 'assistant', content: liveContent }
        : completionMessage;

      const nextCompletionTokenCount =
        liveCompletionMessage && isTextContent(liveCompletionMessage.content[0])
          ? await countTokens([liveCompletionMessage], snapshot.model)
          : 0;

      nextCounts = {
        promptTokenCount: cachedPrompt.promptTokenCount,
        completionTokenCount: nextCompletionTokenCount,
        imageTokenCount: cachedPrompt.imageTokenCount,
      };
    } else {
      const filteredMessages = filterOmittedMessages(
        snapshot.messages,
        snapshot.currentChatIndex
      );
      const nextPromptTokenCount = await countTokens(filteredMessages, snapshot.model);
      nextCounts = {
        promptTokenCount: nextPromptTokenCount,
        completionTokenCount: 0,
        imageTokenCount: countImageInputs(filteredMessages),
      };
    }

    if (!mountedRef.current || version !== requestVersionRef.current) return;
    if (
      snapshot.messages.length === 0 &&
      (currentCountsRef.current.promptTokenCount > 0 ||
        currentCountsRef.current.completionTokenCount > 0 ||
        currentCountsRef.current.imageTokenCount > 0) &&
      nextCounts.promptTokenCount === 0 &&
      nextCounts.completionTokenCount === 0 &&
      nextCounts.imageTokenCount === 0
    ) {
      return;
    }
    applyTokenCounts(nextCounts);
  };

  const costDisplay = useMemo(() => {
    if (modelSource === 'local') {
      return t('free', { ns: 'main', defaultValue: 'Free' });
    }

    const result = calculateUsageCost(
      {
        promptTokens: promptTokenCount,
        completionTokens: completionTokenCount,
        imageTokens: imageTokenCount,
      },
      model,
      providerId
    );

    if (result.kind === 'unknown') {
      if (result.reason === 'model-not-registered') {
        return t('tokenCostModelNotRegistered', {
          defaultValue: 'cost unknown: model not registered',
        });
      }
      return t('tokenCostNoPricingData', {
        defaultValue: 'cost unknown: no pricing data',
      });
    }
    if (result.isFree) {
      return t('free', { ns: 'main', defaultValue: 'Free' });
    }
    const cost = result.cost.toPrecision(3);
    return `$${cost}`;
  }, [
    model,
    providerId,
    modelSource,
    promptTokenCount,
    completionTokenCount,
    imageTokenCount,
    favoriteModels,
    providerCustomModels,
    providerModelCache,
    t,
  ]);

  const isOpenRouter = providerId === 'openrouter';

  const verifiedDisplay = useMemo(() => {
    if (!isOpenRouter || !verifiedStats || generatingSession) return null;
    const cost = verifiedStats.totalCost;
    const costStr = cost === 0 ? 'Free' : `$${cost.toPrecision(3)}`;
    return t('verifiedStatsShort', {
      ns: 'main',
      defaultValue:
        'Actual: {{prompt}}+{{completion}} tokens, {{cost}}',
      prompt: verifiedStats.nativePromptTokens,
      completion: verifiedStats.nativeCompletionTokens,
      cost: costStr,
    });
  }, [isOpenRouter, verifiedStats, generatingSession, t]);

  const verificationStatusDisplay = useMemo(() => {
    if (!isOpenRouter || generatingSession || !pendingVerification) return null;
    if (pendingVerification.status === 'fetching') {
      return t('openrouterVerificationChecking', {
        ns: 'main',
        defaultValue: 'Checking...',
      });
    }
    if (pendingVerification.status === 'failed') {
      return t('openrouterVerificationFailed', {
        ns: 'main',
        defaultValue: 'Check failed',
      });
    }
    return t('openrouterVerificationPending', {
      ns: 'main',
      defaultValue: 'Waiting...',
    });
  }, [isOpenRouter, pendingVerification, generatingSession, t]);

  latestInputRef.current = { messages, generatingSession, model, currentChatIndex, omittedNodes };

  useEffect(() => {
    currentCountsRef.current = {
      promptTokenCount,
      completionTokenCount,
      imageTokenCount,
    };
  }, [promptTokenCount, completionTokenCount, imageTokenCount]);

  useEffect(() => {
    const nextCounts = tokenCountCache.get(currentChatId) ?? {
      promptTokenCount: 0,
      completionTokenCount: 0,
      imageTokenCount: 0,
    };
    currentCountsRef.current = nextCounts;
    setTokenCounts(nextCounts);
  }, [currentChatId]);

  useEffect(() => {
    mountedRef.current = true;
    throttledCountRef.current = throttle(
      () => {
        const version = requestVersionRef.current;
        void countCurrentSnapshot(version).finally(() => {
          // Always re-chain while generating — streaming buffer content
          // changes without triggering a store/messages update, so we
          // must poll.  The throttle wrapper limits the rate.
          if (
            mountedRef.current &&
            latestInputRef.current.generatingSession
          ) {
            throttledCountRef.current?.();
          }
        });
      },
      LIVE_TOKEN_RECOUNT_THROTTLE_MS,
      { leading: true, trailing: true }
    );

    return () => {
      mountedRef.current = false;
      throttledCountRef.current?.cancel();
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // countTokens returns a char-based estimate immediately when the
    // encoder is not yet ready, so no guard is needed here.  When
    // encoderReady flips to true the effect re-fires and recounts
    // with the real tokenizer.
    requestVersionRef.current += 1;

    if (generatingSession) {
      throttledCountRef.current?.();
      return;
    }

    throttledCountRef.current?.cancel();
    promptCacheRef.current = null;
    void countCurrentSnapshot(requestVersionRef.current);
  }, [messages, generatingSession, model, encoderReady, omittedNodes]);

  useEffect(() => {
    if (generatingSession) return;
    promptCacheRef.current = null;
  }, [generatingSession?.sessionId, model]);

  // Invalidate prompt cache when omission state changes mid-stream
  useEffect(() => {
    promptCacheRef.current = null;
  }, [omittedNodes]);

  return (
    <span
      className={`text-xs italic tabular-nums text-gray-900 transition-opacity duration-200 dark:text-gray-300 ${
        isDisplayRefreshing ? 'opacity-80' : 'opacity-100'
      }`}
    >
      {generatingSession
        ? imageTokenCount > 0
          ? t('liveTokenCountWithImages', {
              ns: 'main',
              defaultValue:
                'Input: {{prompt}} / Output: {{completion}} / Images: {{images}} ({{cost}})',
              prompt: promptTokenCount,
              completion: completionTokenCount,
              images: imageTokenCount,
              cost: costDisplay,
            })
          : t('liveTokenCount', {
              ns: 'main',
              defaultValue: 'Input: {{prompt}} / Output: {{completion}} ({{cost}})',
              prompt: promptTokenCount,
              completion: completionTokenCount,
              cost: costDisplay,
            })
        : imageTokenCount > 0
          ? t('tokenCountWithImages', {
              ns: 'main',
              defaultValue: 'Tokens: {{tokens}} / Images: {{images}} ({{cost}})',
              tokens: promptTokenCount,
              images: imageTokenCount,
              cost: costDisplay,
            })
          : `Tokens: ${promptTokenCount} (${costDisplay})`}
      {(verifiedDisplay || verificationStatusDisplay) && (
        <>
          {' / '}
          <span className={`not-italic ${verifiedDisplay ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
            {verifiedDisplay ?? verificationStatusDisplay}
          </span>
        </>
      )}
    </span>
  );
});

export default TokenCount;
