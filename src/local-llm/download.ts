/**
 * HF Hub download module — pure I/O.
 *
 * Downloads model files from Hugging Face and writes them to OPFS.
 * No store mutation — all state updates are the caller's responsibility
 * via callbacks.
 *
 * Supports HTTP Range-based resume for interrupted downloads.
 */

import type { CatalogModel } from './catalog';
import {
  writeTempChunk,
  commitTempFile,
  removeTempFile,
  getTempFileSize,
  hasTempFile,
  readFile,
} from './storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DownloadProgress {
  modelId: string;
  fileName: string;
  bytesDownloaded: number;
  bytesTotal: number;
  fileIndex: number;
  fileCount: number;
}

export interface DownloadCallbacks {
  onProgress: (p: DownloadProgress) => void;
  onFileComplete: (fileName: string, fileSize: number) => void;
  onComplete: (totalBytes: number) => void;
  onError: (error: Error, modelId: string, fileName: string) => void;
  /** Called when resume was requested but server doesn't support Range */
  onResumeFallback?: (fileName: string) => void;
}

export interface DownloadRequest {
  modelId: string;
  repo: string;
  revision: string;
  files: string[];
  resume?: boolean;
}

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

export function buildHfUrl(repo: string, revision: string, filePath: string): string {
  return `https://huggingface.co/${repo}/resolve/${revision}/${filePath}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse Content-Range header: "bytes {start}-{end}/{total}"
 */
function parseContentRange(header: string | null): { start: number; end: number; total: number } | null {
  if (!header) return null;
  const match = header.match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/);
  if (!match) return null;
  const total = match[3] === '*' ? -1 : parseInt(match[3], 10);
  return {
    start: parseInt(match[1], 10),
    end: parseInt(match[2], 10),
    total,
  };
}

/**
 * Check if a final file is fully committed (exists, non-zero, no .part marker).
 *
 * A .part marker signals the download is still in progress (data is written
 * directly to the final name but the download hasn't been committed yet).
 */
async function finalFileReady(modelId: string, fileName: string): Promise<boolean> {
  try {
    const file = await readFile(modelId, fileName);
    if (file.size === 0) return false;
    // If .part marker exists, the file is still being downloaded
    const downloading = await hasTempFile(modelId, fileName);
    return !downloading;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Core download (generic)
// ---------------------------------------------------------------------------

/**
 * Download files for a model and store them in OPFS.
 *
 * For each file:
 * - If final file already exists (size > 0), skip it.
 * - If resume is true and a .part exists, attempt HTTP Range resume.
 * - Otherwise, download from scratch.
 */
export async function downloadModelFiles(
  request: DownloadRequest,
  callbacks: DownloadCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const { modelId, repo, revision, files, resume } = request;
  const fileCount = files.length;
  let totalDownloaded = 0;

  for (let i = 0; i < fileCount; i++) {
    const fileName = files[i];
    const url = buildHfUrl(repo, revision, fileName);

    try {
      // Skip already-committed files (multi-file resume: continue to next)
      if (await finalFileReady(modelId, fileName)) {
        const file = await readFile(modelId, fileName);
        totalDownloaded += file.size;
        callbacks.onFileComplete(fileName, file.size);
        continue;
      }

      let existingSize = 0;
      let isResuming = false;

      if (resume) {
        existingSize = await getTempFileSize(modelId, fileName);
      }

      let response: Response;

      if (existingSize > 0) {
        // Attempt Range-based resume
        response = await fetch(url, {
          signal,
          headers: { Range: `bytes=${existingSize}-` },
        });

        if (response.status === 206) {
          // Validate Content-Range
          const range = parseContentRange(response.headers.get('content-range'));
          if (!range || range.start !== existingSize) {
            // Mismatch — discard .part and restart
            await removeTempFile(modelId, fileName);
            existingSize = 0;
            response = await fetch(url, { signal });
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
          } else if (range.total > 0 && existingSize >= range.total) {
            // .part is corrupt or already complete — restart
            await removeTempFile(modelId, fileName);
            existingSize = 0;
            response = await fetch(url, { signal });
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
          } else {
            isResuming = true;
          }
        } else if (response.status === 416) {
          // Range not satisfiable — .part may be corrupt or complete
          await removeTempFile(modelId, fileName);
          existingSize = 0;
          response = await fetch(url, { signal });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
        } else if (response.ok) {
          // 200 — server ignored Range
          callbacks.onResumeFallback?.(fileName);
          await removeTempFile(modelId, fileName);
          existingSize = 0;
          // response is already 200 OK, use it
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } else {
        // No resume: clean start
        await removeTempFile(modelId, fileName);
        response = await fetch(url, { signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      }

      // Determine expected total
      let expectedTotal: number;
      if (isResuming) {
        const range = parseContentRange(response.headers.get('content-range'));
        expectedTotal = range?.total ?? 0;
      } else {
        expectedTotal = parseInt(response.headers.get('content-length') ?? '0', 10);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      let fileDownloaded = existingSize;
      // For resume: all chunks append. For fresh: first creates, rest append.
      let isFirstChunk = !isResuming;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        await writeTempChunk(modelId, fileName, value, !isFirstChunk);
        isFirstChunk = false;
        fileDownloaded += value.byteLength;

        callbacks.onProgress({
          modelId,
          fileName,
          bytesDownloaded: fileDownloaded,
          bytesTotal: expectedTotal || fileDownloaded,
          fileIndex: i,
          fileCount,
        });
      }

      // Integrity: check total matches if we know expected
      if (expectedTotal > 0 && fileDownloaded !== expectedTotal) {
        // Size mismatch — remove corrupt .part
        await removeTempFile(modelId, fileName);
        throw new Error(
          `Size mismatch: downloaded ${fileDownloaded} bytes, expected ${expectedTotal}`,
        );
      }

      // Commit: .part → final
      await commitTempFile(modelId, fileName);
      const fileSize = fileDownloaded - existingSize + existingSize; // total
      totalDownloaded += fileSize;
      callbacks.onFileComplete(fileName, fileSize);
    } catch (err) {
      // .part stays for potential retry/resume
      callbacks.onError(
        err instanceof Error ? err : new Error(String(err)),
        modelId,
        fileName,
      );
      return;
    }
  }

  callbacks.onComplete(totalDownloaded);
}

// ---------------------------------------------------------------------------
// Catalog model convenience wrapper
// ---------------------------------------------------------------------------

export async function downloadCatalogModel(
  model: CatalogModel,
  callbacks: DownloadCallbacks,
  signal?: AbortSignal,
  resume?: boolean,
): Promise<void> {
  return downloadModelFiles(
    {
      modelId: model.id,
      repo: model.huggingFaceRepo,
      revision: model.revision,
      files: model.downloadFiles,
      resume,
    },
    callbacks,
    signal,
  );
}
