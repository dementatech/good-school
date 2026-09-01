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
    return { ok: false, error: json.error ?? json.message ?? 'Request failed.' };
  } catch {
    return { ok: false, error: 'Network error.' };
  }
}

/** GET a list endpoint, returning `data` (or `[]` on any failure). */
export async function fetchList<T = unknown>(url: string): Promise<T[]> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    const json = await res.json().catch(() => ({}));
    return json.success ? (json.data as T[]) : [];
  } catch {
    return [];
  }
}
