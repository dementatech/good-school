import { DEFAULT_THEME, type ThemeConfig } from "./types";

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const CSS_LENGTH = /^\d*\.?\d+(rem|px|em)$/;
const FONT_FAMILY = /^[\w\s,'"-]{1,200}$/;

// theme_config is admin-controlled DB data today, but it feeds straight into
// a raw <style> block and an <img src> — validate every field independently
// so one malformed value can't break the CSS rule or inject a script scheme,
// without discarding the rest of an otherwise-valid theme.
export function sanitizeTheme(theme: Partial<ThemeConfig>): ThemeConfig {
  return {
    primaryColor: HEX_COLOR.test(theme.primaryColor ?? "")
      ? theme.primaryColor!
      : DEFAULT_THEME.primaryColor,
    accentColor: HEX_COLOR.test(theme.accentColor ?? "")
      ? theme.accentColor!
      : DEFAULT_THEME.accentColor,
    radius: CSS_LENGTH.test(theme.radius ?? "") ? theme.radius! : DEFAULT_THEME.radius,
    fontFamily: FONT_FAMILY.test(theme.fontFamily ?? "")
      ? theme.fontFamily!
      : DEFAULT_THEME.fontFamily,
    logoUrl: isSafeLogoUrl(theme.logoUrl) ? theme.logoUrl! : null,
  };
}

function isSafeLogoUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  return url.startsWith("/") || url.startsWith("https://") || url.startsWith("http://");
}
