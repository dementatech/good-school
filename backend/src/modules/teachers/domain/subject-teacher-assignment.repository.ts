import { pool } from "../../../shared/db/index.js";
import { getActiveAssignmentAtSchool } from "./staff-assignment.repository.js";

// Who teaches what — docs/design/teachers-module.md §3, §4. Time-bound like
// staff_assignment: a mid-year substitute doesn't overwrite the original row,
// it ends the old one and a new one is created, preserving real teaching
// history.
//
// Direct SQL against `subject`/`subject_offering`/`classes`/`streams` here,
// same precedent as staff-assignment.repository.ts's note on `academic_years`
// — these are academic-structure's tables, read directly rather than through
// an import, because the module-boundary rule is about TS internals, not the
// database.

export type TeacherAssignmentStatus = "active" | "ended";

export interface SubjectTeacherAssignmentRecord {
  id: string;
  schoolId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  academicYearId: string;
  classId: string;
  className: string;
  streamId: string | null;
  streamName: string | null;
  staffId: string;
  staffName: string;
  staffSystemId: string | null;
  isLead: boolean;
  status: TeacherAssignmentStatus;
  startDate: string;
  endDate: string | null;
  createdAt: string;
}

export interface SubjectTeacherAssignmentInput {
  subjectId: string;
  academicYearId: string;
  classId: string;
  streamId?: string | null;
  staffId: string;
  isLead?: boolean;
  startDate: string;
}

interface AssignmentRow {
  id: string;
  school_id: string;
  subject_id: string;
  subject_code: string;
  subject_name: string;
  academic_year_id: string;
  class_id: string;
  class_name: string;
  stream_id: string | null;
  stream_name: string | null;
  staff_id: string;
  staff_first_name: string;
  staff_last_name: string;
  staff_system_id: string | null;
  is_lead: boolean;
  status: TeacherAssignmentStatus;
  start_date: string;
  end_date: string | null;
  created_at: string;
}

const SELECT_ASSIGNMENT = `
  select sta.id, sta.school_id, sta.subject_id, sub.code as subject_code, sub.name as subject_name,
         sta.academic_year_id, sta.class_id, cs.name as class_name,
         sta.stream_id, st.name as stream_name,
         sta.staff_id, sf.first_name as staff_first_name, sf.last_name as staff_last_name,
         u.system_id as staff_system_id,
         sta.is_lead, sta.status, sta.start_date, sta.end_date, sta.created_at
  from subject_teacher_assignment sta
  join subject sub on sub.id = sta.subject_id
  join classes c on c.id = sta.class_id
  join curriculum_stage cs on cs.id = c.curriculum_stage_id
  left join streams st on st.id = sta.stream_id
  join staff sf on sf.user_id = sta.staff_id
  join users u on u.id = sf.user_id
`;

function mapRow(row: AssignmentRow): SubjectTeacherAssignmentRecord {
  return {
    id: row.id,
    schoolId: row.school_id,
    subjectId: row.subject_id,
    subjectCode: row.subject_code,
    subjectName: row.subject_name,
    academicYearId: row.academic_year_id,
    classId: row.class_id,
    className: row.class_name,
    streamId: row.stream_id,
    streamName: row.stream_name,
    staffId: row.staff_id,
    staffName: [row.staff_first_name, row.staff_last_name].filter(Boolean).join(" "),
    staffSystemId: row.staff_system_id,
    isLead: row.is_lead,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at,
  };
}

export class UnknownReferenceError extends Error {
  constructor(field: string) {
    super(`Unknown or out-of-school ${field}`);
    this.name = "UnknownReferenceError";
  }
}

export class SubjectNotOfferedError extends Error {
  constructor() {
    super("This subject isn't offered at this school for this academic year yet");
    this.name = "SubjectNotOfferedError";
  }
}

export class StaffNotAssignedError extends Error {
  constructor() {
    super("This staff member has no active assignment at this school");
    this.name = "StaffNotAssignedError";
  }
}

export class AlreadyAssignedError extends Error {
  constructor() {
    super("This staff member is already the active lead teacher for this exact slot");
    this.name = "AlreadyAssignedError";
  }
}

async function assertTargetIsValid(
  schoolId: string,
  input: Pick<SubjectTeacherAssignmentInput, "subjectId" | "academicYearId" | "classId" | "streamId" | "staffId">,
): Promise<void> {
  const offered = await pool.query(
    `select 1 from subject_offering
     where school_id = $1 and academic_year_id = $2 and subject_id = $3 and is_offered = true`,
    [schoolId, input.academicYearId, input.subjectId],
  );
  if (offered.rowCount === 0) throw new SubjectNotOfferedError();

  const cls = await pool.query(
    `select 1 from classes where id = $1 and school_id = $2 and academic_year_id = $3`,
    [input.classId, schoolId, input.academicYearId],
  );
  if (cls.rowCount === 0) throw new UnknownReferenceError("classId");

  if (input.streamId) {
    const stream = await pool.query(
      `select 1 from streams where id = $1 and school_id = $2 and class_id = $3`,
      [input.streamId, schoolId, input.classId],
    );
    if (stream.rowCount === 0) throw new UnknownReferenceError("streamId");
  }

  // The gate from §2: don't allow assigning someone to teach at a school
  // where they have no active staff_assignment.
  const activeStaff = await getActiveAssignmentAtSchool(schoolId, input.staffId);
  if (!activeStaff) throw new StaffNotAssignedError();
}

