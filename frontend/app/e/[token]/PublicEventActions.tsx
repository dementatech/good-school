'use client';

import { useState } from 'react';
import { CalendarPlus, Check, Share2 } from 'lucide-react';
import { shareEventLink } from '@/components/events/shareEvent';
import { googleCalendarUrl, shareMessage, type PublicEvent } from '@/lib/events/public-event';

/** Anyone holding the link can pass it on, or put the event in their own calendar. */
export function PublicEventActions({ event, isPast }: { event: PublicEvent; isPast: boolean }) {
  const [notice, setNotice] = useState<string | null>(null);

  async function share() {
    const outcome = await shareEventLink(event.title, shareMessage(event), window.location.href);
    if (outcome === 'copied') setNotice('Link copied');
    if (outcome === 'failed') setNotice('Could not share. Copy the address from your browser.');
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col xs:flex-row gap-2">
        <button
          type="button"
          onClick={() => void share()}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-primary-900 hover:bg-accent-mid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-900"
        >
          <Share2 className="size-4" aria-hidden />
          Share event
        </button>
        {!isPast && (
          <button
            type="button"
            onClick={() => window.open(googleCalendarUrl(event, window.location.href), '_blank', 'noopener,noreferrer')}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-border-strong px-5 py-3 text-sm font-semibold text-primary-900 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-900"
          >
            <CalendarPlus className="size-4" aria-hidden />
            Add to calendar
          </button>
        )}
      </div>
      {notice && (
        <p role="status" className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Check className="size-3.5" aria-hidden />
          {notice}
        </p>
      )}
    </div>
  );
}
