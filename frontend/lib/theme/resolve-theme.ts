import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { DEFAULT_THEME, type ThemeConfig } from "./types";
import { sanitizeTheme } from "./sanitize";

// Called fresh on every request (Server Component render) — never cached,
// never baked in at build time, so two schools sharing this deployment see
// their own colors/logo instead of whatever was in the environment at build.
export async function resolveTheme(): Promise<ThemeConfig> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return DEFAULT_THEME;

  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:4000";

  try {
    const res = await fetch(`${backendUrl}/api/v1/schools/me/theme`, {
      headers: { Cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });

    if (!res.ok) return DEFAULT_THEME;
    return sanitizeTheme((await res.json()) as Partial<ThemeConfig>);
  } catch {
    return DEFAULT_THEME;
  }
}
