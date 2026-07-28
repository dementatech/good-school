import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { ROLE_HOME } from "@/lib/auth/roles";

const PROTECTED_PREFIXES = Object.values(ROLE_HOME);

// Optimistic check only (cookie-based, no DB round trip) — each dashboard
// layout.tsx re-verifies for defense in depth, per Next.js's auth guidance.
export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await getSession();

  const protectedPrefix = PROTECTED_PREFIXES.find((prefix) => pathname.startsWith(prefix));

  if (protectedPrefix) {
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (ROLE_HOME[session.role] !== protectedPrefix) {
      // e.g. a Teacher hitting /admin gets sent to their own dashboard, not a broken page.
      return NextResponse.redirect(new URL(ROLE_HOME[session.role], request.url));
    }
  }

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL(ROLE_HOME[session.role], request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js).*)"],
};
