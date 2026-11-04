'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { area, curveMonotoneX, easeCubicOut, line, pointer, scaleLinear, scalePoint, select, type ScalePoint } from 'd3';
import { animationMs } from '@/lib/dashboard/charts';
import { useChartWidth } from './useChartWidth';

export interface TrendLinePoint {
  id: string;
  /** Short axis label. */
  label: string;
  /** Full name, shown in the readout. */
  name: string;
  /** 0–100. */
  value: number;
}

const HEIGHT = 172;
const MARGIN = { top: 10, right: 10, bottom: 24, left: 26 };
const TICKS = [0, 50, 100];

/**
 * One percentage over time, on a fixed 0–100 axis so a small change doesn't look
 * dramatic. Drawn with d3.line and d3.area; the crosshair snaps to the nearest
 * exam. The readout shows the latest point until another is hovered, focused or
 * tapped. Needs two points to draw a line; one is just a figure. Pass memoised
 * `points`.
 */
export function TrendLine({ points, ariaLabel }: { points: TrendLinePoint[]; ariaLabel: string }) {
  const gradientId = useId();
  const [wrapperRef, width] = useChartWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const xRef = useRef<ScalePoint<string> | null>(null);
  const hasDrawn = useRef(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const latest = points[points.length - 1];
  const active = points.find((p) => p.id === activeId) ?? latest;
  const activePointId = active?.id ?? null;
  const y = (value: number) => scaleLinear([0, 100], [HEIGHT - MARGIN.bottom, MARGIN.top]).clamp(true)(value);

  useEffect(() => {
    if (!svgRef.current || width === 0 || points.length < 2) return;
    const baseline = HEIGHT - MARGIN.bottom;
    const x = scalePoint(points.map((p) => p.id), [MARGIN.left + 4, width - MARGIN.right]);
    xRef.current = x;
    const xOf = (p: TrendLinePoint) => x(p.id) ?? 0;

    const svg = select(svgRef.current).attr('width', width).attr('height', HEIGHT);
    const layer = (name: string) =>
      svg
        .selectAll<SVGGElement, string>(`g.${name}`)
        .data([name])
        .join('g')
        .attr('class', name);

    const stops = svg
      .selectAll('defs')
      .data([0])
      .join('defs')
      .selectAll('linearGradient')
      .data([0])
      .join('linearGradient')
      .attr('id', gradientId)
      .attr('x1', 0)
      .attr('x2', 0)
      .attr('y1', 0)
      .attr('y2', 1);
    stops
      .selectAll('stop')
      .data([0.22, 0])
      .join('stop')
      .attr('offset', (_, i) => `${i * 100}%`)
      .attr('stop-color', 'var(--color-primary-700)')
      .attr('stop-opacity', (opacity) => opacity);

    layer('grid')
      .selectAll('line')
      .data(TICKS)
      .join('line')
      .attr('x1', MARGIN.left)
      .attr('x2', width)
      .attr('y1', (t) => y(t))
      .attr('y2', (t) => y(t))
      .attr('class', 'stroke-border');
    layer('y-axis')
      .selectAll('text')
      .data(TICKS)
      .join('text')
      .attr('x', MARGIN.left - 6)
      .attr('y', (t) => y(t))
      .attr('dy', '0.32em')
      .attr('text-anchor', 'end')
      .attr('class', 'fill-text-muted text-[10px] tabular-nums')
      .text((t) => t);

    layer('fill')
      .selectAll('path')
      .data([points])
      .join('path')
      .attr('fill', `url(#${gradientId})`)
      .attr('d', area<TrendLinePoint>().x(xOf).y0(baseline).y1((p) => y(p.value)).curve(curveMonotoneX));

    const stroke = layer('line')
      .selectAll<SVGPathElement, TrendLinePoint[]>('path')
      .data([points])
      .join('path')
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round')
      .attr('class', 'stroke-primary-700')
      .attr('d', line<TrendLinePoint>().x(xOf).y((p) => y(p.value)).curve(curveMonotoneX));

    if (!hasDrawn.current) {
      hasDrawn.current = true;
      const length = stroke.node()?.getTotalLength() ?? 0;
      stroke
        .attr('stroke-dasharray', `${length} ${length}`)
        .attr('stroke-dashoffset', length)
        .transition()
        .duration(animationMs(700))
        .ease(easeCubicOut)
        .attr('stroke-dashoffset', 0)
        .on('end', function () {
          select(this).attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
        });
    } else {
      stroke.attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
    }

    layer('crosshair')
      .selectAll('line')
      .data([0])
      .join('line')
      .attr('y1', MARGIN.top)
      .attr('y2', baseline)
      .attr('class', 'stroke-border-strong');

    layer('x-axis')
      .selectAll<SVGTextElement, TrendLinePoint>('text')
      .data(points, (p) => p.id)
      .join('text')
      .attr('x', xOf)
      .attr('y', HEIGHT - 8)
      .attr('text-anchor', (_, i) => (i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'))
      .text((p) => p.label);

    layer('dots')
      .selectAll<SVGCircleElement, TrendLinePoint>('circle')
      .data(points, (p) => p.id)
      .join('circle')
      .attr('cx', xOf)
      .attr('cy', (p) => y(p.value))
      .attr('stroke-width', 2)
      .attr('class', 'stroke-white');

    // The whole plot is the hover target, so a phone needn't land on a dot.
    const nearest = (event: Event) => {
      const [px] = pointer(event);
      return points.reduce((best, p) => (Math.abs(xOf(p) - px) < Math.abs(xOf(best) - px) ? p : best), points[0]);
    };
    layer('hover')
      .selectAll('rect')
      .data([0])
      .join('rect')
      .attr('x', MARGIN.left)
      .attr('y', 0)
      .attr('width', Math.max(width - MARGIN.left, 0))
      .attr('height', HEIGHT)
      .attr('fill', 'transparent')
      .on('pointermove click', (event) => setActiveId(nearest(event).id));

    // Keyboard and screen readers get one stop per exam.
    layer('targets')
      .selectAll<SVGCircleElement, TrendLinePoint>('circle')
      .data(points, (p) => p.id)
      .join('circle')
      .attr('cx', xOf)
      .attr('cy', (p) => y(p.value))
      .attr('r', 14)
      .attr('fill', 'transparent')
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('class', 'outline-none focus-visible:stroke-primary-500')
      .attr('aria-label', (p) => `${p.name}: ${p.value}%`)
      .on('mouseenter focus click', (_, p) => setActiveId(p.id));
  }, [points, width, gradientId]);

  useEffect(() => {
    if (!svgRef.current || !xRef.current || !activePointId) return;
    const x = xRef.current;
    const svg = select(svgRef.current);
    const position = x(activePointId) ?? 0;
    svg.select('g.crosshair line').attr('x1', position).attr('x2', position);
    svg
      .selectAll<SVGCircleElement, TrendLinePoint>('g.dots circle')
      .attr('r', (p) => (p.id === activePointId ? 6 : 4))
      .attr('fill', (p) => (p.id === activePointId ? 'var(--color-accent)' : 'var(--color-primary-700)'));
    // Too many labels collide on a phone: keep the first, last and the one being read.
    svg
      .selectAll<SVGTextElement, TrendLinePoint>('g.x-axis text')
      .attr('class', (p) => (p.id === activePointId ? 'fill-primary-900 text-[10px] font-semibold' : 'fill-text-muted text-[10px]'))
      .attr('display', (p, i) =>
        points.length <= 5 || i === 0 || i === points.length - 1 || p.id === activePointId ? null : 'none',
      );
  }, [activePointId, points, width]);

  if (!latest || !active) return null;

  return (
    <div onMouseLeave={() => setActiveId(null)}>
      <div className="mb-2" aria-live="polite">
        <p className="text-3xl font-bold text-primary-900 tabular-nums leading-none">{active.value}%</p>
        <p className="text-xs text-muted-foreground mt-1 truncate">{active.name}</p>
      </div>
      {points.length > 1 && (
        <div ref={wrapperRef}>
          <svg ref={svgRef} role="group" aria-label={ariaLabel} className="block" />
        </div>
      )}
    </div>
  );
}
