import { pool } from "../../../shared/db/index.js";
import { derivedNameSql } from "../../../shared/combination-name.js";
import { nextSequentialCode } from "./sequential-code.js";
import { applyUnebCombinationRules } from "./combination-rules.js";
import { STANDARD_COMBINATIONS, unebSubjectName } from "../../../shared/uneb.js";

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
  description?: string | null;
  isActive?: boolean;
  /** In pick order — persisted as `sort_order`, which drives the derived name. */
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

// `name` is derived from the current member subjects here — never stored.
const SELECT_COMBINATION = `
  select sc.id, sc.curriculum_id, sc.code, sc.description, sc.is_active,
         ${derivedNameSql("s", "cs")} as name,
         coalesce(
           jsonb_agg(jsonb_build_object('subjectId', cs.subject_id, 'role', cs.role)
             order by cs.sort_order, s.name)
             filter (where cs.subject_id is not null),
           '[]'
         ) as subjects,
         sc.created_at, sc.updated_at
  from subject_combination sc
  left join combination_subject cs on cs.combination_id = sc.id
  left join subject s on s.id = cs.subject_id
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

  // Exactly 3 principals + the UNEB subsidiary rule (shared/uneb.ts).
  members = await applyUnebCombinationRules(
    client,
    curriculumId,
    members,
    (message) => new InvalidCombinationError(message),
  );

  await client.query(`delete from combination_subject where combination_id = $1`, [combinationId]);
  // Array order becomes `sort_order` — this is what the derived name follows.
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    await client.query(
      `insert into combination_subject (combination_id, subject_id, role, sort_order)
       values ($1, $2, $3, $4)
       on conflict (combination_id, subject_id)
         do update set role = excluded.role, sort_order = excluded.sort_order`,
      [combinationId, m.subjectId, m.role, i],
    );
  }
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
    const { rows } = await client.query<{ id: string }>(
      `insert into subject_combination (curriculum_id, code, description, is_active)
       values ($1, $2, $3, $4) returning id`,
      [curriculumId, code, input.description ?? null, input.isActive ?? true],
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
    const existing = await client.query<{ curriculum_id: string; code: string }>(
      `select curriculum_id, code from subject_combination where id = $1`,
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

    await client.query(
      `update subject_combination
       set code = $1, description = $2, is_active = $3, updated_at = now()
       where id = $4`,
      [code, input.description ?? null, input.isActive ?? true, id],
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

export interface SeedStandardResult {
  created: string[];
  /** Already in the catalog — same code, or the same three principals. */
  existing: string[];
  /** Couldn't be built: a principal or the required subsidiary has no
   * subject with that UNEB code in this curriculum yet. */
  skipped: { code: string; reason: string }[];
}

// Adds the standard Ugandan combinations (shared/uneb.ts) to a curriculum's
// catalog, matching principals by UNEB code. Idempotent: a combination whose
// code or principal set is already there is left alone. Each one goes
// through the same member validation as a hand-built combination, so the
// subsidiary follows the UNEB rule. One transaction for the whole seed.
export async function seedStandardCombinations(curriculumId: string): Promise<SeedStandardResult | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const owner = await client.query(`select 1 from curriculum where id = $1`, [curriculumId]);
    if (owner.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const subjects = await client.query<{ id: string; uneb_code: string }>(
      `select id, uneb_code from subject
       where curriculum_id = $1 and phase = 'A_LEVEL' and uneb_code is not null
         and school_id is null and status = 'approved' and is_active`,
      [curriculumId],
    );
    const idByCode = new Map(subjects.rows.map((r) => [r.uneb_code, r.id]));

    const current = await client.query<{ code: string; principals: string[] }>(
      `select sc.code,
              coalesce(array_agg(cs.subject_id::text order by cs.subject_id) filter (where cs.role = 'principal'), '{}') as principals
       from subject_combination sc
       left join combination_subject cs on cs.combination_id = sc.id
       where sc.curriculum_id = $1
       group by sc.id`,
      [curriculumId],
    );
    const takenCodes = new Set(current.rows.map((r) => r.code));
    const takenSets = new Set(current.rows.map((r) => r.principals.join(",")));

    const result: SeedStandardResult = { created: [], existing: [], skipped: [] };
    for (const std of STANDARD_COMBINATIONS) {
      const missing = std.principals.filter((c) => !idByCode.has(c));
      if (missing.length > 0) {
        result.skipped.push({
          code: std.code,
          reason: `no subject with UNEB code ${missing.map((c) => `${c} (${unebSubjectName(c)})`).join(", ")}`,
        });
        continue;
      }
      const principalIds = std.principals.map((c) => idByCode.get(c)!);
      if (takenCodes.has(std.code) || takenSets.has([...principalIds].sort().join(","))) {
        result.existing.push(std.code);
        continue;
      }

      // Savepoint per combination: a rule failure (e.g. no Sub-ICT subject
      // yet) skips just that one instead of aborting the whole seed.
      await client.query("SAVEPOINT seed_one");
      try {
        const { rows } = await client.query<{ id: string }>(
          `insert into subject_combination (curriculum_id, code, description, is_active)
           values ($1, $2, 'Standard UNEB combination', true) returning id`,
          [curriculumId, std.code],
        );
        await replaceMembers(
          client,
          rows[0].id,
          curriculumId,
          principalIds.map((subjectId) => ({ subjectId, role: "principal" as const })),
        );
        await client.query("RELEASE SAVEPOINT seed_one");
        result.created.push(std.code);
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT seed_one");
        if (!(err instanceof InvalidCombinationError)) throw err;
        result.skipped.push({ code: std.code, reason: err.message });
      }
    }

    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
