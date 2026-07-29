import type { PoolClient } from "pg";

// Locks the current highest system_id for this school+prefix so two
// concurrent creates don't hand out the same sequence number. Doesn't help
// on the very first row (nothing to lock yet) — an acceptable gap for the
// single-admin-at-a-time usage this is built for today.
export async function nextSystemId(
  client: PoolClient,
  schoolId: string,
  prefix: string,
): Promise<string> {
  const result = await client.query<{ system_id: string }>(
    `select system_id from users
     where school_id = $1 and system_id like $2
     order by system_id desc
     limit 1
     for update`,
    [schoolId, `${prefix}-%`],
  );

  const last = result.rows[0]?.system_id;
  const lastSeq = last ? parseInt(last.slice(prefix.length + 1), 10) : 0;
  const nextSeq = Number.isNaN(lastSeq) ? 1 : lastSeq + 1;

  return `${prefix}-${String(nextSeq).padStart(4, "0")}`;
}
