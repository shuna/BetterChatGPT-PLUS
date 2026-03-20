import React from 'react';
import useStore from '@store/store';
import { MessageInterface } from '@type/chat';
import { generateDefaultChat } from '@constants/chat';

const useInitialiseNewChat = () => {
  const setChats = useStore((state) => state.setChats);
  const setCurrentChatIndex = useStore((state) => state.setCurrentChatIndex);

  const initialiseNewChat = React.useCallback(() => {
    setChats([generateDefaultChat()]);
    setCurrentChatIndex(0);
    // Clear orphaned content when all chats are replaced
    useStore.setState({ contentStore: {} });
  }, [setChats, setCurrentChatIndex]);

  return initialiseNewChat;
};

export default useInitialiseNewChat;
