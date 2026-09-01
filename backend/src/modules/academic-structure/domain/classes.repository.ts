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
  stageName: string;
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
  has_streams: boolean;
  class_teacher_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const SELECT_CLASS = `
  select c.id, c.academic_year_id, c.curriculum_stage_id,
         cs.code as stage_code, cs.name as stage_name,
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
