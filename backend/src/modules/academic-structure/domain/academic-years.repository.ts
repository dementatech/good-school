import { pool } from "../../../shared/db/index.js";

export interface AcademicYearRecord {
  id: string;
  yearName: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AcademicYearInput {
  yearName: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
}

interface AcademicYearRow {
  id: string;
  year_name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

const SELECT_YEAR = `select id, year_name, start_date, end_date, is_current, created_at, updated_at from academic_years`;

function mapRow(row: AcademicYearRow): AcademicYearRecord {
  return {
    id: row.id,
    yearName: row.year_name,
    startDate: row.start_date,
    endDate: row.end_date,
    isCurrent: row.is_current,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAcademicYears(schoolId: string): Promise<AcademicYearRecord[]> {
  const result = await pool.query<AcademicYearRow>(
    `${SELECT_YEAR} where school_id = $1 order by start_date desc`,
    [schoolId],
  );
  return result.rows.map(mapRow);
}

export async function getAcademicYear(
  schoolId: string,
  id: string,
): Promise<AcademicYearRecord | null> {
  const result = await pool.query<AcademicYearRow>(
    `${SELECT_YEAR} where school_id = $1 and id = $2`,
    [schoolId, id],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function createAcademicYear(
  schoolId: string,
  input: AcademicYearInput,
  createdBy: string,
): Promise<AcademicYearRecord> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // The partial unique index only allows one is_current=true row per
    // school — unset the existing one first so setting a new current year
    // doesn't just fail the insert.
    if (input.isCurrent) {
      await client.query(
        `update academic_years set is_current = false, updated_at = now()
         where school_id = $1 and is_current = true`,
        [schoolId],
      );
    }

    const result = await client.query<AcademicYearRow>(
      `insert into academic_years (school_id, year_name, start_date, end_date, is_current, created_by)
       values ($1, $2, $3, $4, $5, $6)
       returning id, year_name, start_date, end_date, is_current, created_at, updated_at`,
      [schoolId, input.yearName, input.startDate, input.endDate, input.isCurrent ?? false, createdBy],
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

export async function updateAcademicYear(
  schoolId: string,
  id: string,
  input: AcademicYearInput,
): Promise<AcademicYearRecord | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (input.isCurrent) {
      await client.query(
        `update academic_years set is_current = false, updated_at = now()
         where school_id = $1 and is_current = true and id <> $2`,
        [schoolId, id],
      );
    }

    const result = await client.query<AcademicYearRow>(
      `update academic_years
       set year_name = $1, start_date = $2, end_date = $3, is_current = $4, updated_at = now()
       where id = $5 and school_id = $6
       returning id, year_name, start_date, end_date, is_current, created_at, updated_at`,
      [input.yearName, input.startDate, input.endDate, input.isCurrent ?? false, id, schoolId],
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

export async function deleteAcademicYear(schoolId: string, id: string): Promise<boolean> {
  const result = await pool.query(
    `delete from academic_years where id = $1 and school_id = $2`,
    [id, schoolId],
  );
  return (result.rowCount ?? 0) > 0;
}
