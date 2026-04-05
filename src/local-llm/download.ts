/**
 * HF Hub download module — pure I/O.
 *
 * Downloads model files from Hugging Face and writes them to OPFS.
 * No store mutation — all state updates are the caller's responsibility
 * via callbacks.
 *
 * Retry (not Resume): re-download overwrites .part from scratch.
 * No HTTP Range headers in the initial implementation.
 */

import type { CatalogModel } from './catalog';
import { writeTempChunk, commitTempFile, removeTempFile } from './storage';

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
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

function buildHfUrl(repo: string, revision: string, filePath: string): string {
  return `https://huggingface.co/${repo}/resolve/${revision}/${filePath}`;
}

/**
 * Download all files for a catalog model and store them in OPFS.
 *
 * Streams each file through fetch → OPFS temp file → commit.
 * On abort/error: .part stays in OPFS for the caller to clean up
 * or retry.
 */
export async function downloadCatalogModel(
  model: CatalogModel,
  callbacks: DownloadCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const { id: modelId, huggingFaceRepo, revision, downloadFiles } = model;
  const fileCount = downloadFiles.length;
  let totalDownloaded = 0;

  for (let i = 0; i < fileCount; i++) {
    const fileName = downloadFiles[i];
    const url = buildHfUrl(huggingFaceRepo, revision, fileName);

    try {
      // Clean up any previous .part for this file (retry scenario)
      await removeTempFile(modelId, fileName);

      const response = await fetch(url, { signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      let fileDownloaded = 0;
      let isFirstChunk = true;

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
          bytesTotal: contentLength,
          fileIndex: i,
          fileCount,
        });
      }

      // Commit: .part → final
      await commitTempFile(modelId, fileName);
      totalDownloaded += fileDownloaded;
      callbacks.onFileComplete(fileName, fileDownloaded);
    } catch (err) {
      // .part stays for potential retry
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
