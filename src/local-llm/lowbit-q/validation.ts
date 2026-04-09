import type { LocalModelDefinition } from '../types';
import { parseGGUFHeader } from './ggufParser';
import {
  GGUFValueType,
  LOWBIT_Q_LAYERS_KEY,
  LOWBIT_Q_PACKING_KEY,
  LOWBIT_Q_VERSION_KEY,
  LEGACY_ONEBIT_VERSION_KEY,
  LEGACY_ONEBIT_LAYERS_KEY,
  LEGACY_ONEBIT_PACKING_KEY,
  type GGUFMetadataEntry,
} from './types';
import { generateLowbitQModelId, generateLowbitQFilename } from './lowbitQManager';
import type { OutputQualityMetrics } from './qualityMetrics';

export type ValidationVariant = 'original' | 'lowbit-q';
export type ValidationStepStatus = 'idle' | 'running' | 'pass' | 'fail';

export interface ValidationPromptPreset {
  id: string;
  label: string;
  prompt: string;
}

export interface ValidationRunRecord {
  id: string;
  promptId: string;
  prompt: string;
  variant: ValidationVariant;
  modelId: string;
  maxTokens: number;
  temperature: number;
  output: string;
  createdAt: string;
}

export interface OutputComparisonSummary {
  exactMatch: boolean;
  originalLength: number;
  lowbitQLength: number;
  lengthDelta: number;
}

export interface LowbitQMetadataSummary {
  hasLowbitQVersion: boolean;
  lowbitQVersion: number | null;
  signPacking: string | null;
  layers: number[];
  tensorCount: number;
  lowbitQTensorCount: number;
}

export interface ValidationStepState {
  key: string;
  label: string;
  status: ValidationStepStatus;
  detail?: string;
}

export const VALIDATION_RUNS_STORAGE_KEY = 'lowbit-q-validation-runs-v1';

export const FIXED_VALIDATION_MODEL = {
  id: 'lowbit-q-validation-tinyllama-1.1b-q8',
  label: 'Validation · TinyLlama 1.1B Chat (Q8_0)',
  origin: 'TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF',
  revision: 'main',
  fileName: 'tinyllama-1.1b-chat-v1.0.Q8_0.gguf',
  expectedDownloadSize: 1_170_000_000,
  sourceLabel: 'TinyLlama 1.1B Chat (Q8_0)',
} as const;

export const VALIDATION_PROMPTS: ValidationPromptPreset[] = [
  {
    id: 'hello-ja',
    label: 'Greeting',
    prompt: '日本語で2文だけ自己紹介してください。簡潔で自然な文章にしてください。',
  },
  {
    id: 'extract-steps',
    label: 'Structured',
    prompt: '次の依頼を3つの短い手順に要約してください: 旅行前にパスポート、充電器、常備薬を確認する。',
  },
  {
    id: 'tiny-reasoning',
    label: 'Tiny reasoning',
    prompt: 'Q: りんごが3個あり、2個もらいました。合計はいくつですか？ A:',
  },
  {
    id: 'short-qa-ja',
    label: 'Short QA (JA)',
    prompt: '東京タワーの高さは何メートルですか？答えだけ書いてください。',
  },
  {
    id: 'short-qa-en',
    label: 'Short QA (EN)',
    prompt: 'What is the capital of France? Answer in one word.',
  },
  {
    id: 'list-generation',
    label: 'List generation',
    prompt: '日本の四季の名前を箇条書きで4つ挙げてください。',
  },
  {
    id: 'summary',
    label: 'Summary',
    prompt: '次の文を1文で要約してください: 人工知能は医療、金融、製造業など多くの分野で活用が進んでおり、特に画像認識と自然言語処理の精度が大幅に向上している。',
  },
  {
    id: 'continuation',
    label: 'Continuation',
    prompt: '昔々あるところに、おじいさんとおばあさんがいました。ある日おじいさんは山へ',
  },
  {
    id: 'repeat-collapse-probe',
    label: 'Collapse probe',
    prompt: 'Count from 1 to 20, separated by commas.',
  },
];

/** All prompt IDs for batch diagnosis runs */
export const DIAGNOSIS_PROMPT_IDS = VALIDATION_PROMPTS.map((p) => p.id);

/** Extended run record with quality metrics and conversion mode */
export interface DiagnosisRunRecord extends ValidationRunRecord {
  convertMode: string;
  quality: OutputQualityMetrics;
}

