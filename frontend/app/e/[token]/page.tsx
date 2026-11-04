/* eslint-disable @next/next/no-img-element -- images come from the backend or Cloudinary at unknown sizes. */
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { CalendarDays, Clock } from 'lucide-react';
import { EVENT_TYPE_LABEL } from '@/components/admin/events/types';
import {
  countdownLabel,
  eventDateParts,
  formatEventDate,
  publicEventPath,
  todayInKampala,
} from '@/lib/events/public-event';
import { fetchPublicEvent } from '@/lib/events/public-event-server';
import { PublicEventActions } from './PublicEventActions';

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const event = await fetchPublicEvent(token);
  if (!event) return { title: 'Event not available', robots: { index: false } };
  const description = [formatEventDate(event.eventDate), event.schoolName ?? 'Good School'].join(' · ');
  // A chat app fetches the preview image from an absolute address, so it has to
  // be the site this link was opened on, not the server's own idea of its name.
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'https';
  const image = host ? [{ url: `${protocol}://${host}${publicEventPath(token)}/preview.jpg`, width: 1200, height: 630, type: 'image/jpeg', alt: event.title }] : undefined;
  return {
    title: event.title,
    description,
    // Anyone with the link may open it, but it shouldn't turn up in search results.
    robots: { index: false, follow: false },
    openGraph: { title: event.title, description, type: 'website', images: image },
    twitter: { card: 'summary_large_image', title: event.title, description, images: image },
  };
}

export default async function PublicEventPage({ params }: Props) {
  const { token } = await params;
  const event = await fetchPublicEvent(token);
  if (!event) notFound();

  const { day, month } = eventDateParts(event.eventDate);
  const countdown = countdownLabel(event.eventDate, todayInKampala());
  const isPast = event.eventDate < todayInKampala();
  const host = event.schoolName ?? 'Good School';

  return (
    <main className="min-h-dvh bg-bg-canvas sm:py-10">
      <article className="mx-auto w-full max-w-xl bg-white sm:rounded-3xl overflow-hidden sm:shadow-card-hover">
        <header className="relative h-64 sm:h-72 bg-primary-900 overflow-hidden">
          {event.thumbnailUrl ? (
            <img src={event.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <div className="absolute inset-0" aria-hidden>
              <div className="absolute -top-24 -right-16 size-72 rounded-full bg-primary-700" />
              <div className="absolute -bottom-28 -left-12 size-64 rounded-full bg-accent/90" />
              <div className="absolute top-20 left-1/3 size-24 rounded-full border-[14px] border-white/15" />
            </div>
          )}
          {event.thumbnailUrl && (
            <div className="absolute inset-0 bg-gradient-to-t from-primary-900/90 via-primary-900/20 to-primary-900/30" aria-hidden />
          )}

          <div className="absolute top-4 left-4 right-4 flex items-center gap-2.5 text-white">
            {event.schoolLogoUrl && (
              <img src={event.schoolLogoUrl} alt="" className="size-9 rounded-full bg-white object-contain p-0.5 shrink-0" />
            )}
            <span className="text-sm font-semibold truncate">{host}</span>
          </div>

          {event.eventType !== 'other' && (
            <span className="absolute bottom-4 left-4 rounded-full bg-white/20 backdrop-blur px-3 py-1 text-xs font-semibold text-white">
              {EVENT_TYPE_LABEL[event.eventType]}
            </span>
          )}
        </header>

        <div className="relative px-5 sm:px-8 pb-8">
          <div className="absolute -top-10 right-5 sm:right-8 w-20 rounded-2xl bg-accent py-3 text-center text-primary-900 shadow-card-hover">
            <span className="block text-3xl font-bold leading-none tabular-nums">{day}</span>
            <span className="block mt-1 text-xs font-semibold uppercase tracking-wide">{month}</span>
          </div>

          <h1 className="pt-6 pr-24 text-2xl sm:text-3xl font-bold text-primary-900 leading-tight">{event.title}</h1>

          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <dt className="size-9 rounded-full bg-primary-100 text-primary-900 flex items-center justify-center shrink-0">
                <CalendarDays className="size-4" aria-label="Date" />
              </dt>
              <dd className="font-medium text-primary-900">{formatEventDate(event.eventDate)}</dd>
            </div>
            <div className="flex items-center gap-3">
              <dt className="size-9 rounded-full bg-accent-light text-accent-dark flex items-center justify-center shrink-0">
                <Clock className="size-4" aria-label="When" />
              </dt>
              <dd className="font-medium text-primary-900">{countdown}</dd>
            </div>
          </dl>

          {event.description && (
            <p className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-text-secondary">{event.description}</p>
          )}

          <div className="mt-8">
            <PublicEventActions event={event} isPast={isPast} />
          </div>
        </div>

        <footer className="border-t border-border px-5 sm:px-8 py-4 text-center text-xs text-muted-foreground">
          Shared from {host} on Good School
        </footer>
      </article>
    </main>
  );
}
