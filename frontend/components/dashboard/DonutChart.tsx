'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { arc as d3arc, easeCubicOut, interpolate, pie as d3pie, select, type PieArcDatum } from 'd3';
import { animationMs, shareLabel } from '@/lib/dashboard/charts';

export interface DonutPart {
  id: string;
  label: string;
  value: number;
  /** A fill-* class for the slice. Follows the part, never its size. */
  fillClass: string;
  /** The matching bg-* class for its legend dot. */
  dotClass: string;
}

const SIZE = 160;
const INNER_RADIUS = 58;
const OUTER_RADIUS = 72;
const ACTIVE_OUTER_RADIUS = 80;

type Slice = PieArcDatum<DonutPart>;

/**
 * One whole split into a few parts, drawn with d3.pie and d3.arc. The centre
 * leads with `centerValue` and switches to a part's share when it's hovered,
 * focused or tapped. Every part is named with its count beside it, so nothing
 * relies on colour alone. Pass memoised `parts` so it only redraws on new data.
 */
export function DonutChart({
  parts,
  centerValue,
  centerLabel,
  ariaLabel,
}: {
  parts: DonutPart[];
  centerValue: ReactNode;
  centerLabel: string;
  ariaLabel: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const hasDrawn = useRef(false);
  const lastActive = useRef<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const active = parts.find((part) => part.id === activeId);

  useEffect(() => {
    if (!svgRef.current) return;
    const slices = d3pie<DonutPart>().sort(null).value((part) => part.value).padAngle(0.03)(parts.filter((part) => part.value > 0));
    const arc = d3arc<Slice>().innerRadius(INNER_RADIUS).outerRadius(OUTER_RADIUS).cornerRadius(3);

    const paths = select(svgRef.current)
      .selectAll<SVGGElement, null>('g.slices')
      .data([null])
      .join('g')
      .attr('class', 'slices')
      .attr('transform', `translate(${SIZE / 2},${SIZE / 2})`)
      .selectAll<SVGPathElement, Slice>('path')
      .data(slices, (slice) => slice.data.id)
      .join('path')
      .attr('class', (slice) => `${slice.data.fillClass} cursor-pointer`)
      .on('mouseenter', (_, slice) => setActiveId(slice.data.id))
      .on('click', (_, slice) => setActiveId(slice.data.id));

    if (hasDrawn.current) {
      paths.attr('d', arc);
    } else {
      hasDrawn.current = true;
      paths
        .transition()
        .duration(animationMs(600))
        .ease(easeCubicOut)
        .attrTween('d', (slice) => {
          const grow = interpolate(slice.startAngle, slice.endAngle);
          return (t) => arc({ ...slice, endAngle: grow(t) }) ?? '';
        });
    }
  }, [parts]);

  useEffect(() => {
    if (!svgRef.current || lastActive.current === activeId) return;
    lastActive.current = activeId;
    const arc = d3arc<Slice>().innerRadius(INNER_RADIUS).cornerRadius(3);
    select(svgRef.current)
      .selectAll<SVGPathElement, Slice>('g.slices path')
      .transition()
      .duration(animationMs(150))
      .attr('d', (slice) => arc.outerRadius(slice.data.id === activeId ? ACTIVE_OUTER_RADIUS : OUTER_RADIUS)(slice) ?? '');
  }, [activeId]);

  return (
    <div className="flex flex-col xs:flex-row lg:flex-col 2xl:flex-row items-center gap-5" onMouseLeave={() => setActiveId(null)}>
      <div className="relative size-40 shrink-0">
        <svg ref={svgRef} viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full" aria-hidden />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-10">
          <span className="text-2xl font-bold text-primary-900 tabular-nums leading-tight">
            {active ? shareLabel(active.value, total) : centerValue}
          </span>
          <span className="text-[11px] text-muted-foreground leading-tight">{active ? active.label : centerLabel}</span>
        </div>
      </div>

      <ul aria-label={ariaLabel} className="w-full min-w-0 space-y-1">
        {parts.map((part) => (
          <li key={part.id}>
            <button
              type="button"
              onMouseEnter={() => setActiveId(part.id)}
              onFocus={() => setActiveId(part.id)}
              onBlur={() => setActiveId(null)}
              onClick={() => setActiveId(part.id)}
              className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary-500 ${
                part.id === activeId ? 'bg-muted' : ''
              }`}
            >
              <span className={`size-2.5 rounded-full shrink-0 ${part.dotClass}`} aria-hidden />
              <span className="flex-1 min-w-0 truncate text-text-secondary">{part.label}</span>
              <span className="font-semibold text-primary-900 tabular-nums">{part.value.toLocaleString('en-GB')}</span>
              <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{shareLabel(part.value, total)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
