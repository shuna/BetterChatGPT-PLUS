import { v4 as uuidv4 } from 'uuid';
import {
  ChatInterface,
  ConfigInterface,
  ImageDetail,
  TextContentInterface,
} from '@type/chat';
import useStore from '@store/store';
import { normalizeConfigStream } from '@utils/streamSupport';

const date = new Date();
const dateString =
  date.getFullYear() +
  '-' +
  ('0' + (date.getMonth() + 1)).slice(-2) +
  '-' +
  ('0' + date.getDate()).slice(-2);

// default system message obtained using the following method: https://twitter.com/DeminDimin/status/1619935545144279040
export const _defaultSystemMessage =
  import.meta.env.VITE_DEFAULT_SYSTEM_MESSAGE ??
  `You are a large language model assistant.
Carefully heed the user's instructions. 
Respond using Markdown.`;

export const defaultApiVersion = '2024-04-01-preview';
export const defaultModel = '';

export const defaultUserMaxToken = 4000;
export const reduceMessagesToTotalToken = 256000; // sufficient for almost all models; gemini has 1.5kk though

export const _defaultChatConfig: ConfigInterface = {
  model: defaultModel,
  max_tokens: defaultUserMaxToken,
  temperature: 1,
  presence_penalty: 0,
  top_p: 1,
  frequency_penalty: 0,
  stream: true,
};

export const generateDefaultChat = (
  title?: string,
  folder?: string
): ChatInterface => {
  const state = useStore.getState();
  const systemPrompt = state.defaultSystemMessage || undefined;
  return {
    id: uuidv4(),
    title: title ? title : 'New Chat',
    messages: [],
    config: normalizeConfigStream({
      ...state.defaultChatConfig,
      systemPrompt,
    }),
    titleSet: false,
    folder,
    imageDetail: state.defaultImageDetail,
  };
};

export const codeLanguageSubset = [
  'python',
  'javascript',
  'java',
  'go',
  'bash',
  'c',
  'cpp',
  'csharp',
  'css',
  'diff',
  'graphql',
  'json',
  'kotlin',
  'less',
  'lua',
  'makefile',
  'markdown',
  'objectivec',
  'perl',
  'php',
  'php-template',
  'plaintext',
  'python-repl',
  'r',
  'ruby',
  'rust',
  'scss',
  'shell',
  'sql',
  'swift',
  'typescript',
  'vbnet',
  'wasm',
  'xml',
  'yaml',
];

export const _defaultMenuWidth = 260;
export const _defaultDisplayChatSize = false;
export const _defaultImageDetail: ImageDetail = 'auto';
