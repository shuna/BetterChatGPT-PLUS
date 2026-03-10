import { isTextContent, type MessageInterface, type ModelOptions } from '@type/chat';

const getMessageText = (message: MessageInterface): string =>
  message.content
    .filter(isTextContent)
    .map((content) => content.text)
    .join('\n');

export const serializeMessagesForTokenCount = (
  messages: MessageInterface[],
  model: ModelOptions
): string => {
  const isGpt3 = model === 'gpt-3.5-turbo';
  const msgSep = isGpt3 ? '\n' : '';
  const roleSep = isGpt3 ? '\n' : '<|im_sep|>';

  return [
    messages
      .map(({ role, ...message }) => {
        const text = getMessageText({ role, ...message });
        return `<|im_start|>${role}${roleSep}${text}<|im_end|>`;
      })
      .join(msgSep),
    `<|im_start|>assistant${roleSep}`,
  ].join(msgSep);
};
