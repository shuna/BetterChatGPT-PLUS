/**
 * Web Worker for lowbit-Q GGUF conversion.
 *
 * Routes to the v2 mixed-bit pipeline (convertToLowbitQV2StreamingToOPFS) by
 * default, streaming directly to OPFS for low peak memory. The in-memory v2
 * path (convertToLowbitQV2Streaming) is no longer supported here — callers
 * must always provide an opfsTarget for the v2 pipeline.
 *
 * Falls back to the legacy v1 pipeline (convertToLowbitQStreaming) only when
 * explicitly requested via the deprecated `convertMode` field.
 *
 * Message protocol:
 *   Main → Worker: ConversionStartRequest
 *   Worker → Main: { id, type: 'progress', progress: ConversionProgress }
 *   Worker → Main: { id, type: 'done', result: Blob, originalSize, convertedSize, tensorRecords? }
 *   Worker → Main: { id, type: 'error', message: string }
 */

import {
  convertToLowbitQStreaming,
  convertToLowbitQV2StreamingToOPFS,
} from '../local-llm/lowbit-q/convert';
import { createTensorFilter, type LowbitQConvertMode } from '../local-llm/lowbit-q/tensorFilter';
import { DEFAULT_ALLOCATOR_CONFIG } from '../local-llm/lowbit-q/allocator';
import type {
  ConversionStartRequest,
  ConversionProgressMessage,
  ConversionDoneMessage,
  ConversionErrorMessage,
} from '../local-llm/lowbit-q/types';

// ---------------------------------------------------------------------------
// Chunked source: virtual Blob-like object backed by Uint8Array chunks
// ---------------------------------------------------------------------------

/**
 * Creates an object that duck-types as `File | Blob` for the conversion
 * pipeline, backed by an array of Uint8Array chunks. This avoids creating a
 * single multi-GB Blob (which exceeds Chrome's Worker Blob store limit of
 * ~2 GB, throwing NotReadableError on slice/arrayBuffer calls).
 *
 * Supported operations (used by ggufParser / convert.ts):
 *   - `.size`          → total byte length
 *   - `.slice(s, e)`   → returns a Blob of the requested range
 *   - `.arrayBuffer()` → returns an ArrayBuffer of the full data
 */
function createChunkedSource(
  chunks: Uint8Array[],
  totalSize: number,
): File | Blob {
  // Build an offset index for O(log n) chunk lookup
  const offsets: number[] = [];
  let acc = 0;
  for (const c of chunks) {
    offsets.push(acc);
    acc += c.byteLength;
  }

  function readRange(start: number, end: number): Uint8Array {
    const length = end - start;
    const result = new Uint8Array(length);
    let written = 0;

    // Find the first chunk via binary search
    let lo = 0;
    let hi = offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (offsets[mid] <= start) lo = mid;
      else hi = mid - 1;
    }

    for (let i = lo; i < chunks.length && written < length; i++) {
      const chunkStart = offsets[i];
      const chunkEnd = chunkStart + chunks[i].byteLength;
      if (chunkEnd <= start) continue;
      if (chunkStart >= end) break;
      const srcStart = Math.max(0, start - chunkStart);
      const srcEnd = Math.min(chunks[i].byteLength, end - chunkStart);
      result.set(chunks[i].subarray(srcStart, srcEnd), written);
      written += srcEnd - srcStart;
    }
    return result;
  }

  // Return an object that satisfies the File | Blob type duck-typing.
  // The conversion code only uses .size, .slice(), and occasionally .arrayBuffer().
  const proxy = {
    size: totalSize,
    type: 'application/octet-stream',
    name: 'source.gguf',
    lastModified: Date.now(),
    slice(start?: number, end?: number, _contentType?: string) {
      const s = start ?? 0;
      const e = end ?? totalSize;
      return new Blob([readRange(s, e)]);
    },
    async arrayBuffer(): Promise<ArrayBuffer> {
      return readRange(0, totalSize).buffer;
    },
    stream() {
      const data = readRange(0, totalSize);
      return new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      });
    },
    text() {
      return new Blob([readRange(0, totalSize)]).text();
    },
  };

  // Cast to File to satisfy TypeScript
  return proxy as unknown as File;
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

