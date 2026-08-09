import { pool } from "../../../shared/db/index.js";

export interface AcademicLevelRecord {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  stage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AcademicLevelInput {
  code: string;
  name: string;
  sortOrder?: number;
  stage?: string | null;
}

interface AcademicLevelRow {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  stage: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_LEVEL = `select id, code, name, sort_order, stage, created_at, updated_at from academic_levels`;

function mapRow(row: AcademicLevelRow): AcademicLevelRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    sortOrder: row.sort_order,
    stage: row.stage,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAcademicLevels(schoolId: string): Promise<AcademicLevelRecord[]> {
  const result = await pool.query<AcademicLevelRow>(
    `${SELECT_LEVEL} where school_id = $1 order by sort_order, name`,
    [schoolId],
  );
  return result.rows.map(mapRow);
}

export async function getAcademicLevel(
  schoolId: string,
  id: string,
): Promise<AcademicLevelRecord | null> {
  const result = await pool.query<AcademicLevelRow>(
    `${SELECT_LEVEL} where school_id = $1 and id = $2`,
    [schoolId, id],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function createAcademicLevel(
  schoolId: string,
  input: AcademicLevelInput,
): Promise<AcademicLevelRecord> {
  const result = await pool.query<AcademicLevelRow>(
    `insert into academic_levels (school_id, code, name, sort_order, stage)
     values ($1, $2, $3, $4, $5)
     returning id, code, name, sort_order, stage, created_at, updated_at`,
    [schoolId, input.code, input.name, input.sortOrder ?? 0, input.stage ?? null],
  );
  return mapRow(result.rows[0]);
}

export async function updateAcademicLevel(
  schoolId: string,
  id: string,
  input: AcademicLevelInput,
): Promise<AcademicLevelRecord | null> {
  const result = await pool.query<AcademicLevelRow>(
    `update academic_levels
     set code = $1, name = $2, sort_order = $3, stage = $4, updated_at = now()
     where id = $5 and school_id = $6
     returning id, code, name, sort_order, stage, created_at, updated_at`,
    [input.code, input.name, input.sortOrder ?? 0, input.stage ?? null, id, schoolId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function deleteAcademicLevel(schoolId: string, id: string): Promise<boolean> {
  const result = await pool.query(
    `delete from academic_levels where id = $1 and school_id = $2`,
    [id, schoolId],
  );
  return (result.rowCount ?? 0) > 0;
}
