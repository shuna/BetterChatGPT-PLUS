import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import TokenCount from '@components/TokenCount/TokenCount';
import useOpenRouterCreditBalance from '@hooks/useOpenRouterCreditBalance';
import { buildVerifiedStatsKey } from '@utils/openrouterVerification';
import type {
  PendingOpenRouterVerification,
  VerifiedStats,
} from '@store/openrouter-stats-slice';

const ChatStatusBar = React.memo(() => {
  const { t } = useTranslation();

  const currentChatId = useStore(
    (state) => state.chats?.[state.currentChatIndex]?.id ?? ''
  );
  const isGenerating = useStore((state) => {
    if (!currentChatId) return false;
    return Object.values(state.generatingSessions).some(
      (s) => s.chatId === currentChatId
    );
  });

  const providerId = useStore((state) =>
    state.chats?.[state.currentChatIndex]?.config?.providerId
  );
  const isOpenRouter = providerId === 'openrouter';

  const creditBalance = useStore((state) => state.creditBalance);
  const creditBalanceFetching = useStore((state) => state.creditBalanceFetching);
  useOpenRouterCreditBalance(isOpenRouter);

  // Verification state for retry button
  const {
    verifiedStats,
    pendingVerification,
    lastAssistantStatsKey,
  }: {
    verifiedStats?: VerifiedStats;
    pendingVerification?: PendingOpenRouterVerification;
    lastAssistantStatsKey: string | null;
  } = useStore((state) => {
    const chat = state.chats?.[state.currentChatIndex];
    if (!chat?.branchTree) {
      return {
        verifiedStats: undefined,
        pendingVerification: undefined,
        lastAssistantStatsKey: null,
      };
    }
    const path = chat.branchTree.activePath;
    for (let i = path.length - 1; i >= 0; i--) {
      const node = chat.branchTree.nodes[path[i]];
      if (node?.role === 'assistant') {
        const key = buildVerifiedStatsKey(chat.id, node.id);
        return {
          verifiedStats: state.verifiedStats[key],
          pendingVerification: state.pendingVerifications[key],
          lastAssistantStatsKey: key,
        };
      }
    }
    return {
      verifiedStats: undefined,
      pendingVerification: undefined,
      lastAssistantStatsKey: null,
    };
  });

  const showRetryButton =
    !isGenerating &&
    !!lastAssistantStatsKey &&
    !verifiedStats &&
    !!pendingVerification;

  const handleRetryVerifiedStats = () => {
    if (!lastAssistantStatsKey) return;
    if (pendingVerification) {
      useStore.getState().retryVerificationNow(lastAssistantStatsKey);
      return;
    }
    if (!verifiedStats) return;
    const separatorIndex = lastAssistantStatsKey.indexOf(':::');
    if (separatorIndex < 0) return;
    const chatId = lastAssistantStatsKey.slice(0, separatorIndex);
    const targetNodeId = lastAssistantStatsKey.slice(separatorIndex + 3);
    useStore.getState().queueVerification(lastAssistantStatsKey, {
      generationId: verifiedStats.generationId,
      chatId,
      targetNodeId,
      nextAttemptAt: Date.now(),
    });
  };

  const creditDisplay = useMemo(() => {
    if (!isOpenRouter) return null;
    if (!creditBalance) {
      if (creditBalanceFetching) return '...';
      return null;
    }

    const remaining = Math.max(0, creditBalance.totalCredits - creditBalance.totalUsage);
    return t('openrouterCreditRemaining', {
      ns: 'main',
      defaultValue: 'Remaining: ${{remaining}}',
      remaining: remaining.toFixed(2),
    });
  }, [isOpenRouter, creditBalance, creditBalanceFetching, t]);

  return (
    <div className='border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1 text-xs'>
      {/* Row 1: Token info (centered) + retry/stop buttons (right) */}
      <div className='relative flex items-center justify-center min-h-[20px]'>
        <span className='truncate max-w-[calc(100%-3rem)]'>
          <TokenCount />
        </span>
        {showRetryButton && (
          <button
            className='absolute right-0 top-1/2 -translate-y-1/2 rounded p-0.5 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
            onClick={handleRetryVerifiedStats}
            type='button'
            title={t('retry') as string}
          >
            <svg
              className='h-3 w-3'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
              strokeWidth={2}
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
              />
            </svg>
          </button>
        )}
      </div>

      {/* Row 2: Credit balance (OpenRouter only, centered) + refresh button (right) */}
      {isOpenRouter && creditDisplay && (
        <div className='flex items-center justify-center min-h-[20px]'>
          <span className='truncate tabular-nums text-gray-600 dark:text-gray-400'>
            {creditDisplay}
          </span>
        </div>
      )}
    </div>
  );
});

export default ChatStatusBar;
