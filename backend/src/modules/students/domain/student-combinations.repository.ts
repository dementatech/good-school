import type { Pool, PoolClient } from "pg";
import { pool } from "../../../shared/db/index.js";
import { isBelowCredit } from "./prior-exams.repository.js";

type Db = Pool | PoolClient;

// The A-Level student's single atomic combination choice (3 principal + 1
// subsidiary + General Paper, bundled). Confirming it syncs `student_subject`
// rows for every resulting member — the app layer does the sync explicitly,
// not a DB trigger, so it stays visible/debuggable. See
// docs/design/subject-selection-module.md §3.4.

export type StudentCombinationStatus = "pending" | "confirmed" | "reassigned";

// Duplicated from academic-structure/domain/combinations.repository.ts rather
// than imported — modules only import from each other's index.ts, and this
// module reaches `school_combination_subject` via direct SQL anyway (same
// precedent as enrollments.repository.ts).
export type CombinationRole = "principal" | "subsidiary" | "compulsory";

export interface CombinationMemberSummary {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  role: CombinationRole;
}

export interface StudentCombinationRecord {
  id: string;
  studentUserId: string;
  schoolCombinationId: string;
  combinationCode: string;
  combinationName: string;
  subsidiarySubjectId: string | null;
  academicYearId: string;
  status: StudentCombinationStatus;
  selectedAt: string;
  confirmedBy: string | null;
  eligibilityOverrideReason: string | null;
  members: CombinationMemberSummary[];
  // Non-blocking notes about UCE eligibility for the principal subjects,
  // computed from any prior_exam_result_subject grades on file. Empty when
  // nothing looks off (or when there's nothing to check against).
  warnings: string[];
}

interface StudentCombinationRow {
  id: string;
  student_user_id: string;
  school_combination_id: string;
  combination_code: string;
  combination_name: string;
  subsidiary_subject_id: string | null;
  academic_year_id: string;
  status: StudentCombinationStatus;
  selected_at: string;
  confirmed_by: string | null;
  eligibility_override_reason: string | null;
  members: CombinationMemberSummary[] | null;
}

const SELECT_STUDENT_COMBINATION = `
  select sc2.id, sc2.student_user_id, sc2.school_combination_id, c.code as combination_code,
         c.name as combination_name, sc2.subsidiary_subject_id, sc2.academic_year_id, sc2.status,
         sc2.selected_at, sc2.confirmed_by, sc2.eligibility_override_reason,
         coalesce(
           jsonb_agg(jsonb_build_object(
             'subjectId', s.id, 'subjectCode', s.code, 'subjectName', s.name, 'role', cs.role
           )) filter (where cs.subject_id is not null),
           '[]'
         ) as members
  from student_combination sc2
  join school_combination c on c.id = sc2.school_combination_id
  left join school_combination_subject cs on cs.school_combination_id = c.id
  left join subject s on s.id = cs.subject_id
`;

function mapRow(row: StudentCombinationRow, warnings: string[] = []): StudentCombinationRecord {
  return {
    id: row.id,
    studentUserId: row.student_user_id,
    schoolCombinationId: row.school_combination_id,
    combinationCode: row.combination_code,
    combinationName: row.combination_name,
    subsidiarySubjectId: row.subsidiary_subject_id,
    academicYearId: row.academic_year_id,
    status: row.status,
    selectedAt: row.selected_at,
    confirmedBy: row.confirmed_by,
    eligibilityOverrideReason: row.eligibility_override_reason,
    members: row.members ?? [],
    warnings,
  };
}

