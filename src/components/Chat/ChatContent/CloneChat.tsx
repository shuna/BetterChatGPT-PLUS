import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import PopupModal from '@components/PopupModal';

import { retainContent } from '@utils/contentStore';
import { deepCloneSingleChat } from '@utils/chatShallowClone';
import { prepareChatForExport } from '@utils/chatExport';

import TickIcon from '@icon/TickIcon';

const CloneChat = React.memo(() => {
  const { t } = useTranslation();

  const setChats = useStore((state) => state.setChats);
  const setCurrentChatIndex = useStore((state) => state.setCurrentChatIndex);

  const [cloned, setCloned] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [visibleBranchOnly, setVisibleBranchOnly] = useState<boolean>(false);

  const cloneChat = () => {
    const chats = useStore.getState().chats;

    if (chats) {
      const index = useStore.getState().currentChatIndex;
      let title = `Copy of ${chats[index].title}`;
      let i = 0;

      while (chats.some((chat) => chat.title === title)) {
        i += 1;
        title = `Copy ${i} of ${chats[index].title}`;
      }

      const sourceChat = visibleBranchOnly
        ? prepareChatForExport(chats[index], useStore.getState().contentStore, {
            visibleBranchOnly: true,
          }).chat
        : chats[index];

      // Deep-clone only the single chat being duplicated
      const clonedChat = deepCloneSingleChat(sourceChat);
      clonedChat.title = title;

      // Increment refCounts for all content hashes in the cloned tree
      const contentStore = { ...useStore.getState().contentStore };
      if (clonedChat.branchTree) {
        for (const node of Object.values(clonedChat.branchTree.nodes)) {
          retainContent(contentStore, node.contentHash);
        }
      }

      const updatedChats = chats.slice();
      updatedChats.unshift(clonedChat);

      setChats(updatedChats);
      useStore.setState({ contentStore });
      setCurrentChatIndex(0);
      setIsModalOpen(false);
      setCloned(true);

      window.setTimeout(() => {
        setCloned(false);
      }, 3000);
    }
  };

  return (
    <>
      <button
        className='btn btn-neutral flex gap-1'
        aria-label={t('cloneChat') as string}
        onClick={() => {
          setIsModalOpen(true);
        }}
      >
        {cloned ? (
          <>
            <TickIcon /> {t('cloned')}
          </>
        ) : (
          <>{t('cloneChat')}</>
        )}
      </button>
      {isModalOpen && (
        <PopupModal
          setIsModalOpen={setIsModalOpen}
          title={t('cloneChat') as string}
          handleConfirm={cloneChat}
        >
          <div className='p-6 border-b border-gray-200 dark:border-gray-600'>
            <label className='flex items-center gap-2 text-sm text-gray-900 dark:text-gray-300 cursor-pointer'>
              <input
                type='checkbox'
                checked={visibleBranchOnly}
                onChange={(e) => setVisibleBranchOnly(e.target.checked)}
                className='rounded'
              />
              {t('exportVisibleBranchOnly')}
            </label>
          </div>
        </PopupModal>
      )}
    </>
  );
});

export default CloneChat;
