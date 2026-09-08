import { pool } from "../../../shared/db/index.js";

export interface ThemeConfig {
  primaryColor: string;
  accentColor: string;
  radius: string;
  fontFamily: string;
  logoUrl: string | null;
}

/** The design-system default (frontend/app/globals.css). A school whose
 *  primaryColor still equals this is "untouched" — the frontend applies no
 *  override. Keep in step with the 1700000042000 migration. */
export const DEFAULT_PRIMARY_COLOR = "#1e3a8a";

/** #rgb or #rrggbb, case-insensitive. */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

export async function findThemeConfigBySchoolId(
  schoolId: string | null,
): Promise<ThemeConfig | null> {
  // super_admin has no school_id — fall back to the caller's default theme.
  if (!schoolId) return null;

  const result = await pool.query<{ theme_config: ThemeConfig }>(
    `select theme_config from schools where id = $1 limit 1`,
    [schoolId],
  );

  return result.rows[0]?.theme_config ?? null;
}

/**
 * Merge a new primary brand colour into a school's theme_config, leaving the
 * other keys untouched. Returns the updated config, or null if no such school.
 */
export async function updatePrimaryColor(
  schoolId: string,
  primaryColor: string,
): Promise<ThemeConfig | null> {
  const result = await pool.query<{ theme_config: ThemeConfig }>(
    `update schools
       set theme_config = jsonb_set(
             coalesce(theme_config, '{}'::jsonb),
             '{primaryColor}',
             to_jsonb($1::text)
           ),
           updated_at = now()
     where id = $2
     returning theme_config`,
    [primaryColor, schoolId],
  );
  return result.rows[0]?.theme_config ?? null;
}
