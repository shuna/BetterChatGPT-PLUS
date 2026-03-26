import React from 'react';

import useStore from '@store/store';
import PlusIcon from '@icon/PlusIcon';
import MenuIcon from '@icon/MenuIcon';
import SearchIcon from '@icon/SearchIcon';
import useAddChat from '@hooks/useAddChat';

interface MobileBarProps {
  onSearchOpen?: () => void;
  extraButtons?: React.ReactNode;
}

const MobileBar = ({ onSearchOpen, extraButtons }: MobileBarProps) => {
  const setHideSideMenu = useStore((state) => state.setHideSideMenu);
  const chatTitle = useStore((state) =>
    state.chats &&
    state.chats.length > 0 &&
    state.currentChatIndex >= 0 &&
    state.currentChatIndex < state.chats.length
      ? state.chats[state.currentChatIndex].title
      : 'New Chat'
  );

  const currentChatId = useStore((state) =>
    state.chats &&
    state.chats.length > 0 &&
    state.currentChatIndex >= 0 &&
    state.currentChatIndex < state.chats.length
      ? state.chats[state.currentChatIndex].id
      : ''
  );

  const isCurrentChatGenerating = useStore((state) =>
    Object.values(state.generatingSessions).some((s) => s.chatId === currentChatId)
  );

  const isProxyMode = useStore((state) => state.proxyEnabled && !!state.proxyEndpoint);

  const addChat = useAddChat();

  return (
    <div className='sticky top-0 left-0 w-full z-50 flex items-center border-b border-gray-200 dark:border-white/20 bg-white dark:bg-gray-800 pl-1 pt-1 text-gray-700 dark:text-gray-200 sm:pl-3 md:hidden'>
      <button
        type='button'
        className='ml-1 -mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-md hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white dark:hover:text-white'
        onClick={() => {
          setHideSideMenu(false);
        }}
        aria-label='open sidebar'
      >
        <span className='sr-only'>Open sidebar</span>
        <MenuIcon />
      </button>
      {extraButtons}
      <h1 className='flex-1 text-center text-base font-normal px-2 truncate min-w-0'>
        {chatTitle}
      </h1>
      {onSearchOpen && (
        <button
          type='button'
          className='px-2 text-gray-400 cursor-pointer hover:text-gray-600 dark:hover:text-gray-200'
          onClick={onSearchOpen}
          aria-label='ページ内検索'
        >
          <SearchIcon className='h-5 w-5' />
        </button>
      )}
      {isCurrentChatGenerating && (
        <div className='flex shrink-0 items-center gap-1.5 mr-1'>
          <span
            className={`inline-block h-2 w-2 rounded-full animate-pulse ${
              isProxyMode
                ? 'bg-indigo-400 dark:bg-indigo-400'
                : 'bg-green-400 dark:bg-green-400'
            }`}
          />
          <span className='text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap'>
            {isProxyMode ? 'proxy' : ''}
          </span>
        </div>
      )}
      <button
        type='button'
        className='mr-1 px-3 text-gray-400 cursor-pointer opacity-100'
        onClick={() => {
          addChat();
        }}
        aria-label='new chat'
      >
        <PlusIcon className='h-6 w-6' />
      </button>
    </div>
  );
};

export default MobileBar;
