import { v4 as uuidv4 } from 'uuid';

import type { ChatInterface } from '@type/chat';

export const ensureUniqueChatIds = (chats: ChatInterface[]) => {
  const seen = new Set<string>();
  let changed = false;

  chats.forEach((chat) => {
    const hasValidId = typeof chat.id === 'string' && chat.id.length > 0;
    if (!hasValidId || seen.has(chat.id)) {
      chat.id = uuidv4();
      changed = true;
    }
    seen.add(chat.id);
  });

  return changed;
};

/** Assign a fresh UUID to every chat so imported chats never collide with existing ones. */
export const assignFreshChatIds = (chats: ChatInterface[]) => {
  chats.forEach((chat) => {
    chat.id = uuidv4();
  });
};
