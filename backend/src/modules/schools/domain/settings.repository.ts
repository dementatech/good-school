import { pool } from "../../../shared/db/index.js";

// Generic per-school config store. Business-rule limits (e.g. how many terms
// fit in an academic year) read from here instead of being hardcoded
// constants, so a school's own settings — not a migration — decide the rule.
export async function getSchoolSetting<T>(
  schoolId: string,
  key: string,
  defaultValue: T,
): Promise<T> {
  const result = await pool.query<{ value: T }>(
    `select value from school_settings where school_id = $1 and key = $2`,
    [schoolId, key],
  );
  return result.rows[0] ? result.rows[0].value : defaultValue;
}

export async function setSchoolSetting(
  schoolId: string,
  key: string,
  value: unknown,
  updatedBy?: string | null,
): Promise<void> {
  await pool.query(
    `insert into school_settings (school_id, key, value, updated_by)
     values ($1, $2, $3, $4)
     on conflict (school_id, key)
     do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [schoolId, key, JSON.stringify(value), updatedBy ?? null],
  );
}
