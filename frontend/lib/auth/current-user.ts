import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./session";
import type { Role } from "./roles";

export interface CurrentUser {
  email: string | null;
  phoneNumber: string | null;
  systemId: string | null;
  role: Role;
  schoolId: string | null;
}

// Same server-side fetch-with-forwarded-cookie pattern as
// lib/theme/resolve-theme.ts's resolveTheme() — the JWT itself only carries
// user_id/role/school_id, so this is how the UI finds out who's actually
// logged in (email, system_id, etc.) beyond that.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:4000";

  try {
    const res = await fetch(`${backendUrl}/api/v1/auth/me`, {
      headers: { Cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });

    if (!res.ok) return null;
    return (await res.json()) as CurrentUser;
  } catch {
    return null;
  }
}
