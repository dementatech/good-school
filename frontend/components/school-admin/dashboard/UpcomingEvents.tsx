import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { PanelHeader } from './PanelHeader';

export interface UpcomingEvent {
  id: string;
  title: string;
  eventDate: string;
}

export function UpcomingEvents({ events, loading }: { events: UpcomingEvent[]; loading: boolean }) {
  return (
    <Card>
      <PanelHeader
        icon={CalendarClock}
        title="Coming up"
        subtitle="The next 30 days"
        action={
          <Link href="/school-admin/events" className="text-xs font-semibold text-primary-700 hover:underline">
            All events
          </Link>
        }
      />
      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-text-muted">Nothing on the calendar.</p>
      ) : (
        <ul className="space-y-3">
          {events.map((event) => {
            const date = new Date(`${event.eventDate}T00:00:00`);
            return (
              <li key={event.id} className="flex items-center gap-3">
                <span className="w-11 shrink-0 rounded-lg bg-primary-50 py-1 text-center">
                  <span className="block text-sm font-bold leading-tight text-primary-700 tabular-nums">{date.getDate()}</span>
                  <span className="block text-[10px] uppercase text-primary-700">
                    {date.toLocaleDateString('en-GB', { month: 'short' })}
                  </span>
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-primary-900 truncate">{event.title}</p>
                  <p className="text-xs text-text-muted">{date.toLocaleDateString('en-GB', { weekday: 'long' })}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