async function handleStart(req: ConversionStartRequest) {
  try {
    let file: File | Blob = req.sourceFile;

    // When sourceUrl is provided, fetch the source in the Worker context.
    // This avoids:
    //   1. The Chromium ~2 GB per-file OPFS limit
    //   2. The ~3 GB structured-clone limit for postMessage(File)
    // The Worker streams the response into 64 MB merged buffers, then
    // creates a Blob that the conversion pipeline can read.
    if (req.sourceUrl) {
      console.info(`[lowbitQConversionWorker] Fetching source from URL: ${req.sourceUrl}`);
      respondProgress(req.id, {
        stage: 'reading',
        currentTensor: 0,
        totalTensors: 0,
        currentTensorName: 'ソースファイルをHTTPからダウンロード中...',
        percent: 0,
      });
      const response = await fetch(req.sourceUrl);
      if (!response.ok || !response.body) {
        respondError(req.id, `ソースファイルのダウンロードに失敗: HTTP ${response.status}`);
        return;
      }
      const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
      const MERGE_SIZE = 64 * 1024 * 1024;
      const reader = response.body.getReader();
      const merged: Uint8Array[] = [];
      let current = new Uint8Array(MERGE_SIZE);
      let offset = 0;
      let totalBytes = 0;
      let lastPct = -10;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        let srcOff = 0;
        while (srcOff < value.byteLength) {
          const space = MERGE_SIZE - offset;
          const toCopy = Math.min(space, value.byteLength - srcOff);
          current.set(value.subarray(srcOff, srcOff + toCopy), offset);
          offset += toCopy;
          srcOff += toCopy;
          if (offset === MERGE_SIZE) {
            merged.push(current);
            current = new Uint8Array(MERGE_SIZE);
            offset = 0;
          }
        }
        totalBytes += value.byteLength;
        const pct = contentLength > 0 ? Math.round((totalBytes / contentLength) * 100) : 0;
        if (pct >= lastPct + 10) {
          respondProgress(req.id, {
            stage: 'reading',
            currentTensor: 0,
            totalTensors: 0,
            currentTensorName: `ソースファイルをダウンロード中... ${Math.round(totalBytes / 1024 / 1024)} MB`,
            percent: Math.round(pct * 0.1), // 0-10% range for download phase
          });
          lastPct = pct;
        }
      }
      if (offset > 0) merged.push(current.slice(0, offset));

      // Create a virtual Blob-like source that reads from the in-memory
      // chunks without creating a single multi-GB Blob (which fails in
      // Chrome's Worker Blob store for files > ~2 GB).
      file = createChunkedSource(merged, totalBytes);
      console.info(`[lowbitQConversionWorker] Source fetched: ${Math.round(totalBytes / 1024 / 1024)} MB in ${merged.length} buffers`);
    }

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

    const onProgress = (progress: Parameters<typeof respondProgress>[1]) => {
      respondProgress(req.id, progress);
    };

    // ---------------------------------------------------------------------------
    // v2 path (default): mixed-bit allocator pipeline
    // ---------------------------------------------------------------------------
    // Use legacy v1 only when the deprecated `convertMode` field is explicitly set
    // and no allocatorConfig is provided. This preserves backward compatibility
    // for callers that have not yet migrated to the v2 API.
    const useLegacyV1 = req.convertMode !== undefined && req.allocatorConfig === undefined;

    let result:
      | { data: Uint8Array; originalSize: number; convertedSize: number; tensorRecords: unknown[] }
      | { originalSize: number; convertedSize: number; tensorRecords: unknown[] };

    if (useLegacyV1) {
      // Legacy v1: uniform SVID_1BIT conversion controlled by convertMode filter
      const convertMode = (req.convertMode ?? 'all') as LowbitQConvertMode;
      const tensorFilter = createTensorFilter(convertMode);
      result = await convertToLowbitQStreaming(file, {
        onProgress,
        computeQuality: req.computeQuality ?? false,
        tensorFilter,
      });
    } else {
      // v2: mixed-bit allocation pipeline (default for all new callers)
      // opfsTarget is required — the in-memory path (convertToLowbitQV2Streaming)
      // allocates the entire output as a single Uint8Array and will OOM on large
      // models. All production callers must provide opfsTarget.
      if (!req.opfsTarget) {
        respondError(req.id,
          'v2変換にはopfsTargetが必須です。' +
          'in-memoryフォールバックはメモリ不足リスクのため廃止されました。');
        return;
      }
      const allocatorConfig = req.allocatorConfig ?? DEFAULT_ALLOCATOR_CONFIG;
      // For large source files (>2 GB), pass sourceOpfsInfo so the conversion
      // can delete the source from OPFS before writing the output, avoiding
      // quota overflow when both files would exceed the effective OPFS limit.
      const sourceOpfsInfo = req.sourceOpfsInfo;
      console.info('[lowbitQConversionWorker] sourceOpfsInfo:', sourceOpfsInfo ? JSON.stringify(sourceOpfsInfo) : 'undefined');
      result = await convertToLowbitQV2StreamingToOPFS(file, req.opfsTarget, {
        onProgress,
        computeQuality: req.computeQuality ?? false,
        allocatorConfig,
        totalLayers: req.totalLayers,
        sourceModelName: req.sourceModelName,
        sourceOpfsInfo,
      });
    }

    const msg: ConversionDoneMessage = {
      id: req.id,
      type: 'done',
      originalSize: result.originalSize,
      convertedSize: result.convertedSize,
      tensorRecords: result.tensorRecords as ConversionDoneMessage['tensorRecords'],
      persistedToOpfs: req.opfsTarget !== undefined,
    };
    if ('data' in result) {
      msg.result = new Blob([result.data], { type: 'application/octet-stream' });
    }
    self.postMessage(msg);
  } catch (e) {
    const err = e as Error;
    respondError(req.id, `Lowbit-Q変換に失敗しました: ${err.message}`);
  }
}

function respondProgress(id: number, progress: ConversionProgressMessage['progress']) {
  const msg: ConversionProgressMessage = { id, type: 'progress', progress };
  self.postMessage(msg);
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
