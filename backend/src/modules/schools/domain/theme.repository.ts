import { pool } from "../../../shared/db/index.js";

export interface ThemeConfig {
  primaryColor: string;
  accentColor: string;
  radius: string;
  fontFamily: string;
  logoUrl: string | null;
}

export async function findThemeConfigBySchoolId(schoolId: string): Promise<ThemeConfig | null> {
  const result = await pool.query<{ theme_config: ThemeConfig }>(
    `select theme_config from schools where id = $1 limit 1`,
    [schoolId],
  );

  return result.rows[0]?.theme_config ?? null;
}
