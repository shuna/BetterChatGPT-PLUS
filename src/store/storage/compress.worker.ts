import { compressToUTF16 } from 'lz-string';

export interface CompressRequest {
  id: number;
  name: string;
  value: string;
}

export interface CompressResponse {
  id: number;
  name: string;
  compressed: string;
}

self.onmessage = (e: MessageEvent<CompressRequest>) => {
  const { id, name, value } = e.data;
  const compressed = compressToUTF16(value);
  const response: CompressResponse = { id, name, compressed };
  self.postMessage(response);
};
