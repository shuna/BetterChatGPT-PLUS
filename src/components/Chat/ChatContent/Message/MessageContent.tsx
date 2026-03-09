import React, { useCallback, useMemo, useState } from 'react';
import useStore from '@store/store';

import ContentView from './View/ContentView';
import EditView from './View/EditView';
import { ContentInterface } from '@type/chat';

const editStateCache = new Map<string, boolean>();

const getEditSessionKey = (
  currentChatIndex: number,
  messageIndex: number,
  nodeId?: string,
  sticky?: boolean
) =>
  sticky
    ? `sticky:${currentChatIndex}:${messageIndex}`
    : `message:${currentChatIndex}:${nodeId ?? messageIndex}`;

const MessageContent = ({
  role,
  content,
  messageIndex,
  nodeId,
  sticky = false,
}: {
  role: string;
  content: ContentInterface[];
  messageIndex: number;
  nodeId?: string;
  sticky?: boolean;
}) => {
  const currentChatIndex = useStore((state) => state.currentChatIndex);
  const advancedMode = useStore((state) => state.advancedMode);
  const editSessionKey = useMemo(
    () => getEditSessionKey(currentChatIndex, messageIndex, nodeId, sticky),
    [currentChatIndex, messageIndex, nodeId, sticky]
  );
  const [isEditState, setIsEditState] = useState<boolean>(
    () => editStateCache.get(editSessionKey) ?? sticky
  );
  const setIsEdit = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (value) => {
      setIsEditState((previous) => {
        const nextValue = typeof value === 'function' ? value(previous) : value;
        if (nextValue) {
          editStateCache.set(editSessionKey, true);
        } else {
          editStateCache.delete(editSessionKey);
        }
        return nextValue;
      });
    },
    [editSessionKey]
  );

  return (
    <div className='relative flex flex-col gap-2 md:gap-3 lg:w-[calc(100%-115px)]'>
      {advancedMode && <div className='flex flex-grow flex-col gap-3'></div>}
      {isEditState ? (
        <EditView
          role={role}
          content={content}
          setIsEdit={setIsEdit}
          messageIndex={messageIndex}
          nodeId={nodeId}
          sticky={sticky}
          editSessionKey={editSessionKey}
        />
      ) : (
        <ContentView
          role={role}
          content={content}
          setIsEdit={setIsEdit}
          messageIndex={messageIndex}
          nodeId={nodeId}
        />
      )}
    </div>
  );
};

export default MessageContent;
