import React from 'react';
import { useTranslation } from 'react-i18next';
import TickIcon from '@icon/TickIcon';
import CrossIcon from '@icon/CrossIcon';
import DownChevronArrow from '@icon/DownChevronArrow';

import RefreshButton from './Button/RefreshButton';
import RegenerateNextButton from './Button/RegenerateNextButton';
import UpButton from './Button/UpButton';
import DownButton from './Button/DownButton';
import CopyButton from './Button/CopyButton';
import EditButton from './Button/EditButton';
import DeleteButton from './Button/DeleteButton';
import BranchSwitcher from '../BranchSwitcher';
import useHideOnOutsideClick from '@hooks/useHideOnOutsideClick';

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
  onEvaluateSafety: () => void;
  onEvaluateQuality: () => void;
  onEvaluateSafetyOnly: () => void;
  onEvaluateQualityOnly: () => void;
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
  onEvaluateSafety,
  onEvaluateQuality,
  onEvaluateSafetyOnly,
  onEvaluateQualityOnly,
}: ContentActionsProps) {
  const { t } = useTranslation('main');
  const [safetyMenuOpen, setSafetyMenuOpen, safetyMenuRef] = useHideOnOutsideClick();
  const [qualityMenuOpen, setQualityMenuOpen, qualityMenuRef] = useHideOnOutsideClick();

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
          <div className='flex items-center gap-1.5'>
            {/* Safety evaluate split button */}
            <div className='relative flex items-stretch' ref={safetyMenuRef}>
              <button
                className='btn btn-small rounded-r-none border-r-0 text-xs text-white'
                style={{ backgroundColor: 'rgb(239,68,68)', borderColor: 'rgba(239,68,68,0.8)' }}
                onClick={onEvaluateSafety}
                aria-label={t('evaluation.safetyTitle') as string}
              >
                {t('evaluation.safetyTitle')}
              </button>
              <button
                className='btn btn-small rounded-l-none border-l border-white/20 !w-6 justify-center px-0 text-white'
                style={{ backgroundColor: 'rgb(239,68,68)', borderColor: 'rgba(239,68,68,0.8)' }}
                onClick={() => setSafetyMenuOpen(!safetyMenuOpen)}
                aria-label='safety options'
              >
                <DownChevronArrow />
              </button>
              <div
                className={`${
                  safetyMenuOpen ? '' : 'hidden'
                } absolute right-0 bottom-full mb-1 z-50 w-max overflow-hidden rounded-lg border border-black/10 bg-white/95 p-1 shadow-lg backdrop-blur dark:border-white/10 dark:bg-gray-800/95`}
              >
                <button
                  className='block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200'
                  onClick={() => {
                    setSafetyMenuOpen(false);
                    onEvaluateSafetyOnly();
                  }}
                >
                  {t('evaluation.evaluateThisOnly')}
                </button>
              </div>
            </div>

            {/* Quality evaluate split button */}
            <div className='relative flex items-stretch' ref={qualityMenuRef}>
              <button
                className='btn btn-small rounded-r-none border-r-0 text-xs text-white'
                style={{ backgroundColor: 'rgb(59,130,246)', borderColor: 'rgba(59,130,246,0.8)' }}
                onClick={onEvaluateQuality}
                aria-label={t('evaluation.qualityTitle') as string}
              >
                {t('evaluation.qualityTitle')}
              </button>
              <button
                className='btn btn-small rounded-l-none border-l border-white/20 !w-6 justify-center px-0 text-white'
                style={{ backgroundColor: 'rgb(59,130,246)', borderColor: 'rgba(59,130,246,0.8)' }}
                onClick={() => setQualityMenuOpen(!qualityMenuOpen)}
                aria-label='quality options'
              >
                <DownChevronArrow />
              </button>
              <div
                className={`${
                  qualityMenuOpen ? '' : 'hidden'
                } absolute right-0 bottom-full mb-1 z-50 w-max overflow-hidden rounded-lg border border-black/10 bg-white/95 p-1 shadow-lg backdrop-blur dark:border-white/10 dark:bg-gray-800/95`}
              >
                <button
                  className='block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200'
                  onClick={() => {
                    setQualityMenuOpen(false);
                    onEvaluateQualityOnly();
                  }}
                >
                  {t('evaluation.evaluateThisOnly')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
