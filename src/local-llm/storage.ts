/**
 * OPFS (Origin Private File System) storage layer for local LLM models.
 *
 * Provides persistent storage for model files downloaded from HF Hub.
 * Separated from Zustand/IndexedDB — large binary files live in OPFS,
 * lightweight metadata lives in the store.
 *
 * Directory layout:
 *   <opfs-root>/
 *     models/
 *       <modelId>/
 *         <file>.gguf          — final committed file
 *         <file>.gguf.part     — temp file during download
 */

import type {
  LocalModelManifest,
  LocalModelSource,
} from './types';
import type { ModelFileProvider, CustomCacheAdapter } from './fileProvider';
import { resolveUrlToManifestKey } from './fileProvider';

// ---------------------------------------------------------------------------
// File System Access API augmentation (createWritable not in default DOM lib)
// ---------------------------------------------------------------------------

interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string | { type: string; data?: unknown; position?: number; size?: number }): Promise<void>;
  seek(position: number): Promise<void>;
  truncate(size: number): Promise<void>;
  close(): Promise<void>;
}

interface WritableFileHandle {
  createWritable(opts?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
  getFile(): Promise<File>;
}

// ---------------------------------------------------------------------------
// Storage state types
// ---------------------------------------------------------------------------

export type StorageVerifyResult = 'saved' | 'partial' | 'invalid' | 'none';

export interface SavedModelMeta {
  storageState: 'none' | 'downloading' | 'saved' | 'partial';
  storedBytes: number;
  storedFiles: string[];
  fileHashes?: Record<string, string>;
  lastVerifiedAt?: number;
  lastError?: string;
  downloadRevision?: string;
}

// ---------------------------------------------------------------------------
// Core OPFS operations
// ---------------------------------------------------------------------------

const MODELS_DIR = 'models';
const PART_SUFFIX = '.part';

/** GGUF magic bytes: "GGUF" in little-endian */
const GGUF_MAGIC = new Uint8Array([0x47, 0x47, 0x55, 0x46]);

/**
 * Check whether a File/Blob starts with the GGUF magic header.
 * Returns false for files smaller than 4 bytes or with wrong magic.
 */
export async function hasGgufMagic(file: File | Blob): Promise<boolean> {
  if (file.size < 4) return false;
  const buf = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return (
    buf[0] === GGUF_MAGIC[0] &&
    buf[1] === GGUF_MAGIC[1] &&
    buf[2] === GGUF_MAGIC[2] &&
    buf[3] === GGUF_MAGIC[3]
  );
}

/**
 * Large files (e.g. multi-GB GGUFs from external volumes) cannot be read into
 * a single ArrayBuffer – the browser may throw NotReadableError or OOM.
 * For files above this threshold we hash head + tail + encoded size instead.
 */
const PARTIAL_HASH_THRESHOLD = 64 * 1024 * 1024; // 64 MB
const PARTIAL_HASH_CHUNK = 1024 * 1024; // 1 MB

export async function sha256Blob(blob: Blob): Promise<string> {
  let dataToHash: ArrayBuffer;

  if (blob.size <= PARTIAL_HASH_THRESHOLD) {
    dataToHash = await blob.arrayBuffer();
  } else {
    // Partial hash: first 1 MB + last 1 MB + file-size string
    const head = await blob.slice(0, PARTIAL_HASH_CHUNK).arrayBuffer();
    const tail = await blob.slice(blob.size - PARTIAL_HASH_CHUNK).arrayBuffer();
    const sizeTag = new TextEncoder().encode(String(blob.size));
    const combined = new Uint8Array(head.byteLength + tail.byteLength + sizeTag.byteLength);
    combined.set(new Uint8Array(head), 0);
    combined.set(new Uint8Array(tail), head.byteLength);
    combined.set(sizeTag, head.byteLength + tail.byteLength);
    dataToHash = combined.buffer as ArrayBuffer;
  }

  const hash = await crypto.subtle.digest('SHA-256', dataToHash);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function opfsRoot(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory();
}

async function getModelsRoot(): Promise<FileSystemDirectoryHandle> {
  const root = await opfsRoot();
  return root.getDirectoryHandle(MODELS_DIR, { create: true });
}

export async function getModelDir(modelId: string): Promise<FileSystemDirectoryHandle> {
  const modelsRoot = await getModelsRoot();
  return modelsRoot.getDirectoryHandle(modelId, { create: true });
}

/**
 * Save a complete file to OPFS.
 *
 * Streams the blob in natural read-chunks (same pattern as openDownloadWriter)
 * so that large files from external volumes don't require a single contiguous
 * ArrayBuffer and no intermediate copies are created.
 */
export async function saveFile(
  modelId: string,
  relativePath: string,
  blob: Blob,
): Promise<void> {
  const dir = await getModelDir(modelId);
  const fileHandle = await dir.getFileHandle(relativePath, { create: true }) as unknown as WritableFileHandle;
  const writable = await fileHandle.createWritable();
  try {
    const reader = blob.stream().getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
      }
    } finally {
      reader.releaseLock();
    }
    await writable.close();
  } catch (err) {
    try { await writable.abort(); } catch { /* ignore */ }
    throw err;
  }
}

