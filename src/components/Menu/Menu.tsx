import React, { useEffect, useRef } from 'react';
import useStore from '@store/store';

import NewChat from './NewChat';
import NewFolder from './NewFolder';
import ChatHistoryList from './ChatHistoryList';
import MenuOptions from './MenuOptions';

import CrossIcon2 from '@icon/CrossIcon2';
import MenuIcon from '@icon/MenuIcon';
import useSwipeGesture from '@hooks/useSwipeGesture';

const Menu = () => {
  const hideSideMenu = useStore((state) => state.hideSideMenu);
  const setHideSideMenu = useStore((state) => state.setHideSideMenu);
  const menuWidth = useStore((state) => state.menuWidth);
  const setMenuWidth = useStore((state) => state.setMenuWidth);

  const windowWidthRef = useRef<number>(window.innerWidth);
  const isResizing = useRef<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const { edgeHandlers, menuHandlers } = useSwipeGesture(menuRef, backdropRef);

  useEffect(() => {
    if (window.innerWidth < 768) setHideSideMenu(true);
    window.addEventListener('resize', () => {
      if (
        windowWidthRef.current !== window.innerWidth &&
        window.innerWidth < 768
      )
        setHideSideMenu(true);
    });
  }, []);

  const handleMouseDown = () => {
    isResizing.current = true;
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isResizing.current) {
      const newWidth = e.clientX;
      if (newWidth > 100 && newWidth < window.innerWidth * 0.75) {
        setMenuWidth(newWidth);
      }
    }
  };

  const handleMouseUp = () => {
    isResizing.current = false;
  };

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <>
      <div
        id='menu'
        ref={menuRef}
        className={`group/menu fixed top-0 left-0 z-[999] h-full overflow-visible bg-gray-50 text-gray-800 transition-transform dark:bg-gray-900 dark:text-gray-100 md:inset-y-0 md:flex md:flex-col max-md:w-3/4 ${
          hideSideMenu ? 'translate-x-[-100%]' : 'translate-x-[0%]'
        }`}
        style={{ width: `${menuWidth}px` }}
        {...menuHandlers}
      >
        <div className='flex h-full min-h-0 flex-col'>
          <div className='flex h-full w-full flex-1 items-start border-white/20'>
            <nav className='flex h-full flex-1 flex-col space-y-1 px-2 pt-2'>
              <div className='flex gap-2'>
                <button
                  className='mb-2 inline-flex shrink-0 items-center justify-center rounded-md border border-gray-300 bg-gray-200 px-2 py-2 text-gray-900 shadow-sm transition-colors duration-200 hover:bg-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600'
                  onClick={() => {
                    setHideSideMenu(true);
                  }}
                  aria-label='hide menu'
                  title='hide menu'
                >
                  <MenuIcon className='h-4 w-4' />
                </button>
                <NewChat />
                <NewFolder />
              </div>
              <ChatHistoryList />
              <MenuOptions />
            </nav>
          </div>
        </div>
        <div
          id='menu-close'
          className={`${
            hideSideMenu ? 'hidden' : ''
          } absolute right-0 top-10 z-[999] translate-x-full cursor-pointer bg-gray-100 p-2 text-gray-700 hover:bg-gray-200 dark:bg-gray-900 dark:text-white dark:hover:bg-black md:hidden`}
          onClick={() => {
            setHideSideMenu(true);
          }}
        >
          <CrossIcon2 />
        </div>
        <div
          className='absolute top-0 right-0 h-full w-2 cursor-ew-resize'
          onMouseDown={handleMouseDown}
        />
      </div>
      <div
        id='menu-backdrop'
        ref={backdropRef}
        className={`${
          hideSideMenu ? 'hidden' : ''
        } md:hidden fixed top-0 left-0 h-full w-full z-[60] bg-gray-900/70`}
        onClick={() => {
          setHideSideMenu(true);
        }}
        {...menuHandlers}
      />
      {/* Swipe edge zone — invisible touch target on the left edge for opening */}
      <div
        className='md:hidden fixed top-0 left-0 h-full w-5 z-[998]'
        {...edgeHandlers}
      />
    </>
  );
};

export default Menu;
