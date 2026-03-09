import React, { useEffect, useMemo, useState } from 'react';
import useStore from '@store/store';
import { shallow } from 'zustand/shallow';
import { useTranslation } from 'react-i18next';

import countTokens from '@utils/messageUtils';
import useTokenEncoder from '@hooks/useTokenEncoder';
import { isTextContent, isImageContent } from '@type/chat';

const TokenCount = React.memo(() => {
  const { t } = useTranslation();
  const [tokenCount, setTokenCount] = useState<number>(0);
  const [imageTokenCount, setImageTokenCount] = useState<number>(0);
  const encoderReady = useTokenEncoder();
  const generating = useStore((state) => {
    const chatId = state.chats?.[state.currentChatIndex]?.id ?? '';
    return Object.values(state.generatingSessions).some((s) => s.chatId === chatId);
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

  const costDisplay = useMemo(() => {
    const fav = providerId
      ? favoriteModels.find((f) => f.modelId === model && f.providerId === providerId)
      : favoriteModels.find((f) => f.modelId === model);
    if (!fav) {
      return t('tokenCostModelNotRegistered', { defaultValue: 'cost unknown: model not registered' });
    }
    if (fav.promptPrice == null) {
      return t('tokenCostNoPricingData', { defaultValue: 'cost unknown: no pricing data' });
    }
    const promptCost = tokenCount * (fav.promptPrice / 1_000_000);
    const cost = promptCost.toPrecision(3);
    return `$${cost}`;
  }, [model, providerId, tokenCount, favoriteModels, t]);

  useEffect(() => {
    let cancelled = false;

    if (!generating) {
      const textPrompts = messages.filter(
        (e) => Array.isArray(e.content) && e.content.some(isTextContent)
      );
      const imgPrompts = messages.filter(
        (e) => Array.isArray(e.content) && e.content.some(isImageContent)
      );

      Promise.all([
        countTokens(textPrompts, model),
        countTokens(imgPrompts, model),
      ]).then(([newPromptTokens, newImageTokens]) => {
        if (cancelled) return;
        setTokenCount(newPromptTokens);
        setImageTokenCount(newImageTokens);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [messages, generating, model, encoderReady]);

  return (
    <div className='absolute top-[-16px] right-0'>
      <div className='text-xs italic text-gray-900 dark:text-gray-300'>
        Tokens: {tokenCount} ({costDisplay})
      </div>
    </div>
  );
});

export default TokenCount;
