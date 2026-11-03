'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { fetchList } from '@/lib/api/envelope';
import { useRealtimeSocket } from '@/lib/realtime/useRealtimeSocket';
import { localIsoDate } from '@/lib/school-admin/dashboard';
import { Panel } from './Panel';

const DAYS_AHEAD = 30;
const LIMIT = 4;

interface UpcomingEvent {
  id: string;
  title: string;
  eventDate: string;
}

/** The next month of the school calendar. Refreshes when an event is added. */
export function ComingUpPanel() {
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + DAYS_AHEAD);
    const rows = await fetchList<UpcomingEvent>(`/api/v1/events?from=${localIsoDate(from)}&to=${localIsoDate(to)}`);
    setEvents(rows.slice(0, LIMIT));
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
      empty={events.length === 0 ? 'Nothing on the calendar.' : undefined}
    >
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
                <p className="text-sm font-medium text-primary-900 truncate">{event.title}</p>
                <p className="text-xs text-muted-foreground">{date.toLocaleDateString('en-GB', { weekday: 'long' })}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
