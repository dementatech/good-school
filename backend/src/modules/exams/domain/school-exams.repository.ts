import { pool } from "../../../shared/db/index.js";
import {
  computeGrade,
  getActiveSchemeForSubject,
  getCurrentAcademicYear,
  getCurrentTerm,
  type GradeBandRecord,
} from "../../academic-structure/index.js";

// A school's activated exam — an instance of a super_admin exam_session,
// pinned to the school's current academic year + current term at creation.
// See the 1700000048000_exams migration and docs plan.

export type SchoolExamStatus = "active" | "closed";

export interface SchoolExamRecord {
  id: string;
  schoolId: string;
  examSessionId: string;
  examCode: string;
  academicYearId: string;
  academicYearName: string;
  termId: string;
  termName: string;
  name: string;
  startsOn: string;
  endsOn: string;
  marksDueOn: string;
  status: SchoolExamStatus;
  /** Derived: status is active AND today is within [startsOn, marksDueOn]. */
  marksEntryOpen: boolean;
  /** Set by publishSchoolExam — freezes exam_result.computed_grade and
   * blocks further mark edits until unpublishSchoolExam clears it. See
   * migration 1700000054000_publish-exam-results. */
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSchoolExamInput {
  examSessionId: string;
  name?: string | null;
  startsOn: string;
  endsOn: string;
  marksDueOn: string;
}

export interface UpdateSchoolExamInput {
  name?: string | null;
  startsOn: string;
  endsOn: string;
  marksDueOn: string;
}

export class NoCurrentAcademicYearError extends Error {
  constructor() {
    super("Set a current academic year before creating an exam.");
    this.name = "NoCurrentAcademicYearError";
  }
}

export class NoCurrentTermError extends Error {
  constructor(yearName: string) {
    super(`${yearName} has no terms yet — add its terms (with dates) before creating an exam.`);
    this.name = "NoCurrentTermError";
  }
}

export class UnknownExamSessionError extends Error {
  constructor() {
    super("That exam session doesn't exist or is no longer active.");
    this.name = "UnknownExamSessionError";
  }
}

export class InvalidExamDatesError extends Error {
  constructor() {
    super("Dates must run: start ≤ end ≤ marks due.");
    this.name = "InvalidExamDatesError";
  }
}

export class DuplicateExamNameError extends Error {
  constructor(name: string) {
    super(`An exam named "${name}" already exists for this term — give it a different name.`);
    this.name = "DuplicateExamNameError";
  }
}

interface SchoolExamRow {
  id: string;
  school_id: string;
  exam_session_id: string;
  exam_code: string;
  academic_year_id: string;
  academic_year_name: string;
  term_id: string;
  term_name: string;
  name: string;
  starts_on: string;
  ends_on: string;
  marks_due_on: string;
  status: SchoolExamStatus;
  marks_entry_open: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_SCHOOL_EXAM = `
  select se.id, se.school_id, se.exam_session_id, es.exam_code,
         se.academic_year_id, ay.year_name as academic_year_name,
         se.term_id, t.name as term_name,
         se.name, se.starts_on, se.ends_on, se.marks_due_on, se.status, se.published_at,
         (se.status = 'active' and current_date between se.starts_on and se.marks_due_on)
           as marks_entry_open,
         se.created_at, se.updated_at
  from school_exam se
  join exam_session es on es.id = se.exam_session_id
  join academic_years ay on ay.id = se.academic_year_id
  join terms t on t.id = se.term_id
`;

const isPgUniqueViolation = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";

function mapRow(row: SchoolExamRow): SchoolExamRecord {
  return {
    id: row.id,
    schoolId: row.school_id,
    examSessionId: row.exam_session_id,
    examCode: row.exam_code,
    academicYearId: row.academic_year_id,
    academicYearName: row.academic_year_name,
    termId: row.term_id,
    termName: row.term_name,
    name: row.name,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    marksDueOn: row.marks_due_on,
    status: row.status,
    marksEntryOpen: row.marks_entry_open,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const datesInOrder = (i: { startsOn: string; endsOn: string; marksDueOn: string }): boolean =>
  i.startsOn <= i.endsOn && i.endsOn <= i.marksDueOn;

export async function listSchoolExams(
  schoolId: string,
  filter: { academicYearId?: string; termId?: string } = {},
): Promise<SchoolExamRecord[]> {
  let academicYearId = filter.academicYearId;
  if (!academicYearId && !filter.termId) {
    academicYearId = (await getCurrentAcademicYear(schoolId))?.id;
    // No current year and no filter → nothing to scope to; return everything
    // so a school that hasn't set a current year still sees its exams.
    if (!academicYearId) {
      const { rows } = await pool.query<SchoolExamRow>(
        `${SELECT_SCHOOL_EXAM} where se.school_id = $1 order by se.starts_on desc, se.name`,
        [schoolId],
      );
      return rows.map(mapRow);
    }
  }

  const conditions = ["se.school_id = $1"];
  const params: unknown[] = [schoolId];
  if (academicYearId) {
    params.push(academicYearId);
    conditions.push(`se.academic_year_id = $${params.length}`);
  }
  if (filter.termId) {
    params.push(filter.termId);
    conditions.push(`se.term_id = $${params.length}`);
  }

  const { rows } = await pool.query<SchoolExamRow>(
    `${SELECT_SCHOOL_EXAM} where ${conditions.join(" and ")} order by se.starts_on desc, se.name`,
    params,
  );
  return rows.map(mapRow);
}

export async function getSchoolExam(schoolId: string, id: string): Promise<SchoolExamRecord | null> {
  const { rows } = await pool.query<SchoolExamRow>(
    `${SELECT_SCHOOL_EXAM} where se.school_id = $1 and se.id = $2`,
    [schoolId, id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createSchoolExam(
  schoolId: string,
  actingUserId: string,
  input: CreateSchoolExamInput,
): Promise<SchoolExamRecord> {
  const year = await getCurrentAcademicYear(schoolId);
  if (!year) throw new NoCurrentAcademicYearError();

  const term = await getCurrentTerm(schoolId, year.id);
  if (!term) throw new NoCurrentTermError(year.yearName);

  const session = await pool.query<{ exam_name: string }>(
    `select exam_name from exam_session where id = $1 and is_active`,
    [input.examSessionId],
  );
  if (session.rowCount === 0) throw new UnknownExamSessionError();

  if (!datesInOrder(input)) throw new InvalidExamDatesError();

  const name = input.name?.trim() || session.rows[0].exam_name;

  try {
    const { rows } = await pool.query<{ id: string }>(
      `insert into school_exam
         (school_id, exam_session_id, academic_year_id, term_id, name,
          starts_on, ends_on, marks_due_on, status, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)
       returning id`,
      [
        schoolId,
        input.examSessionId,
        year.id,
        term.id,
        name,
        input.startsOn,
        input.endsOn,
        input.marksDueOn,
        actingUserId,
      ],
    );
    return (await getSchoolExam(schoolId, rows[0].id))!;
  } catch (err) {
    if (isPgUniqueViolation(err)) throw new DuplicateExamNameError(name);
    throw err;
  }
}

export async function updateSchoolExam(
  schoolId: string,
  id: string,
  input: UpdateSchoolExamInput,
): Promise<SchoolExamRecord | null> {
  const existing = await getSchoolExam(schoolId, id);
  if (!existing) return null;

  if (!datesInOrder(input)) throw new InvalidExamDatesError();

  const name = input.name?.trim() || existing.name;

  try {
    await pool.query(
      `update school_exam
       set name = $1, starts_on = $2, ends_on = $3, marks_due_on = $4, updated_at = now()
       where id = $5 and school_id = $6`,
      [name, input.startsOn, input.endsOn, input.marksDueOn, id, schoolId],
    );
  } catch (err) {
    if (isPgUniqueViolation(err)) throw new DuplicateExamNameError(name);
    throw err;
  }
  return getSchoolExam(schoolId, id);
}

export async function setSchoolExamStatus(
  schoolId: string,
  id: string,
  status: SchoolExamStatus,
): Promise<SchoolExamRecord | null> {
  const result = await pool.query(
    `update school_exam set status = $1, updated_at = now() where id = $2 and school_id = $3`,
    [status, id, schoolId],
  );
  if ((result.rowCount ?? 0) === 0) return null;
  return getSchoolExam(schoolId, id);
}

export interface PublishResult {
  exam: SchoolExamRecord;
  /** How many exam_result rows got a computed_grade vs. were left null —
   * missing an active/complete grading_scheme for a subject degrades
   * gracefully rather than failing the whole publish (e.g. the UACE scheme
   * ships with zero bands until a school fills them in). */
  resultsGraded: number;
  resultsUngraded: number;
}

// Freezes every exam_result on this exam against the school's current
// grading_scheme(s), and blocks further mark edits (exam-results.repository.ts
// checks publishedAt) until unpublishSchoolExam. An explicit, idempotent
// action — re-publishing recomputes every row from current marks/schemes,
// never automatic, so a published grade doesn't drift out from under a
// later edit. See migration 1700000054000_publish-exam-results.
export async function publishSchoolExam(schoolId: string, id: string): Promise<PublishResult | null> {
  const client = await pool.connect();
  let resultsGraded = 0;
  let resultsUngraded = 0;
  try {
    await client.query("begin");
    const owner = await client.query(`select 1 from school_exam where id = $1 and school_id = $2`, [
      id,
      schoolId,
    ]);
    if (owner.rowCount === 0) {
      await client.query("rollback");
      return null;
    }

    const { rows: results } = await client.query<{
      id: string;
      subject_id: string;
      raw_score: string | null;
      is_absent: boolean;
    }>(`select id, subject_id, raw_score, is_absent from exam_result where school_exam_id = $1`, [id]);

    // One scheme lookup per subject, not per result row.
    const schemeBySubject = new Map<string, { schemeId: string; bands: GradeBandRecord[] } | null>();
    for (const r of results) {
      if (!schemeBySubject.has(r.subject_id)) {
        const scheme = await getActiveSchemeForSubject(schoolId, r.subject_id);
        schemeBySubject.set(r.subject_id, scheme ? { schemeId: scheme.id, bands: scheme.bands } : null);
      }
      const scheme = schemeBySubject.get(r.subject_id) ?? null;
      let grade: string | null = null;
      let gradingSchemeId: string | null = null;
      if (!r.is_absent && r.raw_score !== null && scheme) {
        grade = computeGrade(Number(r.raw_score), scheme.bands)?.label ?? null;
        gradingSchemeId = scheme.schemeId;
      }
      if (grade !== null) resultsGraded++;
      else resultsUngraded++;
      await client.query(
        `update exam_result set computed_grade = $1, grading_scheme_id = $2, updated_at = now() where id = $3`,
        [grade, gradingSchemeId, r.id],
      );
    }

    await client.query(`update school_exam set published_at = now(), updated_at = now() where id = $1`, [id]);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
  const exam = await getSchoolExam(schoolId, id);
  return exam ? { exam, resultsGraded, resultsUngraded } : null;
}

// Clears the freeze marker only — leaves computed_grade/grading_scheme_id on
// exam_result as-is (a subsequent publish recomputes every row anyway), same
// "reopen to unlock editing" shape as reopenMarkSheet.
export async function unpublishSchoolExam(schoolId: string, id: string): Promise<SchoolExamRecord | null> {
  const result = await pool.query(
    `update school_exam set published_at = null, updated_at = now() where id = $1 and school_id = $2`,
    [id, schoolId],
  );
  if ((result.rowCount ?? 0) === 0) return null;
  return getSchoolExam(schoolId, id);
}

export async function deleteSchoolExam(schoolId: string, id: string): Promise<boolean> {
  const result = await pool.query(`delete from school_exam where id = $1 and school_id = $2`, [
    id,
    schoolId,
  ]);
  return (result.rowCount ?? 0) > 0;
}
