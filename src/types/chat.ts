export type ModelOptions = string;
import { Prompt } from './prompt';
import { Theme } from './theme';
import type { FavoriteModel, ProviderConfig, ProviderId } from './provider';

export type ChatView = 'chat' | 'branch-editor' | 'split-horizontal' | 'split-vertical';

export const isSplitView = (view: ChatView): boolean =>
  view === 'split-horizontal' || view === 'split-vertical';

export const isBranchEditorVisible = (view: ChatView): boolean =>
  view === 'branch-editor' || isSplitView(view);

// The types in this file must mimick the structure of the the API request

export type Content = 'text' | 'image_url';
export type ImageDetail = 'low' | 'high' | 'auto';
export const imageDetails: ImageDetail[] = ['low', 'high', 'auto'];
export type StreamingMarkdownPolicy = 'auto' | 'always' | 'never';
export type Role = 'user' | 'assistant' | 'system';
export const roles: Role[] = ['user', 'assistant', 'system'];

export interface ImageContentInterface {
  type: 'image_url';
  image_url: {
    url: string; // base64 or image URL
    detail: ImageDetail;
  };
}

export interface TextContentInterface {
  type: 'text';
  text: string;
}

export interface ReasoningContentInterface {
  type: 'reasoning';
  text: string;
}

export function strToTextContent(ob: string): TextContentInterface {
  return {
    type: 'text',
    text: ob
  };
}

export function isTextContent(ob: ContentInterface | undefined): ob is TextContentInterface {
  return ob !== undefined && ob !== null && ob.type === 'text';
}

export function isImageContent(ob: ContentInterface | undefined): ob is ImageContentInterface {
  return ob !== undefined && ob !== null && (ob as ImageContentInterface).image_url !== undefined;
}

export function isReasoningContent(ob: ContentInterface | undefined): ob is ReasoningContentInterface {
  return ob !== undefined && ob !== null && ob.type === 'reasoning';
}

