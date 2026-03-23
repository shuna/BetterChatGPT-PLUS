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
    content?: string | Array<Record<string, unknown>> | Record<string, unknown>;
    role?: string;
    reasoning?: string;
    reasoning_content?: string;
    reasoning_details?: ReasoningDetail[];
  };
  finish_reason?: string;
  index: number;
}

/** Shape of a non-streaming chat completion response choice. */
export interface NonStreamingChoice {
  message: {
    role: string;
    content: string | Array<Record<string, unknown>> | Record<string, unknown>;
    reasoning?: string;
    reasoning_content?: string;
    reasoning_details?: ReasoningDetail[];
  };
  finish_reason?: string;
  index: number;
}

export interface NonStreamingResponse {
  id: string;
  choices: NonStreamingChoice[];
  model: string;
  object: string;
}