/**
 * Open a fresh OPFS writable stream for streaming writes.
 *
 * Always truncates to zero (keepExistingData: false). The caller must
 * close() on success or abort() on failure. Using a single writable for
 * the entire write avoids the seek-after-getFile pattern that is
 * susceptible to stale-size races on some Chrome builds.
 */
export async function createOPFSWritable(
  modelId: string,
  relativePath: string,
): Promise<FileSystemWritableFileStream> {
  const dir = await getModelDir(modelId);
  const fileHandle = await dir.getFileHandle(relativePath, { create: true }) as unknown as WritableFileHandle;
  return fileHandle.createWritable({ keepExistingData: false });
}

/**
 * Minimal writer interface that mirrors the subset of FileSystemWritableFileStream
 * used by the conversion pipeline (write / close / abort).
 */
export interface OPFSWriter {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

/**
 * Create a writer backed by FileSystemSyncAccessHandle.
 *
 * Unlike createOPFSWritable() (which uses createWritable()), SyncAccessHandle
 * writes directly to the file without a swap-file staging area. This avoids
 * the ~2x storage overhead that causes quota errors for large files (>2 GB).
 *
 * IMPORTANT: Only available in Worker contexts. The file is truncated to 0
 * before the first write. Writes are committed immediately on close/flush.
 */
export async function createOPFSSyncWriter(
  modelId: string,
  relativePath: string,
): Promise<OPFSWriter> {
  const dir = await getModelDir(modelId);
  const fileHandle = await dir.getFileHandle(relativePath, { create: true });
  // @ts-expect-error — createSyncAccessHandle is available in Worker OPFS
  const accessHandle: FileSystemSyncAccessHandle = await fileHandle.createSyncAccessHandle();
  accessHandle.truncate(0);

  let offset = 0;

  return {
    async write(data: Uint8Array): Promise<void> {
      const written = accessHandle.write(data, { at: offset });
      if (written !== data.byteLength) {
        throw new Error(
          `OPFS SyncAccessHandle write incomplete at offset ${offset}: ` +
          `expected ${data.byteLength} bytes but wrote ${written}. ` +
          `Total written so far: ${offset + written} bytes. ` +
          `Likely storage quota exceeded.`,
        );
      }
      offset += written;
    },
    async close(): Promise<void> {
      accessHandle.flush();
      accessHandle.close();
    },
    async abort(): Promise<void> {
      try {
        accessHandle.close();
      } catch {
        // ignore close errors during abort
      }
    },
  };
}

/**
 * Return the current committed size of an OPFS file in bytes.
 * Returns 0 if the file does not exist.
 */
export async function getOPFSFileSize(
  modelId: string,
  relativePath: string,
): Promise<number> {
  try {
    const dir = await getModelDir(modelId);
    const fileHandle = await dir.getFileHandle(relativePath);
    const file = await (fileHandle as unknown as WritableFileHandle).getFile();
    return file.size;
  } catch {
    return 0;
  }
}

/**
 * Read a file from OPFS.
 */
export async function readFile(
  modelId: string,
  relativePath: string,
): Promise<File> {
  const dir = await getModelDir(modelId);
  const fileHandle = await dir.getFileHandle(relativePath);
  return fileHandle.getFile();
}

/**
 * List final files for a model (excludes .part temp files).
 */
export async function listFiles(modelId: string): Promise<string[]> {
  const dir = await getModelDir(modelId);
  const files: string[] = [];
  for await (const [name, handle] of (dir as any).entries()) {
    if (handle.kind === 'file' && !name.endsWith(PART_SUFFIX)) {
      files.push(name);
    }
  }
  return files;
}

/**
 * List all model IDs stored in OPFS.
 */
export async function listSavedModelIds(): Promise<string[]> {
  const modelsRoot = await getModelsRoot();
  const ids: string[] = [];
  for await (const [name, handle] of (modelsRoot as any).entries()) {
    if (handle.kind === 'directory') {
      ids.push(name);
    }
  }
  return ids;
}

/**
 * Get total stored size for a model.
 * @param includeTemp If true, includes .part files in the total.
 */
export async function getStoredSize(
  modelId: string,
  opts?: { includeTemp?: boolean },
): Promise<number> {
  const dir = await getModelDir(modelId);
  let total = 0;
  for await (const [name, handle] of (dir as any).entries()) {
    if (handle.kind === 'file') {
      if (!opts?.includeTemp && name.endsWith(PART_SUFFIX)) continue;
      const file: File = await handle.getFile();
      total += file.size;
    }
  }
  return total;
}

/**
 * Recursively delete a model's directory from OPFS.
 */
export async function deleteModel(modelId: string): Promise<void> {
  const modelsRoot = await getModelsRoot();
  await modelsRoot.removeEntry(modelId, { recursive: true });
}

// ---------------------------------------------------------------------------
// Temp file operations (for streaming downloads)
//
// Strategy: data is written directly to the final file name.
// A zero-byte .part marker file signals "download in progress".
// This avoids FileSystemFileHandle.move() (unsupported on Safari/iOS)
// and eliminates both the memory spike and storage duplication that
// a read-all → copy → delete commit path would cause.
//
// Backward compat: old .part files that contain actual data (from
// pre-marker versions) are detected by checking .part size > 0 and
// handled with a streaming copy.
// ---------------------------------------------------------------------------

/**
 * Streaming writer for downloads.
 *
 * Opens a single FileSystemWritableFileStream for the entire download
 * instead of opening/closing one per chunk. This avoids the O(n²)
 * internal copy overhead that createWritable({ keepExistingData: true })
 * incurs when called repeatedly.
 */
export interface DownloadWriter {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

export async function openDownloadWriter(
  modelId: string,
  relativePath: string,
  resumeOffset: number,
): Promise<DownloadWriter> {
  const dir = await getModelDir(modelId);
  const fileHandle = await dir.getFileHandle(relativePath, { create: true }) as unknown as WritableFileHandle;
  const keepExisting = resumeOffset > 0;
  const writable = await fileHandle.createWritable({ keepExistingData: keepExisting });
  if (keepExisting) {
    await writable.seek(resumeOffset);
  }
  // Create .part marker once (zero-byte sentinel = "download in progress")
  await dir.getFileHandle(relativePath + PART_SUFFIX, { create: true });

  return {
    write: (chunk: Uint8Array) => writable.write(chunk),
    close: () => writable.close(),
    abort: async () => {
      try { await writable.abort(); } catch { /* ignore */ }
    },
  };
}

/**
 * Write a chunk to the target file (final name) during download.
 * Maintains a zero-byte .part marker to signal "in progress".
 *
 * @deprecated Use openDownloadWriter() for streaming downloads.
 * @param append false = create/truncate, true = append
 */
export async function writeTempChunk(
  modelId: string,
  relativePath: string,
  chunk: Uint8Array,
  append: boolean,
): Promise<void> {
  const dir = await getModelDir(modelId);

  // Write data directly to the final file name
  const fileHandle = await dir.getFileHandle(relativePath, { create: true }) as unknown as WritableFileHandle;
  const writable = await fileHandle.createWritable({ keepExistingData: append });
  if (append) {
    const file = await fileHandle.getFile();
    await writable.seek(file.size);
  }
  await writable.write(chunk);
  await writable.close();

  // Ensure .part marker exists (zero-byte sentinel = "download in progress")
  await dir.getFileHandle(relativePath + PART_SUFFIX, { create: true });
}

/**
 * Commit a downloaded file: remove the .part marker.
 *
 * In the current design data is already at the final name, so this
 * just deletes the marker.  For backward compat, if the .part file
 * contains actual data (legacy format), it is streamed to the final
 * name in constant memory before deletion.
 */
export async function commitTempFile(
  modelId: string,
  relativePath: string,
): Promise<void> {
  const dir = await getModelDir(modelId);
  const partName = relativePath + PART_SUFFIX;

  let partHandle: FileSystemFileHandle;
  try {
    partHandle = await dir.getFileHandle(partName);
  } catch {
    // No marker — nothing to commit
    return;
  }

  const partFile = await partHandle.getFile();

  if (partFile.size > 0) {
    // Legacy .part that holds actual data — stream-copy to final name.
    // Uses chunked reads to keep memory constant regardless of file size.
    const finalHandle = await dir.getFileHandle(relativePath, { create: true }) as unknown as WritableFileHandle;
    const writable = await finalHandle.createWritable();
    const reader = (partFile.stream() as ReadableStream<Uint8Array>).getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
      }
    } finally {
      await writable.close();
    }
    await dir.removeEntry(partName);
  } else {
    // Current format: marker-only — just delete it
    await dir.removeEntry(partName);
  }
}

