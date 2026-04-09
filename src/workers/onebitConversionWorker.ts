/**
 * Web Worker for onebit GGUF conversion.
 *
 * Uses the streaming conversion API: the source file is NOT read entirely
 * into memory. Instead, File.slice() reads individual tensors on demand,
 * keeping peak memory to roughly one tensor's worth of fp32 data.
 *
 * Message protocol:
 *   Main → Worker: { id, type: 'start', sourceFile: File, convertMode?, computeQuality? }
 *   Worker → Main: { id, type: 'progress', progress: ConversionProgress }
 *   Worker → Main: { id, type: 'done', result: Blob, originalSize, convertedSize, tensorRecords? }
 *   Worker → Main: { id, type: 'error', message: string }
 */

import { convertToOnebitStreaming } from '../local-llm/onebit/convert';
import { createTensorFilter, type OnebitConvertMode } from '../local-llm/onebit/tensorFilter';
import type {
  ConversionStartRequest,
  ConversionProgressMessage,
  ConversionDoneMessage,
  ConversionErrorMessage,
} from '../local-llm/onebit/types';

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

async function handleStart(req: ConversionStartRequest) {
  try {
    const file = req.sourceFile;

    // Validate source file
    if (!file || file.size === 0) {
      respondError(req.id, '変換元のファイルが空または無効です。');
      return;
    }

    // Validate GGUF magic (read only first 4 bytes)
    const magicSlice = await file.slice(0, 4).arrayBuffer();
    const magic = new Uint8Array(magicSlice);
    if (magic[0] !== 0x47 || magic[1] !== 0x47 || magic[2] !== 0x55 || magic[3] !== 0x46) {
      respondError(req.id,
        'GGUFファイルの検証に失敗しました: マジックバイトが不正です。' +
        'GGUF形式のファイルを指定してください。');
      return;
    }

    // Build tensor filter from convert mode
    const convertMode = (req.convertMode ?? 'all') as OnebitConvertMode;
    const tensorFilter = createTensorFilter(convertMode);
    const computeQuality = req.computeQuality ?? false;

    // Run streaming conversion — does NOT load entire file into memory.
    // Each tensor is read via File.slice() on demand.
    const result = await convertToOnebitStreaming(file, {
      onProgress: (progress) => {
        const msg: ConversionProgressMessage = {
          id: req.id,
          type: 'progress',
          progress,
        };
        self.postMessage(msg);
      },
      computeQuality,
      tensorFilter,
    });

    // Return result as Blob
    const blob = new Blob([result.data], { type: 'application/octet-stream' });
    const msg: ConversionDoneMessage = {
      id: req.id,
      type: 'done',
      result: blob,
      originalSize: result.originalSize,
      convertedSize: result.convertedSize,
      tensorRecords: result.tensorRecords,
    };
    self.postMessage(msg);
  } catch (e) {
    const err = e as Error;
    respondError(req.id,
      `Onebit変換に失敗しました: ${err.message}`);
  }
}

function respondError(id: number, message: string) {
  const msg: ConversionErrorMessage = { id, type: 'error', message };
  self.postMessage(msg);
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

self.onmessage = async (ev: MessageEvent<ConversionStartRequest>) => {
  const req = ev.data;

  switch (req.type) {
    case 'start':
      await handleStart(req);
      break;
    default:
      respondError(
        (req as { id: number }).id,
        `Unknown message type: ${(req as { type: string }).type}`,
      );
  }
};
