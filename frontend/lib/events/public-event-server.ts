import type { PublicEvent } from './public-event';

// The same value next.config.ts rewrites /api/v1 to.
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000';

/** Server-only: a public page and its preview image both read through here. */
export async function fetchPublicEvent(token: string): Promise<PublicEvent | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/events/public/${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (!res.ok) {
      if (res.status !== 404) console.error('Public event request failed:', res.status);
      return null;
    }
    const json = await res.json();
    return (json.data as PublicEvent) ?? null;
  } catch (err) {
    // Reads as "link not available" to the visitor, so say what really happened here.
    console.error('Could not load a public event from the backend:', err);
    return null;
  }
}

/** Backend-served files are relative; absolute (Cloudinary) URLs pass through. */
export function backendFileUrl(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${BACKEND_URL}${path}`;
}
