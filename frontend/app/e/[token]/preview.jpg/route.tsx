/* eslint-disable @next/next/no-img-element -- next/og renders this itself. */
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { eventDateParts, formatEventDate } from '@/lib/events/public-event';
import { backendFileUrl, fetchPublicEvent } from '@/lib/events/public-event-server';

const size = { width: 1200, height: 630 };

// Inlined, shrunk to exactly the preview's size, so the renderer never decodes a
// full phone photo. sharp also reads WebP, which the renderer can't. Fails soft:
// a missing or unreadable picture still leaves a usable preview.
async function imageDataUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const res = await fetch(backendFileUrl(path), { cache: 'no-store' });
    if (!res.ok || !/^image\//.test(res.headers.get('content-type') ?? '')) return null;
    const jpeg = await sharp(Buffer.from(await res.arrayBuffer()))
      .rotate()
      .resize(size.width, size.height, { fit: 'cover' })
      .flatten({ background: '#0D2137' })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
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

  const png = new ImageResponse(
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

  // WhatsApp drops preview images over about 300 KB, and a photo drawn as PNG is
  // well over that. As a JPEG it's a fraction of the size and loads quickly.
  const jpeg = await sharp(Buffer.from(await png.arrayBuffer())).jpeg({ quality: 80, progressive: true, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(jpeg.length),
      // Chat apps and browsers may keep it for an hour; an edited event shows
      // its new preview within that time.
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
