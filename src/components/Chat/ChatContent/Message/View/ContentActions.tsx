import React from 'react';
import TickIcon from '@icon/TickIcon';
import CrossIcon from '@icon/CrossIcon';

import RefreshButton from './Button/RefreshButton';
import RegenerateNextButton from './Button/RegenerateNextButton';
import UpButton from './Button/UpButton';
import DownButton from './Button/DownButton';
import CopyButton from './Button/CopyButton';
import EditButton from './Button/EditButton';
import DeleteButton from './Button/DeleteButton';
import MarkdownModeButton from './Button/MarkdownModeButton';
import BranchSwitcher from '../BranchSwitcher';

type ContentActionsProps = {
  nodeId?: string;
  currentChatIndex: number;
  role: string;
  messageIndex: number;
  lastMessageIndex: number;
  isDelete: boolean;
  isGeneratingMessage: boolean;
  isCurrentChatGenerating: boolean;
  setIsEdit: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDelete: React.Dispatch<React.SetStateAction<boolean>>;
  onRefresh: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onCopy: () => void;
  onDelete: () => void;
};

export default function ContentActions({
  nodeId,
  currentChatIndex,
  role,
  messageIndex,
  lastMessageIndex,
  isDelete,
  isGeneratingMessage,
  isCurrentChatGenerating,
  setIsEdit,
  setIsDelete,
  onRefresh,
  onMoveUp,
  onMoveDown,
  onCopy,
  onDelete,
}: ContentActionsProps) {
  return (
    <div className='sticky bottom-3 z-20 mt-3 -mx-2 flex w-[calc(100%+1rem)] flex-nowrap items-end justify-end gap-x-3 gap-y-2 px-2 py-2 pr-14 pointer-events-none translate-y-2 opacity-0 transition duration-150 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100'>
      <div className='min-w-0'>
        {nodeId && (
          <BranchSwitcher
            chatIndex={currentChatIndex}
            nodeId={nodeId}
          />
        )}
      </div>
      <div className='ml-auto flex flex-wrap items-center justify-end gap-2 rounded-xl bg-transparent px-2 py-2 transition-all duration-150 group-hover:bg-white/75 group-hover:shadow-sm group-hover:backdrop-blur supports-[backdrop-filter]:group-hover:bg-white/60 dark:group-hover:bg-gray-800/75 dark:supports-[backdrop-filter]:group-hover:bg-gray-800/60'>
        {isDelete || (
          <>
            {!isCurrentChatGenerating && role === 'assistant' && (
              <RefreshButton onClick={onRefresh} />
            )}
            {!isCurrentChatGenerating && role === 'user' && (
              <RegenerateNextButton onClick={onRefresh} />
            )}
            {messageIndex !== 0 && <UpButton onClick={onMoveUp} />}
            {messageIndex !== lastMessageIndex && (
              <DownButton onClick={onMoveDown} />
            )}

            <MarkdownModeButton />
            <CopyButton onClick={onCopy} />
            {!isGeneratingMessage && <EditButton setIsEdit={setIsEdit} />}
            <DeleteButton setIsDelete={setIsDelete} />
          </>
        )}
        {isDelete && (
          <>
            <button
              className='p-1 hover:text-white'
              aria-label='cancel'
              onClick={() => setIsDelete(false)}
            >
              <CrossIcon />
            </button>
            <button
              className='p-1 hover:text-white'
              aria-label='confirm'
              onClick={onDelete}
            >
              <TickIcon />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
