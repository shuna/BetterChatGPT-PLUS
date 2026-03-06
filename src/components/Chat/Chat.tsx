import React from 'react';
import useStore from '@store/store';

import ChatContent from './ChatContent';
import MobileBar from '../MobileBar';
import StopGeneratingButton from '@components/StopGeneratingButton/StopGeneratingButton';
import ChatViewTabs from './ChatViewTabs';
import BranchEditorView from '@components/BranchEditor/BranchEditorView';

const Chat = () => {
  const hideSideMenu = useStore((state) => state.hideSideMenu);
  const menuWidth = useStore((state) => state.menuWidth);
  const activeView = useStore((state) => state.chatActiveView);
  const setActiveView = useStore((state) => state.setChatActiveView);

  return (
    <div
      className={`flex h-full flex-1 flex-col`}
      style={{ paddingLeft: hideSideMenu ? '0' : `${menuWidth}px` }}
    >
      <MobileBar />
      <main className='relative h-full w-full transition-width flex flex-col overflow-hidden items-stretch flex-1'>
        <ChatViewTabs activeView={activeView} setActiveView={setActiveView} />
        <div className={activeView === 'chat' ? 'flex flex-col flex-1 overflow-hidden' : 'hidden'}>
          <ChatContent />
          <StopGeneratingButton />
        </div>
        <div className={activeView === 'branch-editor' ? 'flex flex-col flex-1 overflow-hidden' : 'hidden'}>
          <BranchEditorView />
        </div>
      </main>
    </div>
  );
};

export default Chat;
