import type { Pool, PoolClient } from "pg";
import { pool } from "../../../shared/db/index.js";

type Db = Pool | PoolClient;

// Exams roadmap Step 1 — marks entry. See the 1700000050000_exam-results
// migration. Direct SQL against academic-structure / students tables
// (student_enrollment, student_subject, subject, classes, streams) follows the
// existing precedent — the module-boundary rule is about TS internals, not the
// shared Postgres schema.

const STREAM_SENTINEL = "00000000-0000-0000-0000-000000000000";

export type MarkSheetActorRole = "teacher" | "school_admin" | "admin" | "super_admin";

export interface MarkSheetActor {
  userId: string;
  role: MarkSheetActorRole;
}

const isAdmin = (role: MarkSheetActorRole): boolean => role !== "teacher";

// ─── Records ────────────────────────────────────────────────────────────────

export interface MarkSheetRow {
  studentUserId: string;
  studentName: string;
  systemId: string | null;
  rawScore: number | null;
  isAbsent: boolean;
}

export interface MarkSheet {
  exam: {
    id: string;
    name: string;
    termName: string;
    startsOn: string;
    endsOn: string;
    marksDueOn: string;
    status: "active" | "closed";
    marksEntryOpen: boolean;
  };
  subject: { id: string; code: string; name: string };
  class: { id: string; name: string };
  stream: { id: string; name: string } | null;
  /** A submitted slot is frozen — only a school admin can reopen it. */
  submitted: boolean;
  submittedAt: string | null;
  /** Whether *this* actor may currently edit the sheet. */
  editable: boolean;
  rows: MarkSheetRow[];
}

export interface MarkEntryInput {
  studentUserId: string;
  /** A 0–100 number to record a mark, or null to clear it. Ignored when isAbsent. */
  rawScore?: number | null;
  isAbsent?: boolean;
}

export interface AssignedExamSlot {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  classId: string;
  className: string;
  streamId: string | null;
  streamName: string | null;
  rosterCount: number;
  enteredCount: number;
  submitted: boolean;
}

export interface AssignedExam {
  examId: string;
  examName: string;
  termName: string;
  startsOn: string;
  endsOn: string;
  marksDueOn: string;
  marksEntryOpen: boolean;
  slots: AssignedExamSlot[];
}

