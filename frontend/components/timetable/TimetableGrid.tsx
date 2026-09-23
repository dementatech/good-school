'use client';

import { DAY_NAMES, DAY_SHORT, type Period, type Slot } from './types';

/**
 * A week at a glance: periods down the side, school days across the top.
 * Breaks, lunch and assembly span the whole row. `onCellClick` makes lesson
 * cells clickable (the admin editor); without it the grid is read-only.
 */
export function TimetableGrid({
  periods,
  days,
  slots,
  onCellClick,
  cellLabel = 'subject',
}: {
  periods: Period[];
  days: number[];
  slots: Slot[];
  onCellClick?: (day: number, period: Period, slot: Slot | null) => void;
  /** What the cell's second line shows: the teacher (class view) or the class (teacher view). */
  cellLabel?: 'subject' | 'class';
}) {
  if (periods.length === 0) {
    return <p className="text-sm text-text-muted">The school day hasn&apos;t been set up yet.</p>;
  }
  const slotAt = (day: number, periodId: string) =>
    slots.filter((s) => s.dayOfWeek === day && s.periodId === periodId);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-bg-card">
      <table className="w-full text-sm min-w-[720px] border-collapse">
        <thead>
          <tr className="bg-bg-subtle text-[11px] font-bold uppercase tracking-wide text-text-faint">
            <th className="py-2 px-3 text-left w-32 border-b border-border">Period</th>
            {days.map((d) => (
              <th key={d} className="py-2 px-2 text-left border-b border-l border-border">
                <span className="hidden sm:inline">{DAY_NAMES[d]}</span>
                <span className="sm:hidden">{DAY_SHORT[d]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) =>
            p.kind !== 'lesson' ? (
              <tr key={p.id} className="bg-bg-subtle/60">
                <td className="py-1.5 px-3 border-b border-border text-xs text-text-muted">
                  {p.startTime}–{p.endTime}
                </td>
                <td
                  colSpan={days.length}
                  className="py-1.5 px-3 border-b border-l border-border text-center text-xs font-semibold uppercase tracking-widest text-text-faint"
                >
                  {p.label}
                </td>
              </tr>
            ) : (
              <tr key={p.id}>
                <td className="py-2 px-3 border-b border-border align-top">
                  <span className="block font-semibold text-primary-900 text-xs">{p.label}</span>
                  <span className="block text-[11px] text-text-faint tabular-nums">
                    {p.startTime}–{p.endTime}
                  </span>
                </td>
                {days.map((d) => {
                  const here = slotAt(d, p.id);
                  const first = here[0] ?? null;
                  const clickable = !!onCellClick;
                  return (
                    <td key={d} className="p-1 border-b border-l border-border align-top h-14">
                      <button
                        type="button"
                        disabled={!clickable}
                        onClick={() => onCellClick?.(d, p, first)}
                        className={`w-full h-full min-h-12 rounded-lg px-2 py-1 text-left transition-colors ${
                          here.length
                            ? 'bg-primary-50 hover:bg-primary-100'
                            : clickable
                              ? 'border border-dashed border-border hover:border-primary-700 text-text-faint'
                              : ''
                        } disabled:cursor-default`}
                      >
                        {here.map((s) => (
                          <span key={s.id} className="block leading-tight">
                            <span className="block text-xs font-bold text-primary-900 truncate">
                              {s.subjectName ?? s.activity}
                              {s.streamName && cellLabel === 'subject' ? (
                                <span className="font-normal text-text-muted"> · {s.streamName}</span>
                              ) : null}
                            </span>
                            <span className="block text-[11px] text-text-muted truncate">
                              {cellLabel === 'class'
                                ? `${s.className}${s.streamName ? ` ${s.streamName}` : ''}`
                                : s.teacherName ?? '—'}
                              {s.room ? ` · ${s.room}` : ''}
                            </span>
                          </span>
                        ))}
                        {!here.length && clickable && <span className="text-[11px]">+ Add</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}
