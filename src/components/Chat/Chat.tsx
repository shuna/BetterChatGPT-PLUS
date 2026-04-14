import React, { Suspense, useState } from 'react';
import useStore from '@store/store';
import { isSplitView } from '@type/chat';

import ChatContent from './ChatContent';
import MobileBar from '../MobileBar';
import SplitView from './SplitView';

import ChatViewTabs from './ChatViewTabs';
import ChatStatusBar from './ChatStatusBar';
import NavigationButtons from './NavigationButtons';
import useIsDesktop from '@hooks/useIsDesktop';
import useNavigationHistory, { isPWA } from '@hooks/useNavigationHistory';

const BranchEditorView = React.lazy(
  () => import('@components/BranchEditor/BranchEditorView')
);

const Chat = () => {
  const hideSideMenu = useStore((state) => state.hideSideMenu);
  const menuWidth = useStore((state) => state.menuWidth);
  const activeView = useStore((state) => state.chatActiveView);
  const setActiveView = useStore((state) => state.setChatActiveView);
  const isDesktop = useIsDesktop();
  const desktopOffset = isDesktop && !hideSideMenu ? `${menuWidth}px` : '0';
  const [isChatFindOpen, setIsChatFindOpen] = useState(false);
  const showPWANav = React.useMemo(() => isPWA(), []);

  useNavigationHistory();

  // Mobile fallback: split views degrade to chat view
  const effectiveView = !isDesktop && isSplitView(activeView) ? 'chat' : activeView;

  return (
    <div className='flex h-full flex-1 flex-col' style={{ paddingLeft: desktopOffset }}>
      <MobileBar
        onSearchOpen={() => setIsChatFindOpen(true)}
        extraButtons={showPWANav ? <NavigationButtons /> : undefined}
      />
      <main className='relative h-full w-full transition-width flex flex-col overflow-hidden items-stretch flex-1'>
        <ChatViewTabs activeView={effectiveView} setActiveView={setActiveView} />
        <ChatStatusBar />
        {isSplitView(effectiveView) ? (
          <SplitView direction={effectiveView === 'split-horizontal' ? 'horizontal' : 'vertical'} />
        ) : (
          <>
            <div className={effectiveView === 'chat' ? 'flex flex-col flex-1 overflow-hidden' : 'hidden'}>
              <ChatContent isChatFindOpen={isChatFindOpen} onChatFindClose={() => setIsChatFindOpen(false)} />
            </div>
            {effectiveView === 'branch-editor' && (
              <div className='flex flex-col flex-1 overflow-hidden'>
                <Suspense fallback={<div className='flex items-center justify-center flex-1'><div className='animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500'></div></div>}>
                  <BranchEditorView />
                </Suspense>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Chat;
