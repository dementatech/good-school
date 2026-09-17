'use client';

import { max, scaleBand, scaleLinear } from 'd3';
import { useElementSize } from '@/lib/useElementSize';

interface PopulationEntry {
  label: string;
  count: number;
}

// Keep in sync with --color-accent-dark in app/globals.css — the same single
// mark color used by the leaderboard/benchmark charts, not a new palette.
const ACCENT_DARK = '#C4952A';
const AXIS_HEIGHT = 24;

interface PopulationBarChartProps {
  data: PopulationEntry[];
  height?: number;
}

/** Single-series vertical bar — one bar per class, no legend needed. */
export function PopulationBarChart({ data, height = 220 }: PopulationBarChartProps) {
  const { ref, width } = useElementSize<HTMLDivElement>();
  const plotHeight = height - AXIS_HEIGHT - 20;

  if (data.length === 0) {
    return <p className="text-sm text-text-muted">No students enrolled yet.</p>;
  }

  const x = scaleBand()
    .domain(data.map((d) => d.label))
    .range([0, Math.max(0, width)])
    .paddingInner(0.35)
    .paddingOuter(0.15);
  const y = scaleLinear()
    .domain([0, Math.max(1, max(data, (d) => d.count) ?? 1)])
    .range([plotHeight, 0]);

  return (
    <div ref={ref} style={{ width: '100%' }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Student population by class">
          <g transform="translate(0, 16)">
            {data.map((d) => {
              const bx = x(d.label) ?? 0;
              const barHeight = plotHeight - y(d.count);
              return (
                <g key={d.label}>
                  <title>{`${d.label}: ${d.count} student${d.count === 1 ? '' : 's'}`}</title>
                  <rect
                    x={bx}
                    y={y(d.count)}
                    width={x.bandwidth()}
                    height={Math.max(0, barHeight)}
                    fill={ACCENT_DARK}
                    rx={4}
                  />
                  <text
                    x={bx + x.bandwidth() / 2}
                    y={y(d.count) - 6}
                    textAnchor="middle"
                    className="fill-[var(--color-text-secondary)]"
                    fontSize={12}
                  >
                    {d.count}
                  </text>
                  <text
                    x={bx + x.bandwidth() / 2}
                    y={plotHeight + 18}
                    textAnchor="middle"
                    className="fill-[var(--color-text-secondary)]"
                    fontSize={12}
                  >
                    {d.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
}
