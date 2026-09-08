import type { PoolClient } from "pg";
import { pool } from "../../../shared/db/index.js";
import { derivedNameSql } from "../../../shared/combination-name.js";
import type { CombinationRole } from "./combinations.repository.js";
import { nextSequentialCode } from "./sequential-code.js";

// A school's own A-Level combinations — either adopted from the platform
// catalog (`subject_combination`, super_admin's "constants") or fully
// custom. Members are always copied into `school_combination_subject` at
// creation, even when adopted, so the school can tweak them afterward — the
// ownership/flexibility the design doc calls for (§3.2b, §3.3). See
// docs/design/subject-selection-module.md.

export interface SchoolCombinationMember {
  subjectId: string;
  subjectCode: string;
  subjectShortName: string;
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

// `name` is derived from the current member subjects — never stored.
const SELECT_SCHOOL_COMBINATION = `
  select c.id, c.school_id, c.academic_year_id, c.catalog_combination_id, c.code,
         ${derivedNameSql("s", "cs")} as name,
         c.description, c.is_offered, c.min_class_size,
         coalesce(
           jsonb_agg(jsonb_build_object(
             'subjectId', s.id, 'subjectCode', s.code, 'subjectShortName', s.short_name,
             'subjectName', s.name, 'role', cs.role
           ) order by cs.sort_order, s.name) filter (where cs.subject_id is not null),
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
  const found = await client.query<{
    id: string;
    category: string;
    status: string;
    curriculum_id: string;
    is_general_paper: boolean;
  }>(`select id, category, status, curriculum_id, is_general_paper from subject where id = any($1::uuid[])`, [ids]);
  if (found.rowCount !== new Set(ids).size) {
    throw new InvalidSchoolCombinationError(
      "One or more chosen subjects don't exist. Add the subject to the catalog first.",
    );
  }
  // General Paper is automatic for every A-Level student the moment they're
  // placed into any combination — never a member of one. See
  // docs/design/subject-selection-module.md §3.1.
  if (found.rows.some((r) => r.is_general_paper)) {
    throw new InvalidSchoolCombinationError(
      "General Paper is automatic for every A-Level student — don't add it to a combination.",
    );
  }
  if (found.rows.some((r) => r.status !== "approved")) {
    throw new InvalidSchoolCombinationError(
      "One or more chosen subjects haven't been approved yet.",
    );
  }

  // General Paper is a must in the system — it's seeded automatically when a
  // curriculum is created, so this only ever trips for a curriculum that
  // predates that. `school_combination` doesn't carry curriculum_id itself,
  // so it's derived from any member subject here (they share one curriculum).
  const curriculumId = found.rows[0]?.curriculum_id;
  if (curriculumId) {
    const gp = await client.query(
      `select 1 from subject where curriculum_id = $1 and is_general_paper and status = 'approved' and is_active`,
      [curriculumId],
    );
    if (gp.rowCount === 0) {
      throw new InvalidSchoolCombinationError(
        "This curriculum has no approved General Paper subject yet — add one before creating combinations.",
      );
    }
  }

  await client.query(`delete from school_combination_subject where school_combination_id = $1`, [
    schoolCombinationId,
  ]);
  // Array order becomes `sort_order` — the derived name follows it.
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    await client.query(
      `insert into school_combination_subject (school_combination_id, subject_id, role, sort_order)
       values ($1, $2, $3, $4)`,
      [schoolCombinationId, m.subjectId, m.role, i],
    );
  }
}

async function catalogMembers(
  client: PoolClient,
  catalogCombinationId: string,
): Promise<{ subjectId: string; role: CombinationRole }[]> {
  const { rows } = await client.query<{ subject_id: string; role: CombinationRole }>(
    `select subject_id, role from combination_subject
     where combination_id = $1 order by sort_order`,
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

    if (catalogId) {
      const catalog = await client.query<{ code: string }>(
        `select code from subject_combination where id = $1`,
        [catalogId],
      );
      if (catalog.rowCount === 0) {
        throw new InvalidSchoolCombinationError("That catalog combination doesn't exist.");
      }
      members = await catalogMembers(client, catalogId);
      code = code || catalog.rows[0].code;
    }

    if (!code) {
      // System-assigned, unique per school per year — never typed.
      code = await nextSequentialCode(client, {
        table: "school_combination",
        column: "code",
        prefix: "C",
        where: "school_id = $1 and academic_year_id = $2",
        params: [schoolId, academicYearId],
      });
    }

    const result = await client.query<{ id: string }>(
      `insert into school_combination
         (school_id, academic_year_id, catalog_combination_id, code, description, is_offered, min_class_size)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        schoolId,
        academicYearId,
        catalogId,
        code,
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
       set description = $1, is_offered = $2, min_class_size = $3,
           code = coalesce($4, code), updated_at = now()
       where id = $5`,
      [
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
