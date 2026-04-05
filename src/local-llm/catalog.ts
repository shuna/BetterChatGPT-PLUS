/**
 * Curated model registry for local LLM support.
 *
 * Each entry is a confirmed, tested model with pinned repo, revision,
 * exact download files, and measured sizes. No placeholders.
 *
 * Adding a model here means it is fully supported by the download
 * and loading pipeline.
 */

import type { LocalModelEngine, LocalModelTask, LocalModelManifest } from './types';
import type { DeviceTier } from './device';

export interface CatalogModel {
  id: string;
  label: string;
  engine: LocalModelEngine;
  tasks: LocalModelTask[];
  huggingFaceRepo: string;
  /** Pinned git ref. Use specific commit hash for stability, 'main' for latest. */
  revision: string;
  /** Exact file paths within the repo to download. */
  downloadFiles: string[];
  manifest: LocalModelManifest;
  /** Expected total download size in bytes (measured from repo). */
  expectedDownloadSize: number;
  /** Minimum device tier for comfortable use. */
  recommendedDeviceTier: DeviceTier;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Curated model list
// ---------------------------------------------------------------------------

export const CURATED_MODELS: CatalogModel[] = [
  {
    id: 'smollm2-360m-instruct-q8',
    label: 'SmolLM2 360M Instruct (Q8_0)',
    engine: 'wllama',
    tasks: ['generation'],
    huggingFaceRepo: 'HuggingFaceTB/SmolLM2-360M-Instruct-GGUF',
    revision: 'main',
    downloadFiles: ['smollm2-360m-instruct-q8_0.gguf'],
    manifest: {
      kind: 'single-file',
      entrypoint: 'smollm2-360m-instruct-q8_0.gguf',
    },
    // 386 MB — measured from HF repo (only quantization available)
    expectedDownloadSize: 404_750_336,
    recommendedDeviceTier: 'low',
    notes: 'Smallest recommended model. Good for basic text generation on low-end devices.',
  },
  {
    id: 'qwen2.5-0.5b-instruct-q4km',
    label: 'Qwen2.5 0.5B Instruct (Q4_K_M)',
    engine: 'wllama',
    tasks: ['generation', 'analysis'],
    huggingFaceRepo: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
    revision: 'main',
    downloadFiles: ['qwen2.5-0.5b-instruct-q4_k_m.gguf'],
    manifest: {
      kind: 'single-file',
      entrypoint: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    },
    // 491 MB — measured from HF repo
    expectedDownloadSize: 514_850_816,
    recommendedDeviceTier: 'standard',
    notes: 'Balanced size and capability. Supports generation and analysis tasks.',
  },
  {
    id: 'tinyllama-1.1b-chat-q4km',
    label: 'TinyLlama 1.1B Chat (Q4_K_M)',
    engine: 'wllama',
    tasks: ['generation', 'analysis'],
    huggingFaceRepo: 'TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF',
    revision: 'main',
    downloadFiles: ['tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf'],
    manifest: {
      kind: 'single-file',
      entrypoint: 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
    },
    // ~670 MB — measured from HF repo
    expectedDownloadSize: 702_545_920,
    recommendedDeviceTier: 'high',
    notes: 'Largest supported model. Better quality but requires more memory.',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getCatalogModel(id: string): CatalogModel | undefined {
  return CURATED_MODELS.find((m) => m.id === id);
}
