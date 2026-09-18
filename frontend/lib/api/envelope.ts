/**
 * Fire a write against a `{ success, data }` / `{ success, error }` backend
 * route and get a flat result back. Never throws — a network error is just
 * `{ ok: false }`. The `GET` list refetch is left to the caller.
 */
export async function submitJson<T = unknown>(
  url: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<{ ok: boolean; error?: string; data?: T }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.success !== false) return { ok: true, data: json.data as T };
    return { ok: false, error: await describeFailure(res, json) };
  } catch {
    return { ok: false, error: await describeFailure(null, {}) };
  }
}

/**
 * Turns a failed response/exception into the message a user should actually
 * see — the backend's own `error`/`message` when it sent one, otherwise a
 * fallback specific enough to act on (expired session vs. no permission vs.
 * an actual server bug) rather than a blanket "network error" that's wrong
 * whenever the request reached the server at all.
 */
// The auth layer (verify.ts, login) sends bare machine codes on 401/403 —
// "not_authenticated", "forbidden", "invalid_token", "not_your_child" —
// never prose. Everywhere else that sends `error`/`message` on a 401/403
// (e.g. NotAssignedError's "You aren't the assigned teacher for this
// subject and class.") IS meant to be read as-is. A code has no spaces or
// punctuation; a written message does — cheap enough to tell them apart
// without hardcoding every code string here.
const looksLikeRawCode = (s: string) => /^[a-z0-9_]+$/.test(s);

async function describeFailure(
  res: Response | null,
  json: { error?: string; message?: string; code?: string; statusCode?: number },
): Promise<string> {
  if (!res) return "Couldn't reach the server — check your connection and try again.";
  // The app's own `fail()` helper sends `{ success: false, error }` — nothing
  // else. Fastify's own framework-level errors (a schema-validation failure
  // that never reached the route handler) carry `code`/`statusCode` instead,
  // and put the actually useful detail in `message`, with `error` as just the
  // generic HTTP reason phrase ("Bad Request") — the reverse of `fail()`.
  const isFrameworkError = json.code !== undefined || json.statusCode !== undefined;
  const text = isFrameworkError ? json.message || json.error : json.error || json.message;
  if (text && !((res.status === 401 || res.status === 403) && looksLikeRawCode(text))) return text;
  if (res.status === 401) return 'Your session has expired — please log in again.';
  if (res.status === 403) return "You don't have permission to do that.";
  if (res.status === 404) return "That couldn't be found — it may have been deleted.";
  if (res.status >= 500) return `The server hit an error (${res.status}). Try again, and report it if it keeps happening.`;
  return `The request failed (${res.status}).`;
}

/**
 * GET a list endpoint, returning `data` (or `[]` on any failure). Pass
 * `onError` to be told WHY it failed — the previous version discarded that
 * entirely, so a caller couldn't tell a real network outage from an expired
 * session from a 500, and most just went silent (an empty list looks
 * exactly like "no data" to a user, which is worse than a vague message).
 */
export async function fetchList<T = unknown>(url: string, onError?: (message: string) => void): Promise<T[]> {
  let res: Response | null = null;
  try {
    res = await fetch(url, { credentials: 'include' });
    const json = await res.json().catch(() => ({}));
    if (json.success) return json.data as T[];
    onError?.(await describeFailure(res, json));
    return [];
  } catch {
    onError?.(await describeFailure(null, {}));
    return [];
  }
}

/** GET a single-object endpoint. Returns `null` on any failure. See `fetchList` for `onError`. */
export async function fetchOne<T = unknown>(url: string, onError?: (message: string) => void): Promise<T | null> {
  let res: Response | null = null;
  try {
    res = await fetch(url, { credentials: 'include' });
    const json = await res.json().catch(() => ({}));
    if (json.success) return json.data as T;
    onError?.(await describeFailure(res, json));
    return null;
  } catch {
    onError?.(await describeFailure(null, {}));
    return null;
  }
}
