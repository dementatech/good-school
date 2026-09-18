'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { isFeatureReady } from '@/lib/features';
import { fetchList } from '@/lib/api/envelope';
import { ProfileCard } from './ProfileCard';
import { MiniCalendar, type CalendarEvent } from './MiniCalendar';
import { RemindersList, type ReminderItem } from './RemindersList';

const UPCOMING_WINDOW_DAYS = 30;
const UPCOMING_LIMIT = 5;

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatReminderDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function DashboardRightRail({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  // A school-scoped role reads its own school's calendar (plus global
  // events, merged in server-side); super_admin has no school_id but still
  // has a calendar — the global one it manages at /admin/system/events.
  const eventsReady = isFeatureReady('events') && (Boolean(user?.schoolId) || user?.role === 'super_admin');

  const [monthEvents, setMonthEvents] = useState<CalendarEvent[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);

  const loadMonth = useCallback(
    async (year: number, month: number) => {
      if (!eventsReady) return;
      const from = toIsoDate(new Date(year, month, 1));
      const to = toIsoDate(new Date(year, month + 1, 0));
      const rows = await fetchList<{ id: string; title: string; eventDate: string; eventType: CalendarEvent['type'] }>(
        `/api/v1/events?from=${from}&to=${to}`,
      );
      setMonthEvents(rows.map((r) => ({ id: r.id, title: r.title, date: r.eventDate, type: r.eventType })));
    },
    [eventsReady],
  );

  useEffect(() => {
    if (!eventsReady) return;
    void (async () => {
      const today = new Date();
      const from = toIsoDate(today);
      const to = toIsoDate(new Date(today.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000));
      const rows = await fetchList<{ id: string; title: string; eventDate: string }>(
        `/api/v1/events?from=${from}&to=${to}`,
      );
      setReminders(
        rows.slice(0, UPCOMING_LIMIT).map((r) => ({ id: r.id, label: r.title, date: formatReminderDate(r.eventDate) })),
      );
    })();
  }, [eventsReady]);

  return (
    <div className={`w-full xl:w-[300px] xl:shrink-0 space-y-4 sm:space-y-5 ${className}`}>
      <ProfileCard />
      <MiniCalendar events={monthEvents} onMonthChange={loadMonth} />
      <RemindersList items={reminders} />
    </div>
  );
}
