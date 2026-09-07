import type { User } from "@/components/auth/AuthContext";
import { normalizeRole } from "@/lib/auth/roles-map";

/**
 * Where the signed-in identity is rehydrated from on page load.
 *
 * It calls the backend `GET /api/v1/auth/me` (proxied through Next's rewrite,
 * so the HttpOnly `school_os_token` cookie rides along automatically). The old
 * TERECO Collect `window.tereco` desktop bridge is dropped — the Electron
 * offline client is a later phase.
 */

export interface Identity {
  user: User | null;
  mustChangePassword: boolean;
}

const SIGNED_OUT: Identity = { user: null, mustChangePassword: false };

/**
 * How long to wait for `/api/v1/auth/me` before giving up. A frozen/backgrounded
 * tab drops its keep-alive socket to the dev server and backend; on resume the
 * next request can stall indefinitely. Without a ceiling here the promise never
 * settles, `AuthProvider.loading` never clears, and every screen sits on the
 * full-page loader until a hard reload.
 */
const IDENTITY_TIMEOUT_MS = 8000;

/**
 * An AbortSignal that fires when `external` aborts OR after `ms`, whichever is
 * first. Hand-rolled rather than `AbortSignal.any` / `AbortSignal.timeout` so it
 * works on the older Safari/WebKit builds some school devices still run.
 */
function deadline(external: AbortSignal | undefined, ms: number): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, ms);
  if (external) {
    if (external.aborted) abort();
    else external.addEventListener("abort", abort, { once: true });
  }
  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", abort);
    },
    { once: true },
  );
  return controller.signal;
}

interface MeResponse {
  id: string;
  name: string | null;
  email: string | null;
  phoneNumber: string | null;
  systemId: string | null;
  role: string;
  schoolId: string | null;
  mustChangePassword?: boolean;
}

export function meToUser(me: MeResponse): User {
  return {
    id: me.id,
    staffId: me.systemId ?? "",
    name: me.name ?? me.systemId ?? me.email ?? "",
    email: me.email ?? undefined,
    role: normalizeRole(me.role),
    school: "",
    schoolId: me.schoolId,
    className: null,
  };
}

export async function endSession(): Promise<void> {
  await fetch("/api/v1/auth/logout", {
    method: "POST",
    credentials: "include",
    signal: deadline(undefined, IDENTITY_TIMEOUT_MS),
  }).catch(() => {});
}

export async function loadIdentity(signal?: AbortSignal): Promise<Identity> {
  try {
    const res = await fetch("/api/v1/auth/me", {
      credentials: "include",
      signal: deadline(signal, IDENTITY_TIMEOUT_MS),
    });
    if (!res.ok) {
      // A cookie can exist but fail real verification (wrong/rotated secret,
      // expired, tampered) while `proxy.ts` — which only base64-decodes the
      // JWT payload, unverified, for its optimistic routing — still reads a
      // role out of it and keeps sending an unauthenticated visitor back into
      // a protected portal. That portal's PortalGate then bounces them to
      // /auth, proxy.ts sends them right back, forever. Clearing the cookie
      // here (the one place every failed-session path funnels through) is
      // what breaks that loop instead of just reporting "signed out".
      if (res.status === 401) await endSession();
      return SIGNED_OUT;
    }
    const me = (await res.json()) as MeResponse;
    return { user: meToUser(me), mustChangePassword: !!me.mustChangePassword };
  } catch {
    // Timed out, offline, aborted, or the backend never answered. We can't
    // confirm the session, so treat it as signed out and send the visitor to
    // /auth to sign in again rather than leaving them stuck on the loader.
    // Clear the cookie too: otherwise proxy.ts still reads a role out of it and
    // bounces every /auth visit straight back into the portal, so PortalGate
    // and proxy.ts ping-pong on the loader instead of showing the login form.
    await endSession();
    return SIGNED_OUT;
  }
}
