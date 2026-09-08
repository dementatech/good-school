import type { PoolClient } from "pg";
import { pool } from "../../../shared/db/index.js";

// Prior national-exam performance, captured at admission and editable after.
// Summary shape only (aggregate/points + division/result + year + candidate
// number), plus an optional handful of principal-subject grades that feed the
// A-Level combination eligibility warning. See
// docs/design/uganda-secondary-school-foundations.md §5 and the
// 1700000041000_prior-exam-result migration.

export type PriorExamType = "PLE" | "UCE";

export interface PriorExamSubjectInput {
  principalSubjectId: string;
  grade: string;
}

export interface PriorExamInput {
  examType: PriorExamType;
  examYear: number;
  candidateNumber?: string | null;
  aggregate?: number | null;
  divisionOrResult?: string | null;
  notes?: string | null;
  subjects?: PriorExamSubjectInput[];
}

export interface PriorExamSubjectRecord {
  principalSubjectId: string;
  principalSubjectCode: string;
  principalSubjectName: string;
  grade: string;
}

export interface PriorExamRecord {
  id: string;
  studentUserId: string;
  schoolId: string;
  enrollmentId: string | null;
  examType: PriorExamType;
  examYear: number;
  candidateNumber: string | null;
  aggregate: number | null;
  divisionOrResult: string | null;
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
  updatedAt: string;
  subjects: PriorExamSubjectRecord[];
}

interface PriorExamRow {
  id: string;
  student_user_id: string;
  school_id: string;
  enrollment_id: string | null;
  exam_type: PriorExamType;
  exam_year: number;
  candidate_number: string | null;
  aggregate: number | null;
  division_or_result: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
  subjects: PriorExamSubjectRecord[] | null;
}

const SELECT_PRIOR_EXAM = `
  select pe.id, pe.student_user_id, pe.school_id, pe.enrollment_id, pe.exam_type, pe.exam_year,
         pe.candidate_number, pe.aggregate, pe.division_or_result, pe.notes, pe.recorded_by,
         pe.created_at, pe.updated_at,
         coalesce(
           jsonb_agg(jsonb_build_object(
             'principalSubjectId', s.id, 'principalSubjectCode', s.code,
             'principalSubjectName', s.name, 'grade', pes.grade
           ) order by s.name) filter (where pes.id is not null),
           '[]'
         ) as subjects
  from prior_exam_result pe
  left join prior_exam_result_subject pes on pes.prior_exam_result_id = pe.id
  left join subject s on s.id = pes.principal_subject_id
`;

function mapRow(row: PriorExamRow): PriorExamRecord {
  return {
    id: row.id,
    studentUserId: row.student_user_id,
    schoolId: row.school_id,
    enrollmentId: row.enrollment_id,
    examType: row.exam_type,
    examYear: row.exam_year,
    candidateNumber: row.candidate_number,
    aggregate: row.aggregate,
    divisionOrResult: row.division_or_result,
    notes: row.notes,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    subjects: row.subjects ?? [],
  };
}

export class DuplicatePriorExamError extends Error {
  constructor() {
    super("A result for that exam and year is already on file — edit it instead of adding a second.");
    this.name = "DuplicatePriorExamError";
  }
}

// A UCE/UCE-legacy grade at credit level or better. Everything else — the
// legacy passes (P7, P8), a fail (F9), and the weak NLSC bands (D, E) — reads
// as "below a credit" for the principal-subject eligibility warning.
// docs/design/uganda-secondary-school-foundations.md §4.1.
const CREDIT_OR_BETTER = new Set([
  "D1",
  "D2",
  "C3",
  "C4",
  "C5",
  "C6",
  "A",
  "B",
  "C",
]);

export function isBelowCredit(grade: string): boolean {
  return !CREDIT_OR_BETTER.has(grade.trim().toUpperCase());
}

export async function listPriorExams(studentUserId: string): Promise<PriorExamRecord[]> {
  const { rows } = await pool.query<PriorExamRow>(
    `${SELECT_PRIOR_EXAM} where pe.student_user_id = $1
     group by pe.id order by pe.exam_year desc, pe.created_at desc`,
    [studentUserId],
  );
  return rows.map(mapRow);
}

async function fetchOne(client: PoolClient, id: string): Promise<PriorExamRecord> {
  const { rows } = await client.query<PriorExamRow>(
    `${SELECT_PRIOR_EXAM} where pe.id = $1 group by pe.id`,
    [id],
  );
  return mapRow(rows[0]);
}

async function writeSubjects(
  client: PoolClient,
  priorExamId: string,
  subjects: PriorExamSubjectInput[] | undefined,
): Promise<void> {
  await client.query(`delete from prior_exam_result_subject where prior_exam_result_id = $1`, [
    priorExamId,
  ]);
  for (const s of subjects ?? []) {
    await client.query(
      `insert into prior_exam_result_subject (prior_exam_result_id, principal_subject_id, grade)
       values ($1, $2, $3)
       on conflict (prior_exam_result_id, principal_subject_id) do update set grade = excluded.grade`,
      [priorExamId, s.principalSubjectId, s.grade.trim()],
    );
  }
}

// Insert a result (+ its optional principal grades). Runs on the caller's
// transaction so createStudent can fold it into the single admission commit.
export async function recordPriorExam(
  client: PoolClient,
  schoolId: string,
  studentUserId: string,
  input: PriorExamInput,
  recordedBy: string | null,
  enrollmentId: string | null = null,
): Promise<PriorExamRecord> {
  let inserted;
  try {
    inserted = await client.query<{ id: string }>(
      `insert into prior_exam_result
         (student_user_id, school_id, enrollment_id, exam_type, exam_year, candidate_number,
          aggregate, division_or_result, notes, recorded_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id`,
      [
        studentUserId,
        schoolId,
        enrollmentId,
        input.examType,
        input.examYear,
        input.candidateNumber ?? null,
        input.aggregate ?? null,
        input.divisionOrResult ?? null,
        input.notes ?? null,
        recordedBy,
      ],
    );
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "23505") {
      throw new DuplicatePriorExamError();
    }
    throw err;
  }

  await writeSubjects(client, inserted.rows[0].id, input.subjects);
  return fetchOne(client, inserted.rows[0].id);
}

export async function updatePriorExam(
  schoolId: string,
  studentUserId: string,
  examId: string,
  input: PriorExamInput,
  recordedBy: string | null,
): Promise<PriorExamRecord | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query<{ id: string }>(
      `update prior_exam_result
       set exam_type = $1, exam_year = $2, candidate_number = $3, aggregate = $4,
           division_or_result = $5, notes = $6, recorded_by = $7, updated_at = now()
       where id = $8 and school_id = $9 and student_user_id = $10
       returning id`,
      [
        input.examType,
        input.examYear,
        input.candidateNumber ?? null,
        input.aggregate ?? null,
        input.divisionOrResult ?? null,
        input.notes ?? null,
        recordedBy,
        examId,
        schoolId,
        studentUserId,
      ],
    );
    if (updated.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    await writeSubjects(client, examId, input.subjects);
    const row = await fetchOne(client, examId);
    await client.query("COMMIT");
    return row;
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof Error && "code" in err && err.code === "23505") {
      throw new DuplicatePriorExamError();
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function deletePriorExam(
  schoolId: string,
  studentUserId: string,
  examId: string,
): Promise<boolean> {
  const result = await pool.query(
    `delete from prior_exam_result where id = $1 and school_id = $2 and student_user_id = $3`,
    [examId, schoolId, studentUserId],
  );
  return (result.rowCount ?? 0) > 0;
}
