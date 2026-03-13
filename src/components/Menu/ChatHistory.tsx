import React, { useEffect, useRef, useState } from 'react';

import useInitialiseNewChat from '@hooks/useInitialiseNewChat';

import ChatIcon from '@icon/ChatIcon';
import CrossIcon from '@icon/CrossIcon';
import DeleteIcon from '@icon/DeleteIcon';
import EditIcon from '@icon/EditIcon';
import CloneIcon from '@icon/CloneIcon';
import TickIcon from '@icon/TickIcon';
import useStore from '@store/store';
import { formatNumber } from '@utils/chat';
import { retainContent, releaseContent } from '@utils/contentStore';
import { cloneChatAtIndex, deepCloneSingleChat } from '@utils/chatShallowClone';
import { stopSessionsForChat } from '@hooks/useSubmit';
import { BranchNode } from '@type/chat';

const ChatHistoryClass = {
  normal:
    'group relative flex items-center gap-3 break-all rounded-md bg-gray-50 px-2 py-2 text-gray-700 transition-opacity hover:bg-gray-100 hover:pr-4 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-850',
  active:
    'group relative flex items-center gap-3 break-all rounded-md bg-gray-200 px-2 py-2 pr-14 text-gray-800 transition-opacity hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-800',
  normalGradient:
    'absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-gray-50 group-hover:from-gray-100 dark:from-gray-900 dark:group-hover:from-gray-850',
  activeGradient:
    'absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-gray-200 dark:from-gray-800',
};

