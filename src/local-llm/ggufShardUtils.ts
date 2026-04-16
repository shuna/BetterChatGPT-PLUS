/**
 * Utilities for split GGUF model files (shards).
 *
 * Split GGUF naming convention (from llama.cpp / HuggingFace standard):
 *   model-NNNNN-of-MMMMM.gguf   e.g. model-00001-of-00005.gguf
 *
 * Also provides unified manifest helpers to access file lists without
 * switching on `manifest.kind` at every call site.
 */

import type { LocalModelManifest } from './types';

// ---------------------------------------------------------------------------
// Shard pattern
// ---------------------------------------------------------------------------

const SHARD_PATTERN = /^(.*)-(\d{5})-of-(\d{5})\.gguf$/;

export interface ShardInfo {
  /** Filename prefix before the shard index, e.g. "model" */
  baseName: string;
  /** 1-based shard index */
  current: number;
  /** Total number of shards */
  total: number;
}

/**
 * Parse shard info from a GGUF filename.
 * Returns null if the filename does not match the split pattern.
 */
export function parseShardInfo(fileName: string): ShardInfo | null {
  const m = fileName.match(SHARD_PATTERN);
  if (!m) return null;
  return {
    baseName: m[1],
    current: parseInt(m[2], 10),
    total: parseInt(m[3], 10),
  };
}

/** Returns true if the filename is part of a split GGUF set. */
export function isShardedGguf(fileName: string): boolean {
  return SHARD_PATTERN.test(fileName);
}

/**
 * Generate all shard filenames for a split GGUF given the first shard name.
 *
 * e.g. "model-00001-of-00003.gguf" →
 *   ["model-00001-of-00003.gguf", "model-00002-of-00003.gguf", "model-00003-of-00003.gguf"]
 */
export function generateShardFileNames(firstShard: string): string[] {
  const info = parseShardInfo(firstShard);
  if (!info || info.current !== 1) return [firstShard];
  const result: string[] = [];
  const totalStr = String(info.total).padStart(5, '0');
  for (let i = 1; i <= info.total; i++) {
    const idxStr = String(i).padStart(5, '0');
    result.push(`${info.baseName}-${idxStr}-of-${totalStr}.gguf`);
  }
  return result;
}

export interface ShardGroup {
  /** All shard filenames that were found, in shard-index order */
  files: string[];
  /** Sum of found shard sizes in bytes */
  totalSize: number;
  /**
   * Expected number of shards as declared in the filenames (e.g. 5 for "-of-00005").
   * Comparing files.length to expectedTotal tells you whether the group is complete.
   */
  expectedTotal: number;
}

/**
 * Returns true only when every shard from 1..expectedTotal is present with
 * no gaps and no duplicates.
 */
export function isShardGroupComplete(group: ShardGroup): boolean {
  return group.files.length === group.expectedTotal;
}

/**
 * Group shard files from a flat list of HF repo siblings.
 *
 * Input: [{ rfilename, size }, ...]
 * Output: Map from baseName → ShardGroup
 *
 * Non-shard files are ignored.
 * Incomplete groups (some shards missing) are still included —
 * the caller decides whether to treat them as unsupported.
 */
export function groupShardFiles(
  files: Array<{ rfilename: string; size: number }>,
): Map<string, ShardGroup> {
  // First pass: collect shards by baseName, recording their declared total
  const groups = new Map<string, {
    shards: Map<number, { name: string; size: number }>;
    expectedTotal: number;
  }>();
  for (const f of files) {
    const info = parseShardInfo(f.rfilename);
    if (!info) continue;
    if (!groups.has(info.baseName)) {
      groups.set(info.baseName, { shards: new Map(), expectedTotal: info.total });
    }
    const group = groups.get(info.baseName)!;
    // Conflicting total values within the same baseName → treat as corrupted, skip
    if (group.expectedTotal !== info.total) continue;
    // Duplicate shard index → skip duplicate
    if (!group.shards.has(info.current)) {
      group.shards.set(info.current, { name: f.rfilename, size: f.size });
    }
  }

  // Second pass: build sorted ShardGroup per baseName, validating index contiguity
  const result = new Map<string, ShardGroup>();
  for (const [baseName, { shards: shardMap, expectedTotal }] of groups) {
    const sorted = Array.from(shardMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([, v]) => v);
    // Validate that present indices form a contiguous prefix 1..found
    // (if files are missing in the middle, the group is still stored but
    //  files.length < expectedTotal signals incompleteness to callers)
    result.set(baseName, {
      files: sorted.map((s) => s.name),
      totalSize: sorted.reduce((sum, s) => sum + s.size, 0),
      expectedTotal,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Manifest helpers — avoid kind-switches at every call site
// ---------------------------------------------------------------------------

/**
 * Return all file paths that need to be present for a given manifest.
 *
 * - single-file   → [entrypoint]
 * - gguf-sharded  → shards (all shard filenames in order)
 * - multi-file    → requiredFiles
 */
export function getManifestFiles(manifest: LocalModelManifest): string[] {
  switch (manifest.kind) {
    case 'single-file':
      return [manifest.entrypoint];
    case 'gguf-sharded':
      return manifest.shards;
    case 'multi-file':
      return manifest.requiredFiles;
  }
}

/**
 * Return the primary/representative file path for a manifest.
 *
 * - single-file   → entrypoint
 * - gguf-sharded  → entrypoint (first shard)
 * - multi-file    → entrypoint
 */
export function getManifestPrimaryFile(manifest: LocalModelManifest): string {
  return manifest.entrypoint;
}
