/** Everything about a shared event that doesn't need a browser. */

export interface PublicEvent {
  title: string;
  description: string | null;
  eventDate: string;
  eventType: 'holiday' | 'exam' | 'meeting' | 'deadline' | 'other';
  thumbnailUrl: string | null;
  schoolName: string | null;
  schoolLogoUrl: string | null;
}

/** What a shared link looks like. Stays on whichever site the sharer is using. */
export function publicEventPath(token: string): string {
  return `/e/${encodeURIComponent(token)}`;
}

/** "Tuesday, 10 November 2026". Dates are calendar days, so time zones must not move them. */
export function formatEventDate(eventDate: string): string {
  return new Date(`${eventDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function eventDateParts(eventDate: string): { day: string; month: string } {
  const date = new Date(`${eventDate}T00:00:00Z`);
  return {
    day: String(date.getUTCDate()),
    month: date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
  };
}

/** Whole days from `today` to the event, both YYYY-MM-DD. */
function daysUntil(eventDate: string, today: string): number {
  return Math.round((Date.parse(`${eventDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** "Today", "Tomorrow", "In 12 days", or "This event has passed". */
export function countdownLabel(eventDate: string, today: string): string {
  const days = daysUntil(eventDate, today);
  if (days < 0) return 'This event has passed';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

/** Today in Uganda, so a page rendered on any server counts down from the right day. */
export function todayInKampala(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(now);
}

/** The message that goes with a shared link. */
export function shareMessage(event: { title: string; eventDate: string; description?: string | null }): string {
  return [event.title, formatEventDate(event.eventDate), event.description?.trim()].filter(Boolean).join('\n');
}

/** A link that opens Google Calendar with this all-day event filled in. */
export function googleCalendarUrl(event: { title: string; eventDate: string; description?: string | null }, link: string): string {
  const start = event.eventDate.replace(/-/g, '');
  const next = new Date(Date.parse(`${event.eventDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${next}`,
    details: [event.description?.trim(), link].filter(Boolean).join('\n\n'),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
