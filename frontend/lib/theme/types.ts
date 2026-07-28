export interface ThemeConfig {
  primaryColor: string;
  accentColor: string;
  radius: string;
  fontFamily: string;
  logoUrl: string | null;
}

// Mirrors the schools table's theme_config default (backend migration
// 1700000001000_create-schools-table.cjs) so an unreachable backend or
// missing school still renders the brand defaults, not broken CSS.
export const DEFAULT_THEME: ThemeConfig = {
  primaryColor: "#990000", // Ruby Red
  accentColor: "#FFCC99", // Sand
  radius: "0.625rem",
  fontFamily: "Poppins, sans-serif",
  logoUrl: null,
};
