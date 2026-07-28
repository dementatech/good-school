// theme_config only stores one color per role (primary/accent) — no matching
// foreground pair — so we derive a readable text color via relative luminance
// (WCAG formula) rather than asking school admins to pick 4 colors instead of 2.
export function contrastingForeground(hex: string): string {
  const { r, g, b } = hexToRgb(hex);

  const [rl, gl, bl] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });

  const luminance = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;

  return luminance > 0.5 ? "#171717" : "#ffffff";
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;

  const int = parseInt(full, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}
