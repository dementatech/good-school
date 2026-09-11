import type { Pool, PoolClient } from "pg";

type Db = Pool | PoolClient;

// Every user's system ID: <prefix><YY><seq> — e.g. T260001, S260042, A260003.
//
//   prefix  S student · T staff (any staff role) · A school admin ·
//           P parent · X super admin
//   YY      last two digits of the calendar year the account is created,
//           frozen for the life of the account
//   seq     a running counter for that (prefix, year), allocated across the
//           whole platform so the full ID is globally unique — no school
//           segment, so login-by-ID never has to guess which school. Padded to
//           four digits for looks; the pad is a MINIMUM, not a cap — it grows
//           to five or more on its own, and nothing ever sorts these as text.
//
// Allocation goes through id_sequence (see the 1700000051000 migration): one
// upsert per ID, so two concurrent account creations can't land on the same
// number and there's no read-max race. `users.system_id` is NOT NULL with a
// unique index — those are the last line of defence.

export type SystemIdPrefix = "S" | "T" | "A" | "P" | "X";

export const SYSTEM_ID_PREFIX_BY_ROLE: Record<string, SystemIdPrefix> = {
  student: "S",
  teacher: "T",
  admin: "A",
  school_admin: "A",
  parent: "P",
  super_admin: "X",
};

export async function nextSystemId(db: Db, prefix: SystemIdPrefix): Promise<string> {
  const { rows } = await db.query<{ next_value: string; yy: string }>(
    `insert into id_sequence (scope, next_value)
       values ($1 || to_char(now() at time zone 'UTC', ':YYYY'), 1)
     on conflict (scope) do update set next_value = id_sequence.next_value + 1
     returning next_value, to_char(now() at time zone 'UTC', 'YY') as yy`,
    [prefix],
  );
  const { next_value, yy } = rows[0];
  return `${prefix}${yy}${next_value.padStart(4, "0")}`;
}
