'use client';

import { useEffect } from 'react';
import { applyPrimary, cachedPrimary } from '@/lib/theme/school-theme';

/**
 * Applies the signed-in user's school brand colour across the portal.
 * Renders nothing. Mounted in every school-scoped portal shell (school-admin,
 * staff, student, parent) — never in /admin, which stays on the default blue.
 *
 * On mount it re-applies the last-known colour from localStorage immediately
 * (no flash for a returning user), then fetches /api/v1/schools/me/theme and
 * applies the authoritative value. A school on the default colour clears any
 * override.
 */
export function SchoolThemeApplier() {
  useEffect(() => {
    const cached = cachedPrimary();
    if (cached) applyPrimary(cached);

    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/v1/schools/me/theme', {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!res.ok) return; // super_admin / no school — leave the default
        const theme = (await res.json()) as { primaryColor?: string };
        if (!controller.signal.aborted) applyPrimary(theme.primaryColor);
      } catch {
        /* offline or aborted — the cached value (if any) already stands */
      }
    })();
    return () => controller.abort();
  }, []);

  return null;
}
