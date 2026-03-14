import { ContentInterface, MessageInterface, isImageContent, isTextContent } from '@type/chat';

export const hasMeaningfulContent = (content: ContentInterface[]): boolean =>
  content.some((part) => {
    if (isImageContent(part)) return true;
    return isTextContent(part) && part.text.trim().length > 0;
  });

export const hasMeaningfulMessageContent = (messages: MessageInterface[]): boolean =>
  messages.some((message) => hasMeaningfulContent(message.content));
