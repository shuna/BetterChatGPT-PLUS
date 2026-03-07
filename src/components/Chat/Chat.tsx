import React, { Suspense } from 'react';
import useStore from '@store/store';

import ChatContent from './ChatContent';
import MobileBar from '../MobileBar';
import StopGeneratingButton from '@components/StopGeneratingButton/StopGeneratingButton';
import ChatViewTabs from './ChatViewTabs';

const BranchEditorView = React.lazy(
  () => import('@components/BranchEditor/BranchEditorView')
);

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
        {activeView === 'branch-editor' && (
          <div className='flex flex-col flex-1 overflow-hidden'>
            <Suspense fallback={<div className='flex items-center justify-center flex-1'><div className='animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500'></div></div>}>
              <BranchEditorView />
            </Suspense>
          </div>
        )}
      </main>
    </div>
  );
};

export default Chat;
