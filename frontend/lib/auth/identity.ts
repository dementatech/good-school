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
      // A cookie can exist but not resolve to a usable identity — the JWT
      // fails real verification (rotated secret, expired, tampered → 401), or
      // the user it points to is gone (→ 404), or the backend is unhealthy
      // (→ 5xx). Meanwhile `proxy.ts` only base64-decodes the JWT payload,
      // unverified, and keeps routing that visitor into a protected portal;
      // PortalGate bounces them to /auth, proxy.ts sends them right back,
      // forever. Clear the cookie on ANY non-OK response (not just 401) — this
      // is the one place every failed-session path funnels through, and a
      // "signed out" that leaves the cookie in place is exactly the loop.
      await endSession();
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
