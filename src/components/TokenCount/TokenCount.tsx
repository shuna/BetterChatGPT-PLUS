import React, { useEffect, useMemo, useState } from 'react';
import useStore from '@store/store';
import { shallow } from 'zustand/shallow';
import { useTranslation } from 'react-i18next';

import countTokens from '@utils/messageUtils';
import useTokenEncoder from '@hooks/useTokenEncoder';
import { countImageInputs, calculateUsageCost } from '@utils/cost';
import { isTextContent } from '@type/chat';

const TokenCount = React.memo(() => {
  const { t } = useTranslation();
  const [promptTokenCount, setPromptTokenCount] = useState<number>(0);
  const [completionTokenCount, setCompletionTokenCount] = useState<number>(0);
  const [imageTokenCount, setImageTokenCount] = useState<number>(0);
  const encoderReady = useTokenEncoder();
  const generatingSession = useStore((state) => {
    const chatId = state.chats?.[state.currentChatIndex]?.id ?? '';
    return Object.values(state.generatingSessions).find((s) => s.chatId === chatId);
  });
  const messages = useStore(
    (state) =>
      state.chats ? state.chats[state.currentChatIndex].messages : [],
    shallow
  );

  const { model, providerId } = useStore((state) =>
    state.chats
      ? { model: state.chats[state.currentChatIndex].config.model, providerId: state.chats[state.currentChatIndex].config.providerId }
      : { model: '', providerId: undefined }
  );

  const favoriteModels = useStore((state) => state.favoriteModels) || [];
  const providerCustomModels = useStore((state) => state.providerCustomModels);
  const providerModelCache = useStore((state) => state.providerModelCache);

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
        return t('tokenCostModelNotRegistered', { defaultValue: 'cost unknown: model not registered' });
      }
      return t('tokenCostNoPricingData', { defaultValue: 'cost unknown: no pricing data' });
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

  useEffect(() => {
    let cancelled = false;
    const countLiveTokens = async () => {
      if (generatingSession) {
        const promptMessages = messages.slice(0, generatingSession.messageIndex);
        const completionMessage = messages[generatingSession.messageIndex];
        const hasTextCompletion =
          completionMessage && isTextContent(completionMessage.content[0]);

        const [newPromptTokens, newCompletionTokens] = await Promise.all([
          countTokens(promptMessages, model),
          hasTextCompletion ? countTokens([completionMessage], model) : Promise.resolve(0),
        ]);

        if (cancelled) return;
        setPromptTokenCount(newPromptTokens);
        setCompletionTokenCount(newCompletionTokens);
        setImageTokenCount(countImageInputs(promptMessages));
        return;
      }

      const newPromptTokens = await countTokens(messages, model);
      if (cancelled) return;
      setPromptTokenCount(newPromptTokens);
      setCompletionTokenCount(0);
      setImageTokenCount(countImageInputs(messages));
    };

    countLiveTokens();

    return () => {
      cancelled = true;
    };
  }, [messages, generatingSession, model, encoderReady]);

  return (
    <div className='absolute top-[-16px] right-0'>
      <div className='text-xs italic text-gray-900 dark:text-gray-300'>
        {generatingSession
          ? imageTokenCount > 0
            ? t('liveTokenCountWithImages', {
                ns: 'main',
                defaultValue: 'Input: {{prompt}} / Output: {{completion}} / Images: {{images}} ({{cost}})',
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
