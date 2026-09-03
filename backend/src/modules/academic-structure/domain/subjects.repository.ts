import { pool } from "../../../shared/db/index.js";

// The subject catalog, per curriculum. `stageIds` is which curriculum stages
// offer the subject (Physics: S3–S6). Per-student subject registration is a
// later phase. See uganda-secondary-school-foundations.md §3.2.

export type SubjectCategory =
  | "language"
  | "science"
  | "humanity"
  | "vocational"
  | "core"
  | "religion"
  | "special"
  | "general";

/** Which secondary phase a subject belongs to — matches `curriculum_stage.phase`. */
export type SubjectPhase = "O_LEVEL" | "A_LEVEL";

export interface SubjectRecord {
  id: string;
  curriculumId: string;
  phase: SubjectPhase;
  code: string;
  name: string;
  category: SubjectCategory;
  isExaminable: boolean;
  isActive: boolean;
  stageIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SubjectInput {
  phase: SubjectPhase;
  code: string;
  name: string;
  category?: SubjectCategory;
  isExaminable?: boolean;
  isActive?: boolean;
  stageIds?: string[];
}

interface SubjectRow {
  id: string;
  curriculum_id: string;
  phase: SubjectPhase;
  code: string;
  name: string;
  category: SubjectCategory;
  is_examinable: boolean;
  is_active: boolean;
  stage_ids: string[] | null;
  created_at: string;
  updated_at: string;
}

const mapRow = (r: SubjectRow): SubjectRecord => ({
  id: r.id,
  curriculumId: r.curriculum_id,
  phase: r.phase,
  code: r.code,
  name: r.name,
  category: r.category,
  isExaminable: r.is_examinable,
  isActive: r.is_active,
  stageIds: r.stage_ids ?? [],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// coalesce so a subject with no stages returns [] not [null]
const SELECT_SUBJECT = `
  select s.id, s.curriculum_id, s.phase, s.code, s.name, s.category, s.is_examinable, s.is_active,
         coalesce(array_agg(ss.curriculum_stage_id) filter (where ss.curriculum_stage_id is not null), '{}') as stage_ids,
         s.created_at, s.updated_at
  from subject s
  left join subject_stage ss on ss.subject_id = s.id
`;

export async function listSubjects(
  curriculumId?: string,
  phase?: SubjectPhase,
): Promise<SubjectRecord[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (curriculumId) {
    params.push(curriculumId);
    where.push(`s.curriculum_id = $${params.length}`);
  }
  if (phase) {
    params.push(phase);
    where.push(`s.phase = $${params.length}`);
  }
  const clause = where.length ? `where ${where.join(" and ")}` : "";
  const { rows } = await pool.query<SubjectRow>(
    `${SELECT_SUBJECT} ${clause} group by s.id order by s.name`,
    params,
  );
  return rows.map(mapRow);
}

export async function getSubject(id: string): Promise<SubjectRecord | null> {
  const { rows } = await pool.query<SubjectRow>(
    `${SELECT_SUBJECT} where s.id = $1 group by s.id`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export class InvalidSubjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSubjectError";
  }
}

async function replaceStages(
  client: import("pg").PoolClient,
  subjectId: string,
  curriculumId: string,
  phase: SubjectPhase,
  stageIds: string[],
): Promise<void> {
  await client.query(`delete from subject_stage where subject_id = $1`, [subjectId]);
  if (stageIds.length === 0) return;

  const unique = [...new Set(stageIds)];
  // Every chosen stage must be in this curriculum AND match the subject's
  // phase — an O-Level subject can only be offered at S1–S4, never S5/S6.
  const valid = await client.query<{ id: string }>(
    `select id from curriculum_stage
      where curriculum_id = $1 and phase = $2 and id = any($3::uuid[])`,
    [curriculumId, phase, unique],
  );
  if (valid.rowCount !== unique.length) {
    const label = phase === "A_LEVEL" ? "an A-Level" : "an O-Level";
    const range = phase === "A_LEVEL" ? "Senior 5–6" : "Senior 1–4";
    throw new InvalidSubjectError(
      `Every stage for ${label} subject must be ${range} stage of this curriculum.`,
    );
  }

  await client.query(
    `insert into subject_stage (subject_id, curriculum_stage_id)
     select $1, unnest($2::uuid[]) on conflict do nothing`,
    [subjectId, unique],
  );
}

export async function createSubject(
  curriculumId: string,
  input: SubjectInput,
): Promise<SubjectRecord | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const owner = await client.query(`select 1 from curriculum where id = $1`, [curriculumId]);
    if (owner.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const { rows } = await client.query<{ id: string }>(
      `insert into subject (curriculum_id, phase, code, name, category, is_examinable, is_active)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [
        curriculumId,
        input.phase,
        input.code.toUpperCase(),
        input.name,
        input.category ?? "core",
        input.isExaminable ?? true,
        input.isActive ?? true,
      ],
    );
    await replaceStages(client, rows[0].id, curriculumId, input.phase, input.stageIds ?? []);
    await client.query("COMMIT");
    return getSubject(rows[0].id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateSubject(
  id: string,
  input: SubjectInput,
): Promise<SubjectRecord | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Phase is fixed at creation — an O-Level subject never becomes an A-Level
    // one (they're different syllabi). Ignore any phase in the update body.
    const { rows } = await client.query<{ curriculum_id: string; phase: SubjectPhase }>(
      `update subject
       set code = $1, name = $2, category = $3, is_examinable = $4, is_active = $5, updated_at = now()
       where id = $6
       returning curriculum_id, phase`,
      [
        input.code.toUpperCase(),
        input.name,
        input.category ?? "core",
        input.isExaminable ?? true,
        input.isActive ?? true,
        id,
      ],
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    if (input.stageIds) {
      await replaceStages(client, id, rows[0].curriculum_id, rows[0].phase, input.stageIds);
    }
    await client.query("COMMIT");
    return getSubject(id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteSubject(id: string): Promise<boolean> {
  const result = await pool.query(`delete from subject where id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}
