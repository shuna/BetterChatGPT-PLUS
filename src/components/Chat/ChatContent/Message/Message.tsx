import React, { useCallback } from 'react';
import useStore from '@store/store';

import Avatar from './Avatar';
import MessageContent from './MessageContent';

import { ContentInterface, Role, isSplitView, isTextContent } from '@type/chat';
import RoleSelector from './RoleSelector';
import useIsDesktop from '@hooks/useIsDesktop';
import useCanHover from '@hooks/useCanHover';
import MetaActions from './View/MetaActions';

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
    className={`collapse-toggle absolute left-px top-[4.2rem] bottom-2 z-10 w-6 rounded-full touch-manipulation transition-all duration-200 md:left-0 md:top-2 md:w-5 ${
      isCollapsed
        ? 'before:absolute before:left-[9px] before:top-0 before:bottom-0 before:w-1.5 before:rounded-full before:bg-gray-300/50 dark:before:bg-gray-500/40 hover:before:bg-gray-400/60 dark:hover:before:bg-gray-400/50 md:before:left-1.5'
        : canHover
          ? 'before:absolute before:left-[9px] before:top-0 before:bottom-0 before:w-1.5 before:rounded-full before:bg-gray-300/0 before:opacity-0 hover:before:bg-gray-300/70 hover:before:opacity-100 focus-visible:before:bg-gray-300/70 focus-visible:before:opacity-100 dark:before:bg-gray-500/0 dark:hover:before:bg-gray-500/60 dark:focus-visible:before:bg-gray-500/60 md:before:left-1.5'
          : 'before:absolute before:left-[9px] before:top-0 before:bottom-0 before:w-1.5 before:rounded-full before:bg-transparent active:before:bg-gray-400/60 dark:active:before:bg-gray-400/50 md:before:left-1.5'
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
    const setHoveredNodeId = useStore((state) => state.setHoveredNodeId);
    const setBranchEditorFocusNodeId = useStore((state) => state.setBranchEditorFocusNodeId);
    const chatActiveView = useStore((state) => state.chatActiveView);
    const branchEditorSyncEnabled = useStore((state) => state.branchEditorSyncEnabled);
    const pushNavigationEntry = useStore((state) => state.pushNavigationEntry);
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

    const isOmitted = useStore((state) => {
      if (sticky || !resolvedNodeId) return false;
      const chatIndex = state.currentChatIndex;
      const omittedNodes =
        state.omittedNodeMaps[String(chatIndex)] ??
        state.chats?.[chatIndex]?.omittedNodes ??
        {};
      return omittedNodes[resolvedNodeId] ?? false;
    });

    const isProtected = useStore((state) => {
      if (sticky || !resolvedNodeId) return false;
      const chatIndex = state.currentChatIndex;
      const protectedNodes =
        state.protectedNodeMaps[String(chatIndex)] ??
        state.chats?.[chatIndex]?.protectedNodes ??
        {};
      return protectedNodes[resolvedNodeId] ?? false;
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

    const handleMouseEnter = useCallback(() => {
      if (!sticky && isSplitView(chatActiveView)) {
        setHoveredNodeId(resolvedNodeId ?? null);
      }
    }, [sticky, chatActiveView, resolvedNodeId, setHoveredNodeId]);

    const handleMouseLeave = useCallback(() => {
      if (!sticky && isSplitView(chatActiveView)) {
        setHoveredNodeId(null);
      }
    }, [sticky, chatActiveView, setHoveredNodeId]);

    const handleClick = useCallback(() => {
      if (!sticky && resolvedNodeId && isSplitView(chatActiveView) && branchEditorSyncEnabled) {
        const state = useStore.getState();
        const chat = state.chats?.[state.currentChatIndex];
        if (chat?.branchTree) {
          pushNavigationEntry({
            chatId: chat.id,
            activePath: [...chat.branchTree.activePath],
            focusedNodeId: resolvedNodeId,
            viewContext: chatActiveView,
            source: 'chat-click',
          });
        }
        setBranchEditorFocusNodeId(resolvedNodeId);
      }
    }, [sticky, resolvedNodeId, chatActiveView, branchEditorSyncEnabled, setBranchEditorFocusNodeId, pushNavigationEntry]);

    const maxWidthClass = isDesktopMenuExpanded
      ? 'md:max-w-3xl lg:max-w-3xl xl:max-w-4xl'
      : 'md:max-w-4xl lg:max-w-4xl xl:max-w-5xl';

    const contentSurfaceClass =
      'rounded-2xl bg-white/60 px-4 pt-2.5 pb-2 shadow-sm ring-1 ring-black/5 backdrop-blur-sm dark:bg-gray-900/20 dark:ring-white/10 md:px-5 md:pt-3 md:pb-2.5';

    return (
      <div
        className={`w-full border-b border-black/10 dark:border-gray-900/50 text-gray-800 dark:text-gray-100 group relative ${
          backgroundStyle[messageIndex % 2]
        }${isOmitted ? ' opacity-50' : ''}${
          isProtected ? ' ring-2 ring-inset ring-blue-400/30 dark:ring-blue-500/25' : ''
        }`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        {!sticky && (
          <CollapseToggle
            isCollapsed={isCollapsed}
            canHover={canHover}
            onClick={handleToggleCollapse}
          />
        )}
        <div
          className={`text-base gap-1.5 md:gap-2 m-auto px-7 py-6 md:py-8 flex flex-col transition-all ease-in-out ${maxWidthClass}`}
        >
          {sticky ? (
            <>
              <div className='flex items-center gap-2.5'>
                <Avatar role={role} />
                {advancedMode && (
                  <RoleSelector role={role} sticky />
                )}
              </div>
              <div className='w-full'>
                <MessageContent
                  role={role}
                  content={content}
                  messageIndex={messageIndex}
                  nodeId={resolvedNodeId}
                  sticky={sticky}
                />
              </div>
            </>
          ) : (
            <>
              <div className='flex items-center gap-2.5'>
                <Avatar role={role} />
                {advancedMode && resolvedNodeId && (
                  <RoleSelector role={role} nodeId={resolvedNodeId} messageIndex={messageIndex} />
                )}
                <div className='ml-auto'>
                  <MetaActions
                    messageIndex={messageIndex}
                    isOmitted={isOmitted}
                    isProtected={isProtected}
                  />
                </div>
              </div>
              <div className='min-w-0'>
                {isCollapsed ? (
                  <div className={contentSurfaceClass}>
                    <div className='h-[4.5rem] overflow-hidden py-0 text-sm leading-6 text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words line-clamp-3'>
                      {collapsedPreview}
                    </div>
                  </div>
                ) : (
                  <MessageContent
                    role={role}
                    content={content}
                    messageIndex={messageIndex}
                    nodeId={resolvedNodeId}
                    sticky={sticky}
                  />
                )}
              </div>
            </>
          )}
        </div>
        {isCollapsed && (
          <div className='absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white/90 dark:from-gray-800/90 to-transparent pointer-events-none' />
        )}
      </div>
    );
  }
);

export default Message;
