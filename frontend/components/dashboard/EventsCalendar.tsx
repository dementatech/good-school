'use client';

/* eslint-disable @next/next/no-img-element -- stored images at unknown sizes. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ChevronLeft, ChevronRight, Globe2, Link2Off, Pencil, Plus, Share2, Table2, Trash2 } from 'lucide-react';
import { EventFormModal } from '@/components/admin/events/EventFormModal';
import { EVENT_AUDIENCE_LABEL, EVENT_TYPE_LABEL, submitJson, type SchoolEvent } from '@/components/admin/events/types';
import { useAuth } from '@/components/auth/AuthContext';
import { shareEventLink } from '@/components/events/shareEvent';
import { useToast } from '@/components/ui/ToastProvider';
import { Button } from '@/components/kit/button';
import { Card } from '@/components/kit/card';
import { Skeleton } from '@/components/kit/skeleton';
import { fetchList } from '@/lib/api/envelope';
import { monthGrid } from '@/lib/dashboard/calendar';
import { publicEventPath, shareMessage } from '@/lib/events/public-event';
import { withSamplesInRange, type SampleableEvent } from '@/lib/dashboard/sample-events';
import { useRealtimeSocket } from '@/lib/realtime/useRealtimeSocket';
import { localIsoDate } from '@/lib/school-admin/dashboard';
import { DashboardPage } from './DashboardPage';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_DOTS = 3;

// Sample events never reach a production build, and are never sent to the backend.
const SHOW_SAMPLES = process.env.NODE_ENV === 'development';

/** The school calendar: a month grid with a dot on each event, and the events below it. */
export function EventsCalendar({ manageHref }: { manageHref?: string }) {
  const toast = useToast();
  const { user } = useAuth();
  const [modal, setModal] = useState<{ initial?: SchoolEvent } | null>(null);
  const [today] = useState(() => new Date());
  const todayIso = localIsoDate(today);
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<SampleableEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const grid = useMemo(() => monthGrid(view.year, view.month), [view]);
  const from = grid[0].iso;
  const to = grid[grid.length - 1].iso;

  const load = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      const rows = await fetchList<SampleableEvent>(`/api/v1/events?from=${from}&to=${to}`);
      if (!isCurrent()) return;
      setEvents(SHOW_SAMPLES ? withSamplesInRange(rows, from, to, today, localIsoDate) : rows);
      setLoading(false);
    },
    [from, to, today],
  );

  useEffect(() => {
    let current = true;
    void (async () => {
      await load(() => current);
    })();
    return () => {
      current = false;
    };
  }, [load]);

  useRealtimeSocket((event) => {
    if (event.type === 'calendar_event') void load();
  }, true);

  const byDate = useMemo(() => {
    const map = new Map<string, SampleableEvent[]>();
    for (const event of events) map.set(event.eventDate, [...(map.get(event.eventDate) ?? []), event]);
    return map;
  }, [events]);

  const monthPrefix = `${view.year}-${String(view.month + 1).padStart(2, '0')}`;
  const listed = selected ? (byDate.get(selected) ?? []) : events.filter((e) => e.eventDate.startsWith(monthPrefix));
  const monthName = new Date(view.year, view.month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const listTitle = selected
    ? new Date(`${selected}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    : `All of ${monthName}`;

  function move(delta: number) {
    setSelected(null);
    setLoading(true);
    setView(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  // A school admin owns their school's events; a super admin owns the global ones.
  // Each can only see global events and their own, so this is enough to tell.
  const canManage = (event: SampleableEvent) => {
    if (event.isSample || !manageHref) return false;
    return user?.role === 'super_admin' ? event.schoolId === null : event.schoolId !== null;
  };

  async function share(event: SampleableEvent) {
    let token = event.shareToken ?? null;
    if (!token) {
      const res = await submitJson<SchoolEvent>(`/api/v1/events/${event.id}/share`, 'POST');
      if (!res.ok || !res.data?.shareToken) {
        toast.error(res.error ?? 'Could not create a link for this event.');
        return;
      }
      token = res.data.shareToken;
      await load();
    }
    const url = `${window.location.origin}${publicEventPath(token)}`;
    const outcome = await shareEventLink(event.title, shareMessage(event), url);
    if (outcome === 'copied') toast.success('Link copied.');
    if (outcome === 'failed') toast.error(`Could not share automatically. The link is ${url}`);
  }

  async function stopSharing(event: SampleableEvent) {
    if (!confirm(`Switch off the public link for "${event.title}"? Anyone who has it will no longer be able to open it.`)) return;
    const res = await submitJson(`/api/v1/events/${event.id}/share`, 'DELETE');
    if (res.ok) {
      toast.success('Public link switched off.');
      await load();
    } else {
      toast.error(res.error ?? 'Could not switch off the link.');
    }
  }

  async function remove(event: SampleableEvent) {
    if (!confirm(`Delete "${event.title}"?`)) return;
    const res = await submitJson(`/api/v1/events/${event.id}`, 'DELETE');
    if (res.ok) {
      toast.success('Event deleted.');
      await load();
    } else {
      toast.error(res.error ?? 'Could not delete the event.');
    }
  }

  return (
    <DashboardPage title="Events calendar">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4 items-start">
        <Card className="lg:col-span-3 gap-3 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => move(-1)} aria-label="Previous month" className="size-11 rounded-full flex items-center justify-center text-primary-900 hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary-500">
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <h2 className="text-base font-semibold text-primary-900" aria-live="polite">{monthName}</h2>
            <button type="button" onClick={() => move(1)} aria-label="Next month" className="size-11 rounded-full flex items-center justify-center text-primary-900 hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary-500">
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-xs text-muted-foreground" aria-hidden>
            {WEEKDAYS.map((day) => (
              <span key={day} className="py-1">{day}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1">
            {grid.map((cell) => {
              const dayEvents = byDate.get(cell.iso) ?? [];
              const isSelected = cell.iso === selected;
              const isToday = cell.iso === todayIso;
              const fullDate = new Date(`${cell.iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
              const count = dayEvents.length;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${fullDate}${count ? `, ${count} ${count === 1 ? 'event' : 'events'}` : ''}`}
                  onClick={() => setSelected(isSelected ? null : cell.iso)}
                  className="flex flex-col items-center gap-1 py-1 rounded-lg focus-visible:outline-2 focus-visible:outline-primary-500"
                >
                  <span
                    className={`size-9 rounded-lg flex items-center justify-center text-sm tabular-nums transition-colors ${
                      isSelected
                        ? 'bg-primary-700 text-white font-semibold'
                        : isToday
                          ? 'ring-2 ring-primary-700 text-primary-900 font-semibold'
                          : cell.inMonth
                            ? 'text-primary-900 hover:bg-muted'
                            : 'text-text-faint hover:bg-muted'
                    }`}
                  >
                    {cell.day}
                  </span>
                  <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                    {dayEvents.slice(0, MAX_DOTS).map((event) => (
                      <span key={event.id} className={`size-1.5 rounded-full ${event.eventType === 'exam' || event.eventType === 'deadline' ? 'bg-accent' : 'bg-primary-700'}`} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" aria-hidden />Exams and deadlines</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary-700" aria-hidden />Other events</span>
            </span>
            {manageHref && (
              <span className="flex items-center gap-2">
                <Button asChild size="sm" variant="outline" className="rounded-full">
                  <Link href={manageHref}><Table2 className="size-4" aria-hidden />All events</Link>
                </Button>
                <Button size="sm" className="rounded-full" onClick={() => setModal({})}>
                  <Plus className="size-4" aria-hidden />Add event
                </Button>
              </span>
            )}
          </div>
        </Card>

        <section className="lg:col-span-2 min-w-0 space-y-3" aria-label="Events">
          <div className="flex items-center justify-between gap-3 px-1">
            <h2 className="text-sm font-semibold text-primary-900">{listTitle}</h2>
            {selected && (
              <button type="button" onClick={() => setSelected(null)} className="text-xs font-semibold text-primary-700 hover:underline">
                Show whole month
              </button>
            )}
          </div>

          {loading ? (
            <div role="status" aria-label="Loading" className="space-y-3">
              <Skeleton className="h-24 w-full rounded-card" />
              <Skeleton className="h-24 w-full rounded-card" />
            </div>
          ) : listed.length === 0 ? (
            <Card className="items-center gap-2 p-8 text-center">
              <CalendarClock className="size-6 text-text-faint" aria-hidden />
              <p className="text-sm text-muted-foreground">{selected ? 'Nothing on this day.' : 'Nothing on the calendar this month.'}</p>
            </Card>
          ) : (
            <ul className="space-y-3">
              {listed.map((event) => {
                const date = new Date(`${event.eventDate}T00:00:00`);
                return (
                  <li key={event.id} className="flex overflow-hidden rounded-card bg-primary-900 text-white shadow-card">
                    {event.thumbnailUrl && (
                      <div className="relative w-24 xs:w-32 shrink-0">
                        <img src={event.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 p-3 sm:p-4 space-y-2">
                      <div className="flex gap-3">
                        <span className="w-12 shrink-0 self-start rounded-lg bg-accent py-1.5 text-center text-primary-900">
                          <span className="block text-base font-bold leading-tight tabular-nums">{date.getDate()}</span>
                          <span className="block text-[10px] font-semibold">{date.toLocaleDateString('en-GB', { month: 'short' })}</span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold leading-snug">{event.title}</p>
                          <p className="text-xs text-white/70 mt-0.5">{date.toLocaleDateString('en-GB', { weekday: 'long' })}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        {event.eventType && <span className="rounded-full bg-white/15 px-2 py-0.5">{EVENT_TYPE_LABEL[event.eventType]}</span>}
                        {event.audience && <span className="rounded-full bg-white/15 px-2 py-0.5">{EVENT_AUDIENCE_LABEL[event.audience]}</span>}
                        {event.shareToken && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5"><Globe2 className="size-3" aria-hidden />Public link on</span>
                        )}
                        {event.isSample && <span className="rounded-full bg-accent-light px-2 py-0.5 font-semibold text-accent-dark">Sample</span>}
                      </div>
                      {event.description && <p className="text-xs text-white/80">{event.description}</p>}
                      {!event.isSample && (canManage(event) || event.shareToken) && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <button type="button" onClick={() => void share(event)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-semibold text-primary-900 hover:bg-accent-mid focus-visible:outline-2 focus-visible:outline-white">
                            <Share2 className="size-3.5" aria-hidden />Share
                          </button>
                          {canManage(event) && (
                            <>
                              <button type="button" onClick={() => setModal({ initial: event as SchoolEvent })} aria-label={`Edit ${event.title}`} className="flex size-9 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white">
                                <Pencil className="size-3.5" aria-hidden />
                              </button>
                              {event.shareToken && (
                                <button type="button" onClick={() => void stopSharing(event)} aria-label={`Switch off the public link for ${event.title}`} className="flex size-9 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white">
                                  <Link2Off className="size-3.5" aria-hidden />
                                </button>
                              )}
                              {!event.schoolExamId && (
                                <button type="button" onClick={() => void remove(event)} aria-label={`Delete ${event.title}`} className="flex size-9 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white">
                                  <Trash2 className="size-3.5" aria-hidden />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      {modal && <EventFormModal open onClose={() => setModal(null)} onSaved={() => load()} initial={modal.initial} />}
    </DashboardPage>
  );
}
