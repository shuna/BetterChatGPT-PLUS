import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import useSubmit from '@hooks/useSubmit';

import PlusIcon from '@icon/PlusIcon';
import BranchIcon from '@icon/BranchIcon';
import EditIcon from '@icon/EditIcon';

import { Role, TextContentInterface } from '@type/chat';
import { generateDefaultChat } from '@constants/chat';
import { primeEditSession } from './MessageContent';

const NewMessageButton = React.memo(
  ({
    messageIndex,
    nodeId,
    role,
  }: {
    messageIndex: number;
    nodeId?: string;
    role?: Role;
  }) => {
    const { t } = useTranslation();
    const { handleSubmit } = useSubmit();
    const setChats = useStore((state) => state.setChats);
    const currentChatIndex = useStore((state) => state.currentChatIndex);
    const setCurrentChatIndex = useStore((state) => state.setCurrentChatIndex);
    const insertMessageAtIndex = useStore((state) => state.insertMessageAtIndex);
    const createBranch = useStore((state) => state.createBranch);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canBranch = !!nodeId && role === 'user';

    useEffect(() => {
      if (!isMenuOpen) return;

      const handlePointerDown = (event: MouseEvent) => {
        if (!containerRef.current?.contains(event.target as Node)) {
          setIsMenuOpen(false);
        }
      };

      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setIsMenuOpen(false);
        }
      };

      document.addEventListener('mousedown', handlePointerDown);
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('mousedown', handlePointerDown);
        document.removeEventListener('keydown', handleEscape);
      };
    }, [isMenuOpen]);

    const addChat = () => {
      const chats = useStore.getState().chats;
      if (chats) {
        const updatedChats = chats.slice();
        let titleIndex = 1;
        let title = `New Chat ${titleIndex}`;

        while (chats.some((chat) => chat.title === title)) {
          titleIndex += 1;
          title = `New Chat ${titleIndex}`;
        }

        updatedChats.unshift(generateDefaultChat(title));
        setChats(updatedChats);
        setCurrentChatIndex(0);
      }
    };

    const addMessage = () => {
      if (currentChatIndex === -1) {
        addChat();
      } else {
        insertMessageAtIndex(
          currentChatIndex,
          messageIndex + 1,
          'user',
          [{ type: 'text', text: '' } as TextContentInterface]
        );
      }
    };

    const handleBranchGenerate = async () => {
      if (!nodeId) return;
      createBranch(currentChatIndex, nodeId, undefined);
      setIsMenuOpen(false);
      await handleSubmit();
    };

    const handleBranchOnly = () => {
      if (!nodeId) return;
      const newNodeId = createBranch(currentChatIndex, nodeId, undefined);
      primeEditSession(currentChatIndex, messageIndex, newNodeId);
      setIsMenuOpen(false);
    };

    return (
      <div
        className='h-0 w-full relative z-10 flex justify-center'
        key={messageIndex}
        aria-label='insert message'
      >
        <div
          ref={containerRef}
          className='absolute top-0 translate-y-[-50%]'
        >
          <div className='relative flex items-center overflow-hidden rounded-full border border-gray-300 bg-gray-200 text-gray-600 shadow-sm dark:border-gray-500/70 dark:bg-gray-600/80 dark:text-white'>
            <button
              type='button'
              className='flex h-8 w-9 items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-800/80 transition-colors duration-200'
              onClick={addMessage}
              aria-label='insert message'
              title={t('insertMessage') as string}
            >
              <PlusIcon />
            </button>
            {nodeId && (
              <>
                <div className='h-5 w-px bg-gray-400/80 dark:bg-gray-400/60' />
                <button
                  type='button'
                  className={`flex h-8 w-7 items-center justify-center transition-colors duration-200 ${
                    canBranch
                      ? 'hover:bg-gray-300 dark:hover:bg-gray-800/80'
                      : 'cursor-not-allowed opacity-40'
                  }`}
                  onClick={() => canBranch && setIsMenuOpen((prev) => !prev)}
                  aria-haspopup='menu'
                  aria-expanded={isMenuOpen}
                  aria-label={t('branchActions') as string}
                  title={
                    canBranch
                      ? (t('branchActions') as string)
                      : (t('branchDisabledTooltip') as string)
                  }
                  disabled={!canBranch}
                >
                  <svg
                    xmlns='http://www.w3.org/2000/svg'
                    viewBox='0 0 20 20'
                    fill='currentColor'
                    className='h-3.5 w-3.5'
                  >
                    <path
                      fillRule='evenodd'
                      d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z'
                      clipRule='evenodd'
                    />
                  </svg>
                </button>
              </>
            )}
          </div>
          {isMenuOpen && canBranch && (
            <div
              role='menu'
              className='absolute left-9 top-[calc(100%+0.45rem)] z-30 w-max min-w-[11rem] overflow-hidden rounded-xl border border-black/10 bg-white/95 p-1 shadow-lg backdrop-blur dark:border-white/10 dark:bg-gray-800/95'
            >
              <button
                type='button'
                role='menuitem'
                className='flex w-full items-center justify-start gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700'
                onClick={handleBranchGenerate}
                title={t('branchGenerateTooltip') as string}
              >
                <BranchIcon />
                {t('branchGenerate')}
              </button>
              <button
                type='button'
                role='menuitem'
                className='flex w-full items-center justify-start gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700'
                onClick={handleBranchOnly}
                title={t('branchOnlyTooltip') as string}
              >
                <EditIcon />
                {t('branchOnly')}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
);

export default NewMessageButton;