export function getValidationModelDefinition(variant: ValidationVariant): LocalModelDefinition {
  if (variant === 'original') {
    return {
      id: FIXED_VALIDATION_MODEL.id,
      engine: 'wllama',
      tasks: ['generation', 'analysis'],
      label: FIXED_VALIDATION_MODEL.label,
      origin: FIXED_VALIDATION_MODEL.origin,
      source: 'opfs',
      manifest: {
        kind: 'single-file',
        entrypoint: FIXED_VALIDATION_MODEL.fileName,
      },
      fileSize: FIXED_VALIDATION_MODEL.expectedDownloadSize,
      lastFileName: FIXED_VALIDATION_MODEL.fileName,
      displayMeta: {
        supportsTextInference: true,
        quantization: 'Q8_0',
        parameterSizeLabel: '1.1B',
        sourceLabel: 'catalog',
      },
    };
  }

  const lowbitQFileName = generateLowbitQFilename(FIXED_VALIDATION_MODEL.fileName);
  return {
    id: generateLowbitQModelId(FIXED_VALIDATION_MODEL.id),
    engine: 'wllama',
    tasks: ['generation', 'analysis'],
    label: `${FIXED_VALIDATION_MODEL.sourceLabel} (1-bit)`,
    origin: FIXED_VALIDATION_MODEL.id,
    source: 'opfs',
    manifest: {
      kind: 'single-file',
      entrypoint: lowbitQFileName,
    },
    lastFileName: lowbitQFileName,
      displayMeta: {
        supportsTextInference: true,
        quantization: 'lowbit-q',
        parameterSizeLabel: '1.1B',
        sourceLabel: 'imported',
      },
  };
}

export function createInitialValidationSteps(): ValidationStepState[] {
  return [
    { key: 'download-original', label: '元GGUFダウンロード', status: 'idle' },
    { key: 'convert-lowbit-q', label: 'lowbit-Q変換', status: 'idle' },
    { key: 'save-opfs', label: 'OPFS保存', status: 'idle' },
    { key: 'detect-lowbit-q-metadata', label: 'lowbit-Q metadata 検出', status: 'idle' },
    { key: 'load-generate-original', label: '原本 load/generate', status: 'idle' },
    { key: 'load-generate-lowbit-q', label: 'lowbit-Q load/generate', status: 'idle' },
    { key: 'compare-outputs', label: '出力比較', status: 'idle' },
  ];
}

function parseArrayNumbers(entry: GGUFMetadataEntry | undefined): number[] {
  if (!entry || entry.type !== GGUFValueType.ARRAY || !Array.isArray(entry.value)) {
    return [];
  }
  return entry.value
    .map((item) => typeof item.value === 'number' ? item.value : null)
    .filter((value): value is number => value !== null);
}

async function parseHeaderFromBlob(source: Blob): Promise<ReturnType<typeof parseGGUFHeader>> {
  const initialSize = Math.min(source.size, 256 * 1024);
  const initialBuffer = await source.slice(0, initialSize).arrayBuffer();

  try {
    const header = parseGGUFHeader(initialBuffer);
    if (header.dataOffset <= source.size) return header;
  } catch {
    // Fall back to a larger read when the header does not fit.
  }

  const fullBuffer = await source.arrayBuffer();
  return parseGGUFHeader(fullBuffer);
}

export async function inspectLowbitQMetadata(file: Blob): Promise<LowbitQMetadataSummary> {
  const header = await parseHeaderFromBlob(file);
  // Accept both new (lowbit-q.*) and legacy (onebit.*) metadata keys
  const versionEntry = header.metadata.get(LOWBIT_Q_VERSION_KEY) ?? header.metadata.get(LEGACY_ONEBIT_VERSION_KEY);
  const signPackingEntry = header.metadata.get(LOWBIT_Q_PACKING_KEY) ?? header.metadata.get(LEGACY_ONEBIT_PACKING_KEY);
  const layersEntry = header.metadata.get(LOWBIT_Q_LAYERS_KEY) ?? header.metadata.get(LEGACY_ONEBIT_LAYERS_KEY);
  // Count tensors with either new or legacy suffixes
  const lowbitQTensorCount = header.tensors.filter((tensor) =>
    tensor.name.endsWith('.lowbit_q_a') ||
    tensor.name.endsWith('.lowbit_q_b') ||
    tensor.name.endsWith('.lowbit_q_sign') ||
    tensor.name.endsWith('.onebit_a') ||
    tensor.name.endsWith('.onebit_b') ||
    tensor.name.endsWith('.onebit_sign'),
  ).length;

  return {
    hasLowbitQVersion: typeof versionEntry?.value === 'number',
    lowbitQVersion: typeof versionEntry?.value === 'number' ? versionEntry.value : null,
    signPacking: typeof signPackingEntry?.value === 'string' ? signPackingEntry.value : null,
    layers: parseArrayNumbers(layersEntry),
    tensorCount: header.tensors.length,
    lowbitQTensorCount,
  };
}

export function summarizeOutputComparison(originalOutput: string, lowbitQOutput: string): OutputComparisonSummary {
  return {
    exactMatch: originalOutput === lowbitQOutput,
    originalLength: originalOutput.length,
    lowbitQLength: lowbitQOutput.length,
    lengthDelta: lowbitQOutput.length - originalOutput.length,
  };
}

export function appendValidationRun(
  existing: ValidationRunRecord[],
  next: ValidationRunRecord,
): ValidationRunRecord[] {
  return [next, ...existing].slice(0, 50);
}