const ChatHistory = React.memo(
  ({
    title,
    chatIndex,
    chatSize,
    selectedChats,
    setSelectedChats,
    lastSelectedIndex,
    setLastSelectedIndex,
  }: {
    title: string;
    chatIndex: number;
    chatSize?: number;
    selectedChats: number[];
    setSelectedChats: (indices: number[]) => void;
    lastSelectedIndex: number | null;
    setLastSelectedIndex: (index: number) => void;
  }) => {
    const initialiseNewChat = useInitialiseNewChat();
    const setCurrentChatIndex = useStore((state) => state.setCurrentChatIndex);
    const setChats = useStore((state) => state.setChats);
    const active = useStore((state) => state.currentChatIndex === chatIndex);

    const chatId = useStore((state) => state.chats?.[chatIndex]?.id ?? '');
    const isThisChatGenerating = useStore((state) =>
      Object.values(state.generatingSessions).some((s) => s.chatId === chatId)
    );

    const [isDelete, setIsDelete] = useState<boolean>(false);
    const [isEdit, setIsEdit] = useState<boolean>(false);
    const [_title, _setTitle] = useState<string>(title);
    const inputRef = useRef<HTMLInputElement>(null);

    const editTitle = () => {
      const chats = useStore.getState().chats;
      if (!chats) return;
      const updatedChats = cloneChatAtIndex(chats, chatIndex);
      updatedChats[chatIndex].title = _title;
      setChats(updatedChats);
      setIsEdit(false);
    };

    const deleteChat = () => {
      const chats = useStore.getState().chats;
      if (!chats) return;
      const updatedChats = chats.slice();
      const indicesToDelete =
        selectedChats.length > 0 ? selectedChats : [chatIndex];

      const contentStore = { ...useStore.getState().contentStore };
      indicesToDelete.forEach((index) => {
        const chat = chats?.[index];
        if (chat?.branchTree) {
          for (const node of Object.values(chat.branchTree.nodes)) {
            releaseContent(contentStore, node.contentHash);
          }
        }
      });

      indicesToDelete
        .sort((a, b) => b - a)
        .forEach((index) => {
          updatedChats.splice(index, 1);
        });
      if (updatedChats.length > 0) {
        setCurrentChatIndex(0);
        setChats(updatedChats);
        useStore.setState({ contentStore });
      } else {
        initialiseNewChat();
      }
      setIsDelete(false);
      setSelectedChats([]);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        editTitle();
      }
    };

    const handleTick = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (isEdit) editTitle();
      else if (isDelete) deleteChat();
    };

    const handleCross = () => {
      setIsDelete(false);
      setIsEdit(false);
    };

    const handleDragStart = (e: React.DragEvent<HTMLAnchorElement>) => {
      if (isEdit) {
        e.preventDefault();
        return;
      }
      if (e.dataTransfer) {
        const chatIndices =
          selectedChats.length > 0 ? selectedChats : [chatIndex];
        e.dataTransfer.setData('chatIndices', JSON.stringify(chatIndices));
      }
    };

    const handleCheckboxClick = (e: React.MouseEvent<HTMLInputElement>) => {
      if (e.shiftKey && lastSelectedIndex !== null) {
        const start = Math.min(lastSelectedIndex, chatIndex);
        const end = Math.max(lastSelectedIndex, chatIndex);
        const newSelectedChats = [...selectedChats];
        for (let i = start; i <= end; i++) {
          if (!newSelectedChats.includes(i)) {
            newSelectedChats.push(i);
          }
        }
        setSelectedChats(newSelectedChats);
      } else {
        if (selectedChats.includes(chatIndex)) {
          setSelectedChats(
            selectedChats.filter((index) => index !== chatIndex)
          );
        } else {
          setSelectedChats([...selectedChats, chatIndex]);
        }
        setLastSelectedIndex(chatIndex);
      }
    };

    const handleClone = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const chats = useStore.getState().chats;
      if (chats) {
        const index = chatIndex;
        let title = `Copy of ${chats[index].title}`;
        let i = 0;
        while (chats.some((chat: { title: string }) => chat.title === title)) {
          i += 1;
          title = `Copy ${i} of ${chats[index].title}`;
        }

        const clonedChat = deepCloneSingleChat(chats[index]);
        clonedChat.title = title;

        const contentStore = { ...useStore.getState().contentStore };
        if (clonedChat.branchTree) {
          for (const node of Object.values(clonedChat.branchTree.nodes) as BranchNode[]) {
            retainContent(contentStore, node.contentHash);
          }
        }

        const updatedChats = chats.slice();
        updatedChats.unshift(clonedChat);

        setChats(updatedChats);
        useStore.setState({ contentStore });
        setCurrentChatIndex(0);
      }
    };

    const handleStopGeneration = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (chatId) stopSessionsForChat(chatId);
    };

    useEffect(() => {
      if (inputRef && inputRef.current) inputRef.current.focus();
    }, [isEdit]);

    return (
      <a
        className={`${
          active ? ChatHistoryClass.active : ChatHistoryClass.normal
        } cursor-pointer opacity-100 ${selectedChats.includes(chatIndex) ? 'bg-blue-500' : ''}`}
        onClick={() => {
          if (!active) setCurrentChatIndex(chatIndex);
        }}
        draggable={!isEdit}
        onDragStart={handleDragStart}
      >
        <input
          type='checkbox'
          checked={selectedChats.includes(chatIndex)}
          onClick={handleCheckboxClick}
          onChange={() => {}}
        />
        {isThisChatGenerating ? (
          <button
            className='p-0.5 hover:text-red-400 text-green-400 flex-shrink-0'
            onClick={handleStopGeneration}
            aria-label='stop generation'
            title='Stop generation'
          >
            <svg
              className='h-4 w-4 animate-spin'
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeWidth='2'
            >
              <circle cx='12' cy='12' r='10' strokeDasharray='60' strokeDashoffset='15' />
            </svg>
          </button>
        ) : (
          <ChatIcon />
        )}
        <div
          className='flex-1 text-ellipsis max-h-5 overflow-hidden break-all relative'
          title={`${title}${chatSize ? ` (${formatNumber(chatSize)})` : ''}`}
        >
          {isEdit ? (
            <input
              type='text'
              className='focus:outline-blue-600 text-sm border-none bg-transparent p-0 m-0 w-full'
              value={_title}
              onChange={(e) => {
                _setTitle(e.target.value);
              }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={handleKeyDown}
              ref={inputRef}
            />
          ) : (
            `${title}${chatSize ? ` (${formatNumber(chatSize)})` : ''}`
          )}

          {isEdit || (
            <div
              className={
                active
                  ? ChatHistoryClass.activeGradient
                  : ChatHistoryClass.normalGradient
              }
            />
          )}
        </div>
        {active && (
          <div className='visible absolute right-1 z-10 flex text-gray-500 dark:text-gray-300'>
            {isDelete || isEdit ? (
              <>
                <button
                  className='p-1 hover:text-gray-900 dark:hover:text-white'
                  onClick={handleTick}
                  aria-label='confirm'
                >
                  <TickIcon />
                </button>
                <button
                  className='p-1 hover:text-gray-900 dark:hover:text-white'
                  onClick={handleCross}
                  aria-label='cancel'
                >
                  <CrossIcon />
                </button>
              </>
            ) : (
              <>
                <button
                  className='p-1 hover:text-gray-900 dark:hover:text-white'
                  onClick={() => setIsEdit(true)}
                  aria-label='edit chat title'
                >
                  <EditIcon />
                </button>
                <button
                  className='p-1 hover:text-gray-900 dark:hover:text-white'
                  onClick={handleClone}
                  aria-label='clone chat'
                >
                  <CloneIcon />
                </button>
                <button
                  className='p-1 hover:text-gray-900 dark:hover:text-white'
                  onClick={() => setIsDelete(true)}
                  aria-label='delete chat'
                >
                  <DeleteIcon />
                </button>
              </>
            )}
          </div>
        )}
      </a>
    );
  }
);

export default ChatHistory;
