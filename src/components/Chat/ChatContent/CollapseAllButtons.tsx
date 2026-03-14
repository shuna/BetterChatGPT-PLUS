import React from 'react';
import useStore from '@store/store';

const CollapseAllButtons = React.memo(() => {
  const currentChatIndex = useStore((state) => state.currentChatIndex);
  const setAllCollapsed = useStore((state) => state.setAllCollapsed);
  const { hasMessages, orphanCount, focusOrphanNode } = useStore((state) => {
    const chat =
      state.chats &&
      state.chats.length > 0 &&
      state.currentChatIndex >= 0 &&
      state.currentChatIndex < state.chats.length
        ? state.chats[state.currentChatIndex]
        : undefined;
    const activePath = new Set(chat?.branchTree?.activePath ?? []);
    const orphanSessions = Object.values(state.generatingSessions)
      .filter((session) => session.chatId === chat?.id && !activePath.has(session.targetNodeId))
      .sort((left, right) => right.startedAt - left.startedAt);

    return {
      hasMessages: !!chat && chat.messages.length > 0,
      orphanCount: orphanSessions.length,
      focusOrphanNode: orphanSessions[0]?.targetNodeId ?? null,
    };
  });

  if (!hasMessages) return null;

  const btnClass =
    'cursor-pointer rounded-full border border-gray-200 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-white/10 dark:text-gray-200 p-1.5 hover:bg-gray-200 dark:hover:bg-white/20 transition-colors';
  const orphanLabel = orphanCount > 9 ? '9+' : String(orphanCount);

  return (
    <div className='absolute left-6 bottom-[84px] z-10 flex flex-col gap-1.5'>
      {orphanCount > 0 && (
        <button
          className={`${btnClass} relative overflow-hidden`}
          aria-label='Show orphan nodes in branch editor'
          title='Show orphan nodes'
          onClick={() => {
            if (!focusOrphanNode) return;
            const state = useStore.getState();
            state.ensureBranchTree(currentChatIndex);
            state.setBranchEditorFocusNodeId(focusOrphanNode);
            state.navigateToBranchEditor();
          }}
        >
          <span className='flex h-4 w-4 items-center justify-center text-[11px] font-semibold leading-none'>
            {orphanLabel}
          </span>
        </button>
      )}
      <button
        className={btnClass}
        aria-label='Collapse all messages'
        title='Collapse all'
        onClick={() => setAllCollapsed(currentChatIndex, true)}
      >
        <svg
          stroke='currentColor'
          fill='none'
          strokeWidth='2'
          viewBox='0 0 24 24'
          strokeLinecap='round'
          strokeLinejoin='round'
          className='h-4 w-4'
        >
          <polyline points='4 14 10 14 10 20' />
          <polyline points='20 10 14 10 14 4' />
          <line x1='14' y1='10' x2='21' y2='3' />
          <line x1='3' y1='21' x2='10' y2='14' />
        </svg>
      </button>
      <button
        className={btnClass}
        aria-label='Expand all messages'
        title='Expand all'
        onClick={() => setAllCollapsed(currentChatIndex, false)}
      >
        <svg
          stroke='currentColor'
          fill='none'
          strokeWidth='2'
          viewBox='0 0 24 24'
          strokeLinecap='round'
          strokeLinejoin='round'
          className='h-4 w-4'
        >
          <polyline points='15 3 21 3 21 9' />
          <polyline points='9 21 3 21 3 15' />
          <line x1='21' y1='3' x2='14' y2='10' />
          <line x1='3' y1='21' x2='10' y2='14' />
        </svg>
      </button>
    </div>
  );
});

export default CollapseAllButtons;
