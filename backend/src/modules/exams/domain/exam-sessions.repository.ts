import { pool } from "../../../shared/db/index.js";

// Reference data — global, super_admin-managed. The catalog of exam types a
// school picks from (End of Term, Mid-Term, Mock, …). Modelled on
// curricula.repository.ts. See the 1700000048000_exams migration.

export interface ExamSessionRecord {
  id: string;
  examName: string;
  examCode: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExamSessionInput {
  examName: string;
  examCode: string;
  description?: string | null;
  isActive?: boolean;
}

export class DuplicateExamCodeError extends Error {
  constructor(code: string) {
    super(`Exam code "${code}" is already in use.`);
    this.name = "DuplicateExamCodeError";
  }
}

export class ExamSessionInUseError extends Error {
  constructor() {
    super("This exam session is in use by one or more schools and can't be deleted. Deactivate it instead.");
    this.name = "ExamSessionInUseError";
  }
}

interface ExamSessionRow {
  id: string;
  exam_name: string;
  exam_code: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const SELECT = `select id, exam_name, exam_code, description, is_active, created_at, updated_at from exam_session`;

const isPgError = (err: unknown, code: string): boolean =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === code;

function mapRow(row: ExamSessionRow): ExamSessionRecord {
  return {
    id: row.id,
    examName: row.exam_name,
    examCode: row.exam_code,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listExamSessions(
  opts: { activeOnly?: boolean } = {},
): Promise<ExamSessionRecord[]> {
  const where = opts.activeOnly ? " where is_active" : "";
  const { rows } = await pool.query<ExamSessionRow>(`${SELECT}${where} order by exam_name`);
  return rows.map(mapRow);
}

export async function getExamSession(id: string): Promise<ExamSessionRecord | null> {
  const { rows } = await pool.query<ExamSessionRow>(`${SELECT} where id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createExamSession(input: ExamSessionInput): Promise<ExamSessionRecord> {
  try {
    const { rows } = await pool.query<ExamSessionRow>(
      `insert into exam_session (exam_name, exam_code, description, is_active)
       values ($1, $2, $3, $4)
       returning id, exam_name, exam_code, description, is_active, created_at, updated_at`,
      [
        input.examName.trim(),
        input.examCode.trim().toUpperCase(),
        input.description?.trim() || null,
        input.isActive ?? true,
      ],
    );
    return mapRow(rows[0]);
  } catch (err) {
    if (isPgError(err, "23505")) throw new DuplicateExamCodeError(input.examCode.trim().toUpperCase());
    throw err;
  }
}

export async function updateExamSession(
  id: string,
  input: ExamSessionInput,
): Promise<ExamSessionRecord | null> {
  try {
    const { rows } = await pool.query<ExamSessionRow>(
      `update exam_session
       set exam_name = $1, exam_code = $2, description = $3, is_active = $4, updated_at = now()
       where id = $5
       returning id, exam_name, exam_code, description, is_active, created_at, updated_at`,
      [
        input.examName.trim(),
        input.examCode.trim().toUpperCase(),
        input.description?.trim() || null,
        input.isActive ?? true,
        id,
      ],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  } catch (err) {
    if (isPgError(err, "23505")) throw new DuplicateExamCodeError(input.examCode.trim().toUpperCase());
    throw err;
  }
}

export async function deleteExamSession(id: string): Promise<boolean> {
  try {
    const result = await pool.query(`delete from exam_session where id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    if (isPgError(err, "23503")) throw new ExamSessionInUseError();
    throw err;
  }
}