// Non-blocking UCE-eligibility check for a combination's principal subjects,
// read off any prior_exam_result_subject grades captured for the student. No
// grade on file for a principal → a "couldn't check" note; a sub-credit grade
// → a "below a credit" note. Never throws — the caller decides what to do
// with the notes (the UI shows them and lets an admin override with a reason).
// docs/design/subject-selection-module.md §4 (prerequisite rules).
async function computeEligibilityWarnings(
  db: Db,
  studentUserId: string,
  schoolCombinationId: string,
): Promise<string[]> {
  const principals = await db.query<{ subject_id: string; subject_name: string }>(
    `select cs.subject_id, s.name as subject_name
     from school_combination_subject cs
     join subject s on s.id = cs.subject_id
     where cs.school_combination_id = $1 and cs.role = 'principal'`,
    [schoolCombinationId],
  );
  if (principals.rowCount === 0) return [];

  const grades = await db.query<{ principal_subject_id: string; grade: string }>(
    `select pes.principal_subject_id, pes.grade
     from prior_exam_result_subject pes
     join prior_exam_result pe on pe.id = pes.prior_exam_result_id
     where pe.student_user_id = $1 and pe.exam_type = 'UCE'`,
    [studentUserId],
  );
  const gradeBySubject = new Map(grades.rows.map((r) => [r.principal_subject_id, r.grade]));

  const warnings: string[] = [];
  for (const p of principals.rows) {
    const grade = gradeBySubject.get(p.subject_id);
    if (!grade) {
      warnings.push(`No UCE grade recorded for ${p.subject_name} — eligibility not checked.`);
    } else if (isBelowCredit(grade)) {
      warnings.push(`UCE grade ${grade} in ${p.subject_name} is below a credit.`);
    }
  }
  return warnings;
}

export class UnknownReferenceError extends Error {
  constructor(field: string) {
    super(`Unknown or out-of-school ${field}`);
    this.name = "UnknownReferenceError";
  }
}

export class InvalidSubsidiaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSubsidiaryError";
  }
}

export class ActiveCombinationExistsError extends Error {
  constructor() {
    super("Student already has a combination this year — reassign instead of adding a second one.");
    this.name = "ActiveCombinationExistsError";
  }
}

export async function getCurrentCombination(
  studentUserId: string,
  academicYearId?: string,
): Promise<StudentCombinationRecord | null> {
  const params: unknown[] = [studentUserId];
  let clause = `where sc2.student_user_id = $1 and sc2.status <> 'reassigned'`;
  if (academicYearId) {
    params.push(academicYearId);
    clause += ` and sc2.academic_year_id = $2`;
  }
  const { rows } = await pool.query<StudentCombinationRow>(
    `${SELECT_STUDENT_COMBINATION} ${clause} group by sc2.id, c.code, c.name order by sc2.selected_at desc limit 1`,
    params,
  );
  if (!rows[0]) return null;
  const warnings = await computeEligibilityWarnings(
    pool,
    rows[0].student_user_id,
    rows[0].school_combination_id,
  );
  return mapRow(rows[0], warnings);
}

export async function listCombinationHistory(studentUserId: string): Promise<StudentCombinationRecord[]> {
  const { rows } = await pool.query<StudentCombinationRow>(
    `${SELECT_STUDENT_COMBINATION} where sc2.student_user_id = $1
     group by sc2.id, c.code, c.name order by sc2.selected_at desc`,
    [studentUserId],
  );
  return rows.map((r) => mapRow(r));
}

async function resolveSubsidiary(
  client: import("pg").PoolClient,
  schoolCombinationId: string,
  requestedSubsidiaryId: string | null | undefined,
): Promise<string | null> {
  const options = await client.query<{ subject_id: string }>(
    `select subject_id from school_combination_subject
     where school_combination_id = $1 and role = 'subsidiary'`,
    [schoolCombinationId],
  );
  if (options.rowCount === 0) return null;
  if (options.rowCount === 1) return options.rows[0].subject_id;

  // More than one subsidiary option — the school/student must pick one of
  // the real options, never a free-typed subject id.
  if (!requestedSubsidiaryId) {
    throw new InvalidSubsidiaryError(
      "This combination offers more than one subsidiary option — pick one.",
    );
  }
  if (!options.rows.some((r) => r.subject_id === requestedSubsidiaryId)) {
    throw new InvalidSubsidiaryError("That subsidiary isn't offered by this combination.");
  }
  return requestedSubsidiaryId;
}

