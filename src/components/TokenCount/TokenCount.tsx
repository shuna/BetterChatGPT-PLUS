import React, { useEffect, useMemo, useState } from 'react';
import useStore from '@store/store';
import { shallow } from 'zustand/shallow';
import { useTranslation } from 'react-i18next';

import countTokens from '@utils/messageUtils';
import { isTextContent, isImageContent } from '@type/chat';

const TokenCount = React.memo(() => {
  const { t } = useTranslation();
  const [tokenCount, setTokenCount] = useState<number>(0);
  const [imageTokenCount, setImageTokenCount] = useState<number>(0);
  const generating = useStore((state) => state.generating);
  const messages = useStore(
    (state) =>
      state.chats ? state.chats[state.currentChatIndex].messages : [],
    shallow
  );

  const model = useStore((state) =>
    state.chats
      ? state.chats[state.currentChatIndex].config.model
      : ''
  );

  const favoriteModels = useStore((state) => state.favoriteModels) || [];

  const costDisplay = useMemo(() => {
    const fav = favoriteModels.find((f) => f.modelId === model);
    if (!fav) {
      return t('tokenCostModelNotRegistered', { defaultValue: 'cost unknown: model not registered' });
    }
    if (fav.promptPrice == null) {
      return t('tokenCostNoPricingData', { defaultValue: 'cost unknown: no pricing data' });
    }
    const promptCost = tokenCount * (fav.promptPrice / 1_000_000);
    const cost = promptCost.toPrecision(3);
    return `$${cost}`;
  }, [model, tokenCount, favoriteModels, t]);

  useEffect(() => {
    if (!generating) {
      const textPrompts = messages.filter(
        (e) => Array.isArray(e.content) && e.content.some(isTextContent)
      );
      const imgPrompts = messages.filter(
        (e) => Array.isArray(e.content) && e.content.some(isImageContent)
      );
      const newPromptTokens = countTokens(textPrompts, model);
      const newImageTokens = countTokens(imgPrompts, model);
      setTokenCount(newPromptTokens);
      setImageTokenCount(newImageTokens);
    }
  }, [messages, generating, model]);

  return (
    <div className='absolute top-[-16px] right-0'>
      <div className='text-xs italic text-gray-900 dark:text-gray-300'>
        Tokens: {tokenCount} ({costDisplay})
      </div>
    </div>
  );
});

export default TokenCount;
