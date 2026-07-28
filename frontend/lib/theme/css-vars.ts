import { contrastingForeground } from "./color";
import type { ThemeConfig } from "./types";

// Overrides shadcn's default :root values (app/globals.css) with the
// resolved school's colors — a plain custom-property override, so it works
// regardless of whether the base value underneath is oklch(), hsl(), or hex.
export function themeStyleTag(theme: ThemeConfig): string {
  return `:root {
  --primary: ${theme.primaryColor};
  --primary-foreground: ${contrastingForeground(theme.primaryColor)};
  --accent: ${theme.accentColor};
  --accent-foreground: ${contrastingForeground(theme.accentColor)};
  --radius: ${theme.radius};
}`;
}
