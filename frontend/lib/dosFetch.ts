// Marks requests made from the Director of Studies' portal (/dos) with
// x-portal: dos. The server then treats the DOS like the school admin in the
// academic areas only (backend/src/shared/dos.ts) — and only if they really
// are the DOS; the header alone grants nothing.
//
// Installed once, when the DOS portal's layout module first loads — before any
// of its pages fetch (a page's effects run before its layout's). The check is
// made per request, so the same person's ordinary teacher pages (/staff) are
// never marked.

let installed = false;

export function installDosFetchMarker(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    const path = url.startsWith('http') ? new URL(url).pathname : url;
    if (!window.location.pathname.startsWith('/dos') || !path.startsWith('/api/v1/')) {
      return original(input, init);
    }
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('x-portal', 'dos');
    return original(input, { ...init, headers });
  };
}

installDosFetchMarker();
