import React from 'react';

interface RadarChartProps {
  /** Labels for each axis */
  labels: string[];
  /** Scores 0.0–1.0 for each axis */
  scores: number[];
  /** SVG width/height */
  size?: number;
  /** Optional color override. When provided the internal avg-based heuristic is skipped. */
  colorOverride?: { fill: string; stroke: string };
}

/**
 * SVG radar (spider) chart for quality evaluation scores.
 * Renders a pentagonal web with score polygon overlay.
 */
const RadarChart: React.FC<RadarChartProps> = ({
  labels,
  scores,
  size = 240,
  colorOverride,
}) => {
  const padding = 60; // extra space for labels
  const vbSize = size + padding * 2;
  const cx = vbSize / 2;
  const cy = vbSize / 2;
  const radius = size * 0.35; // chart size unchanged
  const labelRadius = radius + 24;
  const n = labels.length;
  const levels = 5; // concentric rings

  const angleOf = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;

  const pointAt = (i: number, r: number): [number, number] => {
    const a = angleOf(i);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };

  const polygonPoints = (r: number) =>
    Array.from({ length: n }, (_, i) => pointAt(i, r).join(',')).join(' ');

  const scorePoints = scores
    .map((s, i) => pointAt(i, radius * Math.max(s, 0.02)).join(','))
    .join(' ');

  const scoreColor = (score: number) => {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (avg >= 0.8) return { fill: 'rgba(34,197,94,0.25)', stroke: 'rgb(34,197,94)' };
    if (avg >= 0.5) return { fill: 'rgba(234,179,8,0.25)', stroke: 'rgb(234,179,8)' };
    return { fill: 'rgba(239,68,68,0.25)', stroke: 'rgb(239,68,68)' };
  };

  const colors = colorOverride ?? scoreColor(0);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${vbSize} ${vbSize}`}
      className='select-none'
    >
      {/* Concentric grid rings */}
      {Array.from({ length: levels }, (_, l) => {
        const r = (radius * (l + 1)) / levels;
        return (
          <polygon
            key={`ring-${l}`}
            points={polygonPoints(r)}
            fill='none'
            stroke='currentColor'
            strokeWidth={l === levels - 1 ? 1 : 0.5}
            className='text-gray-300 dark:text-gray-600'
          />
        );
      })}

      {/* Axis lines from center */}
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = pointAt(i, radius);
        return (
          <line
            key={`axis-${i}`}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke='currentColor'
            strokeWidth={0.5}
            className='text-gray-300 dark:text-gray-600'
          />
        );
      })}

      {/* Score polygon */}
      <polygon
        points={scorePoints}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={2}
      />

      {/* Score dots */}
      {scores.map((s, i) => {
        const [x, y] = pointAt(i, radius * Math.max(s, 0.02));
        return (
          <circle
            key={`dot-${i}`}
            cx={x}
            cy={y}
            r={3}
            fill={colors.stroke}
          />
        );
      })}

      {/* Labels */}
      {labels.map((label, i) => {
        const [x, y] = pointAt(i, labelRadius);
        const a = angleOf(i);
        const anchor =
          Math.abs(Math.cos(a)) < 0.1
            ? 'middle'
            : Math.cos(a) > 0
            ? 'start'
            : 'end';
        const baseline =
          Math.abs(Math.sin(a)) < 0.1
            ? 'central'
            : Math.sin(a) > 0
            ? 'hanging'
            : 'auto';
        return (
          <text
            key={`label-${i}`}
            x={x}
            y={y}
            textAnchor={anchor}
            dominantBaseline={baseline}
            className='fill-gray-600 dark:fill-gray-400'
            fontSize={11}
          >
            {label}
          </text>
        );
      })}

      {/* Percentage labels on score points */}
      {scores.map((s, i) => {
        const [x, y] = pointAt(i, radius * Math.max(s, 0.02));
        const offsetY = y < cy ? -10 : 10;
        return (
          <text
            key={`pct-${i}`}
            x={x}
            y={y + offsetY}
            textAnchor='middle'
            dominantBaseline='central'
            className='fill-gray-500 dark:fill-gray-400'
            fontSize={9}
            fontWeight='bold'
          >
            {Math.round(s * 100)}%
          </text>
        );
      })}
    </svg>
  );
};

export default RadarChart;