export interface ExamCompletionSlot extends AssignedExamSlot {
  teacherName: string | null;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export class UnknownExamError extends Error {
  constructor() {
    super("That exam doesn't exist for this school.");
    this.name = "UnknownExamError";
  }
}

export class UnknownSlotError extends Error {
  constructor() {
    super("That subject / class / stream isn't a valid mark sheet for this exam.");
    this.name = "UnknownSlotError";
  }
}

export class NotAssignedError extends Error {
  constructor() {
    super("You aren't the assigned teacher for this subject and class.");
    this.name = "NotAssignedError";
  }
}

export class MarksEntryClosedError extends Error {
  constructor() {
    super("Marks entry isn't open for this exam — it's closed or outside the entry window.");
    this.name = "MarksEntryClosedError";
  }
}

export class MarkSheetLockedError extends Error {
  constructor() {
    super("This mark sheet has been submitted. Ask a school admin to reopen it.");
    this.name = "MarkSheetLockedError";
  }
}

export class InvalidScoreError extends Error {
  constructor() {
    super("Scores must be numbers between 0 and 100.");
    this.name = "InvalidScoreError";
  }
}

export class IncompleteMarkSheetError extends Error {
  constructor(public readonly missing: number) {
    super(`${missing} student${missing === 1 ? "" : "s"} still unmarked — enter a score or mark absent for everyone before submitting.`);
    this.name = "IncompleteMarkSheetError";
  }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

interface ExamContext {
  id: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  termName: string;
  name: string;
  startsOn: string;
  endsOn: string;
  marksDueOn: string;
  status: "active" | "closed";
  marksEntryOpen: boolean;
}

async function loadExam(schoolId: string, examId: string): Promise<ExamContext> {
  const { rows } = await pool.query<{
    id: string;
    school_id: string;
    academic_year_id: string;
    term_id: string;
    term_name: string;
    name: string;
    starts_on: string;
    ends_on: string;
    marks_due_on: string;
    status: "active" | "closed";
    marks_entry_open: boolean;
  }>(
    `select se.id, se.school_id, se.academic_year_id, se.term_id, t.name as term_name,
            se.name, se.starts_on, se.ends_on, se.marks_due_on, se.status,
            (se.status = 'active' and current_date between se.starts_on and se.marks_due_on)
              as marks_entry_open
       from school_exam se
       join terms t on t.id = se.term_id
      where se.id = $1 and se.school_id = $2`,
    [examId, schoolId],
  );
  if (!rows[0]) throw new UnknownExamError();
  const r = rows[0];
  return {
    id: r.id,
    schoolId: r.school_id,
    academicYearId: r.academic_year_id,
    termId: r.term_id,
    termName: r.term_name,
    name: r.name,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    marksDueOn: r.marks_due_on,
    status: r.status,
    marksEntryOpen: r.marks_entry_open,
  };
}

interface SlotRef {
  subjectId: string;
  classId: string;
  streamId: string | null;
}

interface ResolvedSlot {
  subject: { id: string; code: string; name: string };
  klass: { id: string; name: string };
  stream: { id: string; name: string } | null;
}

// Confirms the (subject, class, stream) triple is a real teaching slot for this
// exam's academic year, and returns its display names.
async function resolveSlot(exam: ExamContext, slot: SlotRef): Promise<ResolvedSlot> {
  const { rows } = await pool.query<{
    subject_id: string;
    subject_code: string;
    subject_name: string;
    class_id: string;
    class_name: string;
    stream_id: string | null;
    stream_name: string | null;
  }>(
    `select sta.subject_id, sub.code as subject_code, sub.name as subject_name,
            sta.class_id, cs.name as class_name,
            sta.stream_id, st.name as stream_name
       from subject_teacher_assignment sta
       join subject sub on sub.id = sta.subject_id
       join classes c on c.id = sta.class_id
       join curriculum_stage cs on cs.id = c.curriculum_stage_id
       left join streams st on st.id = sta.stream_id
      where sta.school_id = $1 and sta.academic_year_id = $2 and sta.status = 'active'
        and sta.subject_id = $3 and sta.class_id = $4
        and coalesce(sta.stream_id, $5) = coalesce($6::uuid, $5)
      limit 1`,
    [exam.schoolId, exam.academicYearId, slot.subjectId, slot.classId, STREAM_SENTINEL, slot.streamId],
  );
  if (!rows[0]) throw new UnknownSlotError();
  const r = rows[0];
  return {
    subject: { id: r.subject_id, code: r.subject_code, name: r.subject_name },
    klass: { id: r.class_id, name: r.class_name },
    stream: r.stream_id ? { id: r.stream_id, name: r.stream_name ?? "" } : null,
  };
}

// Is this actor allowed to touch this slot's marks at all? Teachers must hold an
// active subject_teacher_assignment for the exact slot; admins always may.
async function assertActorOwnsSlot(
  exam: ExamContext,
  slot: SlotRef,
  actor: MarkSheetActor,
): Promise<void> {
  if (isAdmin(actor.role)) return;
  const { rowCount } = await pool.query(
    `select 1 from subject_teacher_assignment
      where school_id = $1 and academic_year_id = $2 and status = 'active'
        and staff_id = $3 and subject_id = $4 and class_id = $5
        and coalesce(stream_id, $6) = coalesce($7::uuid, $6)`,
    [exam.schoolId, exam.academicYearId, actor.userId, slot.subjectId, slot.classId, STREAM_SENTINEL, slot.streamId],
  );
  if (!rowCount) throw new NotAssignedError();
}

async function isSlotSubmitted(exam: ExamContext, slot: SlotRef): Promise<string | null> {
  const { rows } = await pool.query<{ submitted_at: string }>(
    `select submitted_at from exam_subject_submission
      where school_exam_id = $1 and subject_id = $2 and class_id = $3
        and coalesce(stream_id, $4) = coalesce($5::uuid, $4)`,
    [exam.id, slot.subjectId, slot.classId, STREAM_SENTINEL, slot.streamId],
  );
  return rows[0]?.submitted_at ?? null;
}

// Teachers may edit only while marks entry is open AND the slot is unsubmitted.
// A school admin may edit whenever the exam itself is still active (the
// "override" path), but a submitted slot must be explicitly reopened first.
function canEdit(exam: ExamContext, submitted: boolean, actor: MarkSheetActor): boolean {
  if (submitted) return false;
  if (isAdmin(actor.role)) return exam.status === "active";
  return exam.marksEntryOpen;
}

function assertEditable(exam: ExamContext, submitted: boolean, actor: MarkSheetActor): void {
  if (submitted) throw new MarkSheetLockedError();
  if (!canEdit(exam, submitted, actor)) throw new MarksEntryClosedError();
}

interface RosterEntry {
  studentUserId: string;
  studentName: string;
  systemId: string | null;
}

// The students who should appear on a subject's mark sheet: everyone with an
// active enrollment in the class (and stream, if the slot has one) for the
// exam's academic year, INTERSECTED with the subject's registration —
// student_subject rows with status active/added. Fallback: a student who has no
// student_subject rows at all for that year (subject selection never done for
// them) is included regardless.
async function roster(db: Db, exam: ExamContext, slot: SlotRef): Promise<RosterEntry[]> {
  const { rows } = await db.query<{
    student_user_id: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    system_id: string | null;
  }>(
    `select en.student_user_id, s.first_name, s.middle_name, s.last_name, u.system_id
       from student_enrollment en
       join students s on s.user_id = en.student_user_id
       join users u on u.id = en.student_user_id
      where en.school_id = $1 and en.academic_year_id = $2 and en.class_id = $3
        and en.status = 'active'
        and ($4::uuid is null or en.stream_id = $4::uuid)
        and (
          not exists (
            select 1 from student_subject ss
             where ss.student_user_id = en.student_user_id and ss.academic_year_id = $2
          )
          or exists (
            select 1 from student_subject ss
             where ss.student_user_id = en.student_user_id and ss.academic_year_id = $2
               and ss.subject_id = $5 and ss.status in ('active', 'added')
          )
        )
      order by s.last_name, s.first_name`,
    [exam.schoolId, exam.academicYearId, slot.classId, slot.streamId, slot.subjectId],
  );
  return rows.map((r) => ({
    studentUserId: r.student_user_id,
    studentName: [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" "),
    systemId: r.system_id,
  }));
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function getMarkSheet(
  schoolId: string,
  examId: string,
  slot: SlotRef,
  actor: MarkSheetActor,
): Promise<MarkSheet> {
  const exam = await loadExam(schoolId, examId);
  const resolved = await resolveSlot(exam, slot);
  await assertActorOwnsSlot(exam, slot, actor);

  const submittedAt = await isSlotSubmitted(exam, slot);
  const submitted = submittedAt !== null;

  const students = await roster(pool, exam, slot);
  const { rows: marks } = await pool.query<{
    student_user_id: string;
    raw_score: string | null;
    is_absent: boolean;
  }>(
    `select student_user_id, raw_score, is_absent
       from exam_result where school_exam_id = $1 and subject_id = $2`,
    [exam.id, slot.subjectId],
  );
  const byStudent = new Map(marks.map((m) => [m.student_user_id, m]));

  return {
    exam: {
      id: exam.id,
      name: exam.name,
      termName: exam.termName,
      startsOn: exam.startsOn,
      endsOn: exam.endsOn,
      marksDueOn: exam.marksDueOn,
      status: exam.status,
      marksEntryOpen: exam.marksEntryOpen,
    },
    subject: resolved.subject,
    class: resolved.klass,
    stream: resolved.stream,
    submitted,
    submittedAt,
    editable: canEdit(exam, submitted, actor),
    rows: students.map((s) => {
      const m = byStudent.get(s.studentUserId);
      return {
        studentUserId: s.studentUserId,
        studentName: s.studentName,
        systemId: s.systemId,
        rawScore: m && m.raw_score !== null ? Number(m.raw_score) : null,
        isAbsent: m?.is_absent ?? false,
      };
    }),
  };
}

function normaliseScore(entry: MarkEntryInput): { isAbsent: boolean; rawScore: number | null } | null {
  if (entry.isAbsent) return { isAbsent: true, rawScore: null };
  const raw = entry.rawScore;
  if (raw === null || raw === undefined) return null; // clear the mark
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 100) {
    throw new InvalidScoreError();
  }
  return { isAbsent: false, rawScore: Math.round(raw * 100) / 100 };
}

export async function saveMarks(
  schoolId: string,
  examId: string,
  slot: SlotRef,
  entries: MarkEntryInput[],
  actor: MarkSheetActor,
): Promise<MarkSheet> {
  const exam = await loadExam(schoolId, examId);
  await resolveSlot(exam, slot);
  await assertActorOwnsSlot(exam, slot, actor);
  const submitted = (await isSlotSubmitted(exam, slot)) !== null;
  assertEditable(exam, submitted, actor);

  const client = await pool.connect();
  try {
    await client.query("begin");
    const allowed = new Set((await roster(client, exam, slot)).map((r) => r.studentUserId));

    for (const entry of entries) {
      if (!allowed.has(entry.studentUserId)) continue; // silently skip anyone off the sheet
      const value = normaliseScore(entry);
      if (value === null) {
        await client.query(
          `delete from exam_result where school_exam_id = $1 and subject_id = $2 and student_user_id = $3`,
          [exam.id, slot.subjectId, entry.studentUserId],
        );
        continue;
      }
      await client.query(
        `insert into exam_result
           (school_exam_id, student_user_id, subject_id, raw_score, is_absent, entered_by)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (school_exam_id, student_user_id, subject_id) do update
           set raw_score = excluded.raw_score,
               is_absent = excluded.is_absent,
               entered_by = excluded.entered_by,
               updated_at = now()`,
        [exam.id, entry.studentUserId, slot.subjectId, value.rawScore, value.isAbsent, actor.userId],
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  return getMarkSheet(schoolId, examId, slot, actor);
}

export async function submitMarkSheet(
  schoolId: string,
  examId: string,
  slot: SlotRef,
  actor: MarkSheetActor,
): Promise<MarkSheet> {
  const exam = await loadExam(schoolId, examId);
  await resolveSlot(exam, slot);
  await assertActorOwnsSlot(exam, slot, actor);
  const alreadySubmitted = (await isSlotSubmitted(exam, slot)) !== null;
  if (alreadySubmitted) return getMarkSheet(schoolId, examId, slot, actor);
  assertEditable(exam, false, actor);

  const students = await roster(pool, exam, slot);
  const { rows: marked } = await pool.query<{ n: string }>(
    `select count(*)::text as n from exam_result
      where school_exam_id = $1 and subject_id = $2 and student_user_id = any($3::uuid[])`,
    [exam.id, slot.subjectId, students.map((s) => s.studentUserId)],
  );
  const missing = students.length - Number(marked[0].n);
  if (missing > 0) throw new IncompleteMarkSheetError(missing);

  await pool.query(
    `insert into exam_subject_submission (school_exam_id, subject_id, class_id, stream_id, submitted_by)
     values ($1, $2, $3, $4, $5)
     on conflict do nothing`,
    [exam.id, slot.subjectId, slot.classId, slot.streamId, actor.userId],
  );
  return getMarkSheet(schoolId, examId, slot, actor);
}

export async function reopenMarkSheet(
  schoolId: string,
  examId: string,
  slot: SlotRef,
  actor: MarkSheetActor,
): Promise<MarkSheet> {
  const exam = await loadExam(schoolId, examId);
  await resolveSlot(exam, slot);
  // Route already gates this to admins, but be explicit.
  if (!isAdmin(actor.role)) throw new NotAssignedError();
  await pool.query(
    `delete from exam_subject_submission
      where school_exam_id = $1 and subject_id = $2 and class_id = $3
        and coalesce(stream_id, $4) = coalesce($5::uuid, $4)`,
    [exam.id, slot.subjectId, slot.classId, STREAM_SENTINEL, slot.streamId],
  );
  return getMarkSheet(schoolId, examId, slot, actor);
}

// Shared shape for the teacher portal ("my sheets") and the admin completion
// view. `staffId` null → every slot for the exam (admin); set → just that
// teacher's slots.
async function slotsForExam(
  exam: ExamContext,
  staffId: string | null,
): Promise<ExamCompletionSlot[]> {
  const { rows } = await pool.query<{
    subject_id: string;
    subject_code: string;
    subject_name: string;
    class_id: string;
    class_name: string;
    stream_id: string | null;
    stream_name: string | null;
    teacher_first: string | null;
    teacher_last: string | null;
    roster_count: string;
    entered_count: string;
    submitted: boolean;
  }>(
    `select sta.subject_id, sub.code as subject_code, sub.name as subject_name,
            sta.class_id, cs.name as class_name,
            sta.stream_id, st.name as stream_name,
            tf.first_name as teacher_first, tf.last_name as teacher_last,
            (
              select count(*) from student_enrollment en
               join students s2 on s2.user_id = en.student_user_id
               where en.school_id = $1 and en.academic_year_id = $2
                 and en.class_id = sta.class_id and en.status = 'active'
                 and (sta.stream_id is null or en.stream_id = sta.stream_id)
                 and (
                   not exists (select 1 from student_subject ss
                                where ss.student_user_id = en.student_user_id and ss.academic_year_id = $2)
                   or exists (select 1 from student_subject ss
                               where ss.student_user_id = en.student_user_id and ss.academic_year_id = $2
                                 and ss.subject_id = sta.subject_id and ss.status in ('active','added'))
                 )
            )::text as roster_count,
            (
              select count(*) from exam_result er
               join student_enrollment en2 on en2.student_user_id = er.student_user_id
               where er.school_exam_id = $3 and er.subject_id = sta.subject_id
                 and en2.school_id = $1 and en2.academic_year_id = $2
                 and en2.class_id = sta.class_id and en2.status = 'active'
                 and (sta.stream_id is null or en2.stream_id = sta.stream_id)
            )::text as entered_count,
            exists (
              select 1 from exam_subject_submission sm
               where sm.school_exam_id = $3 and sm.subject_id = sta.subject_id
                 and sm.class_id = sta.class_id
                 and coalesce(sm.stream_id, $5) = coalesce(sta.stream_id, $5)
            ) as submitted
       from subject_teacher_assignment sta
       join subject sub on sub.id = sta.subject_id
       join classes c on c.id = sta.class_id
       join curriculum_stage cs on cs.id = c.curriculum_stage_id
       left join streams st on st.id = sta.stream_id
       left join staff tf on tf.user_id = sta.staff_id
      where sta.school_id = $1 and sta.academic_year_id = $2 and sta.status = 'active'
        and sta.is_lead = true
        and ($4::uuid is null or sta.staff_id = $4::uuid)
      order by cs.name, st.name nulls first, sub.name`,
    [exam.schoolId, exam.academicYearId, exam.id, staffId, STREAM_SENTINEL],
  );

  return rows.map((r) => ({
    subjectId: r.subject_id,
    subjectCode: r.subject_code,
    subjectName: r.subject_name,
    classId: r.class_id,
    className: r.class_name,
    streamId: r.stream_id,
    streamName: r.stream_name,
    rosterCount: Number(r.roster_count),
    enteredCount: Number(r.entered_count),
    submitted: r.submitted,
    teacherName: [r.teacher_first, r.teacher_last].filter(Boolean).join(" ") || null,
  }));
}

// Teacher portal: the exams a teacher has marks to enter for, each with their
// own subject/class/stream slots. Only exams whose status is 'active'.
export async function listAssignedExams(
  schoolId: string,
  staffId: string,
): Promise<AssignedExam[]> {
  const { rows: exams } = await pool.query<{
    id: string;
    academic_year_id: string;
    term_id: string;
    term_name: string;
    name: string;
    starts_on: string;
    ends_on: string;
    marks_due_on: string;
    status: "active" | "closed";
    marks_entry_open: boolean;
  }>(
    `select distinct se.id, se.academic_year_id, se.term_id, t.name as term_name, se.name,
            se.starts_on, se.ends_on, se.marks_due_on, se.status,
            (se.status = 'active' and current_date between se.starts_on and se.marks_due_on)
              as marks_entry_open
       from school_exam se
       join terms t on t.id = se.term_id
       join subject_teacher_assignment sta
         on sta.school_id = se.school_id and sta.academic_year_id = se.academic_year_id
        and sta.staff_id = $2 and sta.status = 'active' and sta.is_lead = true
      where se.school_id = $1 and se.status = 'active'
      order by se.starts_on desc`,
    [schoolId, staffId],
  );

  const out: AssignedExam[] = [];
  for (const e of exams) {
    const exam: ExamContext = {
      id: e.id,
      schoolId,
      academicYearId: e.academic_year_id,
      termId: e.term_id,
      termName: e.term_name,
      name: e.name,
      startsOn: e.starts_on,
      endsOn: e.ends_on,
      marksDueOn: e.marks_due_on,
      status: e.status,
      marksEntryOpen: e.marks_entry_open,
    };
    const slots = await slotsForExam(exam, staffId);
    out.push({
      examId: e.id,
      examName: e.name,
      termName: e.term_name,
      startsOn: e.starts_on,
      endsOn: e.ends_on,
      marksDueOn: e.marks_due_on,
      marksEntryOpen: e.marks_entry_open,
      slots,
    });
  }
  return out;
}

// Admin completion view for one exam — every teaching slot with progress.
export async function examCompletion(
  schoolId: string,
  examId: string,
): Promise<{ exam: MarkSheet["exam"]; slots: ExamCompletionSlot[] }> {
  const exam = await loadExam(schoolId, examId);
  const slots = await slotsForExam(exam, null);
  return {
    exam: {
      id: exam.id,
      name: exam.name,
      termName: exam.termName,
      startsOn: exam.startsOn,
      endsOn: exam.endsOn,
      marksDueOn: exam.marksDueOn,
      status: exam.status,
      marksEntryOpen: exam.marksEntryOpen,
    },
    slots,
  };
}
