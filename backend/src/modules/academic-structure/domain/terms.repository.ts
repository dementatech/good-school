import type { PoolClient } from "pg";
import { pool } from "../../../shared/db/index.js";
import { getSchoolSetting } from "../../schools/index.js";

const TERMS_PER_YEAR_SETTING = "terms_per_academic_year";
const DEFAULT_TERMS_PER_YEAR = 3;

export class TermLimitExceededError extends Error {
  constructor(limit: number) {
    super(`This academic year already has the maximum of ${limit} terms.`);
    this.name = "TermLimitExceededError";
  }
}

export interface TermRecord {
  id: string;
  academicYearId: string;
  termNumber: number | null;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TermInput {
  academicYearId: string;
  termNumber?: number | null;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
}

interface TermRow {
  id: string;
  academic_year_id: string;
  term_number: number | null;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

const SELECT_TERM = `select id, academic_year_id, term_number, name, start_date, end_date, is_current, created_at, updated_at from terms`;

function mapRow(row: TermRow): TermRecord {
  return {
    id: row.id,
    academicYearId: row.academic_year_id,
    termNumber: row.term_number,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    isCurrent: row.is_current,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function academicYearBelongsToSchool(
  client: PoolClient,
  schoolId: string,
  academicYearId: string,
): Promise<boolean> {
  const result = await client.query(
    `select 1 from academic_years where id = $1 and school_id = $2`,
    [academicYearId, schoolId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listTerms(
  schoolId: string,
  academicYearId?: string,
): Promise<TermRecord[]> {
  const result = academicYearId
    ? await pool.query<TermRow>(
        `${SELECT_TERM} where school_id = $1 and academic_year_id = $2 order by term_number nulls last, start_date`,
        [schoolId, academicYearId],
      )
    : await pool.query<TermRow>(
        `${SELECT_TERM} where school_id = $1 order by term_number nulls last, start_date`,
        [schoolId],
      );
  return result.rows.map(mapRow);
}

export async function getTerm(schoolId: string, id: string): Promise<TermRecord | null> {
  const result = await pool.query<TermRow>(`${SELECT_TERM} where school_id = $1 and id = $2`, [
    schoolId,
    id,
  ]);
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function createTerm(
  schoolId: string,
  input: TermInput,
  createdBy: string,
): Promise<TermRecord | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (!(await academicYearBelongsToSchool(client, schoolId, input.academicYearId))) {
      await client.query("ROLLBACK");
      return null;
    }

    const limit = await getSchoolSetting(schoolId, TERMS_PER_YEAR_SETTING, DEFAULT_TERMS_PER_YEAR);
    const countResult = await client.query<{ count: string }>(
      `select count(*)::text as count from terms where academic_year_id = $1`,
      [input.academicYearId],
    );
    if (Number(countResult.rows[0].count) >= limit) {
      throw new TermLimitExceededError(limit);
    }

    if (input.isCurrent) {
      await client.query(
        `update terms set is_current = false, updated_at = now()
         where academic_year_id = $1 and is_current = true`,
        [input.academicYearId],
      );
    }

    const result = await client.query<TermRow>(
      `insert into terms (school_id, academic_year_id, term_number, name, start_date, end_date, is_current, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id, academic_year_id, term_number, name, start_date, end_date, is_current, created_at, updated_at`,
      [
        schoolId,
        input.academicYearId,
        input.termNumber ?? null,
        input.name,
        input.startDate,
        input.endDate,
        input.isCurrent ?? false,
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

export async function updateTerm(
  schoolId: string,
  id: string,
  input: TermInput,
): Promise<TermRecord | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (!(await academicYearBelongsToSchool(client, schoolId, input.academicYearId))) {
      await client.query("ROLLBACK");
      return null;
    }

    if (input.isCurrent) {
      await client.query(
        `update terms set is_current = false, updated_at = now()
         where academic_year_id = $1 and is_current = true and id <> $2`,
        [input.academicYearId, id],
      );
    }

    const result = await client.query<TermRow>(
      `update terms
       set term_number = $1, name = $2, start_date = $3, end_date = $4, is_current = $5, updated_at = now()
       where id = $6 and school_id = $7
       returning id, academic_year_id, term_number, name, start_date, end_date, is_current, created_at, updated_at`,
      [
        input.termNumber ?? null,
        input.name,
        input.startDate,
        input.endDate,
        input.isCurrent ?? false,
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

export async function deleteTerm(schoolId: string, id: string): Promise<boolean> {
  const result = await pool.query(`delete from terms where id = $1 and school_id = $2`, [
    id,
    schoolId,
  ]);
  return (result.rowCount ?? 0) > 0;
}
