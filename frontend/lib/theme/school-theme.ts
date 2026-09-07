/**
 * A school's custom brand colour, applied at runtime over the design-system
 * blue. Only the primary scale is themeable (product decision) — one hex in,
 * a coherent 50–700 ramp out. 800/900 stay as globals.css defines them so
 * heading text (`text-primary-900`) never turns coloured.
 *
 * Works because globals.css declares `--color-primary-*` in a NON-inline
 * `@theme` block, so `bg-primary-700` et al. resolve to `var(--color-primary-700)`
 * and picking up an override we set on `:root`.
 */

/** Keep in step with globals.css `--color-primary-700` and the
 *  1700000042000 migration. A school still on this value isn't themed. */
export const DEFAULT_PRIMARY = '#1e3a8a';

const CACHE_KEY = 'gs.school.primary';

/** The stops we override — everything lighter than 800. */
const STOPS = [50, 100, 200, 400, 500, 600, 700] as const;

/** How far each stop is mixed toward white from the 700 base (700 = 0). */
const TINT: Record<(typeof STOPS)[number], number> = {
  700: 0,
  600: 0.1,
  500: 0.22,
  400: 0.36,
  200: 0.6,
  100: 0.78,
  50: 0.92,
};

export function isHex(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

function parseHex(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex(rgb: [number, number, number]): string {
  return (
    '#' +
    rgb
      .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'))
      .join('')
  );
}

const mixWhite = (rgb: [number, number, number], amount: number): [number, number, number] =>
  rgb.map((c) => c + (255 - c) * amount) as [number, number, number];

/** `{ '--color-primary-700': '#...', ... }` for the given brand colour. */
export function primaryScale(hex: string): Record<string, string> {
  const base = parseHex(hex);
  const out: Record<string, string> = {};
  for (const stop of STOPS) {
    out[`--color-primary-${stop}`] = toHex(mixWhite(base, TINT[stop]));
  }
  return out;
}

function isDefault(hex: string): boolean {
  return hex.trim().toLowerCase() === DEFAULT_PRIMARY;
}

/** Apply (or, for the default colour, clear) the brand colour on <html>. */
export function applyPrimary(hex: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!hex || !isHex(hex) || isDefault(hex)) {
    for (const stop of STOPS) root.style.removeProperty(`--color-primary-${stop}`);
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      /* private mode / storage disabled — the effect refetch still applies it */
    }
    return;
  }
  const scale = primaryScale(hex);
  for (const [prop, value] of Object.entries(scale)) root.style.setProperty(prop, value);
  try {
    localStorage.setItem(CACHE_KEY, hex);
  } catch {
    /* non-fatal */
  }
}

/** Last-applied colour, for an instant re-apply on the next load before the
 *  /me/theme fetch returns. */
export function cachedPrimary(): string | null {
  try {
    const v = localStorage.getItem(CACHE_KEY);
    return v && isHex(v) ? v : null;
  } catch {
    return null;
  }
}
