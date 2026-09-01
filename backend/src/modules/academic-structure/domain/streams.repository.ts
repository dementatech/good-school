import { pool } from "../../../shared/db/index.js";

// A stream / section — the physical class group learners enrol into
// ("Senior 2 East"). Streams reset each academic year (they hang off a
// year-scoped class). See uganda-secondary-school-foundations.md §3.1, §5.

export interface StreamRecord {
  id: string;
  classId: string;
  name: string;
  streamTeacherId: string | null;
  capacity: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StreamInput {
  classId: string;
  name: string;
  streamTeacherId?: string | null;
  capacity?: number | null;
  isActive?: boolean;
}

interface StreamRow {
  id: string;
  class_id: string;
  name: string;
  stream_teacher_id: string | null;
  capacity: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const SELECT_STREAM = `select id, class_id, name, stream_teacher_id, capacity, is_active, created_at, updated_at from streams`;

function mapRow(row: StreamRow): StreamRecord {
  return {
    id: row.id,
    classId: row.class_id,
    name: row.name,
    streamTeacherId: row.stream_teacher_id,
    capacity: row.capacity,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listStreams(schoolId: string, classId?: string): Promise<StreamRecord[]> {
  const result = classId
    ? await pool.query<StreamRow>(
        `${SELECT_STREAM} where school_id = $1 and class_id = $2 order by name`,
        [schoolId, classId],
      )
    : await pool.query<StreamRow>(`${SELECT_STREAM} where school_id = $1 order by name`, [schoolId]);
  return result.rows.map(mapRow);
}

export async function getStream(schoolId: string, id: string): Promise<StreamRecord | null> {
  const result = await pool.query<StreamRow>(`${SELECT_STREAM} where school_id = $1 and id = $2`, [
    schoolId,
    id,
  ]);
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

async function classOwnedBySchool(classId: string, schoolId: string): Promise<boolean> {
  const result = await pool.query(`select 1 from classes where id = $1 and school_id = $2`, [
    classId,
    schoolId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

export async function createStream(
  schoolId: string,
  input: StreamInput,
  createdBy: string,
): Promise<StreamRecord | null> {
  if (!(await classOwnedBySchool(input.classId, schoolId))) return null;

  const result = await pool.query<StreamRow>(
    `insert into streams (school_id, class_id, name, stream_teacher_id, capacity, is_active, created_by)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, class_id, name, stream_teacher_id, capacity, is_active, created_at, updated_at`,
    [
      schoolId,
      input.classId,
      input.name,
      input.streamTeacherId ?? null,
      input.capacity ?? null,
      input.isActive ?? true,
      createdBy,
    ],
  );
  return mapRow(result.rows[0]);
}

export async function updateStream(
  schoolId: string,
  id: string,
  input: StreamInput,
): Promise<StreamRecord | null> {
  if (!(await classOwnedBySchool(input.classId, schoolId))) return null;

  const result = await pool.query<StreamRow>(
    `update streams
     set class_id = $1, name = $2, stream_teacher_id = $3, capacity = $4, is_active = $5, updated_at = now()
     where id = $6 and school_id = $7
     returning id, class_id, name, stream_teacher_id, capacity, is_active, created_at, updated_at`,
    [
      input.classId,
      input.name,
      input.streamTeacherId ?? null,
      input.capacity ?? null,
      input.isActive ?? true,
      id,
      schoolId,
    ],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function deleteStream(schoolId: string, id: string): Promise<boolean> {
  const result = await pool.query(`delete from streams where id = $1 and school_id = $2`, [
    id,
    schoolId,
  ]);
  return (result.rowCount ?? 0) > 0;
}
