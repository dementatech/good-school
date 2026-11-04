/** Small helpers shared by the D3 dashboard charts. No React, so they can be tested. */

/** A part's share of the whole, as text. A real but tiny part never reads as 0%. */
export function shareLabel(value: number, total: number): string {
  if (total <= 0 || value <= 0) return '0%';
  const percent = (value / total) * 100;
  return percent < 1 ? '<1%' : `${Math.round(percent)}%`;
}

/** SVG path for a bar: square at the bottom, optionally rounded at the top. */
export function barPath(x: number, width: number, top: number, bottom: number, radius = 0): string {
  const r = Math.max(Math.min(radius, width / 2, bottom - top), 0);
  return (
    `M${x},${bottom}V${top + r}` +
    (r ? `Q${x},${top} ${x + r},${top}` : '') +
    `H${x + width - r}` +
    (r ? `Q${x + width},${top} ${x + width},${top + r}` : '') +
    `V${bottom}Z`
  );
}

export function animationMs(ms: number): number {
  if (typeof window === 'undefined' || !window.matchMedia) return ms;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms;
}
