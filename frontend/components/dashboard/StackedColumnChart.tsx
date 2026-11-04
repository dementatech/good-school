'use client';

import { useEffect, useRef, useState } from 'react';
import { easeCubicOut, max, scaleBand, scaleLinear, select, stack, type ScaleBand, type SeriesPoint } from 'd3';
import { animationMs, barPath } from '@/lib/dashboard/charts';
import { useChartWidth } from './useChartWidth';

export interface ColumnSeries {
  id: string;
  label: string;
  /** A fill-* class chosen to read on the navy FeaturePanel. */
  fillClass: string;
  /** The matching bg-* class for its legend dot. */
  dotClass: string;
}

export interface StackedColumn {
  id: string;
  /** Short axis label, e.g. S1. */
  label: string;
  /** Full name, shown in the readout. */
  name: string;
  /** One value per series, in the same order. */
  values: number[];
}

const HEIGHT = 232;
const MARGIN = { top: 8, bottom: 24, left: 32 };
const MIN_COLUMN_SLOT = 30;
const MAX_BAR_WIDTH = 24;
const SEGMENT_GAP = 2;

type Segment = SeriesPoint<StackedColumn> & { key: number };

/**
 * Columns on one zero-based axis, drawn with d3.stack for the navy FeaturePanel.
 * The readout above shows the column being read: the largest by default, or
 * whichever is hovered, focused or tapped. Scrolls sideways rather than
 * squeezing many classes. Pass memoised `columns` and `series`.
 */
