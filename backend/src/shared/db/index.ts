import { Pool, types } from "pg";

// `date` columns: keep the raw 'YYYY-MM-DD' string instead of pg's default
// (a JS Date at the server's local midnight, which then serializes to a
// timezone-shifted ISO datetime). The frontend treats these as plain calendar
// dates.
types.setTypeParser(types.builtins.DATE, (value) => value);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params);
}
