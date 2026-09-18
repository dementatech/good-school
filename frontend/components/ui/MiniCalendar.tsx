'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from './Card';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export type CalendarEventType = 'holiday' | 'exam' | 'meeting' | 'deadline' | 'other';

export interface CalendarEvent {
  id: string;
  title: string;
  /** ISO date, e.g. "2026-09-17". */
  date: string;
  type: CalendarEventType;
}

const DOT_COLOR: Record<CalendarEventType, string> = {
  holiday: 'bg-amber-500',
  exam: 'bg-rose-500',
  meeting: 'bg-primary-700',
  deadline: 'bg-orange-500',
  other: 'bg-gray-400',
};

export interface MiniCalendarProps {
  /** Events falling within the currently displayed month — pass whatever
   * matches `onMonthChange`'s last call, or a wider set (extra ones are
   * simply invisible until their month is in view). */
  events?: CalendarEvent[];
  /** Fired on mount and whenever the visible month changes, so the caller
   * can fetch just that month's events. `month` is 0-indexed. */
  onMonthChange?: (year: number, month: number) => void;
  className?: string;
}

export function MiniCalendar({ events = [], onMonthChange, className = '' }: MiniCalendarProps) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const isCurrentMonth = cursor.year === today.getFullYear() && cursor.month === today.getMonth();

  useEffect(() => {
    onMonthChange?.(cursor.year, cursor.month);
    // Only re-fire when the visible month actually changes — onMonthChange
    // is a fresh closure every render on the caller's side.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor.year, cursor.month]);

  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const leading = (first.getDay() + 6) % 7; // Monday-first week
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    return [...Array(leading).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    const prefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-`;
    for (const event of events) {
      if (!event.date.startsWith(prefix)) continue;
      const day = Number(event.date.slice(8, 10));
      const list = map.get(day) ?? [];
      list.push(event);
      map.set(day, list);
    }
    return map;
  }, [events, cursor]);

  const goPrev = () => {
    setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }));
    setSelectedDay(null);
  };
  const goNext = () => {
    setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }));
    setSelectedDay(null);
  };

  const selectedEvents = selectedDay !== null ? (eventsByDay.get(selectedDay) ?? []) : [];

  return (
    <Card className={className}>
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={goPrev} aria-label="Previous month" className="p-1 rounded-lg hover:bg-bg-muted text-text-muted">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="text-sm font-semibold text-primary-900">
          {MONTH_NAMES[cursor.month]} {cursor.year}
        </p>
        <button type="button" onClick={goNext} aria-label="Next month" className="p-1 rounded-lg hover:bg-bg-muted text-text-muted">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1.5 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-[11px] font-medium text-text-faint">
            {w[0]}
          </span>
        ))}
        {cells.map((day, i) => {
          const isToday = isCurrentMonth && day === today.getDate();
          const dayEvents = day !== null ? (eventsByDay.get(day) ?? []) : [];
          const isSelected = day !== null && day === selectedDay;
          return (
            <span key={i} className="flex flex-col items-center justify-center h-7">
              {day && (
                <button
                  type="button"
                  onClick={() => setSelectedDay((d) => (d === day ? null : day))}
                  title={dayEvents.map((e) => e.title).join(', ') || undefined}
                  className={`flex items-center justify-center w-7 h-7 rounded-full text-xs transition-colors ${
                    isToday
                      ? 'bg-primary-700 text-white font-semibold'
                      : isSelected
                        ? 'bg-primary-100 text-primary-700 font-semibold ring-1 ring-primary-300'
                        : dayEvents.length > 0
                          ? 'bg-primary-50 text-primary-700 font-medium hover:bg-primary-100'
                          : 'text-text-secondary hover:bg-bg-muted'
                  }`}
                >
                  {day}
                </button>
              )}
              {dayEvents.length > 0 && (
                <span className="flex gap-0.5 -mt-1">
                  {dayEvents.slice(0, 3).map((e) => (
                    <span key={e.id} className={`w-1 h-1 rounded-full ${DOT_COLOR[e.type]}`} />
                  ))}
                </span>
              )}
            </span>
          );
        })}
      </div>

      {selectedDay !== null && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs font-medium text-text-muted mb-1.5">
            {MONTH_NAMES[cursor.month]} {selectedDay}, {cursor.year}
          </p>
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-text-muted">No events on this day.</p>
          ) : (
            <ul className="space-y-1.5">
              {selectedEvents.map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-sm">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT_COLOR[e.type]}`} />
                  <span className="text-primary-900 truncate">{e.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