export function StackedColumnChart({
  columns,
  series,
  unit,
  ariaLabel,
}: {
  columns: StackedColumn[];
  series: ColumnSeries[];
  /** Plural noun for the total, e.g. "students". */
  unit: string;
  ariaLabel: string;
}) {
  const [wrapperRef, width] = useChartWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const xRef = useRef<ScaleBand<string> | null>(null);
  const hasDrawn = useRef(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const totalOf = (column: StackedColumn) => column.values.reduce((sum, value) => sum + value, 0);
  const largest = columns.reduce<StackedColumn | null>((best, c) => (!best || totalOf(c) > totalOf(best) ? c : best), null);
  const active = columns.find((c) => c.id === activeId) ?? largest;
  const activeColumnId = active?.id ?? null;

  useEffect(() => {
    if (!svgRef.current || width === 0) return;
    const chartWidth = Math.max(width, MARGIN.left + columns.length * MIN_COLUMN_SLOT);
    const baseline = HEIGHT - MARGIN.bottom;
    const svg = select(svgRef.current).attr('width', chartWidth).attr('height', HEIGHT);

    const x = scaleBand(columns.map((c) => c.id), [MARGIN.left, chartWidth]).paddingInner(0.2).paddingOuter(0.1);
    xRef.current = x;
    const y = scaleLinear([0, max(columns, (c) => c.values.reduce((a, b) => a + b, 0)) || 1], [baseline, MARGIN.top]).nice(4);
    const ticks = y.ticks(4).filter(Number.isInteger);
    const barWidth = Math.min(x.bandwidth(), MAX_BAR_WIDTH);
    // Hugs the bar when there are only a few wide columns.
    const highlightWidth = Math.min(x.bandwidth(), barWidth + 16);
    const barLeft = (column: StackedColumn) => (x(column.id) ?? 0) + (x.bandwidth() - barWidth) / 2;

    const layer = (name: string) =>
      svg
        .selectAll<SVGGElement, string>(`g.${name}`)
        .data([name])
        .join('g')
        .attr('class', name);

    layer('grid')
      .selectAll('line')
      .data(ticks)
      .join('line')
      .attr('x1', MARGIN.left)
      .attr('x2', chartWidth)
      .attr('y1', (t) => y(t))
      .attr('y2', (t) => y(t))
      .attr('class', 'stroke-white/10');

    layer('y-axis')
      .selectAll('text')
      .data(ticks)
      .join('text')
      .attr('x', MARGIN.left - 8)
      .attr('y', (t) => y(t))
      .attr('dy', '0.32em')
      .attr('text-anchor', 'end')
      .attr('class', 'fill-white/60 text-[10px] tabular-nums')
      .text((t) => t.toLocaleString('en-GB'));

    // Behind the bars, so the column being read lifts off the navy.
    layer('highlight')
      .selectAll('rect')
      .data([0])
      .join('rect')
      .attr('y', MARGIN.top)
      .attr('height', baseline - MARGIN.top)
      .attr('width', highlightWidth)
      .attr('rx', 4)
      .attr('class', 'fill-white/10');

    // Each bar's topmost non-empty segment gets the rounded data-end.
    const topKey = (column: StackedColumn) => column.values.reduce((top, value, key) => (value > 0 ? key : top), -1);
    const layers = stack<StackedColumn, number>()
      .keys(series.map((_, key) => key))
      .value((column, key) => column.values[key])(columns);
    const bars = layer('bars')
      .selectAll<SVGGElement, (typeof layers)[number]>('g')
      .data(layers)
      .join('g')
      .attr('class', (_, key) => series[key].fillClass)
      .selectAll<SVGPathElement, Segment>('path')
      .data(
        (group) => group.filter((point) => point[1] > point[0]).map((point) => Object.assign(point, { key: group.key })),
        (segment) => segment.data.id,
      )
      .join('path');

    const shape = (segment: Segment, t: number) => {
      const scaled = (value: number) => baseline - (baseline - y(value)) * t;
      const isTop = topKey(segment.data) === segment.key;
      const top = scaled(segment[1]) + (isTop ? 0 : SEGMENT_GAP * t);
      return barPath(barLeft(segment.data), barWidth, top, scaled(segment[0]), isTop ? 4 : 0);
    };

    if (hasDrawn.current) {
      bars.attr('d', (segment) => shape(segment, 1));
    } else {
      hasDrawn.current = true;
      bars
        .transition()
        .duration(animationMs(600))
        .ease(easeCubicOut)
        .attrTween('d', (segment) => (t) => shape(segment, t));
    }

    layer('x-axis')
      .selectAll<SVGTextElement, StackedColumn>('text')
      .data(columns, (column) => column.id)
      .join('text')
      .attr('x', (column) => (x(column.id) ?? 0) + x.bandwidth() / 2)
      .attr('y', HEIGHT - 8)
      .attr('text-anchor', 'middle')
      .text((column) => column.label);

    // Larger than the bars, so a thin column is still easy to tap.
    layer('targets')
      .selectAll<SVGRectElement, StackedColumn>('rect')
      .data(columns, (column) => column.id)
      .join('rect')
      .attr('x', (column) => x(column.id) ?? 0)
      .attr('y', MARGIN.top)
      .attr('width', x.bandwidth())
      .attr('height', HEIGHT - MARGIN.top)
      .attr('fill', 'transparent')
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('class', 'cursor-pointer outline-none focus-visible:stroke-white')
      .attr('aria-label', (column) => {
        const total = column.values.reduce((a, b) => a + b, 0);
        const split = series.length > 1 ? `, ${series.map((s, i) => `${s.label} ${column.values[i]}`).join(', ')}` : '';
        return `${column.name}: ${total} ${unit}${split}`;
      })
      .on('mouseenter focus click', (_, column) => setActiveId(column.id));
  }, [columns, series, unit, width]);

  useEffect(() => {
    if (!svgRef.current || !xRef.current) return;
    const x = xRef.current;
    const svg = select(svgRef.current);
    const highlight = svg.select('g.highlight rect');
    const inset = (x.bandwidth() - Number(highlight.attr('width') ?? 0)) / 2;
    highlight.attr('x', activeColumnId ? (x(activeColumnId) ?? 0) + inset : -999);
    svg
      .selectAll<SVGTextElement, StackedColumn>('g.x-axis text')
      .attr('class', (column) => (column.id === activeColumnId ? 'fill-white text-[10px] sm:text-xs font-semibold' : 'fill-white/60 text-[10px] sm:text-xs'));
  }, [activeColumnId, columns, width]);

  return (
    <div onMouseLeave={() => setActiveId(null)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-3 min-h-11 rounded-lg bg-white/10 px-3 py-2 text-xs" aria-live="polite">
        {active && (
          <>
            <span className="font-semibold truncate">
              {active.name}: {totalOf(active).toLocaleString('en-GB')} {unit}
            </span>
            {series.length > 1 && (
              <span className="flex flex-wrap gap-x-3">
                {series.map((s, index) => (
                  <span key={s.id} className="flex items-center gap-1.5 tabular-nums">
                    <span className={`size-2 rounded-full ${s.dotClass}`} aria-hidden />
                    {s.label} {active.values[index].toLocaleString('en-GB')}
                  </span>
                ))}
              </span>
            )}
          </>
        )}
      </div>
      <div ref={wrapperRef} className="overflow-x-auto no-scrollbar">
        <svg ref={svgRef} role="group" aria-label={ariaLabel} className="block" />
      </div>
    </div>
  );
}
