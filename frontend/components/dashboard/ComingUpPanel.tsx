'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarClock } from 'lucide-react';
import { fetchList } from '@/lib/api/envelope';
import { withSampleEvents, type SampleableEvent } from '@/lib/dashboard/sample-events';
import { useRealtimeSocket } from '@/lib/realtime/useRealtimeSocket';
import { localIsoDate } from '@/lib/school-admin/dashboard';
import { Panel } from './Panel';

const DAYS_AHEAD = 30;
const LIMIT = 4;

// Sample events never reach a production build: this is false there, and they
// are only ever added on the client, never sent to the backend.
const SHOW_SAMPLES = process.env.NODE_ENV === 'development';

/** The next month of the school calendar. Refreshes when an event is added. */
export function ComingUpPanel({ href }: { href: string }) {
  const [events, setEvents] = useState<SampleableEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + DAYS_AHEAD);
    const rows = await fetchList<SampleableEvent>(`/api/v1/events?from=${localIsoDate(from)}&to=${localIsoDate(to)}`);
    const real = rows.slice(0, LIMIT);
    setEvents(SHOW_SAMPLES ? withSampleEvents(real, LIMIT, from, localIsoDate) : real);
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  useRealtimeSocket((event) => {
    if (event.type === 'calendar_event') void load();
  }, true);

  return (
    <Panel
      icon={CalendarClock}
      title="Coming up"
      description="The next 30 days"
      loading={loading}
    >
      {events.length === 0 && <p className="text-sm text-muted-foreground">Nothing on the calendar.</p>}
      <ul className="space-y-3">
        {events.map((event) => {
          const date = new Date(`${event.eventDate}T00:00:00`);
          return (
            <li key={event.id} className="flex items-center gap-3">
              <span className="w-11 shrink-0 rounded-lg bg-primary-50 py-1 text-center text-primary-700">
                <span className="block text-sm font-bold leading-tight tabular-nums">{date.getDate()}</span>
                <span className="block text-[10px] uppercase">{date.toLocaleDateString('en-GB', { month: 'short' })}</span>
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium text-primary-900">
                  <span className="truncate">{event.title}</span>
                  {event.isSample && (
                    <span className="shrink-0 rounded bg-accent-light px-1.5 py-0.5 text-[10px] font-semibold text-accent-dark">Sample</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{date.toLocaleDateString('en-GB', { weekday: 'long' })}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <Link href={href} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-primary-500">
        See more events
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </Panel>
  );
}
