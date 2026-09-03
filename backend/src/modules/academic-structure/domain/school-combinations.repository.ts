import type { PoolClient } from "pg";
import { pool } from "../../../shared/db/index.js";
import type { CombinationRole } from "./combinations.repository.js";

// A school's own A-Level combinations — either adopted from the platform
// catalog (`subject_combination`, super_admin's "constants") or fully
// custom. Members are always copied into `school_combination_subject` at
// creation, even when adopted, so the school can tweak them afterward — the
// ownership/flexibility the design doc calls for (§3.2b, §3.3). See
// docs/design/subject-selection-module.md.

export interface SchoolCombinationMember {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  role: CombinationRole;
}

export interface SchoolCombinationRecord {
  id: string;
  schoolId: string;
  academicYearId: string;
  catalogCombinationId: string | null;
  code: string;
  name: string;
  description: string | null;
  isOffered: boolean;
  minClassSize: number | null;
  subjects: SchoolCombinationMember[];
  createdAt: string;
  updatedAt: string;
}

export interface SchoolCombinationInput {
  /** Set to adopt-from-catalog (members are copied in, then editable);
   * omit/null for a fully custom combination. */
  catalogCombinationId?: string | null;
  code?: string;
  /** Required unless adopting from a catalog combination (its name is used
   * when omitted). */
  name?: string;
  description?: string | null;
  isOffered?: boolean;
  minClassSize?: number | null;
  /** Required when catalogCombinationId is absent — ignored (re-derived from
   * the catalog) when adopting, so the two never drift apart at creation. */
  subjects?: { subjectId: string; role: CombinationRole }[];
}

export class InvalidSchoolCombinationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSchoolCombinationError";
  }
}

interface SchoolCombinationRow {
  id: string;
  school_id: string;
  academic_year_id: string;
  catalog_combination_id: string | null;
  code: string;
  name: string;
  description: string | null;
  is_offered: boolean;
  min_class_size: number | null;
  subjects: SchoolCombinationMember[] | null;
  created_at: string;
  updated_at: string;
}

const SELECT_SCHOOL_COMBINATION = `
  select c.id, c.school_id, c.academic_year_id, c.catalog_combination_id, c.code, c.name,
         c.description, c.is_offered, c.min_class_size,
         coalesce(
           jsonb_agg(jsonb_build_object(
             'subjectId', s.id, 'subjectCode', s.code, 'subjectName', s.name, 'role', cs.role
           )) filter (where cs.subject_id is not null),
           '[]'
         ) as subjects,
         c.created_at, c.updated_at
  from school_combination c
  left join school_combination_subject cs on cs.school_combination_id = c.id
  left join subject s on s.id = cs.subject_id
`;

