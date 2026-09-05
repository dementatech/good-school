import { pool } from "../../../shared/db/index.js";
import { nextSequentialCode } from "./sequential-code.js";

// A-Level subject combinations (PCM, HEG, …) and their member subjects with a
// role — `principal` subjects drive UACE points, `subsidiary`/`compulsory`
// contribute at most 1 each. See uganda-secondary-school-foundations.md §3.3.

export type CombinationRole = "principal" | "subsidiary" | "compulsory";

export interface CombinationMember {
  subjectId: string;
  role: CombinationRole;
}

/** Thrown when the caller's subject list is empty, has no principal, or names
 *  a subject that isn't in this curriculum. The route turns it into a 400 with
 *  this message shown to the user verbatim. */
export class InvalidCombinationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCombinationError";
  }
}

export interface CombinationRecord {
  id: string;
  curriculumId: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  subjects: CombinationMember[];
  createdAt: string;
  updatedAt: string;
}

export interface CombinationInput {
  /** Omit to auto-assign the next sequential code (C001, C002, …). */
  code?: string;
  /** Omit to derive it from the chosen subjects' short names (PhyChemMath/ICT/GP). */
  name?: string;
  description?: string | null;
  isActive?: boolean;
  subjects?: CombinationMember[];
}

interface CombinationRow {
  id: string;
  curriculum_id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  subjects: { subjectId: string; role: CombinationRole }[] | null;
  created_at: string;
  updated_at: string;
}