export async function listForSubjectOffering(
  schoolId: string,
  academicYearId: string,
  subjectId: string,
): Promise<SubjectTeacherAssignmentRecord[]> {
  const result = await pool.query<AssignmentRow>(
    `${SELECT_ASSIGNMENT}
     where sta.school_id = $1 and sta.academic_year_id = $2 and sta.subject_id = $3 and sta.status = 'active'
     order by cs.name, st.name nulls first`,
    [schoolId, academicYearId, subjectId],
  );
  return result.rows.map(mapRow);
}

export async function listForStaff(
  schoolId: string,
  staffId: string,
): Promise<SubjectTeacherAssignmentRecord[]> {
  const result = await pool.query<AssignmentRow>(
    `${SELECT_ASSIGNMENT}
     where sta.school_id = $1 and sta.staff_id = $2
     order by sta.status = 'active' desc, sta.created_at desc`,
    [schoolId, staffId],
  );
  return result.rows.map(mapRow);
}

// Candidates for "who teaches this" — staff at this school who are both
// actively assigned here and specialize in the subject (§4.2). An empty
// result is expected and fine: the caller falls back to every active staff
// member (via staff.repository's listStaff + activeAssignment) rather than
// blocking, per §4.4 ("let the subject stay offered, unassigned").
export async function candidatesForSubject(
  schoolId: string,
  subjectId: string,
): Promise<{ staffId: string; staffName: string; staffSystemId: string | null }[]> {
  const result = await pool.query<{ staff_id: string; first_name: string; last_name: string; system_id: string | null }>(
    `select distinct sf.user_id as staff_id, sf.first_name, sf.last_name, u.system_id
     from staff_subject_specialization sss
     join staff sf on sf.user_id = sss.staff_id
     join users u on u.id = sf.user_id
     join staff_assignment sa on sa.staff_id = sf.user_id and sa.school_id = $1 and sa.status = 'active'
     where sss.subject_id = $2 and sf.is_active = true
     order by sf.first_name, sf.last_name`,
    [schoolId, subjectId],
  );
  return result.rows.map((r) => ({
    staffId: r.staff_id,
    staffName: [r.first_name, r.last_name].filter(Boolean).join(" "),
    staffSystemId: r.system_id,
  }));
}

export async function createSubjectTeacherAssignment(
  schoolId: string,
  input: SubjectTeacherAssignmentInput,
  assignedBy: string,
): Promise<SubjectTeacherAssignmentRecord> {
  await assertTargetIsValid(schoolId, input);

  let id: string;
  try {
    const result = await pool.query<{ id: string }>(
      `insert into subject_teacher_assignment
         (school_id, subject_id, academic_year_id, class_id, stream_id, staff_id, is_lead,
          status, start_date, assigned_by)
       values ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9)
       returning id`,
      [
        schoolId,
        input.subjectId,
        input.academicYearId,
        input.classId,
        input.streamId ?? null,
        input.staffId,
        input.isLead ?? true,
        input.startDate,
        assignedBy,
      ],
    );
    id = result.rows[0].id;
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new AlreadyAssignedError();
    throw err;
  }

  const created = await pool.query<AssignmentRow>(`${SELECT_ASSIGNMENT} where sta.id = $1`, [id]);
  return mapRow(created.rows[0]);
}

// The substitute-teacher workflow (§3): close the old row, the caller opens
// a new one via createSubjectTeacherAssignment — never an in-place staff_id
// overwrite, so "who was actually teaching this in March" stays answerable.
export async function endSubjectTeacherAssignment(
  schoolId: string,
  id: string,
  endDate: string,
): Promise<SubjectTeacherAssignmentRecord | null> {
  const result = await pool.query<{ id: string }>(
    `update subject_teacher_assignment
     set status = 'ended', end_date = $1
     where id = $2 and school_id = $3 and status = 'active'
     returning id`,
    [endDate, id, schoolId],
  );
  if (result.rowCount === 0) return null;

  const updated = await pool.query<AssignmentRow>(`${SELECT_ASSIGNMENT} where sta.id = $1`, [
    result.rows[0].id,
  ]);
  return mapRow(updated.rows[0]);
}

export interface AllocationGap {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  issue: "no_teacher_assigned";
}

// docs/design/teachers-module.md §5's `subject_offering_validation_result`,
// computed on read rather than persisted (matches the existing
// seedAlwaysOnOfferings precedent of recomputing derived state instead of
// storing it, and avoids a staleness problem of its own).
//
// Scoped to "is anyone at all assigned to teach this subject this year",
// not a full subject × class × stream cross-product — subject_offering
// itself carries no class/stream granularity yet (it's a per-subject,
// per-year toggle), so a true per-slot gap check isn't expressible from the
// current schema. Good enough for the dashboard's actual purpose ("3
// subjects still need a teacher"); a finer-grained check is future work if
// subject_offering ever gains that granularity.
export async function allocationGaps(
  schoolId: string,
  academicYearId: string,
): Promise<AllocationGap[]> {
  const result = await pool.query<{ id: string; code: string; name: string }>(
    `select sub.id, sub.code, sub.name
     from subject_offering o
     join subject sub on sub.id = o.subject_id
     where o.school_id = $1 and o.academic_year_id = $2 and o.is_offered = true
       and not exists (
         select 1 from subject_teacher_assignment sta
         where sta.school_id = o.school_id and sta.academic_year_id = o.academic_year_id
           and sta.subject_id = o.subject_id and sta.status = 'active'
       )
     order by sub.name`,
    [schoolId, academicYearId],
  );
  return result.rows.map((r) => ({
    subjectId: r.id,
    subjectCode: r.code,
    subjectName: r.name,
    issue: "no_teacher_assigned",
  }));
}