function mapRow(row: SchoolCombinationRow): SchoolCombinationRecord {
  return {
    id: row.id,
    schoolId: row.school_id,
    academicYearId: row.academic_year_id,
    catalogCombinationId: row.catalog_combination_id,
    code: row.code,
    name: row.name,
    description: row.description,
    isOffered: row.is_offered,
    minClassSize: row.min_class_size,
    subjects: row.subjects ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSchoolCombinations(
  schoolId: string,
  academicYearId: string,
): Promise<SchoolCombinationRecord[]> {
  const { rows } = await pool.query<SchoolCombinationRow>(
    `${SELECT_SCHOOL_COMBINATION} where c.school_id = $1 and c.academic_year_id = $2
     group by c.id order by c.code`,
    [schoolId, academicYearId],
  );
  return rows.map(mapRow);
}

export async function getSchoolCombination(
  schoolId: string,
  id: string,
): Promise<SchoolCombinationRecord | null> {
  const { rows } = await pool.query<SchoolCombinationRow>(
    `${SELECT_SCHOOL_COMBINATION} where c.id = $1 and c.school_id = $2 group by c.id`,
    [id, schoolId],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

async function replaceMembers(
  client: PoolClient,
  schoolCombinationId: string,
  members: { subjectId: string; role: CombinationRole }[],
): Promise<void> {
  if (members.length === 0) {
    throw new InvalidSchoolCombinationError(
      "Pick the subjects that make up this combination — it can't be empty.",
    );
  }
  if (!members.some((m) => m.role === "principal")) {
    throw new InvalidSchoolCombinationError("A combination needs at least one principal subject.");
  }

  const ids = members.map((m) => m.subjectId);
  const found = await client.query<{ id: string; category: string }>(
    `select id, category from subject where id = any($1::uuid[])`,
    [ids],
  );
  if (found.rowCount !== new Set(ids).size) {
    throw new InvalidSchoolCombinationError(
      "One or more chosen subjects don't exist. Add the subject to the catalog first.",
    );
  }
  // General Paper (category 'general') is automatic for every A-Level
  // student the moment they're placed into any combination — never a member
  // of one. See docs/design/subject-selection-module.md §3.1.
  if (found.rows.some((r) => r.category === "general")) {
    throw new InvalidSchoolCombinationError(
      "General Paper is automatic for every A-Level student — don't add it to a combination.",
    );
  }

  await client.query(`delete from school_combination_subject where school_combination_id = $1`, [
    schoolCombinationId,
  ]);
  for (const m of members) {
    await client.query(
      `insert into school_combination_subject (school_combination_id, subject_id, role)
       values ($1, $2, $3)`,
      [schoolCombinationId, m.subjectId, m.role],
    );
  }
}

async function catalogMembers(
  client: PoolClient,
  catalogCombinationId: string,
): Promise<{ subjectId: string; role: CombinationRole }[]> {
  const { rows } = await client.query<{ subject_id: string; role: CombinationRole }>(
    `select subject_id, role from combination_subject where combination_id = $1`,
    [catalogCombinationId],
  );
  return rows.map((r) => ({ subjectId: r.subject_id, role: r.role }));
}

export async function createSchoolCombination(
  schoolId: string,
  academicYearId: string,
  input: SchoolCombinationInput,
): Promise<SchoolCombinationRecord> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let catalogId = input.catalogCombinationId || null;
    let members = input.subjects ?? [];
    let code = input.code?.trim().toUpperCase();
    let name = input.name;

    if (catalogId) {
      const catalog = await client.query<{ code: string; name: string }>(
        `select code, name from subject_combination where id = $1`,
        [catalogId],
      );
      if (catalog.rowCount === 0) {
        throw new InvalidSchoolCombinationError("That catalog combination doesn't exist.");
      }
      members = await catalogMembers(client, catalogId);
      code = code || catalog.rows[0].code;
      name = name || catalog.rows[0].name;
    }

    if (!code) {
      // "PCM/ICT" — principal-first-letters (in pick order) + "/" + the
      // subsidiary's own code, matching the catalog's deriveCode. No
      // alphabetical re-sort — there's no single "correct" order for these.
      const principalIds = members.filter((m) => m.role === "principal").map((m) => m.subjectId);
      const subsidiaryIds = members.filter((m) => m.role === "subsidiary").map((m) => m.subjectId);
      const derived = await client.query<{ id: string; code: string }>(
        `select id, code from subject where id = any($1::uuid[])`,
        [[...principalIds, ...subsidiaryIds]],
      );
      const byId = new Map(derived.rows.map((r) => [r.id, r.code]));
      const principalLetters = principalIds.map((id) => byId.get(id)?.[0]?.toUpperCase() ?? "").join("");
      const subsidiaryCode = subsidiaryIds.map((id) => byId.get(id) ?? "").join("+");
      code = (principalLetters || "COMB") + (subsidiaryCode ? `/${subsidiaryCode}` : "");
    }

    if (!name) {
      throw new InvalidSchoolCombinationError(
        "Give the combination a name, or adopt one from the catalog to fill it in automatically.",
      );
    }

    const result = await client.query<{ id: string }>(
      `insert into school_combination
         (school_id, academic_year_id, catalog_combination_id, code, name, description, is_offered, min_class_size)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [
        schoolId,
        academicYearId,
        catalogId,
        code,
        name,
        input.description ?? null,
        input.isOffered ?? true,
        input.minClassSize ?? null,
      ],
    );

    await replaceMembers(client, result.rows[0].id, members);
    await client.query("COMMIT");

    const created = await getSchoolCombination(schoolId, result.rows[0].id);
    return created!;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateSchoolCombination(
  schoolId: string,
  id: string,
  input: SchoolCombinationInput,
): Promise<SchoolCombinationRecord | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const owns = await client.query(`select 1 from school_combination where id = $1 and school_id = $2`, [
      id,
      schoolId,
    ]);
    if (owns.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    if (input.subjects) {
      await replaceMembers(client, id, input.subjects);
    }

    await client.query(
      `update school_combination
       set name = coalesce($1, name), description = $2, is_offered = $3, min_class_size = $4,
           code = coalesce($5, code), updated_at = now()
       where id = $6`,
      [
        input.name ?? null,
        input.description ?? null,
        input.isOffered ?? true,
        input.minClassSize ?? null,
        input.code?.trim().toUpperCase() || null,
        id,
      ],
    );

    await client.query("COMMIT");
    return getSchoolCombination(schoolId, id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteSchoolCombination(schoolId: string, id: string): Promise<boolean> {
  const result = await pool.query(`delete from school_combination where id = $1 and school_id = $2`, [
    id,
    schoolId,
  ]);
  return (result.rowCount ?? 0) > 0;
}
