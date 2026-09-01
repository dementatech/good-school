import { NextResponse, type NextRequest } from "next/server";
import { PORTAL_FOR_ROLE } from "@/lib/auth/portals";
import { normalizeRole } from "@/lib/auth/roles-map";
import type { Role } from "@/lib/auth/session";

/**
 * Optimistic, cookie-only route protection. Renamed from `middleware` per the
 * Next.js 16 deprecation.
 *
 * This is NOT the security boundary — it only avoids a flash of a portal shell
 * for a request that obviously has no session, and sends a wrong-role user
 * toward their own portal. Real authorization is re-done in every portal's
 * `PortalGate` (client) and, later, in the backend on every `/api/v1` call.
 * The JWT is decoded here WITHOUT verification for that reason — a forged
 * cookie gets past this line and is caught immediately downstream.
 */

const SESSION_COOKIE = "school_os_token";

const PROTECTED_PREFIXES = ["/staff", "/admin", "/student", "/parent", "/school-admin"];

function roleFromToken(token: string | undefined): Role | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return json?.role ? normalizeRole(String(json.role)) : null;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const role = roleFromToken(token);

  const protectedPrefix = PROTECTED_PREFIXES.find(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (protectedPrefix) {
    if (!role) {
      return NextResponse.redirect(new URL("/auth", request.url));
    }
    const home = PORTAL_FOR_ROLE[role];
    if (home && !home.startsWith(protectedPrefix)) {
      return NextResponse.redirect(new URL(home, request.url));
    }
  }

  if ((pathname === "/auth" || pathname === "/") && role) {
    const home = PORTAL_FOR_ROLE[role];
    if (home) return NextResponse.redirect(new URL(home, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon.svg).*)"],
};
