import { pool } from "../../../shared/db/index.js";

export interface StreamRecord {
  id: string;
  classId: string;
  name: string;
  streamTeacherId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StreamInput {
  classId: string;
  name: string;
  streamTeacherId?: string | null;
}

interface StreamRow {
  id: string;
  class_id: string;
  name: string;
  stream_teacher_id: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_STREAM = `select id, class_id, name, stream_teacher_id, created_at, updated_at from streams`;

function mapRow(row: StreamRow): StreamRecord {
  return {
    id: row.id,
    classId: row.class_id,
    name: row.name,
    streamTeacherId: row.stream_teacher_id,
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
    : await pool.query<StreamRow>(`${SELECT_STREAM} where school_id = $1 order by name`, [
        schoolId,
      ]);
  return result.rows.map(mapRow);
}

export async function getStream(schoolId: string, id: string): Promise<StreamRecord | null> {
  const result = await pool.query<StreamRow>(`${SELECT_STREAM} where school_id = $1 and id = $2`, [
    schoolId,
    id,
  ]);
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function createStream(
  schoolId: string,
  input: StreamInput,
  createdBy: string,
): Promise<StreamRecord | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const classOwned = await client.query(
      `select 1 from classes where id = $1 and school_id = $2`,
      [input.classId, schoolId],
    );
    if (classOwned.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const result = await client.query<StreamRow>(
      `insert into streams (school_id, class_id, name, stream_teacher_id, created_by)
       values ($1, $2, $3, $4, $5)
       returning id, class_id, name, stream_teacher_id, created_at, updated_at`,
      [schoolId, input.classId, input.name, input.streamTeacherId ?? null, createdBy],
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

export async function updateStream(
  schoolId: string,
  id: string,
  input: StreamInput,
): Promise<StreamRecord | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const classOwned = await client.query(
      `select 1 from classes where id = $1 and school_id = $2`,
      [input.classId, schoolId],
    );
    if (classOwned.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const result = await client.query<StreamRow>(
      `update streams
       set class_id = $1, name = $2, stream_teacher_id = $3, updated_at = now()
       where id = $4 and school_id = $5
       returning id, class_id, name, stream_teacher_id, created_at, updated_at`,
      [input.classId, input.name, input.streamTeacherId ?? null, id, schoolId],
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

export async function deleteStream(schoolId: string, id: string): Promise<boolean> {
  const result = await pool.query(`delete from streams where id = $1 and school_id = $2`, [
    id,
    schoolId,
  ]);
  return (result.rowCount ?? 0) > 0;
}
