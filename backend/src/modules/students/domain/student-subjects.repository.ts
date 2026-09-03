import { pool } from "../../../shared/db/index.js";

// Per-student O-Level subject registration — a state transition on one row
// per (student, subject, year), never a delete, so a dropped subject's prior
// grades/attendance still resolve. See
// docs/design/subject-selection-module.md §2.4. Direct SQL against
// `subject`/`subject_offering` here (not an import from academic-structure)
// matches the existing precedent — see enrollments.repository.ts.

export type StudentSubjectStatus = "active" | "dropped" | "added";

export interface StudentSubjectRecord {
  id: string;
  studentUserId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  subjectCategory: string;
  academicYearId: string;
  status: StudentSubjectStatus;
  statusChangedAt: string;
  statusChangedBy: string | null;
  reason: string | null;
  createdAt: string;
}

interface StudentSubjectRow {
  id: string;
  student_user_id: string;
  subject_id: string;
  subject_code: string;
  subject_name: string;
  subject_category: string;
  academic_year_id: string;
  status: StudentSubjectStatus;
  status_changed_at: string;
  status_changed_by: string | null;
  reason: string | null;
  created_at: string;
}

const SELECT_STUDENT_SUBJECT = `
  select ss.id, ss.student_user_id, ss.subject_id, s.code as subject_code, s.name as subject_name,
         s.category as subject_category, ss.academic_year_id, ss.status, ss.status_changed_at,
         ss.status_changed_by, ss.reason, ss.created_at
  from student_subject ss
  join subject s on s.id = ss.subject_id
`;

function mapRow(row: StudentSubjectRow): StudentSubjectRecord {
  return {
    id: row.id,
    studentUserId: row.student_user_id,
    subjectId: row.subject_id,
    subjectCode: row.subject_code,
    subjectName: row.subject_name,
    subjectCategory: row.subject_category,
    academicYearId: row.academic_year_id,
    status: row.status,
    statusChangedAt: row.status_changed_at,
    statusChangedBy: row.status_changed_by,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

export class CompulsorySubjectError extends Error {
  constructor() {
    super("This subject is compulsory at this school — it can't be dropped.");
    this.name = "CompulsorySubjectError";
  }
}

export class SubjectNotOfferedError extends Error {
  constructor() {
    super("This school doesn't offer that subject for this academic year.");
    this.name = "SubjectNotOfferedError";
  }
}

export async function listStudentSubjects(
  studentUserId: string,
  academicYearId?: string,
): Promise<StudentSubjectRecord[]> {
  const params: unknown[] = [studentUserId];
  let clause = `where ss.student_user_id = $1`;
  if (academicYearId) {
    params.push(academicYearId);
    clause += ` and ss.academic_year_id = $2`;
  }
  const { rows } = await pool.query<StudentSubjectRow>(
    `${SELECT_STUDENT_SUBJECT} ${clause} order by s.category, s.name`,
    params,
  );
  return rows.map(mapRow);
}

// Registers a subject for a student — rejects a subject the school hasn't
// marked `is_offered` for this year (per subject_offering, the source of
// truth for what's actually available at this school), never silently
// allowing an unoffered subject to be added.
export async function addStudentSubject(
  schoolId: string,
  studentUserId: string,
  academicYearId: string,
  subjectId: string,
  changedBy: string,
): Promise<StudentSubjectRecord> {
  const offering = await pool.query<{ is_offered: boolean }>(
    `select is_offered from subject_offering
     where school_id = $1 and subject_id = $2 and academic_year_id = $3`,
    [schoolId, subjectId, academicYearId],
  );
  if (offering.rowCount === 0 || !offering.rows[0].is_offered) {
    throw new SubjectNotOfferedError();
  }

  // A fresh row starts 'active'; re-adding over a previously-'dropped' row is
  // tagged 'added' instead — the doc's distinction between "was here all
  // along" and "came back after being dropped" (§2.4).
  const result = await pool.query<{ id: string }>(
    `insert into student_subject (student_user_id, school_id, subject_id, academic_year_id, status, status_changed_by)
     values ($1, $2, $3, $4, 'active', $5)
     on conflict (student_user_id, subject_id, academic_year_id) do update
       set status = case when student_subject.status = 'dropped' then 'added' else student_subject.status end,
           status_changed_at = now(), status_changed_by = excluded.status_changed_by, reason = null
     returning id`,
    [studentUserId, schoolId, subjectId, academicYearId, changedBy],
  );

  const row = await pool.query<StudentSubjectRow>(`${SELECT_STUDENT_SUBJECT} where ss.id = $1`, [
    result.rows[0].id,
  ]);
  return mapRow(row.rows[0]);
}

// A compulsory subject (per subject_offering.is_compulsory) can't be
// dropped — enforced here, not just left to the UI. See §2.4's drop rules.
export async function setStudentSubjectStatus(
  schoolId: string,
  studentUserId: string,
  subjectId: string,
  academicYearId: string,
  status: StudentSubjectStatus,
  changedBy: string,
  reason: string | null,
): Promise<StudentSubjectRecord | null> {
  if (status === "dropped") {
    const offering = await pool.query<{ is_compulsory: boolean }>(
      `select is_compulsory from subject_offering
       where school_id = $1 and subject_id = $2 and academic_year_id = $3`,
      [schoolId, subjectId, academicYearId],
    );
    if (offering.rows[0]?.is_compulsory) throw new CompulsorySubjectError();
  }

  const result = await pool.query<{ id: string }>(
    `update student_subject
     set status = $1, status_changed_at = now(), status_changed_by = $2, reason = $3, updated_at = now()
     where student_user_id = $4 and school_id = $5 and subject_id = $6 and academic_year_id = $7
     returning id`,
    [status, changedBy, reason, studentUserId, schoolId, subjectId, academicYearId],
  );
  if (result.rowCount === 0) return null;

  const row = await pool.query<StudentSubjectRow>(`${SELECT_STUDENT_SUBJECT} where ss.id = $1`, [
    result.rows[0].id,
  ]);
  return mapRow(row.rows[0]);
}
