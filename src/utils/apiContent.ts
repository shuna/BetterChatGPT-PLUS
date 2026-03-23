import type { ReasoningDetail } from '@type/api';

type ContentBlock = {
  type?: string;
  text?: string;
  summary?: string;
  reasoning?: string;
  thinking?: string;
  content?: string;
  value?: string;
};

type ContentPayload = string | ContentBlock | Array<string | ContentBlock> | null | undefined;

const REASONING_TYPES = new Set([
  'reasoning', 'thinking', 'reasoning.text', 'reasoning.summary', 'redacted_thinking',
]);

const collectTextFromBlock = (block: string | ContentBlock): string => {
  if (typeof block === 'string') return block;
  if (!block || typeof block !== 'object') return '';

  const type = block.type ?? '';
  // Skip reasoning/thinking blocks — they are handled by collectReasoningFromBlock
  if (type && REASONING_TYPES.has(type)) return '';
  if (type === 'text' || type === 'output_text' || !type) return block.text ?? block.content ?? block.value ?? '';

  return '';
};

const collectReasoningFromBlock = (block: string | ContentBlock): string => {
  if (typeof block === 'string') return '';
  if (!block || typeof block !== 'object') return '';

  const type = block.type ?? '';
  if (
    type === 'reasoning' ||
    type === 'thinking' ||
    type === 'reasoning.text' ||
    type === 'reasoning.summary' ||
    type === 'redacted_thinking'
  ) {
    return block.text ?? block.summary ?? block.reasoning ?? block.thinking ?? block.content ?? '';
  }

  return '';
};

export const extractTextFromApiContent = (content: ContentPayload): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(collectTextFromBlock).join('');
  if (content && typeof content === 'object') return collectTextFromBlock(content);
  return '';
};

export const extractReasoningFromReasoningDetails = (
  reasoningDetails: ReasoningDetail[] | undefined
): string => {
  if (!reasoningDetails || !Array.isArray(reasoningDetails)) return '';

  return reasoningDetails
    .map((detail) => {
      if (detail.type === 'reasoning.text') return detail.text ?? '';
      if (detail.type === 'reasoning.summary') return detail.summary ?? '';
      return '';
    })
    .join('');
};

export const extractReasoningFromApiContent = (content: ContentPayload): string => {
  if (typeof content === 'string') return '';
  if (Array.isArray(content)) return content.map(collectReasoningFromBlock).join('');
  if (content && typeof content === 'object') return collectReasoningFromBlock(content);
  return '';
};
