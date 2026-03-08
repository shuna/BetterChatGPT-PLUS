const DEV = import.meta.env.DEV;

export function perfStart(label: string): void {
  if (!DEV) return;
  performance.mark(`${label}:start`);
}

export function perfEnd(label: string): void {
  if (!DEV) return;
  performance.mark(`${label}:end`);
  try {
    performance.measure(label, `${label}:start`, `${label}:end`);
  } catch {
    /* start mark missing */
  }
}

/** コンソールに全計測結果のサマリーを出力 */
export function perfSummary(): void {
  if (!DEV) return;
  const entries = performance.getEntriesByType('measure');
  const grouped: Record<string, number[]> = {};
  for (const e of entries) {
    (grouped[e.name] ??= []).push(e.duration);
  }
  console.table(
    Object.entries(grouped).map(([name, durations]) => ({
      name,
      count: durations.length,
      avg: +(durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1),
      min: +Math.min(...durations).toFixed(1),
      max: +Math.max(...durations).toFixed(1),
      last: +durations[durations.length - 1].toFixed(1),
    }))
  );
}

/** 計測データをクリア */
export function perfClear(): void {
  if (!DEV) return;
  performance.clearMarks();
  performance.clearMeasures();
}

// 開発時のみ window に公開
if (DEV && typeof window !== 'undefined') {
  (window as any).__perfSummary = perfSummary;
  (window as any).__perfClear = perfClear;
}