const mapRow = (r: CombinationRow): CombinationRecord => ({
  id: r.id,
  curriculumId: r.curriculum_id,
  code: r.code,
  name: r.name,
  description: r.description,
  isActive: r.is_active,
  subjects: r.subjects ?? [],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const SELECT_COMBINATION = `
  select sc.id, sc.curriculum_id, sc.code, sc.name, sc.description, sc.is_active,
         coalesce(
           jsonb_agg(jsonb_build_object('subjectId', cs.subject_id, 'role', cs.role))
             filter (where cs.subject_id is not null),
           '[]'
         ) as subjects,
         sc.created_at, sc.updated_at
  from subject_combination sc
  left join combination_subject cs on cs.combination_id = sc.id
`;

export async function listCombinations(curriculumId?: string): Promise<CombinationRecord[]> {
  const { rows } = curriculumId
    ? await pool.query<CombinationRow>(
        `${SELECT_COMBINATION} where sc.curriculum_id = $1 group by sc.id order by sc.code`,
        [curriculumId],
      )
    : await pool.query<CombinationRow>(`${SELECT_COMBINATION} group by sc.id order by sc.code`);
  return rows.map(mapRow);
}

export async function getCombination(id: string): Promise<CombinationRecord | null> {
  const { rows } = await pool.query<CombinationRow>(
    `${SELECT_COMBINATION} where sc.id = $1 group by sc.id`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

async function replaceMembers(
  client: import("pg").PoolClient,
  combinationId: string,
  curriculumId: string,
  members: CombinationMember[],
): Promise<void> {
  if (members.length === 0) {
    throw new InvalidCombinationError(
      "Pick the subjects that make up this combination — a combination can't be empty.",
    );
  }
  if (!members.some((m) => m.role === "principal")) {
    throw new InvalidCombinationError("A combination needs at least one principal subject.");
  }

  // Every subject named must be a real subject in this curriculum. We reject
  // the whole request rather than silently drop the unknown ones — a
  // combination that quietly loses a subject is exactly the kind of surprise
  // this check exists to prevent.
  const ids = members.map((m) => m.subjectId);
  const found = await client.query<{ id: string; category: string; status: string; is_general_paper: boolean }>(
    `select id, category, status, is_general_paper from subject where curriculum_id = $1 and id = any($2::uuid[])`,
    [curriculumId, ids],
  );
  if (found.rowCount !== new Set(ids).size) {
    throw new InvalidCombinationError(
      "One or more chosen subjects don't exist in this curriculum. Add the subject first, then build the combination.",
    );
  }
  // General Paper is implicit for every A-Level student the moment they're
  // placed into ANY combination — it's never a per-combination choice, so it
  // never appears as a member. See docs/design/subject-selection-module.md §3.1.
  if (found.rows.some((r) => r.is_general_paper)) {
    throw new InvalidCombinationError(
      "General Paper is automatic for every A-Level student — don't add it to a combination.",
    );
  }
  if (found.rows.some((r) => r.status !== "approved")) {
    throw new InvalidCombinationError(
      "One or more chosen subjects haven't been approved yet.",
    );
  }

  // General Paper is a must in the system — it's seeded automatically when a
  // curriculum is created (see curricula.repository.ts), so this only ever
  // trips for a curriculum that predates that, or whose GP was deactivated.
  const gp = await client.query(
    `select 1 from subject where curriculum_id = $1 and is_general_paper and status = 'approved' and is_active`,
    [curriculumId],
  );
  if (gp.rowCount === 0) {
    throw new InvalidCombinationError(
      "This curriculum has no approved General Paper subject yet — add one before creating combinations.",
    );
  }

  await client.query(`delete from combination_subject where combination_id = $1`, [combinationId]);
  for (const m of members) {
    await client.query(
      `insert into combination_subject (combination_id, subject_id, role)
       values ($1, $2, $3)
       on conflict (combination_id, subject_id) do update set role = excluded.role`,
      [combinationId, m.subjectId, m.role],
    );
  }
}

/**
 * "PhyChemMath/ICT/GP" — each principal's `short_name`, in the order they
 * were picked (there's no single "correct" alphabetical order for these, so
 * we don't impose one), concatenated with no separator, then the
 * subsidiary's own `short_name` after a slash if there is one, then "/GP" —
 * always, since General Paper is automatic for every A-Level student the
 * moment they're placed into ANY combination (never a member here, see
 * `replaceMembers` above; this is display text only).
 */
async function deriveName(
  client: import("pg").PoolClient,
  members: CombinationMember[],
): Promise<string> {
  const principalIds = members.filter((m) => m.role === "principal").map((m) => m.subjectId);
  const subsidiaryIds = members.filter((m) => m.role === "subsidiary").map((m) => m.subjectId);
  const { rows } = await client.query<{ id: string; short_name: string }>(
    `select id, short_name from subject where id = any($1::uuid[])`,
    [[...principalIds, ...subsidiaryIds]],
  );
  const byId = new Map(rows.map((r) => [r.id, r.short_name]));

  const principalNames = principalIds.map((id) => byId.get(id) ?? "").join("");
  const subsidiaryName = subsidiaryIds.map((id) => byId.get(id) ?? "").join("+");

  const name = principalNames || "Combination";
  return `${name}${subsidiaryName ? `/${subsidiaryName}` : ""}/GP`;
}

export async function createCombination(
  curriculumId: string,
  input: CombinationInput,
): Promise<CombinationRecord | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const owner = await client.query(`select 1 from curriculum where id = $1`, [curriculumId]);
    if (owner.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const members = input.subjects ?? [];
    const code =
      input.code?.trim().toUpperCase() ||
      (await nextSequentialCode(client, {
        table: "subject_combination",
        column: "code",
        prefix: "C",
        where: "curriculum_id = $1",
        params: [curriculumId],
      }));
    const name = input.name?.trim() || (await deriveName(client, members));
    const { rows } = await client.query<{ id: string }>(
      `insert into subject_combination (curriculum_id, code, name, description, is_active)
       values ($1, $2, $3, $4, $5) returning id`,
      [curriculumId, code, name, input.description ?? null, input.isActive ?? true],
    );
    await replaceMembers(client, rows[0].id, curriculumId, members);
    await client.query("COMMIT");
    return getCombination(rows[0].id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateCombination(
  id: string,
  input: CombinationInput,
): Promise<CombinationRecord | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ curriculum_id: string; code: string; name: string }>(
      `select curriculum_id, code, name from subject_combination where id = $1`,
      [id],
    );
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const curriculumId = existing.rows[0].curriculum_id;

    if (input.subjects) {
      await replaceMembers(client, id, curriculumId, input.subjects);
    }

    // The code is assigned once at creation and stays fixed — it's a system
    // id, not something that should shift under a combination just because
    // its membership changed. An explicit override is still respected.
    const code = input.code?.trim().toUpperCase() || existing.rows[0].code;
    const name =
      input.name?.trim() ||
      (input.subjects ? await deriveName(client, input.subjects) : existing.rows[0].name);

    await client.query(
      `update subject_combination
       set code = $1, name = $2, description = $3, is_active = $4, updated_at = now()
       where id = $5`,
      [code, name, input.description ?? null, input.isActive ?? true, id],
    );
    await client.query("COMMIT");
    return getCombination(id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteCombination(id: string): Promise<boolean> {
  const result = await pool.query(`delete from subject_combination where id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}
