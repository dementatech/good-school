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

/**
 * Creates the same streams ("East", "West") in several classes at once. A
 * class that already has a stream of that name (any case) keeps it — nothing
 * is duplicated. Classes that aren't this school's are ignored.
 */
export async function createStreamsForClasses(
  schoolId: string,
  classIds: string[],
  names: string[],
  capacity: number | null,
  createdBy: string,
): Promise<{ created: number; skipped: number }> {
  // Trimmed, blanks dropped, and a name typed twice ("Red", "red") kept once
  // in the spelling it was first typed.
  const firstSpelling = new Map<string, string>();
  for (const n of names.map((x) => x.trim()).filter(Boolean)) {
    if (!firstSpelling.has(n.toLowerCase())) firstSpelling.set(n.toLowerCase(), n);
  }
  const cleanNames = [...firstSpelling.values()];
  if (cleanNames.length === 0 || classIds.length === 0) return { created: 0, skipped: 0 };
  const client = await pool.connect();
  let created = 0;
  let skipped = 0;
  try {
    await client.query("BEGIN");
    const { rows: classes } = await client.query<{ id: string }>(
      `select id from classes where school_id = $1 and id = any($2::uuid[])`,
      [schoolId, classIds],
    );
    for (const { id: classId } of classes) {
      for (const name of cleanNames) {
        const { rowCount } = await client.query(
          `insert into streams (school_id, class_id, name, capacity, is_active, created_by)
           select $1, $2, $3, $4, true, $5
            where not exists (select 1 from streams where class_id = $2 and lower(name) = lower($3))`,
          [schoolId, classId, name, capacity, createdBy],
        );
        if (rowCount) created++;
        else skipped++;
      }
      // A class with streams is a streamed class.
      await client.query(`update classes set has_streams = true, updated_at = now() where id = $1`, [classId]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return { created, skipped };
}
