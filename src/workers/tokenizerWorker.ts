import { Tiktoken } from '@dqbd/tiktoken/lite';

import { isTextContent, MessageInterface } from '@type/chat';
import { ModelOptions } from '@type/chat';

type InitMessage = {
  id: number;
  type: 'init';
};

type CountMessage = {
  id: number;
  type: 'countTokens';
  messages: MessageInterface[];
  model: ModelOptions;
};

type LimitMessage = {
  id: number;
  type: 'limitMessages';
  messages: MessageInterface[];
  model: ModelOptions;
  limit: number;
};

type WorkerRequest = InitMessage | CountMessage | LimitMessage;

type WorkerResponse =
  | { id: number; type: 'ready' }
  | { id: number; type: 'countTokensResult'; count: number }
  | { id: number; type: 'limitMessagesResult'; messages: MessageInterface[] }
  | { id: number; type: 'error'; message: string };

let encoder: Tiktoken | null = null;
let encoderPromise: Promise<Tiktoken> | null = null;

const loadEncoder = async (): Promise<Tiktoken> => {
  if (encoder) return encoder;
  if (!encoderPromise) {
    encoderPromise = import('@dqbd/tiktoken/encoders/cl100k_base.json').then(
      (cl100kBase) => {
        encoder = new Tiktoken(
          cl100kBase.bpe_ranks,
          {
            ...cl100kBase.special_tokens,
            '<|im_start|>': 100264,
            '<|im_end|>': 100265,
            '<|im_sep|>': 100266,
          },
          cl100kBase.pat_str
        );
        return encoder;
      }
    );
  }

  return encoderPromise;
};

const getConversationEncoding = (
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
        return `<|im_start|>${role}${roleSep}${text}<|im_end|>`;
      })
      .join(msgSep),
    `<|im_start|>assistant${roleSep}`,
  ].join(msgSep);

  return encoder.encode(serialized, 'all');
};

const countTokens = (messages: MessageInterface[], model: ModelOptions) => {
  if (!messages || messages.length === 0) return 0;
  return getConversationEncoding(messages, model).length;
};

const limitMessages = (
  messages: MessageInterface[],
  limit: number,
  model: ModelOptions
): MessageInterface[] => {
  if (!encoder) return messages;

  const limitedMessages: MessageInterface[] = [];
  let tokenCount = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const nextCount = countTokens([messages[index]], model);
    if (nextCount + tokenCount > limit) break;
    tokenCount += nextCount;
    limitedMessages.unshift({ ...messages[index] });
  }

  return limitedMessages;
};

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    await loadEncoder();

    if (request.type === 'init') {
      const response: WorkerResponse = { id: request.id, type: 'ready' };
      self.postMessage(response);
      return;
    }

    if (request.type === 'countTokens') {
      const response: WorkerResponse = {
        id: request.id,
        type: 'countTokensResult',
        count: countTokens(request.messages, request.model),
      };
      self.postMessage(response);
      return;
    }

    const response: WorkerResponse = {
      id: request.id,
      type: 'limitMessagesResult',
      messages: limitMessages(request.messages, request.limit, request.model),
    };
    self.postMessage(response);
  } catch (error: unknown) {
    const response: WorkerResponse = {
      id: request.id,
      type: 'error',
      message: error instanceof Error ? error.message : 'Tokenizer worker failed',
    };
    self.postMessage(response);
  }
};