/**
 * Check if a .part marker exists (download in progress or legacy .part).
 */
export async function hasTempFile(
  modelId: string,
  relativePath: string,
): Promise<boolean> {
  const dir = await getModelDir(modelId);
  try {
    await dir.getFileHandle(relativePath + PART_SUFFIX);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the byte count downloaded so far for a file.
 *
 * - Legacy .part (size > 0): returns .part size (data lives there).
 * - Current marker (size 0): returns the final file's size (data
 *   is written directly to the final name).
 * - No .part at all: returns 0.
 */
export async function getTempFileSize(
  modelId: string,
  relativePath: string,
): Promise<number> {
  const dir = await getModelDir(modelId);
  try {
    const partHandle = await dir.getFileHandle(relativePath + PART_SUFFIX);
    const partFile = await partHandle.getFile();
    if (partFile.size > 0) {
      // Legacy: data lives in the .part file itself
      return partFile.size;
    }
    // Current: data lives at the final name
    const finalHandle = await dir.getFileHandle(relativePath);
    const finalFile = await finalHandle.getFile();
    return finalFile.size;
  } catch {
    return 0;
  }
}

/**
 * Remove download artifacts for a file (both .part marker and
 * partially-written final file).
 */
export async function removeTempFile(
  modelId: string,
  relativePath: string,
): Promise<void> {
  const dir = await getModelDir(modelId);
  // Remove .part marker (or legacy data file)
  try {
    await dir.removeEntry(relativePath + PART_SUFFIX);
  } catch {
    // Already gone
  }
  // Remove the partially-written final file
  try {
    await dir.removeEntry(relativePath);
  } catch {
    // Already gone or never created
  }
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

async function fileExists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

async function fileSize(dir: FileSystemDirectoryHandle, name: string): Promise<number> {
  try {
    const handle = await dir.getFileHandle(name);
    const file = await handle.getFile();
    return file.size;
  } catch {
    return -1;
  }
}

async function anyPartFiles(dir: FileSystemDirectoryHandle): Promise<boolean> {
  for await (const [name, handle] of (dir as any).entries()) {
    if (handle.kind === 'file' && name.endsWith(PART_SUFFIX)) return true;
  }
  return false;
}

/**
 * Verify the integrity of a stored model against its manifest.
 *
 * Evaluation order is strict and documented in the plan.
 */
export async function verifyStoredModel(
  modelId: string,
  manifest: LocalModelManifest,
): Promise<StorageVerifyResult> {
  let dir: FileSystemDirectoryHandle;
  try {
    const modelsRoot = await getModelsRoot();
    dir = await modelsRoot.getDirectoryHandle(modelId);
  } catch {
    return 'none';
  }

  if (manifest.kind === 'single-file') {
    const entrypoint = manifest.entrypoint;
    const exists = await fileExists(dir, entrypoint);
    const hasPart = await hasTempFile(modelId, entrypoint);

    // 1. nothing at all → none
    if (!exists && !hasPart) return 'none';
    // 2. .part marker/file present → download was in progress → partial
    //    (covers both legacy .part-with-data and current marker-only)
    if (hasPart) return 'partial';
    // 3. final is zero-byte → invalid
    if (exists) {
      const size = await fileSize(dir, entrypoint);
      if (size === 0) return 'invalid';
      // 3b. GGUF files must start with correct magic bytes
      if (entrypoint.endsWith('.gguf')) {
        const file = await readFile(modelId, entrypoint);
        if (!(await hasGgufMagic(file))) return 'invalid';
      }
    }
    // 4. final present, non-zero, no marker → saved
    return 'saved';
  }

  // Multi-file
  const requiredFiles = manifest.requiredFiles;
  let existingCount = 0;
  let hasAnyPart = false;

  for (const f of requiredFiles) {
    const partExists = await hasTempFile(modelId, f);
    if (partExists) hasAnyPart = true;

    const exists = await fileExists(dir, f);
    if (exists) {
      const size = await fileSize(dir, f);
      // any requiredFile zero-byte → invalid
      if (size === 0) return 'invalid';
      existingCount++;
    }
  }

  // 1. nothing present → none
  if (existingCount === 0 && !hasAnyPart) return 'none';
  // 2. any .part marker → download in progress → partial
  if (hasAnyPart) return 'partial';
  // 3. all present & non-zero, no markers → saved
  if (existingCount === requiredFiles.length) return 'saved';
  // 4. otherwise → partial
  return 'partial';
}

// ---------------------------------------------------------------------------
// Rehydration — sync OPFS state with catalog on startup
// ---------------------------------------------------------------------------

/**
 * Entry for rehydration — any model with an id and manifest.
 * Works for both curated catalog models and search-added models.
 */
export interface RehydrationEntry {
  id: string;
  manifest: LocalModelManifest;
  revision?: string;
}

/**
 * Walk OPFS model dirs, verify against known entries.
 * Model dirs not matching any entry are ignored.
 * Called once on LocalModelSettings first mount.
 */
export async function rehydrateSavedModels(
  entries: RehydrationEntry[],
): Promise<Record<string, SavedModelMeta>> {
  const result: Record<string, SavedModelMeta> = {};
  const entryMap = new Map(entries.map((e) => [e.id, e]));

  let savedIds: string[];
  try {
    savedIds = await listSavedModelIds();
  } catch {
    return result;
  }

  for (const modelId of savedIds) {
    const entry = entryMap.get(modelId);
    if (!entry) continue;

    const verifyResult = await verifyStoredModel(modelId, entry.manifest);
    if (verifyResult === 'none') continue;

    const storedFiles = await listFiles(modelId);
    const storedBytes = await getStoredSize(modelId);

    let storageState: SavedModelMeta['storageState'];
    if (verifyResult === 'saved') {
      storageState = 'saved';
    } else {
      // invalid and partial both map to 'partial' in store
      storageState = 'partial';
    }

    result[modelId] = {
      storageState,
      storedBytes,
      storedFiles,
      lastVerifiedAt: Date.now(),
      downloadRevision: entry.revision,
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// OPFS management — browsing, bulk clear
// ---------------------------------------------------------------------------

/** A single file entry inside OPFS (for the file browser). */
export interface OpfsFileEntry {
  /** File name within the model directory */
  name: string;
  /** Size in bytes */
  size: number;
  /** Whether this is a .part temp file */
  isTemp: boolean;
}

/** A model directory entry inside OPFS (for the file browser). */
export interface OpfsModelEntry {
  /** Model ID (directory name) */
  modelId: string;
  /** Files inside this model directory */
  files: OpfsFileEntry[];
  /** Total size in bytes (all files including temp) */
  totalSize: number;
}

/**
 * Walk the entire OPFS models/ directory and return a detailed listing
 * of every model directory and its files. Used by the file browser UI.
 */
export async function listAllOpfsEntries(): Promise<OpfsModelEntry[]> {
  let modelsRoot: FileSystemDirectoryHandle;
  try {
    modelsRoot = await getModelsRoot();
  } catch {
    return [];
  }

  const entries: OpfsModelEntry[] = [];

  for await (const [dirName, dirHandle] of (modelsRoot as any).entries()) {
    if (dirHandle.kind !== 'directory') continue;

    const files: OpfsFileEntry[] = [];
    let totalSize = 0;

    for await (const [fileName, fileHandle] of (dirHandle as any).entries()) {
      if (fileHandle.kind !== 'file') continue;
      const file: File = await fileHandle.getFile();
      const isTemp = fileName.endsWith(PART_SUFFIX);
      files.push({ name: fileName, size: file.size, isTemp });
      totalSize += file.size;
    }

    entries.push({ modelId: dirName, files, totalSize });
  }

  // Sort by total size descending so largest models appear first
  entries.sort((a, b) => b.totalSize - a.totalSize);
  return entries;
}

/**
 * Delete all model directories from OPFS.
 * Returns the list of model IDs that were deleted.
 */
export async function clearAllModels(): Promise<string[]> {
  const modelsRoot = await getModelsRoot();
  const deleted: string[] = [];

  for await (const [name, handle] of (modelsRoot as any).entries()) {
    if (handle.kind === 'directory') {
      await modelsRoot.removeEntry(name, { recursive: true });
      deleted.push(name);
    }
  }

  return deleted;
}

/**
 * Delete a single file from a model directory (e.g. orphaned .part file).
 */
export async function deleteModelFile(
  modelId: string,
  fileName: string,
): Promise<void> {
  const dir = await getModelDir(modelId);
  await dir.removeEntry(fileName);
}

/**
 * Get total OPFS storage used by all models.
 */
export async function getTotalStorageUsed(): Promise<number> {
  let modelsRoot: FileSystemDirectoryHandle;
  try {
    modelsRoot = await getModelsRoot();
  } catch {
    return 0;
  }

  let total = 0;
  for await (const [, dirHandle] of (modelsRoot as any).entries()) {
    if (dirHandle.kind !== 'directory') continue;
    for await (const [, fileHandle] of (dirHandle as any).entries()) {
      if (fileHandle.kind !== 'file') continue;
      const file: File = await fileHandle.getFile();
      total += file.size;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// OpfsFileProvider — ModelFileProvider backed by OPFS
// ---------------------------------------------------------------------------

export class OpfsFileProvider implements ModelFileProvider {
  readonly source: LocalModelSource = 'opfs';

  constructor(
    private modelId: string,
    private manifest: LocalModelManifest,
  ) {}

  async isAvailable(): Promise<boolean> {
    const result = await verifyStoredModel(this.modelId, this.manifest);
    return result === 'saved';
  }

  async getFile(): Promise<File | Blob> {
    if (this.manifest.kind !== 'single-file') {
      throw new Error('getFile() is only available for single-file manifests');
    }
    return readFile(this.modelId, this.manifest.entrypoint);
  }

  getCustomCache(): CustomCacheAdapter {
    return {
      match: async (request: RequestInfo | URL): Promise<Response | undefined> => {
        const url = typeof request === 'string' ? request : request instanceof URL ? request.href : request.url;
        const key = resolveUrlToManifestKey(url, this.modelId);
        if (!key) return undefined;
        try {
          const file = await readFile(this.modelId, key);
          return new Response(file);
        } catch {
          return undefined;
        }
      },
      put: async (): Promise<void> => {
        // OPFS files are pre-populated by download; no runtime write needed
      },
    };
  }

  async getFileEntries(): Promise<[string, Blob][]> {
    const files = await listFiles(this.modelId);
    const entries: [string, Blob][] = [];
    for (const name of files) {
      const file = await readFile(this.modelId, name);
      entries.push([name, file]);
    }
    return entries;
  }

  dispose(): void {
    // No-op — OPFS files persist independently
  }
}
