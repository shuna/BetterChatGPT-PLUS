import React, { useCallback, useLayoutEffect, useRef } from 'react';
import useStore from '@store/store';

import Avatar from './Avatar';
import MessageContent from './MessageContent';

import { ContentInterface, Role, isTextContent } from '@type/chat';
import RoleSelector from './RoleSelector';

const backgroundStyle = ['dark:bg-gray-800', 'bg-gray-50 dark:bg-gray-650'];

const CollapseToggle = ({
  isCollapsed,
  onClick,
}: {
  isCollapsed: boolean;
  onClick: () => void;
}) => (
  <div
    className={`absolute left-1.5 top-2 bottom-2 z-10 cursor-pointer transition-all duration-200 rounded-full ${
      isCollapsed
        ? 'w-1.5 bg-gray-300/50 dark:bg-gray-500/40 hover:bg-gray-400/60 dark:hover:bg-gray-400/50'
        : 'w-1 bg-transparent hover:w-1.5 hover:bg-gray-400/40 dark:hover:bg-gray-300/25'
    }`}
    onClick={onClick}
    title={isCollapsed ? 'Expand' : 'Collapse'}
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
      const chatIndex = state.currentChatIndex;
      const collapsedNodes =
        state.collapsedNodeMaps[String(chatIndex)] ??
        state.chats?.[chatIndex]?.collapsedNodes ??
        {};
      return collapsedNodes[nodeId] ?? false;
    });

    const collapsedPreview = (() => {
      const firstText = content.find(isTextContent);
      const text = firstText?.text.replace(/\s+/g, ' ').trim() ?? '';
      if (!text) return `${role} message`;
      return text.length > 280 ? `${text.slice(0, 280)}...` : text;
    })();

    const renderStartRef = useRef(performance.now());
    renderStartRef.current = performance.now();

    useLayoutEffect(() => {
      const elapsed = performance.now() - renderStartRef.current;
      console.log(`[perf] Message[${messageIndex}] render+commit: ${elapsed.toFixed(2)}ms (collapsed=${isCollapsed})`);
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
          <CollapseToggle
            isCollapsed={isCollapsed}
            onClick={handleToggleCollapse}
          />
        )}
        <div
          className={`text-base gap-2.5 md:gap-4 m-auto p-4 pl-7 md:py-6 flex transition-all ease-in-out ${
            hideSideMenu
              ? 'md:max-w-5xl lg:max-w-5xl xl:max-w-6xl'
              : 'md:max-w-3xl lg:max-w-3xl xl:max-w-4xl'
          }`}
        >
          <Avatar role={role} />
          <div
            className='w-[calc(100%-50px)]'
          >
            {isCollapsed ? (
              <div className='py-1 text-sm leading-6 text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words'>
                {collapsedPreview}
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
        {isCollapsed && (
          <div className='absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white/90 dark:from-gray-800/90 to-transparent pointer-events-none' />
        )}
      </div>
    );
  }
);

export default Message;