async function syncStudentSubjects(
  client: import("pg").PoolClient,
  schoolId: string,
  studentUserId: string,
  academicYearId: string,
  schoolCombinationId: string,
  subsidiarySubjectId: string | null,
  changedBy: string,
): Promise<void> {
  const members = await client.query<{ subject_id: string; role: CombinationRole; curriculum_id: string }>(
    `select cs.subject_id, cs.role, s.curriculum_id
     from school_combination_subject cs
     join subject s on s.id = cs.subject_id
     where cs.school_combination_id = $1`,
    [schoolCombinationId],
  );
  const combinationSubjectIds = members.rows
    .filter((m) => m.role !== "subsidiary" || m.subject_id === subsidiarySubjectId)
    .map((m) => m.subject_id);

  // General Paper is never a combination member (see
  // combinations.repository.ts) — it's implicit the moment a student is
  // placed into ANY combination, so it's added here directly, independent of
  // which one. Identified by the `is_general_paper` flag, not category —
  // ordinary 'subsidiary' subjects share that category. Its curriculum is the
  // combination's own (shared by all its members — `school_combination`
  // doesn't carry curriculum_id itself). docs/design/subject-selection-module.md §3.1, §3.4.
  const curriculumId = members.rows[0]?.curriculum_id;
  const gp = curriculumId
    ? await client.query<{ id: string }>(
        `select id from subject
         where curriculum_id = $1 and is_general_paper and status = 'approved' and is_active`,
        [curriculumId],
      )
    : { rows: [] as { id: string }[] };
  const activeSubjectIds = [...combinationSubjectIds, ...gp.rows.map((r) => r.id)];

  for (const subjectId of activeSubjectIds) {
    await client.query(
      `insert into student_subject (student_user_id, school_id, subject_id, academic_year_id, status, status_changed_by)
       values ($1, $2, $3, $4, 'active', $5)
       on conflict (student_user_id, subject_id, academic_year_id) do update
         set status = 'active', status_changed_at = now(), status_changed_by = excluded.status_changed_by, reason = null`,
      [studentUserId, schoolId, subjectId, academicYearId, changedBy],
    );
  }

  // Anything the student was studying under a PREVIOUS combination this year
  // that isn't part of the new one gets dropped, not left dangling as
  // "active" for a combination they're no longer in.
  if (activeSubjectIds.length > 0) {
    await client.query(
      `update student_subject
       set status = 'dropped', status_changed_at = now(), status_changed_by = $1,
           reason = 'combination reassigned', updated_at = now()
       where student_user_id = $2 and academic_year_id = $3 and status = 'active'
         and subject_id <> all($4::uuid[])
         and subject_id in (
           select subject_id from school_combination_subject
           where school_combination_id in (
             select school_combination_id from student_combination
             where student_user_id = $2 and academic_year_id = $3
           )
         )`,
      [changedBy, studentUserId, academicYearId, activeSubjectIds],
    );
  }
}

export interface CombinationChoice {
  schoolId: string;
  studentUserId: string;
  academicYearId: string;
  schoolCombinationId: string;
  requestedSubsidiaryId?: string | null;
  confirmedBy: string;
  overrideReason?: string | null;
}

