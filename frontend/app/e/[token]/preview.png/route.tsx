/* eslint-disable @next/next/no-img-element -- next/og renders this itself. */
import { ImageResponse } from 'next/og';
import { eventDateParts, formatEventDate } from '@/lib/events/public-event';
import { backendFileUrl, fetchPublicEvent } from '@/lib/events/public-event-server';

const size = { width: 1200, height: 630 };

// Inlined because the renderer can't read WebP, and to fail soft: a missing
// picture must still leave a usable preview.
async function imageDataUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const res = await fetch(backendFileUrl(path), { cache: 'no-store' });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !/^image\/(jpeg|png)/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * The picture a chat shows when the link is pasted: the same design as the page.
 * A plain route rather than Next's opengraph-image file, which always builds its
 * address from the server's own name and so breaks behind a proxy.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const event = await fetchPublicEvent(token);
  if (!event) return new Response('Not found', { status: 404 });
  const picture = await imageDataUrl(event.thumbnailUrl);
  const parts = eventDateParts(event.eventDate);

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#0D2137', color: '#FFFFFF', fontFamily: 'sans-serif' }}>
        {picture ? (
          <img src={picture} alt="" width={1200} height={630} style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 630, objectFit: 'cover' }} />
        ) : (
          <div style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex' }}>
            <div style={{ position: 'absolute', top: -180, right: -120, width: 560, height: 560, borderRadius: 280, background: '#2E77AE' }} />
            <div style={{ position: 'absolute', bottom: -240, left: -80, width: 460, height: 460, borderRadius: 230, background: '#FF8E2B' }} />
          </div>
        )}
        {picture && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex', backgroundImage: 'linear-gradient(0deg, rgba(13,33,55,0.95) 0%, rgba(13,33,55,0.55) 55%, rgba(13,33,55,0.6) 100%)' }} />
        )}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', padding: 64 }}>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 600 }}>{event.schoolName ?? 'Good School'}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 48 }}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 16 }}>
              <div style={{ display: 'flex', fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>{event.title}</div>
              <div style={{ display: 'flex', fontSize: 32, opacity: 0.85 }}>{formatEventDate(event.eventDate)}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 170, padding: '24px 0', borderRadius: 32, background: '#FF8E2B', color: '#0D2137' }}>
                <div style={{ display: 'flex', fontSize: 72, fontWeight: 700, lineHeight: 1 }}>{parts.day}</div>
                <div style={{ display: 'flex', fontSize: 30, fontWeight: 600 }}>{parts.month.toUpperCase()}</div>
              </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
