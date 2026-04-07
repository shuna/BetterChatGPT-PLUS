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
 * Save a complete file to OPFS. For small confirmed files.
 */
export async function saveFile(
  modelId: string,
  relativePath: string,
  blob: Blob,
): Promise<void> {
  const dir = await getModelDir(modelId);
  const fileHandle = await dir.getFileHandle(relativePath, { create: true }) as unknown as WritableFileHandle;
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
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
// ---------------------------------------------------------------------------

/**
 * Write a chunk to a .part temp file.
 * @param append false = create/truncate, true = append
 */
export async function writeTempChunk(
  modelId: string,
  relativePath: string,
  chunk: Uint8Array,
  append: boolean,
): Promise<void> {
  const dir = await getModelDir(modelId);
  const partName = relativePath + PART_SUFFIX;
  const fileHandle = await dir.getFileHandle(partName, { create: true }) as unknown as WritableFileHandle;
  const writable = await fileHandle.createWritable({ keepExistingData: append });
  if (append) {
    const file = await fileHandle.getFile();
    await writable.seek(file.size);
  }
  await writable.write(chunk);
  await writable.close();
}

/**
 * Commit a .part temp file to its final name.
 * Reads .part fully, writes final file, removes .part.
 * Integrity over performance.
 */
export async function commitTempFile(
  modelId: string,
  relativePath: string,
): Promise<void> {
  const dir = await getModelDir(modelId);
  const partName = relativePath + PART_SUFFIX;

  // Read the .part file
  const partHandle = await dir.getFileHandle(partName);
  const partFile = await partHandle.getFile();
  const data = await partFile.arrayBuffer();

  // Write final file
  const finalHandle = await dir.getFileHandle(relativePath, { create: true }) as unknown as WritableFileHandle;
  const writable = await finalHandle.createWritable();
  await writable.write(data);
  await writable.close();

  // Remove .part
  await dir.removeEntry(partName);
}

/**
 * Check if a .part temp file exists.
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
 * Get the size of a .part temp file.
 * Returns 0 if no .part exists.
 */
export async function getTempFileSize(
  modelId: string,
  relativePath: string,
): Promise<number> {
  const dir = await getModelDir(modelId);
  try {
    const handle = await dir.getFileHandle(relativePath + PART_SUFFIX);
    const file = await handle.getFile();
    return file.size;
  } catch {
    return 0;
  }
}

/**
 * Remove a .part temp file.
 */
export async function removeTempFile(
  modelId: string,
  relativePath: string,
): Promise<void> {
  const dir = await getModelDir(modelId);
  try {
    await dir.removeEntry(relativePath + PART_SUFFIX);
  } catch {
    // Already gone
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

    // 1. final missing & no .part → none
    if (!exists && !hasPart) return 'none';
    // 2. final is zero-byte → invalid
    if (exists) {
      const size = await fileSize(dir, entrypoint);
      if (size === 0) return 'invalid';
      // 2b. GGUF files must start with correct magic bytes
      if (entrypoint.endsWith('.gguf')) {
        const file = await readFile(modelId, entrypoint);
        if (!(await hasGgufMagic(file))) return 'invalid';
      }
    }
    // 3. .part exists but no final → partial
    if (!exists && hasPart) return 'partial';
    // 4. final present & non-zero → saved
    return 'saved';
  }

  // Multi-file
  const requiredFiles = manifest.requiredFiles;
  let existingCount = 0;
  let hasAnyPart = false;

  for (const f of requiredFiles) {
    const exists = await fileExists(dir, f);
    if (exists) {
      const size = await fileSize(dir, f);
      // 2. any requiredFile zero-byte → invalid
      if (size === 0) return 'invalid';
      existingCount++;
    } else {
      const partExists = await hasTempFile(modelId, f);
      if (partExists) hasAnyPart = true;
    }
  }

  // 1. nothing present → none
  if (existingCount === 0 && !hasAnyPart) return 'none';
  // 3. all present & non-zero → saved
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
