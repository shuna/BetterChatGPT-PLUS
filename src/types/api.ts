export interface EventSourceDataInterface {
  choices: EventSourceDataChoices[];
  created: number;
  id: string;
  model: string;
  object: string;
}

export type EventSourceData = EventSourceDataInterface | '[DONE]';

export interface ReasoningDetail {
  type: string; // 'reasoning.text' | 'reasoning.summary' | 'reasoning.encrypted'
  text?: string;
  summary?: string;
  data?: string;
}

export interface EventSourceDataChoices {
  delta: {
    content?: string;
    role?: string;
    reasoning?: string;
    reasoning_content?: string;
    reasoning_details?: ReasoningDetail[];
  };
  finish_reason?: string;
  index: number;
}