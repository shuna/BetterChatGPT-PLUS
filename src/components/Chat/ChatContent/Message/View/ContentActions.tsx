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
import EvaluateButton from './Button/EvaluateButton';
import BranchSwitcher from '../BranchSwitcher';

type ContentActionsProps = {
  nodeId?: string;
  currentChatIndex: number;
  role: string;
  messageIndex: number;
  lastMessageIndex: number;
  isDelete: boolean;
  isProtected: boolean;
  isGeneratingMessage: boolean;
  isCurrentChatGenerating: boolean;
  showEvaluateButton: boolean;
  setIsEdit: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDelete: React.Dispatch<React.SetStateAction<boolean>>;
  onRefresh: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onEvaluate: () => void;
};

export default function ContentActions({
  nodeId,
  currentChatIndex,
  role,
  messageIndex,
  lastMessageIndex,
  isDelete,
  isProtected,
  isGeneratingMessage,
  isCurrentChatGenerating,
  showEvaluateButton,
  setIsEdit,
  setIsDelete,
  onRefresh,
  onMoveUp,
  onMoveDown,
  onCopy,
  onDelete,
  onEvaluate,
}: ContentActionsProps) {
  return (
    <div className='sticky bottom-2 z-20 mt-2.5 flex min-h-[2.75rem] items-center justify-center gap-2 px-2 md:bottom-3 md:px-3'>
      <div className='absolute left-2 top-1/2 -translate-y-1/2 min-w-0 shrink-0 md:left-3 pointer-events-auto'>
        {nodeId && (
          <BranchSwitcher
            chatIndex={currentChatIndex}
            nodeId={nodeId}
          />
        )}
      </div>
      <div className='pointer-events-none translate-y-1 opacity-0 transition duration-150 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100'>
      <div className='relative isolate flex shrink-0 overflow-hidden rounded-full border border-gray-300 bg-gray-200/80 shadow-sm backdrop-blur-2xl supports-[backdrop-filter]:bg-gray-200/45 transition duration-150 dark:border-white/10 dark:bg-white/8 dark:supports-[backdrop-filter]:bg-white/5'>
        <div className='relative z-10 flex flex-nowrap items-center justify-center gap-1.5 px-1.5 py-1.5 text-gray-600 md:gap-2 md:px-2 md:py-2 dark:text-gray-200'>
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

              <CopyButton onClick={onCopy} />
              {!isGeneratingMessage && <EditButton setIsEdit={setIsEdit} disabled={isProtected} />}
              <DeleteButton setIsDelete={setIsDelete} disabled={isProtected} />
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
      </div>
      {showEvaluateButton && !isGeneratingMessage && !isDelete && (
        <div className='absolute right-2 top-1/2 -translate-y-1/2 min-w-0 shrink-0 md:right-3 pointer-events-none opacity-0 transition duration-150 group-hover:pointer-events-auto group-hover:opacity-100'>
          <EvaluateButton onClick={onEvaluate} />
        </div>
      )}
    </div>
  );
}
