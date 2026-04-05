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
  /** When true, axis scale is inverted: center = 1.0, outer edge = 0.0.
   *  Useful for safety scores where lower = better. */
  invertAxis?: boolean;
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
  invertAxis = false,
}) => {
  const hPadding = 90; // horizontal space for labels
  const vPadding = 0;  // no vertical padding
  const vbW = size + hPadding * 2;
  const vbH = size + vPadding * 2;
  const cx = vbW / 2;
  const cy = vbH / 2;
  const radius = size * 0.34;
  const labelRadius = radius + 42;
  const n = labels.length;
  const levels = 5; // concentric rings

  const angleOf = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;

  const pointAt = (i: number, r: number): [number, number] => {
    const a = angleOf(i);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };

  const polygonPoints = (r: number) =>
    Array.from({ length: n }, (_, i) => pointAt(i, r).join(',')).join(' ');

  // When invertAxis, map score to radius: 0.0 → full radius (outer), 1.0 → center
  const scoreToRadius = (s: number) =>
    invertAxis ? radius * Math.max(1 - s, 0.02) : radius * Math.max(s, 0.02);

  const scorePoints = scores
    .map((s, i) => pointAt(i, scoreToRadius(s)).join(','))
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
      width='100%'
      viewBox={`0 0 ${vbW} ${vbH}`}
      className='select-none'
      style={{ display: 'block', maxWidth: 480 }}
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
        const [x, y] = pointAt(i, scoreToRadius(s));
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

      {/* Labels — split long labels into two lines */}
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
        // Split long labels into two lines at natural break points
        const splitLabel = (text: string): string[] => {
          if (text.includes('/')) return text.split('/').map((s, j) => j === 0 ? s + '/' : s);
          if (text.length <= 7) return [text];
          // Try splitting at particles that form natural phrase breaks
          const particles = ['を伴う', 'の'];
          for (const p of particles) {
            const idx = text.indexOf(p);
            if (idx > 0 && idx + p.length < text.length) {
              return [text.slice(0, idx + p.length), text.slice(idx + p.length)];
            }
          }
          return [text];
        };
        const lines = splitLabel(label);
        const lineHeight = 16;
        const yOffset = lines.length > 1 ? -lineHeight / 2 : 0;
        return (
          <text
            key={`label-${i}`}
            x={x}
            y={y + yOffset}
            textAnchor={anchor}
            dominantBaseline={baseline}
            className='fill-gray-600 dark:fill-gray-400'
            fontSize={16}
          >
            {lines.map((line, li) => (
              <tspan key={li} x={x} dy={li === 0 ? 0 : lineHeight}>
                {line}
              </tspan>
            ))}
          </text>
        );
      })}

      {/* Percentage labels — placed near the data point, offset outward */}
      {scores.map((s, i) => {
        const dataR = scoreToRadius(s);
        const pctR = dataR + 12;
        const [x, y] = pointAt(i, pctR);
        const offsetY = 0;
        return (
          <text
            key={`pct-${i}`}
            x={x}
            y={y + offsetY}
            textAnchor='middle'
            dominantBaseline='central'
            className='fill-gray-500 dark:fill-gray-400'
            fontSize={14}
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