// The shared body of both select and reassign. Runs entirely on the caller's
// transaction (`client`), so createStudent can fold an A-Level admission into
// the one commit. `reassign` marks any current row `reassigned` first;
// `select` instead rejects a second active row.
async function applyCombinationTx(
  client: PoolClient,
  choice: CombinationChoice,
  { reassign }: { reassign: boolean },
): Promise<StudentCombinationRecord> {
  const {
    schoolId,
    studentUserId,
    academicYearId,
    schoolCombinationId,
    requestedSubsidiaryId,
    confirmedBy,
    overrideReason,
  } = choice;

  const combo = await client.query(
    `select 1 from school_combination
     where id = $1 and school_id = $2 and academic_year_id = $3 and is_offered = true`,
    [schoolCombinationId, schoolId, academicYearId],
  );
  if (combo.rowCount === 0) throw new UnknownReferenceError("schoolCombinationId");

  if (reassign) {
    await client.query(
      `update student_combination set status = 'reassigned', updated_at = now()
       where student_user_id = $1 and school_id = $2 and academic_year_id = $3 and status <> 'reassigned'`,
      [studentUserId, schoolId, academicYearId],
    );
  } else {
    const existing = await client.query(
      `select 1 from student_combination
       where student_user_id = $1 and school_id = $2 and academic_year_id = $3 and status <> 'reassigned'`,
      [studentUserId, schoolId, academicYearId],
    );
    if ((existing.rowCount ?? 0) > 0) throw new ActiveCombinationExistsError();
  }

  const subsidiarySubjectId = await resolveSubsidiary(client, schoolCombinationId, requestedSubsidiaryId);

  const result = await client.query<{ id: string }>(
    `insert into student_combination
       (student_user_id, school_id, school_combination_id, subsidiary_subject_id, academic_year_id,
        status, confirmed_by, eligibility_override_reason)
     values ($1, $2, $3, $4, $5, 'confirmed', $6, $7)
     returning id`,
    [
      studentUserId,
      schoolId,
      schoolCombinationId,
      subsidiarySubjectId,
      academicYearId,
      confirmedBy,
      overrideReason?.trim() || null,
    ],
  );

  await syncStudentSubjects(
    client,
    schoolId,
    studentUserId,
    academicYearId,
    schoolCombinationId,
    subsidiarySubjectId,
    confirmedBy,
  );

  const row = await client.query<StudentCombinationRow>(
    `${SELECT_STUDENT_COMBINATION} where sc2.id = $1 group by sc2.id, c.code, c.name`,
    [result.rows[0].id],
  );
  const warnings = await computeEligibilityWarnings(client, studentUserId, schoolCombinationId);
  return mapRow(row.rows[0], warnings);
}

// Transaction-participating entry point for createStudent's admission commit.
export async function selectCombinationTx(
  client: PoolClient,
  choice: CombinationChoice,
): Promise<StudentCombinationRecord> {
  return applyCombinationTx(client, choice, { reassign: false });
}

export async function selectCombination(
  schoolId: string,
  studentUserId: string,
  academicYearId: string,
  schoolCombinationId: string,
  requestedSubsidiaryId: string | null | undefined,
  confirmedBy: string,
  overrideReason?: string | null,
): Promise<StudentCombinationRecord> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const record = await applyCombinationTx(
      client,
      {
        schoolId,
        studentUserId,
        academicYearId,
        schoolCombinationId,
        requestedSubsidiaryId,
        confirmedBy,
        overrideReason,
      },
      { reassign: false },
    );
    await client.query("COMMIT");
    return record;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Reassignment is the exception path (§3.4) — the current row is marked
// `reassigned`, a new `confirmed` row is created, and the subject sync above
// drops whatever the old combination uniquely contributed.
export async function reassignCombination(
  schoolId: string,
  studentUserId: string,
  academicYearId: string,
  newSchoolCombinationId: string,
  requestedSubsidiaryId: string | null | undefined,
  confirmedBy: string,
  overrideReason?: string | null,
): Promise<StudentCombinationRecord> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const record = await applyCombinationTx(
      client,
      {
        schoolId,
        studentUserId,
        academicYearId,
        schoolCombinationId: newSchoolCombinationId,
        requestedSubsidiaryId,
        confirmedBy,
        overrideReason,
      },
      { reassign: true },
    );
    await client.query("COMMIT");
    return record;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
