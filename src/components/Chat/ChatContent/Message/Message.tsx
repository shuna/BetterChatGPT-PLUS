import React, { useCallback } from 'react';
import useStore from '@store/store';

import Avatar from './Avatar';
import MessageContent from './MessageContent';

import { ContentInterface, Role, isTextContent } from '@type/chat';
import RoleSelector from './RoleSelector';
import useIsDesktop from '@hooks/useIsDesktop';
import useCanHover from '@hooks/useCanHover';

const backgroundStyle = ['dark:bg-gray-800', 'bg-gray-50 dark:bg-gray-650'];

const CollapseToggle = ({
  isCollapsed,
  canHover,
  onClick,
}: {
  isCollapsed: boolean;
  canHover: boolean;
  onClick: () => void;
}) => (
  <button
    type='button'
    className={`collapse-toggle absolute left-2 top-2 bottom-2 z-10 w-7 rounded-full touch-manipulation transition-all duration-200 md:left-0 md:w-5 ${
      isCollapsed
        ? 'before:absolute before:left-2.5 before:top-0 before:bottom-0 before:w-1.5 before:rounded-full before:bg-gray-300/50 dark:before:bg-gray-500/40 hover:before:bg-gray-400/60 dark:hover:before:bg-gray-400/50 md:before:left-1.5'
        : canHover
          ? 'before:absolute before:left-2.5 before:top-0 before:bottom-0 before:w-1.5 before:rounded-full before:bg-gray-300/0 before:opacity-0 hover:before:bg-gray-300/70 hover:before:opacity-100 focus-visible:before:bg-gray-300/70 focus-visible:before:opacity-100 dark:before:bg-gray-500/0 dark:hover:before:bg-gray-500/60 dark:focus-visible:before:bg-gray-500/60 md:before:left-1.5'
          : 'before:absolute before:left-2.5 before:top-0 before:bottom-0 before:w-1.5 before:rounded-full before:bg-transparent active:before:bg-gray-400/60 dark:active:before:bg-gray-400/50 md:before:left-1.5'
    }`}
    onClick={onClick}
    aria-label={isCollapsed ? 'Expand message' : 'Collapse message'}
    title={isCollapsed ? 'Expand' : 'Collapse'}
  />
);

const Message = React.memo(
  ({
    role,
    content,
    messageIndex,
    nodeId,
    sticky = false,
  }: {
    role: Role;
    content: ContentInterface[],
    messageIndex: number;
    nodeId?: string;
    sticky?: boolean;
  }) => {
    const hideSideMenu = useStore((state) => state.hideSideMenu);
    const advancedMode = useStore((state) => state.advancedMode);
    const toggleCollapseNode = useStore((state) => state.toggleCollapseNode);
    const currentChatIndex = useStore((state) => state.currentChatIndex);
    const isDesktop = useIsDesktop();
    const canHover = useCanHover();
    const isDesktopMenuExpanded = isDesktop && !hideSideMenu;

    const resolvedNodeId = useStore((state) => {
      if (sticky) return undefined;
      if (nodeId) return nodeId;
      const chat = state.chats?.[state.currentChatIndex];
      return chat?.branchTree?.activePath?.[messageIndex] ?? String(messageIndex);
    });

    const isCollapsed = useStore((state) => {
      if (sticky || !resolvedNodeId) return false;
      const chatIndex = state.currentChatIndex;
      const collapsedNodes =
        state.collapsedNodeMaps[String(chatIndex)] ??
        state.chats?.[chatIndex]?.collapsedNodes ??
        {};
      return collapsedNodes[resolvedNodeId] ?? false;
    });

    const collapsedPreview = (() => {
      const firstText = content.find(isTextContent);
      const text = firstText?.text.replace(/\s+/g, ' ').trim() ?? '';
      if (!text) return `${role} message`;
      return text.length > 280 ? `${text.slice(0, 280)}...` : text;
    })();

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
            canHover={canHover}
            onClick={handleToggleCollapse}
          />
        )}
        <div
          className={`text-base gap-2.5 md:gap-4 m-auto p-4 pl-10 md:py-6 md:pl-7 flex transition-all ease-in-out ${
            isDesktopMenuExpanded
              ? 'md:max-w-3xl lg:max-w-3xl xl:max-w-4xl'
              : 'md:max-w-5xl lg:max-w-5xl xl:max-w-6xl'
          }`}
        >
          <Avatar role={role} />
          <div
            className='w-[calc(100%-50px)]'
          >
            {isCollapsed ? (
              <div className='h-[4.5rem] overflow-hidden py-0 text-sm leading-6 text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words line-clamp-3'>
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
                  nodeId={resolvedNodeId}
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
