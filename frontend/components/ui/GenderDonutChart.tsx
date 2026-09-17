'use client';

import { useState } from 'react';
import { arc as d3arc, pie as d3pie } from 'd3';
import { useElementSize } from '@/lib/useElementSize';

interface GenderBreakdownEntry {
  gender: 'male' | 'female' | 'unspecified';
  count: number;
}

// Validated with the dataviz skill's palette script against the app's actual
// theme (app/globals.css): primary-400 + accent-dark pass lightness band,
// chroma floor, CVD separation (ΔE 20.4/22.3), and the normal-vision floor
// (ΔE 25.3) as a categorical pair. "unspecified" is a muted neutral, not a
// third validated hue — a residual/unknown bucket reads as distinct-by-being-
// muted rather than needing to clear the same separation bar as a real category.
const COLORS: Record<GenderBreakdownEntry['gender'], string> = {
  male: '#0489AE',
  female: '#C4952A',
  unspecified: '#A3A3A3',
};

const LABELS: Record<GenderBreakdownEntry['gender'], string> = {
  male: 'Male',
  female: 'Female',
  unspecified: 'Unspecified',
};

const CHART_HEIGHT = 220;

interface GenderDonutChartProps {
  data: GenderBreakdownEntry[];
}

export function GenderDonutChart({ data }: GenderDonutChartProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const { ref, width } = useElementSize<HTMLDivElement>();
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return <p className="text-sm text-text-muted">No students enrolled yet.</p>;
  }

  const chartData = data.map((d) => ({
    ...d,
    label: LABELS[d.gender],
    percent: Math.round((d.count / total) * 1000) / 10,
  }));

  const size = Math.min(width, CHART_HEIGHT);
  const radius = size / 2;
  const pie = d3pie<GenderBreakdownEntry>()
    .value((d) => d.count)
    .padAngle(0.015)
    .sort(null);
  const arc = d3arc<{ startAngle: number; endAngle: number; padAngle: number }>()
    .innerRadius(radius * 0.55)
    .outerRadius(radius * 0.8)
    .cornerRadius(2);
  const labelArc = d3arc<{ startAngle: number; endAngle: number; padAngle: number }>()
    .innerRadius(radius * 0.9)
    .outerRadius(radius * 0.9);
  const arcs = pie(data);

  return (
    <div>
      <div className="flex justify-end mb-2">
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => setView('chart')}
            className={`px-2.5 py-1 rounded-lg ${view === 'chart' ? 'bg-primary-700 text-white' : 'text-text-secondary hover:bg-bg-muted'}`}
          >
            Chart
          </button>
          <button
            onClick={() => setView('table')}
            className={`px-2.5 py-1 rounded-lg ${view === 'table' ? 'bg-primary-700 text-white' : 'text-text-secondary hover:bg-bg-muted'}`}
          >
            Table
          </button>
        </div>
      </div>

      {view === 'chart' ? (
        <div ref={ref} style={{ width: '100%', height: CHART_HEIGHT }} className="flex flex-col items-center">
          {width > 0 && (
            <svg width={size} height={size} role="img" aria-label="Gender breakdown of enrolled students">
              <g transform={`translate(${size / 2}, ${size / 2})`}>
                {arcs.map((a) => {
                  const pct = Math.round((a.data.count / total) * 100);
                  return (
                    <g key={a.data.gender}>
                      <title>{`${LABELS[a.data.gender]}: ${a.data.count} (${pct}%)`}</title>
                      <path d={arc(a) ?? undefined} fill={COLORS[a.data.gender]} stroke="var(--color-bg-card)" strokeWidth={2} />
                      {pct > 0 && (
                        <text
                          transform={`translate(${labelArc.centroid(a)})`}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="fill-[var(--color-text-secondary)]"
                          fontSize={11}
                          fontWeight={600}
                        >
                          {pct}%
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          )}
          <div className="flex items-center justify-center gap-4 mt-2 text-xs text-text-muted">
            {chartData.map((d) => (
              <span key={d.gender} className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COLORS[d.gender] }} />
                {d.label}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted border-b border-border">
              <th className="py-2 pr-4">Gender</th>
              <th className="py-2 pr-4">Students</th>
              <th className="py-2 pr-4">Share</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((d) => (
              <tr key={d.gender} className="border-b border-primary-50">
                <td className="py-2 pr-4 text-text-primary">{d.label}</td>
                <td className="py-2 pr-4 text-text-secondary">{d.count}</td>
                <td className="py-2 pr-4 text-text-secondary">{d.percent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
