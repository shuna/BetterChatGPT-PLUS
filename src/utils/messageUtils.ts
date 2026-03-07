import useStore from '@store/store';

import { Tiktoken } from '@dqbd/tiktoken/lite';
import {
  isImageContent,
  isTextContent,
  MessageInterface,
  TextContentInterface,
  TotalTokenUsed,
} from '@type/chat';
import { ModelOptions } from './modelReader';

let encoder: Tiktoken | null = null;
let encoderPromise: Promise<Tiktoken> | null = null;
const listeners: Set<() => void> = new Set();

export const loadEncoder = (): Promise<Tiktoken> => {
  if (encoder) return Promise.resolve(encoder);
  if (!encoderPromise) {
    encoderPromise = import('@dqbd/tiktoken/encoders/cl100k_base.json').then(
      (cl100k_base) => {
        encoder = new Tiktoken(
          cl100k_base.bpe_ranks,
          {
            ...cl100k_base.special_tokens,
            '<|im_start|>': 100264,
            '<|im_end|>': 100265,
            '<|im_sep|>': 100266,
          },
          cl100k_base.pat_str
        );
        listeners.forEach((fn) => fn());
        listeners.clear();
        return encoder;
      }
    );
  }
  return encoderPromise;
};

export const isEncoderReady = (): boolean => encoder !== null;

export const onEncoderReady = (fn: () => void): (() => void) => {
  if (encoder) {
    fn();
    return () => {};
  }
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// https://github.com/dqbd/tiktoken/issues/23#issuecomment-1483317174
export const getChatGPTEncoding = (
  messages: MessageInterface[],
  model: ModelOptions
) => {
  if (!encoder) return new Uint32Array(0);

  const isGpt3 = model === 'gpt-3.5-turbo';

  const msgSep = isGpt3 ? '\n' : '';
  const roleSep = isGpt3 ? '\n' : '<|im_sep|>';

  const serialized = [
    messages
      .map(({ role, content }) => {
        const textContent = content[0];
        const text = textContent && isTextContent(textContent) ? textContent.text : '';
        return `<|im_start|>${role}${roleSep}${
          text
        }<|im_end|>`;
      })
      .join(msgSep),
    `<|im_start|>assistant${roleSep}`,
  ].join(msgSep);

  return encoder.encode(serialized, 'all');
};

const countTokens = (messages: MessageInterface[], model: ModelOptions) => {
  if (!messages || messages.length === 0) return 0;
  return getChatGPTEncoding(messages, model).length;
};

export const limitMessageTokens = (
  messages: MessageInterface[],
  limit: number = 4096,
  model: ModelOptions
): MessageInterface[] => {
  if (!encoder) return messages;

  const limitedMessages: MessageInterface[] = [];
  let tokenCount = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const count = countTokens([messages[i]], model);
    if (count + tokenCount > limit) break;
    tokenCount += count;
    limitedMessages.unshift({ ...messages[i] });
  }

  return limitedMessages;
};

export const updateTotalTokenUsed = (
  model: ModelOptions,
  promptMessages: MessageInterface[],
  completionMessage: MessageInterface
) => {
  const setTotalTokenUsed = useStore.getState().setTotalTokenUsed;
  const updatedTotalTokenUsed: TotalTokenUsed = JSON.parse(
    JSON.stringify(useStore.getState().totalTokenUsed)
  );

  const textPrompts = promptMessages.filter(
    (e) => Array.isArray(e.content) && e.content.some(isTextContent)
  );

  const imgPrompts = promptMessages.filter(
    (e) => Array.isArray(e.content) && e.content.some(isImageContent)
  );

  const newPromptTokens = countTokens(textPrompts, model);
  const newImageTokens = countTokens(imgPrompts, model);
  const newCompletionTokens = countTokens([completionMessage], model);

  const {
    promptTokens = 0,
    completionTokens = 0,
    imageTokens = 0,
  } = updatedTotalTokenUsed[model] ?? {};

  updatedTotalTokenUsed[model] = {
    promptTokens: promptTokens + newPromptTokens,
    completionTokens: completionTokens + newCompletionTokens,
    imageTokens: imageTokens + newImageTokens,
  };

  setTotalTokenUsed(updatedTotalTokenUsed);
};

export default countTokens;
