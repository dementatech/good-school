// Requests go to /api/v1/* on this app's own origin; next.config.ts rewrites
// them to the backend, so the backend's Set-Cookie (the HttpOnly JWT) lands
// on this app's domain too. There is no token to attach here — the browser
// sends the cookie automatically, and client-side JS never touches it.
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    credentials: "include",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? "request_failed");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