export interface ToolCallContentInterface {
  type: 'tool_call';
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResultContentInterface {
  type: 'tool_result';
  tool_call_id: string;
  content: string;
}

export function isToolCallContent(ob: ContentInterface | undefined): ob is ToolCallContentInterface {
  return ob !== undefined && ob !== null && ob.type === 'tool_call';
}

export function isToolResultContent(ob: ContentInterface | undefined): ob is ToolResultContentInterface {
  return ob !== undefined && ob !== null && ob.type === 'tool_result';
}

export type ContentInterface =
  | TextContentInterface
  | ImageContentInterface
  | ReasoningContentInterface
  | ToolCallContentInterface
  | ToolResultContentInterface;

export interface MessageInterface {
  role: Role;
  content: ContentInterface[];
}

export interface BranchNode {
  id: string;
  parentId: string | null;
  role: Role;
  contentHash: string;
  createdAt: number;
  label?: string;
  starred?: boolean;
  pinned?: boolean;
}

/** @deprecated Pre-v12 format with inline content */
export interface BranchNodeLegacy {
  id: string;
  parentId: string | null;
  role: Role;
  content: ContentInterface[];
  createdAt: number;
  label?: string;
}

export interface BranchTree {
  nodes: Record<string, BranchNode>;
  rootId: string;
  activePath: string[];
}

export interface ChatInterface {
  id: string;
  title: string;
  folder?: string;
  messages: MessageInterface[];
  config: ConfigInterface;
  titleSet: boolean;
  imageDetail: ImageDetail;
  branchTree?: BranchTree;
  collapsedNodes?: Record<string, boolean>;
  omittedNodes?: Record<string, boolean>;
  protectedNodes?: Record<string, boolean>;
}

export interface BranchClipboard {
  nodeIds: string[];
  sourceChat: string;
  nodes: Record<string, BranchNode>;
}

export interface LocalStorageInterfaceV11ToV12
  extends LocalStorageInterfaceV10ToV11 {
  contentStore: Record<string, { content: ContentInterface[]; refCount: number }>;
}

export interface LocalStorageInterfaceV12ToV13
  extends LocalStorageInterfaceV11ToV12 {
  providerModelCache: Record<string, unknown[]>;
}

export interface LocalStorageInterfaceV13ToV14
  extends LocalStorageInterfaceV12ToV13 {
  providerCustomModels: Record<string, unknown[]>;
  _legacyCustomModels?: unknown[];
}

export interface LocalStorageInterfaceV14ToV15
  extends LocalStorageInterfaceV13ToV14 {
  onboardingCompleted: number | false;
}

export interface LocalStorageInterfaceV15ToV16
  extends LocalStorageInterfaceV14ToV15 {
  streamingMarkdownPolicy?: StreamingMarkdownPolicy;
}

export interface LocalStorageInterfaceV10ToV11
  extends LocalStorageInterfaceV9ToV10 {
  // branchTree is inside ChatInterface, no new top-level fields
}

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type Verbosity = 'low' | 'medium' | 'high' | 'max';

export interface ConfigInterface {
  model: ModelOptions;
  max_tokens: number;
  temperature: number;
  presence_penalty: number;
  top_p: number;
  frequency_penalty: number;
  stream?: boolean;
  providerId?: ProviderId;
  reasoning_effort?: ReasoningEffort;
  reasoning_budget_tokens?: number;
  verbosity?: Verbosity;
  /** Per-chat system prompt. This is the source of truth; the top system bubble is a synced view. */
  systemPrompt?: string;
}

export interface ChatHistoryInterface {
  title: string;
  index: number;
  id: string;
  chatSize?: number;
}

export interface ChatHistoryFolderInterface {
  [folderId: string]: ChatHistoryInterface[];
}

export interface FolderCollection {
  [folderId: string]: Folder;
}

export interface Folder {
  id: string;
  name: string;
  expanded: boolean;
  order: number;
  color?: string;
}

interface Pricing {
  price: number;
  unit: number;
}

interface CostDetails {
  prompt: Pricing;
  completion: Pricing;
  image: Pricing;
}

export interface ModelCost {
  [modelName: string]: CostDetails;
}

export type TotalTokenUsed = {
  [model in ModelOptions]?: {
    promptTokens: number;
    completionTokens: number;
    imageTokens: number;
  };
};
export interface LocalStorageInterfaceV0ToV1 {
  chats: ChatInterface[];
  currentChatIndex: number;
  apiKey: string;
  apiFree: boolean;
  apiFreeEndpoint: string;
  theme: Theme;
}

export interface LocalStorageInterfaceV1ToV2 {
  chats: ChatInterface[];
  currentChatIndex: number;
  apiKey: string;
  apiFree: boolean;
  apiFreeEndpoint: string;
  apiEndpoint?: string;
  theme: Theme;
}

export interface LocalStorageInterfaceV2ToV3 {
  chats: ChatInterface[];
  currentChatIndex: number;
  apiKey: string;
  apiFree: boolean;
  apiFreeEndpoint: string;
  apiEndpoint?: string;
  theme: Theme;
  autoTitle: boolean;
}
export interface LocalStorageInterfaceV3ToV4 {
  chats: ChatInterface[];
  currentChatIndex: number;
  apiKey: string;
  apiFree: boolean;
  apiFreeEndpoint: string;
  apiEndpoint?: string;
  theme: Theme;
  autoTitle: boolean;
  prompts: Prompt[];
}

export interface LocalStorageInterfaceV4ToV5 {
  chats: ChatInterface[];
  currentChatIndex: number;
  apiKey: string;
  apiFree: boolean;
  apiFreeEndpoint: string;
  apiEndpoint?: string;
  theme: Theme;
  autoTitle: boolean;
  prompts: Prompt[];
}

export interface LocalStorageInterfaceV5ToV6 {
  chats: ChatInterface[];
  currentChatIndex: number;
  apiKey: string;
  apiFree: boolean;
  apiFreeEndpoint: string;
  apiEndpoint?: string;
  theme: Theme;
  autoTitle: boolean;
  prompts: Prompt[];
}

export interface LocalStorageInterfaceV6ToV7 {
  chats: ChatInterface[];
  currentChatIndex: number;
  apiFree?: boolean;
  apiKey: string;
  apiEndpoint: string;
  theme: Theme;
  autoTitle: boolean;
  prompts: Prompt[];
  defaultChatConfig: ConfigInterface;
  defaultSystemMessage: string;
  hideMenuOptions: boolean;
  firstVisit: boolean;
  hideSideMenu: boolean;
}

export interface LocalStorageInterfaceV7oV8
  extends LocalStorageInterfaceV6ToV7 {
  foldersName: string[];
  foldersExpanded: boolean[];
  folders: FolderCollection;
}
export interface LocalStorageInterfaceV8oV8_1
  extends LocalStorageInterfaceV7oV8 {
  apiVersion: string;
}

export interface LocalStorageInterfaceV8_1ToV8_2
  extends LocalStorageInterfaceV8oV8_1 {
  menuWidth: number;
  displayChatSize: boolean;
}

export interface LocalStorageInterfaceV8_2ToV9
  extends LocalStorageInterfaceV8_1ToV8_2 {
  defaultImageDetail: ImageDetail;
}

export interface LocalStorageInterfaceV9ToV10
  extends LocalStorageInterfaceV8_2ToV9 {
  providers?: Partial<Record<ProviderId, ProviderConfig>>;
  favoriteModels?: FavoriteModel[];
}

export interface GeneratingSession {
  sessionId: string;
  chatId: string;
  chatIndex: number;
  messageIndex: number;
  targetNodeId: string;
  mode: 'append' | 'midchat';
  insertIndex: number | null;
  requestPath: 'sw' | 'fetch';
  startedAt: number;
}
