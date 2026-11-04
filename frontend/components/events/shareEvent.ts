export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * The phone's own share sheet (WhatsApp, SMS, ...) where there is one, otherwise
 * the link goes on the clipboard. The link is what's shared, not the picture: the
 * event page supplies the picture as the chat's link preview.
 */
export async function shareEventLink(title: string, text: string, url: string): Promise<ShareOutcome> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // A browser refusing the share sheet still leaves the clipboard to try.
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
