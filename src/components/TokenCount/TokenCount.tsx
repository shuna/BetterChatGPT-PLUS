import React, { useEffect, useMemo, useRef, useState } from 'react';
import { throttle } from 'lodash';
import useStore from '@store/store';
import { shallow } from 'zustand/shallow';
import { useTranslation } from 'react-i18next';

import countTokens from '@utils/messageUtils';
import useTokenEncoder from '@hooks/useTokenEncoder';
import { countImageInputs, calculateUsageCost } from '@utils/cost';
import {
  LIVE_TOKEN_RECOUNT_THROTTLE_MS,
  buildPromptCountCacheKey,
} from '@utils/liveTokenUsage';
import { isTextContent } from '@type/chat';

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
  const messages = useStore(
    (state) => (state.chats ? state.chats[state.currentChatIndex].messages : []),
    shallow
  );

  const { model, providerId } = useStore((state) =>
    state.chats
      ? {
          model: state.chats[state.currentChatIndex].config.model,
          providerId: state.chats[state.currentChatIndex].config.providerId,
        }
      : { model: '', providerId: undefined }
  );

  const favoriteModels = useStore((state) => state.favoriteModels) || [];
  const providerCustomModels = useStore((state) => state.providerCustomModels);
  const providerModelCache = useStore((state) => state.providerModelCache);
  const latestInputRef = useRef({ messages, generatingSession, model });
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
      const promptMessages = snapshot.messages.slice(
        0,
        snapshot.generatingSession.messageIndex
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

      const nextCompletionTokenCount =
        completionMessage && isTextContent(completionMessage.content[0])
          ? await countTokens([completionMessage], snapshot.model)
          : 0;

      nextCounts = {
        promptTokenCount: cachedPrompt.promptTokenCount,
        completionTokenCount: nextCompletionTokenCount,
        imageTokenCount: cachedPrompt.imageTokenCount,
      };
    } else {
      const nextPromptTokenCount = await countTokens(snapshot.messages, snapshot.model);
      nextCounts = {
        promptTokenCount: nextPromptTokenCount,
        completionTokenCount: 0,
        imageTokenCount: countImageInputs(snapshot.messages),
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
    promptTokenCount,
    completionTokenCount,
    imageTokenCount,
    favoriteModels,
    providerCustomModels,
    providerModelCache,
    t,
  ]);

  latestInputRef.current = { messages, generatingSession, model };

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
    throttledCountRef.current = throttle(
      () => {
        const version = requestVersionRef.current;
        void countCurrentSnapshot(version).finally(() => {
          if (
            mountedRef.current &&
            version !== requestVersionRef.current &&
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
    if (!encoderReady) return;

    requestVersionRef.current += 1;

    if (generatingSession) {
      throttledCountRef.current?.();
      return;
    }

    throttledCountRef.current?.cancel();
    promptCacheRef.current = null;
    void countCurrentSnapshot(requestVersionRef.current);
  }, [messages, generatingSession, model, encoderReady]);

  useEffect(() => {
    if (generatingSession) return;
    promptCacheRef.current = null;
  }, [generatingSession?.sessionId, model]);

  return (
    <div className='absolute top-[-16px] right-0'>
      <div
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
      </div>
    </div>
  );
});

export default TokenCount;
