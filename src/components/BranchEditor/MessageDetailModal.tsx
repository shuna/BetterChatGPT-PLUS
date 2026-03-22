import React from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import useStore from '@store/store';
import { isTextContent, isImageContent } from '@type/chat';
import CrossIcon2 from '@icon/CrossIcon2';

interface MessageDetailModalProps {
  chatIndex: number;
  nodeId: string;
  onClose: () => void;
}

const MessageDetailModal = ({ chatIndex, nodeId, onClose }: MessageDetailModalProps) => {
  const { t } = useTranslation();
  const tree = useStore((state) => state.chats?.[chatIndex]?.branchTree);
  const contentStore = useStore((state) => state.contentStore);
  const toggleNodeStar = useStore((state) => state.toggleNodeStar);
  const toggleNodePin = useStore((state) => state.toggleNodePin);
  const modalRoot = document.getElementById('modal-root');

  const node = tree?.nodes[nodeId];
  if (!node || !modalRoot) return null;

  const entry = contentStore[node.contentHash];
  if (!entry) return null;

  const roleLabel = t(node.role);
  const roleBg = node.role === 'user'
    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    : node.role === 'assistant'
    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';

  return ReactDOM.createPortal(
    <div className='fixed top-0 left-0 z-[999] w-full p-4 overflow-x-hidden overflow-y-auto h-full flex justify-center items-center'>
      <div className='relative z-2 max-w-3xl w-full md:h-auto flex justify-center max-h-full'>
        <div className='relative bg-gray-50 rounded-lg shadow dark:bg-gray-700 max-h-full overflow-y-auto hide-scroll-bar w-full'>
          <div className='flex items-center justify-between p-4 border-b rounded-t dark:border-gray-600'>
            <div className='flex items-center gap-2'>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${roleBg}`}>
                {roleLabel}
              </span>
              {node.label && (
                <span className='text-sm text-gray-500 dark:text-gray-400'>
                  {node.label}
                </span>
              )}
              <button
                className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${
                  node.starred ? 'text-yellow-500' : 'text-gray-400'
                }`}
                onClick={() => toggleNodeStar(chatIndex, nodeId)}
                title={node.starred ? 'Unstar' : 'Star'}
              >
                <svg className='w-4 h-4' viewBox='0 0 24 24' fill='currentColor'>
                  <path d='M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' />
                </svg>
              </button>
              <button
                className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${
                  node.pinned ? 'text-blue-500' : 'text-gray-400'
                }`}
                onClick={() => toggleNodePin(chatIndex, nodeId)}
                title={node.pinned ? 'Unpin' : 'Pin'}
              >
                <svg className='w-4 h-4' viewBox='0 0 24 24' fill='currentColor'>
                  <path d='M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z' />
                </svg>
              </button>
            </div>
            <button
              type='button'
              className='text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm p-1.5 ml-auto inline-flex items-center dark:hover:bg-gray-600 dark:hover:text-white'
              onClick={onClose}
              aria-label='close modal'
            >
              <CrossIcon2 />
            </button>
          </div>

          <div className='p-4 space-y-3'>
            {entry.content.map((content, idx) => {
              if (isTextContent(content)) {
                return (
                  <div
                    key={idx}
                    className='text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words'
                  >
                    {content.text}
                  </div>
                );
              }
              if (isImageContent(content)) {
                return (
                  <img
                    key={idx}
                    src={content.image_url.url}
                    alt='attachment'
                    className='max-w-full max-h-96 rounded border border-gray-200 dark:border-gray-600'
                  />
                );
              }
              return null;
            })}
          </div>
        </div>
      </div>
      <div
        className='bg-gray-800/90 absolute top-0 left-0 h-full w-full z-[-1]'
        onClick={onClose}
      />
    </div>,
    modalRoot
  );
};

export default MessageDetailModal;
