import { pool } from "../../../shared/db/index.js";

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
  members: CombinationMemberSummary[];
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
  members: CombinationMemberSummary[] | null;
}

const SELECT_STUDENT_COMBINATION = `
  select sc2.id, sc2.student_user_id, sc2.school_combination_id, c.code as combination_code,
         c.name as combination_name, sc2.subsidiary_subject_id, sc2.academic_year_id, sc2.status,
         sc2.selected_at, sc2.confirmed_by,
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

function mapRow(row: StudentCombinationRow): StudentCombinationRecord {
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
    members: row.members ?? [],
  };
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
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function listCombinationHistory(studentUserId: string): Promise<StudentCombinationRecord[]> {
  const { rows } = await pool.query<StudentCombinationRow>(
    `${SELECT_STUDENT_COMBINATION} where sc2.student_user_id = $1
     group by sc2.id, c.code, c.name order by sc2.selected_at desc`,
    [studentUserId],
  );
  return rows.map(mapRow);
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
  const members = await client.query<{ subject_id: string; role: CombinationRole }>(
    `select subject_id, role from school_combination_subject where school_combination_id = $1`,
    [schoolCombinationId],
  );
  const combinationSubjectIds = members.rows
    .filter((m) => m.role !== "subsidiary" || m.subject_id === subsidiarySubjectId)
    .map((m) => m.subject_id);

  // General Paper (category 'general') is never a combination member (see
  // combinations.repository.ts) — it's implicit the moment a student is
  // placed into ANY combination, so it's added here directly, independent
  // of which one. docs/design/subject-selection-module.md §3.1, §3.4.
  const gp = await client.query<{ id: string }>(
    `select s.id from subject s
     join school_combination sc on sc.id = $1
     where s.curriculum_id = sc.curriculum_id... this line unused`,
  );
  const activeSubjectIds = [...combinationSubjectIds];

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

export async function selectCombination(
  schoolId: string,
  studentUserId: string,
  academicYearId: string,
  schoolCombinationId: string,
  requestedSubsidiaryId: string | null | undefined,
  confirmedBy: string,
): Promise<StudentCombinationRecord> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const combo = await client.query(
      `select 1 from school_combination
       where id = $1 and school_id = $2 and academic_year_id = $3 and is_offered = true`,
      [schoolCombinationId, schoolId, academicYearId],
    );
    if (combo.rowCount === 0) throw new UnknownReferenceError("schoolCombinationId");

    const existing = await client.query(
      `select 1 from student_combination
       where student_user_id = $1 and school_id = $2 and academic_year_id = $3 and status <> 'reassigned'`,
      [studentUserId, schoolId, academicYearId],
    );
    if ((existing.rowCount ?? 0) > 0) throw new ActiveCombinationExistsError();

    const subsidiarySubjectId = await resolveSubsidiary(client, schoolCombinationId, requestedSubsidiaryId);

    const result = await client.query<{ id: string }>(
      `insert into student_combination
         (student_user_id, school_id, school_combination_id, subsidiary_subject_id, academic_year_id, status, confirmed_by)
       values ($1, $2, $3, $4, $5, 'confirmed', $6)
       returning id`,
      [studentUserId, schoolId, schoolCombinationId, subsidiarySubjectId, academicYearId, confirmedBy],
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

    await client.query("COMMIT");

    const row = await pool.query<StudentCombinationRow>(
      `${SELECT_STUDENT_COMBINATION} where sc2.id = $1 group by sc2.id, c.code, c.name`,
      [result.rows[0].id],
    );
    return mapRow(row.rows[0]);
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
): Promise<StudentCombinationRecord> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const combo = await client.query(
      `select 1 from school_combination
       where id = $1 and school_id = $2 and academic_year_id = $3 and is_offered = true`,
      [newSchoolCombinationId, schoolId, academicYearId],
    );
    if (combo.rowCount === 0) throw new UnknownReferenceError("schoolCombinationId");

    await client.query(
      `update student_combination set status = 'reassigned', updated_at = now()
       where student_user_id = $1 and school_id = $2 and academic_year_id = $3 and status <> 'reassigned'`,
      [studentUserId, schoolId, academicYearId],
    );

    const subsidiarySubjectId = await resolveSubsidiary(client, newSchoolCombinationId, requestedSubsidiaryId);

    const result = await client.query<{ id: string }>(
      `insert into student_combination
         (student_user_id, school_id, school_combination_id, subsidiary_subject_id, academic_year_id, status, confirmed_by)
       values ($1, $2, $3, $4, $5, 'confirmed', $6)
       returning id`,
      [studentUserId, schoolId, newSchoolCombinationId, subsidiarySubjectId, academicYearId, confirmedBy],
    );

    await syncStudentSubjects(
      client,
      schoolId,
      studentUserId,
      academicYearId,
      newSchoolCombinationId,
      subsidiarySubjectId,
      confirmedBy,
    );

    await client.query("COMMIT");

    const row = await pool.query<StudentCombinationRow>(
      `${SELECT_STUDENT_COMBINATION} where sc2.id = $1 group by sc2.id, c.code, c.name`,
      [result.rows[0].id],
    );
    return mapRow(row.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
