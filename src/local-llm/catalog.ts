/**
 * Curated model registry for local LLM support.
 *
 * Each entry is a confirmed, tested model with pinned repo, revision,
 * exact download files, and measured sizes. No placeholders.
 *
 * Adding a model here means it is fully supported by the download
 * and loading pipeline.
 */

import type { LocalModelEngine, LocalModelTask, LocalModelManifest, LocalModelDisplayMeta } from './types';
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
  /** Display metadata for UI */
  displayMeta?: LocalModelDisplayMeta;
}

// ---------------------------------------------------------------------------
// Curated model list
// ---------------------------------------------------------------------------

export const CURATED_MODELS: CatalogModel[] = [
  {
    id: 'smollm2-360m-instruct-q8',
    label: 'SmolLM2 360M Instruct (Q8_0)',
    engine: 'wllama',
    tasks: ['generation', 'analysis'],
    huggingFaceRepo: 'HuggingFaceTB/SmolLM2-360M-Instruct-GGUF',
    revision: 'main',
    downloadFiles: ['smollm2-360m-instruct-q8_0.gguf'],
    manifest: {
      kind: 'single-file',
      entrypoint: 'smollm2-360m-instruct-q8_0.gguf',
    },
    // 386 MB — measured from HF repo (only quantization available)
    expectedDownloadSize: 386_404_992,
    recommendedDeviceTier: 'low',
    notes: 'Smallest recommended model. Good for basic text generation on low-end devices.',
    displayMeta: {
      supportsTextInference: true,
      quantization: 'Q8_0',
      parameterSizeLabel: '360M',
      sourceLabel: 'catalog',
      recommended: true,
      contextLength: 8192,
    },
  },
  {
    id: 'qwen3-0.6b-q4km',
    label: 'Qwen3 0.6B (Q4_K_M)',
    engine: 'wllama',
    tasks: ['generation', 'analysis'],
    huggingFaceRepo: 'bartowski/Qwen_Qwen3-0.6B-GGUF',
    revision: 'main',
    downloadFiles: ['Qwen_Qwen3-0.6B-Q4_K_M.gguf'],
    manifest: {
      kind: 'single-file',
      entrypoint: 'Qwen_Qwen3-0.6B-Q4_K_M.gguf',
    },
    // 484 MB — measured from HF repo
    expectedDownloadSize: 484_220_320,
    recommendedDeviceTier: 'standard',
    notes: 'Balanced size and capability. Latest Qwen3 architecture with generation and analysis.',
    displayMeta: {
      supportsTextInference: true,
      quantization: 'Q4_K_M',
      parameterSizeLabel: '0.6B',
      sourceLabel: 'catalog',
      recommended: true,
      contextLength: 40960,
    },
  },
  {
    id: 'llm-jp-3-1.8b-instruct-q4km',
    label: 'LLM-jp-3 1.8B Instruct (Q4_K_M)',
    engine: 'wllama',
    tasks: ['generation', 'analysis'],
    huggingFaceRepo: 'alfredplpl/llm-jp-3-1.8b-instruct-gguf',
    revision: 'main',
    downloadFiles: ['llm-jp-3-1.8b-instruct-Q4_K_M.gguf'],
    manifest: {
      kind: 'single-file',
      entrypoint: 'llm-jp-3-1.8b-instruct-Q4_K_M.gguf',
    },
    // 1.16 GB — measured from HF repo
    expectedDownloadSize: 1_164_239_104,
    recommendedDeviceTier: 'high',
    notes: 'Japanese-focused model. Good quality for Japanese text generation and analysis.',
    displayMeta: {
      supportsTextInference: true,
      quantization: 'Q4_K_M',
      parameterSizeLabel: '1.8B',
      sourceLabel: 'catalog',
      recommended: true,
      contextLength: 4096,
    },
  },
];

// ---------------------------------------------------------------------------
// Experimental multimodal models (not mixed into text-only runtime)
// ---------------------------------------------------------------------------

export interface ExperimentalModel {
  id: string;
  label: string;
  huggingFaceRepo: string;
  category: 'multimodal';
  notes: string;
}

/**
 * Models tracked for future support but NOT integrated into the
 * current text-only wllama/transformers.js runtime.
 *
 * These require separate vision encoders, image preprocessing,
 * or architectures that the existing pipeline does not handle.
 */
export const EXPERIMENTAL_MULTIMODAL_MODELS: ExperimentalModel[] = [
  {
    id: 'smolvlm-256m',
    label: 'SmolVLM 256M',
    huggingFaceRepo: 'HuggingFaceTB/SmolVLM-256M-Instruct',
    category: 'multimodal',
    notes: 'Vision-language model. Requires image encoder not supported by current runtime.',
  },
  {
    id: 'smolvlm-500m',
    label: 'SmolVLM 500M',
    huggingFaceRepo: 'HuggingFaceTB/SmolVLM-500M-Instruct',
    category: 'multimodal',
    notes: 'Vision-language model. Requires image encoder not supported by current runtime.',
  },
  {
    id: 'qwen3.5-0.8b',
    label: 'Qwen3.5 0.8B',
    huggingFaceRepo: 'Qwen/Qwen3.5-0.8B',
    category: 'multimodal',
    notes: 'Multimodal Qwen variant. Not yet supported by browser runtime.',
  },
  {
    id: 'gemma-4-e2b',
    label: 'Gemma 4 E2B',
    huggingFaceRepo: 'google/gemma-4-e2b-it',
    category: 'multimodal',
    notes: 'Multimodal Gemma variant. Not yet supported by browser runtime.',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getCatalogModel(id: string): CatalogModel | undefined {
  return CURATED_MODELS.find((m) => m.id === id);
}
