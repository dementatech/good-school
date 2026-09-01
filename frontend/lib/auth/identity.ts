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

export async function loadIdentity(): Promise<Identity> {
  try {
    const res = await fetch("/api/v1/auth/me", { credentials: "include" });
    if (!res.ok) return SIGNED_OUT;
    const me = (await res.json()) as MeResponse;
    return { user: meToUser(me), mustChangePassword: !!me.mustChangePassword };
  } catch {
    return SIGNED_OUT;
  }
}

export async function endSession(): Promise<void> {
  await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
}
