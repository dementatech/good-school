import type { PoolClient } from "pg";

// A system-assigned code — "S001", "C001", ... — for a table/scope where the
// caller never types an identifier (see no-magic-typing: the system assigns
// ids, users don't invent them). Scoped by an arbitrary `where` clause so the
// same helper serves subjects (per curriculum+phase) and combinations (per
// curriculum, or per school+academic year).

export interface SequentialCodeOptions {
  table: string;
  column: string;
  prefix: string;
  /** SQL fragment using $1, $2, ... referring to `params`, e.g. "curriculum_id = $1". */
  where: string;
  params: unknown[];
}

export async function nextSequentialCode(
  client: PoolClient,
  { table, column, prefix, where, params }: SequentialCodeOptions,
): Promise<string> {
  const { rows } = await client.query<{ max_n: number | null }>(
    `select max((substring(${column} from '^${prefix}([0-9]+)$'))::int) as max_n
     from ${table}
     where ${where} and ${column} ~ '^${prefix}[0-9]+$'`,
    params,
  );
  const next = (rows[0]?.max_n ?? 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}
