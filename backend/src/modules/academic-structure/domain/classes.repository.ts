import type { SchoolLevel } from "../../../shared/levels.js";
import type { PoolClient } from "pg";
import { pool } from "../../../shared/db/index.js";

// A "class" is the thin per-year record that a school runs a given curriculum
// stage that year ("St Mary's runs Senior 2 in 2026"). The physical group
// learners are enrolled into is the stream. See
// uganda-secondary-school-foundations.md §3.1.

export interface ClassRecord {
  id: string;
  academicYearId: string;
  curriculumStageId: string;
  stageCode: string;
  /** The school's own name for this level ("Level 1"), else the national one. */
  stageName: string;
  /** The national name ("Primary 1") — what stageName falls back to. */
  stageDefaultName: string;
  stagePhase: SchoolLevel;
  hasStreams: boolean;
  classTeacherId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClassInput {
  academicYearId: string;
  curriculumStageId: string;
  hasStreams?: boolean;
  classTeacherId?: string | null;
  isActive?: boolean;
}

interface ClassRow {
  id: string;
  academic_year_id: string;
  curriculum_stage_id: string;
  stage_code: string;
  stage_name: string;
  stage_default_name: string;
  stage_phase: SchoolLevel;
  has_streams: boolean;
  class_teacher_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const SELECT_CLASS = `
  select c.id, c.academic_year_id, c.curriculum_stage_id,
         cs.code as stage_code, stage_label(c.school_id, cs.id) as stage_name, cs.name as stage_default_name,
         cs.phase as stage_phase,
         c.has_streams, c.class_teacher_id, c.is_active, c.created_at, c.updated_at
  from classes c
  join curriculum_stage cs on cs.id = c.curriculum_stage_id
`;

function mapRow(row: ClassRow): ClassRecord {
  return {
    id: row.id,
    academicYearId: row.academic_year_id,
    curriculumStageId: row.curriculum_stage_id,
    stageCode: row.stage_code,
    stageName: row.stage_name,
    stageDefaultName: row.stage_default_name,
    stagePhase: row.stage_phase,
    hasStreams: row.has_streams,
    classTeacherId: row.class_teacher_id,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * The academic year must belong to the school, and the school must run the
 * curriculum the chosen stage belongs to (school_curriculum).
 */
async function referencesValid(
  client: PoolClient,
  schoolId: string,
  academicYearId: string,
  curriculumStageId: string,
): Promise<boolean> {
  const result = await client.query(
    `select
       (select 1 from academic_years where id = $1 and school_id = $2) as year_ok,
       (select 1
          from curriculum_stage cs
          join school_curriculum sc on sc.curriculum_id = cs.curriculum_id
         where cs.id = $3 and sc.school_id = $2) as stage_ok`,
    [academicYearId, schoolId, curriculumStageId],
  );
  const row = result.rows[0];
  return Boolean(row?.year_ok) && Boolean(row?.stage_ok);
}

export async function listClasses(
  schoolId: string,
  academicYearId?: string,
): Promise<ClassRecord[]> {
  const result = academicYearId
    ? await pool.query<ClassRow>(
        `${SELECT_CLASS} where c.school_id = $1 and c.academic_year_id = $2 order by cs.sequence_number`,
        [schoolId, academicYearId],
      )
    : await pool.query<ClassRow>(
        `${SELECT_CLASS} where c.school_id = $1 order by cs.sequence_number`,
        [schoolId],
      );
  return result.rows.map(mapRow);
}

export async function getClass(schoolId: string, id: string): Promise<ClassRecord | null> {
  const result = await pool.query<ClassRow>(
    `${SELECT_CLASS} where c.school_id = $1 and c.id = $2`,
    [schoolId, id],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function createClass(
  schoolId: string,
  input: ClassInput,
  createdBy: string,
): Promise<ClassRecord | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (!(await referencesValid(client, schoolId, input.academicYearId, input.curriculumStageId))) {
      await client.query("ROLLBACK");
      return null;
    }

    const { rows } = await client.query<{ id: string }>(
      `insert into classes (school_id, academic_year_id, curriculum_stage_id, has_streams, class_teacher_id, is_active, created_by)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        schoolId,
        input.academicYearId,
        input.curriculumStageId,
        input.hasStreams ?? false,
        input.classTeacherId ?? null,
        input.isActive ?? true,
        createdBy,
      ],
    );

    await client.query("COMMIT");
    return getClass(schoolId, rows[0].id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateClass(
  schoolId: string,
  id: string,
  input: ClassInput,
): Promise<ClassRecord | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (!(await referencesValid(client, schoolId, input.academicYearId, input.curriculumStageId))) {
      await client.query("ROLLBACK");
      return null;
    }

    const result = await client.query<{ id: string }>(
      `update classes
       set academic_year_id = $1, curriculum_stage_id = $2, has_streams = $3,
           class_teacher_id = $4, is_active = $5, updated_at = now()
       where id = $6 and school_id = $7
       returning id`,
      [
        input.academicYearId,
        input.curriculumStageId,
        input.hasStreams ?? false,
        input.classTeacherId ?? null,
        input.isActive ?? true,
        id,
        schoolId,
      ],
    );

    await client.query("COMMIT");
    return result.rows[0] ? getClass(schoolId, id) : null;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteClass(schoolId: string, id: string): Promise<boolean> {
  const result = await pool.query(`delete from classes where id = $1 and school_id = $2`, [
    id,
    schoolId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

// ─── A school's own names for its class levels ──────────────────────────────

export class InvalidStageLabelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStageLabelError";
  }
}

/**
 * Names (or, with null/blank, un-names) a class level for this school —
 * "Level 1" for Primary 1. Applies in every academic year; the national stage
 * underneath is unchanged.
 */
export async function setStageLabel(schoolId: string, stageId: string, name: string | null): Promise<void> {
  const clean = name?.trim() || null;
  const stage = await pool.query<{ name: string }>(`select name from curriculum_stage where id = $1`, [stageId]);
  if (!stage.rows[0]) throw new InvalidStageLabelError("Unknown class level.");
  if (!clean || clean === stage.rows[0].name) {
    await pool.query(`delete from school_stage_label where school_id = $1 and curriculum_stage_id = $2`, [
      schoolId,
      stageId,
    ]);
    return;
  }
  if (clean.length > 40) throw new InvalidStageLabelError("Keep the class name to 40 characters or fewer.");
  // Another level's name — the school's own or a national one it still uses.
  const clash = await pool.query<{ label: string }>(
    `select stage_label($1, cs.id) as label
       from curriculum_stage cs
      where cs.id <> $2
        and cs.curriculum_id = (select curriculum_id from curriculum_stage where id = $2)
        and lower(stage_label($1, cs.id)) = lower($3)
      limit 1`,
    [schoolId, stageId, clean],
  );
  if (clash.rows[0]) throw new InvalidStageLabelError(`Another class is already called "${clash.rows[0].label}".`);
  await pool.query(
    `insert into school_stage_label (school_id, curriculum_stage_id, name) values ($1, $2, $3)
     on conflict (school_id, curriculum_stage_id) do update set name = excluded.name, updated_at = now()`,
    [schoolId, stageId, clean],
  );
}
