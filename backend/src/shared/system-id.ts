import type { PoolClient } from "pg";

// A user's system ID: <T|S><YY><seq> — e.g. T260001 (staff), S260042 (student).
//
//   T / S  staff or student
//   YY     last two digits of the calendar year the account is created,
//          frozen for the life of the account
//   seq    a running counter for that (type, year), allocated across the whole
//          platform so the full ID is globally unique — there is no school
//          segment, and login-by-ID never has to guess which school. Padded to
//          four digits for looks; the pad is a MINIMUM, not a cap — it grows to
//          five or more on its own, and nothing ever sorts these as text.
//
// Allocation goes through id_sequence (see the 1700000051000 migration): one
// upsert per ID, so two concurrent account creations can't land on the same
// number and there's no read-max race. The unique indexes on `users`
// (global for this format, per-school for the legacy one) are the last line of
// defence.

export type SystemIdPrefix = "T" | "S";

export async function nextSystemId(
  client: PoolClient,
  prefix: SystemIdPrefix,
): Promise<string> {
  const { rows } = await client.query<{ next_value: string; yy: string }>(
    `insert into id_sequence (scope, next_value)
       values ($1 || to_char(now() at time zone 'UTC', ':YYYY'), 1)
     on conflict (scope) do update set next_value = id_sequence.next_value + 1
     returning next_value, to_char(now() at time zone 'UTC', 'YY') as yy`,
    [prefix],
  );
  const { next_value, yy } = rows[0];
  return `${prefix}${yy}${next_value.padStart(4, "0")}`;
}
