import type { PoolClient } from "pg";
import { pool } from "../../../shared/db/index.js";

export interface ClassRecord {
  id: string;
  academicYearId: string;
  academicLevelId: string;
  hasStreams: boolean;
  classTeacherId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClassInput {
  academicYearId: string;
  academicLevelId: string;
  hasStreams?: boolean;
  classTeacherId?: string | null;
}

interface ClassRow {
  id: string;
  academic_year_id: string;
  academic_level_id: string;
  has_streams: boolean;
  class_teacher_id: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_CLASS = `select id, academic_year_id, academic_level_id, has_streams, class_teacher_id, created_at, updated_at from classes`;

function mapRow(row: ClassRow): ClassRecord {
  return {
    id: row.id,
    academicYearId: row.academic_year_id,
    academicLevelId: row.academic_level_id,
    hasStreams: row.has_streams,
    classTeacherId: row.class_teacher_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function referencesBelongToSchool(
  client: PoolClient,
  schoolId: string,
  academicYearId: string,
  academicLevelId: string,
): Promise<boolean> {
  const result = await client.query(
    `select
       (select 1 from academic_years where id = $1 and school_id = $3) as year_ok,
       (select 1 from academic_levels where id = $2 and school_id = $3) as level_ok`,
    [academicYearId, academicLevelId, schoolId],
  );
  const row = result.rows[0];
  return Boolean(row?.year_ok) && Boolean(row?.level_ok);
}

export async function listClasses(schoolId: string, academicYearId?: string): Promise<ClassRecord[]> {
  const result = academicYearId
    ? await pool.query<ClassRow>(
        `${SELECT_CLASS} where school_id = $1 and academic_year_id = $2 order by created_at`,
        [schoolId, academicYearId],
      )
    : await pool.query<ClassRow>(`${SELECT_CLASS} where school_id = $1 order by created_at`, [
        schoolId,
      ]);
  return result.rows.map(mapRow);
}

export async function getClass(schoolId: string, id: string): Promise<ClassRecord | null> {
  const result = await pool.query<ClassRow>(`${SELECT_CLASS} where school_id = $1 and id = $2`, [
    schoolId,
    id,
  ]);
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

    if (
      !(await referencesBelongToSchool(client, schoolId, input.academicYearId, input.academicLevelId))
    ) {
      await client.query("ROLLBACK");
      return null;
    }

    const result = await client.query<ClassRow>(
      `insert into classes (school_id, academic_year_id, academic_level_id, has_streams, class_teacher_id, created_by)
       values ($1, $2, $3, $4, $5, $6)
       returning id, academic_year_id, academic_level_id, has_streams, class_teacher_id, created_at, updated_at`,
      [
        schoolId,
        input.academicYearId,
        input.academicLevelId,
        input.hasStreams ?? false,
        input.classTeacherId ?? null,
        createdBy,
      ],
    );

    await client.query("COMMIT");
    return mapRow(result.rows[0]);
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

    if (
      !(await referencesBelongToSchool(client, schoolId, input.academicYearId, input.academicLevelId))
    ) {
      await client.query("ROLLBACK");
      return null;
    }

    const result = await client.query<ClassRow>(
      `update classes
       set academic_year_id = $1, academic_level_id = $2, has_streams = $3, class_teacher_id = $4, updated_at = now()
       where id = $5 and school_id = $6
       returning id, academic_year_id, academic_level_id, has_streams, class_teacher_id, created_at, updated_at`,
      [
        input.academicYearId,
        input.academicLevelId,
        input.hasStreams ?? false,
        input.classTeacherId ?? null,
        id,
        schoolId,
      ],
    );

    await client.query("COMMIT");
    return result.rows[0] ? mapRow(result.rows[0]) : null;
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
