import React, { useCallback } from 'react';
import useStore from '@store/store';

import Avatar from './Avatar';
import MessageContent from './MessageContent';

import { ContentInterface, Role } from '@type/chat';
import RoleSelector from './RoleSelector';

// const backgroundStyle: { [role in Role]: string } = {
//   user: 'dark:bg-gray-800',
//   assistant: 'bg-gray-50 dark:bg-gray-650',
//   system: 'bg-gray-50 dark:bg-gray-650',
// };
const backgroundStyle = ['dark:bg-gray-800', 'bg-gray-50 dark:bg-gray-650'];

const CollapseClickArea = ({
  side,
  onClick,
}: {
  side: 'left' | 'right';
  onClick: () => void;
}) => (
  <div
    className={`absolute top-0 bottom-0 w-3 z-10 cursor-pointer transition-colors duration-150 bg-gray-400/5 dark:bg-gray-300/5 hover:bg-gray-500/20 dark:hover:bg-gray-300/15 ${
      side === 'left' ? 'left-0' : 'right-[14px]'
    }`}
    onClick={onClick}
    title='Click to collapse/expand'
  />
);

const Message = React.memo(
  ({
    role,
    content,
    messageIndex,
    sticky = false,
  }: {
    role: Role;
    content: ContentInterface[],
    messageIndex: number;
    sticky?: boolean;
  }) => {
    const hideSideMenu = useStore((state) => state.hideSideMenu);
    const advancedMode = useStore((state) => state.advancedMode);
    const toggleCollapseNode = useStore((state) => state.toggleCollapseNode);
    const currentChatIndex = useStore((state) => state.currentChatIndex);

    const nodeId = useStore((state) => {
      if (sticky) return undefined;
      const chat = state.chats?.[state.currentChatIndex];
      return chat?.branchTree?.activePath?.[messageIndex] ?? String(messageIndex);
    });

    const isCollapsed = useStore((state) => {
      if (sticky || !nodeId) return false;
      const chat = state.chats?.[state.currentChatIndex];
      return chat?.collapsedNodes?.[nodeId] ?? false;
    });

    const handleToggleCollapse = useCallback(() => {
      if (!sticky) {
        toggleCollapseNode(currentChatIndex, messageIndex);
      }
    }, [currentChatIndex, messageIndex, sticky, toggleCollapseNode]);

    return (
      <div
        className={`w-full border-b border-black/10 dark:border-gray-900/50 text-gray-800 dark:text-gray-100 group relative ${
          backgroundStyle[messageIndex % 2]
        }`}
      >
        {!sticky && (
          <>
            <CollapseClickArea side='left' onClick={handleToggleCollapse} />
            <CollapseClickArea side='right' onClick={handleToggleCollapse} />
          </>
        )}
        <div
          className={`text-base gap-4 md:gap-6 m-auto p-4 md:py-6 flex transition-all ease-in-out ${
            hideSideMenu
              ? 'md:max-w-5xl lg:max-w-5xl xl:max-w-6xl'
              : 'md:max-w-3xl lg:max-w-3xl xl:max-w-4xl'
          }`}
        >
          <Avatar role={role} />
          <div
            className={`w-[calc(100%-50px)] transition-[max-height] duration-200 ease-in-out ${
              isCollapsed ? 'max-h-12 overflow-hidden' : ''
            }`}
          >
            {advancedMode &&
              <RoleSelector
                role={role}
                messageIndex={messageIndex}
                sticky={sticky}
              />}
            <MessageContent
              role={role}
              content={content}
              messageIndex={messageIndex}
              sticky={sticky}
            />
          </div>
        </div>
        {isCollapsed && (
          <div className='absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white/80 dark:from-gray-800/80 to-transparent pointer-events-none' />
        )}
      </div>
    );
  }
);

export default Message;
