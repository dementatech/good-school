import { scaleLinear } from 'd3';
import { AlertTriangle } from 'lucide-react';

export interface RankedBar {
  id: string;
  label: string;
  /** 0–100. */
  percent: number;
}

/**
 * Worst first, so whatever needs attention is at the top. Rows under `target`
 * turn warning-coloured and gain an icon, so colour isn't the only signal.
 */
export function RankedBars({
  rows,
  target,
  limit = 6,
  ariaLabel,
}: {
  rows: RankedBar[];
  target: number;
  limit?: number;
  ariaLabel: string;
}) {
  const widthOf = scaleLinear([0, 100], [0, 100]).clamp(true);
  const shown = [...rows].sort((a, b) => a.percent - b.percent).slice(0, limit);
  return (
    <ul aria-label={ariaLabel} className="space-y-3">
      {shown.map((row) => {
        const below = row.percent < target;
        return (
          <li key={row.id} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-1.5 min-w-0 text-text-secondary">
                {below && <AlertTriangle className="size-3.5 shrink-0 text-warning" aria-label={`Below ${target}%`} />}
                <span className="truncate">{row.label}</span>
              </span>
              <span className="font-semibold text-primary-900 tabular-nums">{row.percent}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-primary-100 overflow-hidden" aria-hidden>
              <div className={`h-full rounded-full ${below ? 'bg-warning' : 'bg-primary-700'}`} style={{ width: `${widthOf(row.percent)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
