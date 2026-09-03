import type { PoolClient } from "pg";
import { pool } from "../../../shared/db/index.js";

// A student's enrollment history — one row per school year (or transfer/
// repeat), never overwritten. See docs/design/student-enrollment.md §1, §4.
// Direct SQL against `classes`/`streams`/`academic_years` here (rather than
// importing from the academic-structure module) matches the existing
// precedent in `schools/domain/school-curricula.repository.ts` — modules
// share one Postgres schema, the import-boundary rule is about TS internals.

export type EntryType = "new_admission" | "transfer" | "repeat" | "re_admission_s5";
export type ExitType = "transfer" | "withdrawal" | "completion" | "no_show";
export type EnrollmentStatus =
  | "applied"
  | "admitted"
  | "active"
  | "transferred_out"
  | "withdrawn"
  | "graduated"
  | "no_show";

export interface EnrollmentRecord {
  id: string;
  studentUserId: string;
  schoolId: string;
  academicYearId: string;
  academicYearName: string;
  classId: string;
  stageCode: string;
  stageName: string;
  stagePhase: "O_LEVEL" | "A_LEVEL";
  streamId: string | null;
  streamName: string | null;
  entryDate: string;
  entryType: EntryType;
  exitDate: string | null;
  exitType: ExitType | null;
  status: EnrollmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface EnrollmentInput {
  academicYearId: string;
  classId: string;
  streamId?: string | null;
  entryDate: string;
  entryType: EntryType;
}

interface EnrollmentRow {
  id: string;
  student_user_id: string;
  school_id: string;
  academic_year_id: string;
  academic_year_name: string;
  class_id: string;
  stage_code: string;
  stage_name: string;
  stage_phase: "O_LEVEL" | "A_LEVEL";
  stream_id: string | null;
  stream_name: string | null;
  entry_date: string;
  entry_type: EntryType;
  exit_date: string | null;
  exit_type: ExitType | null;
  status: EnrollmentStatus;
  created_at: string;
  updated_at: string;
}

const SELECT_ENROLLMENT = `
  select se.id, se.student_user_id, se.school_id, se.academic_year_id, ay.year_name as academic_year_name,
         se.class_id, cs.code as stage_code, cs.name as stage_name, cs.phase as stage_phase,
         se.stream_id, st.name as stream_name,
         se.entry_date, se.entry_type, se.exit_date, se.exit_type, se.status,
         se.created_at, se.updated_at
  from student_enrollment se
  join academic_years ay on ay.id = se.academic_year_id
  join classes c on c.id = se.class_id
  join curriculum_stage cs on cs.id = c.curriculum_stage_id
  left join streams st on st.id = se.stream_id
`;

function mapRow(row: EnrollmentRow): EnrollmentRecord {
  return {
    id: row.id,
    studentUserId: row.student_user_id,
    schoolId: row.school_id,
    academicYearId: row.academic_year_id,
    academicYearName: row.academic_year_name,
    classId: row.class_id,
    stageCode: row.stage_code,
    stageName: row.stage_name,
    stagePhase: row.stage_phase,
    streamId: row.stream_id,
    streamName: row.stream_name,
    entryDate: row.entry_date,
    entryType: row.entry_type,
    exitDate: row.exit_date,
    exitType: row.exit_type,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class UnknownReferenceError extends Error {
  constructor(field: string) {
    super(`Unknown or out-of-school ${field}`);
    this.name = "UnknownReferenceError";
  }
}

export class ActiveEnrollmentExistsError extends Error {
  constructor() {
    super("Student already has an active enrollment at this school");
    this.name = "ActiveEnrollmentExistsError";
  }
}

// Validates that academicYearId/classId/streamId are real rows belonging to
// this school (and, for streamId, to the given class) before anything is
// written — reject the whole request on an unknown id rather than silently
// dropping it (see docs/design memory: no-magic-typing-fetch-real-data).
async function assertEnrollmentTargetBelongsToSchool(
  client: PoolClient,
  schoolId: string,
  input: Pick<EnrollmentInput, "academicYearId" | "classId" | "streamId">,
): Promise<void> {
  const year = await client.query(
    `select 1 from academic_years where id = $1 and school_id = $2`,
    [input.academicYearId, schoolId],
  );
  if (year.rowCount === 0) throw new UnknownReferenceError("academicYearId");

  const cls = await client.query(
    `select 1 from classes where id = $1 and school_id = $2 and academic_year_id = $3`,
    [input.classId, schoolId, input.academicYearId],
  );
  if (cls.rowCount === 0) throw new UnknownReferenceError("classId");

  if (input.streamId) {
    const stream = await client.query(
      `select 1 from streams where id = $1 and school_id = $2 and class_id = $3`,
      [input.streamId, schoolId, input.classId],
    );
    if (stream.rowCount === 0) throw new UnknownReferenceError("streamId");
  }
}

export async function getActiveEnrollment(
  schoolId: string,
  studentUserId: string,
): Promise<EnrollmentRecord | null> {
  const result = await pool.query<EnrollmentRow>(
    `${SELECT_ENROLLMENT} where se.school_id = $1 and se.student_user_id = $2 and se.status = 'active'`,
    [schoolId, studentUserId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function listEnrollments(
  schoolId: string,
  studentUserId: string,
): Promise<EnrollmentRecord[]> {
  const result = await pool.query<EnrollmentRow>(
    `${SELECT_ENROLLMENT} where se.school_id = $1 and se.student_user_id = $2
     order by se.entry_date desc, se.created_at desc`,
    [schoolId, studentUserId],
  );
  return result.rows.map(mapRow);
}

// Shared by createStudent's own transaction (passed an existing `client`)
// and the standalone POST /:id/enrollments route (which opens its own).
// Rejects a second active row for the same student/school — 409, never
// silently supersedes the existing one. Per docs/design/student-enrollment.md
// §4: "never delete an enrollment record ... a withdrawal-then-return
// creates a new enrollment period, not a reopened old one."
export async function createEnrollment(
  client: PoolClient,
  schoolId: string,
  studentUserId: string,
  input: EnrollmentInput,
): Promise<EnrollmentRecord> {
  await assertEnrollmentTargetBelongsToSchool(client, schoolId, input);

  const active = await client.query(
    `select 1 from student_enrollment where school_id = $1 and student_user_id = $2 and status = 'active'`,
    [schoolId, studentUserId],
  );
  if ((active.rowCount ?? 0) > 0) throw new ActiveEnrollmentExistsError();

  const result = await client.query<{ id: string }>(
    `insert into student_enrollment
       (student_user_id, school_id, academic_year_id, class_id, stream_id, entry_date, entry_type, status)
     values ($1, $2, $3, $4, $5, $6, $7, 'active')
     returning id`,
    [
      studentUserId,
      schoolId,
      input.academicYearId,
      input.classId,
      input.streamId ?? null,
      input.entryDate,
      input.entryType,
    ],
  );

  const created = await client.query<EnrollmentRow>(
    `${SELECT_ENROLLMENT} where se.id = $1`,
    [result.rows[0].id],
  );
  return mapRow(created.rows[0]);
}

export async function withdrawEnrollment(
  schoolId: string,
  enrollmentId: string,
  input: { exitDate: string; exitType: ExitType },
): Promise<EnrollmentRecord | null> {
  const status: EnrollmentStatus =
    input.exitType === "transfer"
      ? "transferred_out"
      : input.exitType === "completion"
        ? "graduated"
        : input.exitType === "no_show"
          ? "no_show"
          : "withdrawn";

  const result = await pool.query<{ id: string }>(
    `update student_enrollment
     set exit_date = $1, exit_type = $2, status = $3, updated_at = now()
     where id = $4 and school_id = $5 and status = 'active'
     returning id`,
    [input.exitDate, input.exitType, status, enrollmentId, schoolId],
  );
  if (result.rowCount === 0) return null;

  const updated = await pool.query<EnrollmentRow>(`${SELECT_ENROLLMENT} where se.id = $1`, [
    result.rows[0].id,
  ]);
  return mapRow(updated.rows[0]);
}
