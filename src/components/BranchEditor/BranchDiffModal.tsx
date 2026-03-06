import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import { BranchTree } from '@type/chat';
import { wordDiff, DiffSegment } from '@utils/diffUtils';
import PopupModal from '@components/PopupModal';
import { resolveContent } from '@utils/contentStore';

interface BranchDiffModalProps {
  chatIndex: number;
  pathA: string[];
  pathB: string[];
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const BranchDiffModal = ({
  chatIndex,
  pathA,
  pathB,
  setIsOpen,
}: BranchDiffModalProps) => {
  const { t } = useTranslation();
  const tree = useStore(
    (state) => state.chats?.[chatIndex]?.branchTree
  ) as BranchTree;
  const contentStore = useStore((state) => state.contentStore);

  const diffRows = useMemo(() => {
    const maxLen = Math.max(pathA.length, pathB.length);
    const rows: {
      role: string;
      segments: DiffSegment[];
      textA: string;
      textB: string;
    }[] = [];

    for (let i = 0; i < maxLen; i++) {
      const nodeA = pathA[i] ? tree.nodes[pathA[i]] : null;
      const nodeB = pathB[i] ? tree.nodes[pathB[i]] : null;

      const contentA = nodeA ? resolveContent(contentStore, nodeA.contentHash) : [];
      const contentB = nodeB ? resolveContent(contentStore, nodeB.contentHash) : [];

      const textA = contentA
            .filter((c) => c.type === 'text')
            .map((c) => (c as any).text || '')
            .join(' ');
      const textB = contentB
            .filter((c) => c.type === 'text')
            .map((c) => (c as any).text || '')
            .join(' ');

      const role = nodeA?.role || nodeB?.role || 'unknown';
      const segments = wordDiff(textA, textB);

      rows.push({ role, segments, textA, textB });
    }
    return rows;
  }, [pathA, pathB, tree, contentStore]);

  const hasChanges = diffRows.some((r) =>
    r.segments.some((s) => s.type !== 'equal')
  );

  return (
    <PopupModal
      title={t('diffTitle') as string}
      setIsModalOpen={setIsOpen}
      handleConfirm={() => setIsOpen(false)}
    >
      <div className='max-h-[70vh] overflow-y-auto p-4'>
        {!hasChanges ? (
          <p className='text-gray-500 text-center'>{t('diffNoChanges')}</p>
        ) : (
          <div className='space-y-4'>
            {diffRows.map((row, idx) => (
              <div
                key={idx}
                className='border border-gray-200 dark:border-gray-700 rounded-lg p-3'
              >
                <span className='text-xs font-medium text-gray-500 dark:text-gray-400 uppercase'>
                  {row.role}
                </span>
                <div className='mt-1 text-sm leading-relaxed whitespace-pre-wrap'>
                  {row.segments.map((seg, si) => (
                    <span
                      key={si}
                      className={
                        seg.type === 'added'
                          ? 'bg-green-200 dark:bg-green-900/50 text-green-800 dark:text-green-200'
                          : seg.type === 'removed'
                          ? 'bg-red-200 dark:bg-red-900/50 text-red-800 dark:text-red-200 line-through'
                          : ''
                      }
                    >
                      {seg.text}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PopupModal>
  );
};

export default BranchDiffModal;
