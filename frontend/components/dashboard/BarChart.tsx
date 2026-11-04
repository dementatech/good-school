'use client';

import { useState } from 'react';

export interface ClassBar {
  id: string;
  /** Short axis label, e.g. S1. */
  label: string;
  /** Full name, shown at the top of the tooltip. */
  name: string;
  value: number;
  details: { label: string; value: string }[];
}

// Bars stop short of the plot's top so the tooltip above the tallest one stays
// inside the card. The scale is still linear from zero.
const TALLEST_BAR_PERCENT = 58;

/**
 * One series, one hue. The solid bar is the one being read: the largest by
 * default, or whichever is hovered, focused or tapped. Each bar is a button so
 * the same reading works by keyboard and touch.
 */
export function ClassBarChart({ bars, scaleMax, ariaLabel }: { bars: ClassBar[]; scaleMax?: number; ariaLabel: string }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const top = Math.max(scaleMax ?? 0, ...bars.map((bar) => bar.value), 1);
  const largest = bars.reduce<ClassBar | null>((best, bar) => (!best || bar.value > best.value ? bar : best), null);
  const active = bars.find((bar) => bar.id === activeId) ?? largest;

  return (
    <div role="group" aria-label={ariaLabel} className="flex items-stretch gap-1.5 sm:gap-3 h-72" onMouseLeave={() => setActiveId(null)}>
      {bars.map((bar, index) => {
        const isActive = bar.id === active?.id;
        const height = (bar.value / top) * TALLEST_BAR_PERCENT;
        // Keep the first and last tooltips from running off the card's sides.
        const align =
          index === 0 ? 'left-0' : index === bars.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2';
        const summary = `${bar.name}: ${bar.details.map((d) => `${d.label} ${d.value}`).join(', ')}`;
        return (
          <button
            key={bar.id}
            type="button"
            aria-label={summary}
            onMouseEnter={() => setActiveId(bar.id)}
            onFocus={() => setActiveId(bar.id)}
            onClick={() => setActiveId(bar.id)}
            className={`relative flex-1 min-w-0 flex flex-col justify-end rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 ${isActive ? 'z-10' : ''}`}
          >
            <span className="relative flex-1 flex items-end justify-center">
              <span
                className={`relative block w-full max-w-14 rounded-t-xl ${
                  isActive ? 'bg-gradient-to-b from-primary-400 to-primary-700' : 'bg-primary-100'
                }`}
                style={{ height: `${height}%` }}
              >
                {isActive && (
                  <span
                    className={`absolute bottom-full mb-2 w-max min-w-28 rounded-lg bg-primary-900 px-3 py-2 text-left text-[11px] text-white shadow-lg pointer-events-none ${align}`}
                  >
                    <span className="block font-semibold mb-1">{bar.name}</span>
                    {bar.details.map((detail) => (
                      <span key={detail.label} className="flex justify-between gap-4">
                        <span className="text-white/70">{detail.label}</span>
                        <span className="font-semibold tabular-nums">{detail.value}</span>
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </span>
            <span className={`block pt-2 text-center text-xs truncate ${isActive ? 'font-semibold text-primary-900' : 'text-text-muted'}`}>
              {bar.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
