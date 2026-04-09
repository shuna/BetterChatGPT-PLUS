/**
 * diagnosisExport.ts — Build structured JSON export payloads for lowbit-Q quality diagnosis.
 *
 * Designed for offline comparison with OneCompression / OneBit paper results.
 */

import type { OutputQualityMetrics } from './qualityMetrics';
import type { TensorConvertRecord } from './tensorFilter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TensorSummary {
  totalTensors: number;
  convertedCount: number;
  passthroughCount: number;
  avgNMSE: number | null;
  maxNMSE: number | null;
  worstTensor: string | null;
  nmseByFamily: Record<
    string,
    { avg: number; max: number; count: number; worstTensor: string }
  >;
}

export interface DiagnosisRunExport {
  promptId: string;
  prompt: string;
  output: string;
  quality: OutputQualityMetrics;
}

export interface DiagnosisVariantExport {
  convertMode: string;
  convertedSizeBytes: number;
  compressionRatio: number;
  tensorRecords: TensorConvertRecord[];
  tensorSummary: TensorSummary;
  runs: DiagnosisRunExport[];
  diagnosisSummary: {
    collapsedCount: number;
    avgTrigramRepeatScore: number;
    avgCharDelta: number | null;
  };
}

export interface DiagnosisExportPayload {
  version: 1;
  exportedAt: string;
  model: {
    source: string;
    fileName: string;
    originalSizeBytes: number;
  };
  generationParams: {
    maxTokens: number;
    temperature: number;
  };
  originalRuns: DiagnosisRunExport[];
  variants: DiagnosisVariantExport[];
}

// ---------------------------------------------------------------------------
// Tensor summary computation
// ---------------------------------------------------------------------------

/**
 * Summarize tensor conversion records: averages, maximums, breakdown by family.
 */
export function summarizeTensorRecords(
  records: TensorConvertRecord[],
): TensorSummary {
  const converted = records.filter((r) => r.converted);
  const withNMSE = converted.filter((r) => r.nmse !== null) as Array<
    TensorConvertRecord & { nmse: number }
  >;

  let avgNMSE: number | null = null;
  let maxNMSE: number | null = null;
  let worstTensor: string | null = null;

  if (withNMSE.length > 0) {
    avgNMSE =
      withNMSE.reduce((sum, r) => sum + r.nmse, 0) / withNMSE.length;
    const worst = withNMSE.reduce((a, b) => (a.nmse > b.nmse ? a : b));
    maxNMSE = worst.nmse;
    worstTensor = worst.name;
  }

  // Breakdown by family
  const familyMap = new Map<
    string,
    { sum: number; max: number; count: number; worstName: string }
  >();

  for (const r of withNMSE) {
    const existing = familyMap.get(r.family);
    if (existing) {
      existing.sum += r.nmse;
      existing.count++;
      if (r.nmse > existing.max) {
        existing.max = r.nmse;
        existing.worstName = r.name;
      }
    } else {
      familyMap.set(r.family, {
        sum: r.nmse,
        max: r.nmse,
        count: 1,
        worstName: r.name,
      });
    }
  }

  const nmseByFamily: TensorSummary['nmseByFamily'] = {};
  for (const [family, data] of familyMap) {
    nmseByFamily[family] = {
      avg: data.sum / data.count,
      max: data.max,
      count: data.count,
      worstTensor: data.worstName,
    };
  }

  return {
    totalTensors: records.length,
    convertedCount: converted.length,
    passthroughCount: records.length - converted.length,
    avgNMSE,
    maxNMSE,
    worstTensor,
    nmseByFamily,
  };
}

// ---------------------------------------------------------------------------
// Export builder
// ---------------------------------------------------------------------------

/**
 * Build the full diagnosis export payload.
 */
export function buildDiagnosisExport(params: {
  model: DiagnosisExportPayload['model'];
  generationParams: DiagnosisExportPayload['generationParams'];
  originalRuns: DiagnosisRunExport[];
  variants: Array<{
    convertMode: string;
    convertedSizeBytes: number;
    compressionRatio: number;
    tensorRecords: TensorConvertRecord[];
    runs: DiagnosisRunExport[];
  }>;
}): DiagnosisExportPayload {
  const variants: DiagnosisVariantExport[] = params.variants.map((v) => {
    const tensorSummary = summarizeTensorRecords(v.tensorRecords);

    const collapsedCount = v.runs.filter((r) => r.quality.collapsed).length;
    const trigramScores = v.runs.map((r) => r.quality.trigramRepeatScore);
    const avgTrigramRepeatScore =
      trigramScores.length > 0
        ? trigramScores.reduce((a, b) => a + b, 0) / trigramScores.length
        : 0;

    const charDeltas = v.runs
      .map((r) => r.quality.diffFromOriginal?.charDelta)
      .filter((d): d is number => d !== undefined);
    const avgCharDelta =
      charDeltas.length > 0
        ? charDeltas.reduce((a, b) => a + b, 0) / charDeltas.length
        : null;

    return {
      convertMode: v.convertMode,
      convertedSizeBytes: v.convertedSizeBytes,
      compressionRatio: v.compressionRatio,
      tensorRecords: v.tensorRecords,
      tensorSummary,
      runs: v.runs,
      diagnosisSummary: {
        collapsedCount,
        avgTrigramRepeatScore,
        avgCharDelta,
      },
    };
  });

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    model: params.model,
    generationParams: params.generationParams,
    originalRuns: params.originalRuns,
    variants,
  };
}
