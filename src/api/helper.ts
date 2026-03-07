import { EventSourceDataInterface } from '@type/api';

export interface ParsedSSEResult {
  events: EventSourceDataInterface[];
  partial: string;
  done: boolean;
}

export const parseEventSource = (
  data: string,
  flush: boolean = false
): ParsedSSEResult => {
  // Normalize \r\n and \r to \n
  const normalized = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split on double newline (event boundary)
  const rawEvents = normalized.split('\n\n');

  // Last segment may be incomplete unless flushing
  const partial = flush ? '' : (rawEvents.pop() ?? '');

  const events: EventSourceDataInterface[] = [];
  let done = false;

  for (const rawEvent of rawEvents) {
    if (!rawEvent.trim()) continue;

    // Collect data: lines, skip event:/id:/retry:/comment lines
    const dataLines: string[] = [];
    for (const line of rawEvent.split('\n')) {
      if (line.startsWith('data: ')) {
        dataLines.push(line.slice(6));
      } else if (line === 'data') {
        dataLines.push('');
      }
      // Skip event:, id:, retry:, and comment lines (starting with :)
    }

    if (dataLines.length === 0) continue;

    const payload = dataLines.join('\n');

    if (payload.trim() === '[DONE]') {
      done = true;
      continue;
    }

    try {
      events.push(JSON.parse(payload));
    } catch {
      // Malformed JSON – skip this event
    }
  }

  return { events, partial, done };
};

export const createMultipartRelatedBody = (
  metadata: object,
  file: File,
  boundary: string
): Blob => {
  const encoder = new TextEncoder();

  const metadataPart = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
      metadata
    )}\r\n`
  );
  const filePart = encoder.encode(
    `--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`
  );
  const endBoundary = encoder.encode(`\r\n--${boundary}--`);

  return new Blob([metadataPart, filePart, file, endBoundary], {
    type: 'multipart/related; boundary=' + boundary,
  });
};
