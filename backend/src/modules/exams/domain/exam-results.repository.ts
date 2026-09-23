import type { SchoolLevel } from "../../../shared/levels.js";
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

export interface SubjectVariantSummary {
  id: string;
  name: string;
  code: string;
  contributionPercent: number;
}

export interface VariantScore {
  variantId: string;
  rawScore: number | null;
  isAbsent: boolean;
}

export interface MarkSheetRow {
  studentUserId: string;
  studentName: string;
  systemId: string | null;
  /** For a non-variant subject, the entered mark. For a variant subject, the
   * MERGED (weighted-sum) mark, computed on read — never stored. Null while
   * any variant is still unmarked; see mergeVariantScore. */
  rawScore: number | null;
  isAbsent: boolean;
  /** Present only when `subject.hasVariant` — one entry per variant, in
   * `subject.variants` order. */
  variantScores?: VariantScore[];
  /** Set only by publishing the exam (school-exams.repository.ts
   * publishSchoolExam) — null until then. For a variant subject this is the
   * grade of the MERGED score (mergeVariantScore), not any one paper's —
   * publish writes it identically onto every variant row for the student,
   * since papers are entered out of 100% each but graded as one subject.
   * See migration 1700000054000_publish-exam-results. */
  computedGrade?: string | null;
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
    publishedAt: string | null;
  };
  subject: {
    id: string;
    code: string;
    name: string;
    hasVariant: boolean;
    variants: SubjectVariantSummary[];
  };
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
  /** Required when the subject has variants — which paper this entry is for. */
  variantId?: string | null;
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

// ─── Report card (roadmap Step 5 — compiled, whole-exam view) ─────────────

/** Every A-Level subject is "subsidiary" (subject.category = 'subsidiary' —
 * General Paper plus whichever subsidiary the student's combination adds) or
 * "principal" (everything else — the combination's own members). O-Level has
 * no such split; every O-Level subject reports as "principal" and the report
 * card ignores the distinction for that phase. */
export type ReportSubjectRole = "principal" | "subsidiary";

/** A PLE-style division band over an aggregate (lower is better) — mirrors
 * grading_scheme.divisions. */
export interface GradeDivision {
  label: string;
  minAggregate: number;
  maxAggregate: number;
}

export interface ReportCardSubject {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  /** e.g. "Bio", "Chem" — the catalog's short form, for compact renders like
   * the heatmap's column headers where the full name or the code (a
   * database identifier, not an abbreviation — e.g. "S005") don't fit. */
  subjectShortName: string;
  role: ReportSubjectRole;
  teacherName: string | null;
  rosterCount: number;
  enteredCount: number;
  submitted: boolean;
  /** Class average score for this subject, among students with a mark. Null
   * if nobody in this class/stream has been marked yet. */
  average: number | null;
}

export interface ReportCardStudentSubject {
  subjectId: string;
  subjectName: string;
  role: ReportSubjectRole;
  hasVariant: boolean;
  /** Present only when hasVariant — the individual papers behind rawScore's
   * weighted merge, e.g. Theory/Practical. */
  variantScores?: { name: string; rawScore: number | null; isAbsent: boolean }[];
  rawScore: number | null;
  isAbsent: boolean;
  computedGrade: string | null;
  /** Primary only: counts toward the PLE aggregate (English, Maths, Science,
   * SST) — false for taught-but-not-examined subjects. */
  isExaminable: boolean;
  /** Primary only: the band's points for this score (D1 = 1 … F9 = 9).
   * Null elsewhere, or with no score yet. */
  points: number | null;
  /** Primary only: the live band label for rawScore (D1 … F9), so an
   * unpublished exam still shows grades. `computedGrade` (frozen at publish)
   * wins when set. */
  bandGrade: string | null;
}

export interface ReportCardStudent {
  studentUserId: string;
  studentName: string;
  systemId: string | null;
  streamId: string | null;
  streamName: string | null;
  /** O-Level only: mean of every subject score, one blended grade — there's
   * no principal/subsidiary split at this phase. Null for A-Level (use the
   * principal/subsidiary fields instead) or if nothing's been entered yet. */
  average: number | null;
  overallGrade: string | null;
  /** The grade band's own remark (grade_band.comment), reused as the
   * report's teacher-remark equivalent rather than a fabricated comment. */
  overallComment: string | null;
  /** A-Level only: mean of principal-subject scores — what actually ranks
   * students (subsidiaries don't count toward the ranking). Null for
   * O-Level. */
  principalAverage: number | null;
  principalGrade: string | null;
  principalComment: string | null;
  /** A-Level only: mean of subsidiary-subject scores (General Paper + the
   * combination's chosen subsidiary), graded on the school's separate
   * subsidiary scheme. Reported alongside, not blended into, the principal
   * average. Null for O-Level. */
  subsidiaryAverage: number | null;
  subsidiaryGrade: string | null;
  subsidiaryComment: string | null;
  /** Primary only: sum of the points of the best N examinable subjects
   * (PLE: 4 → aggregate 4–36, lower is better). Null until every one of
   * those N subjects has a score. */
  aggregate: number | null;
  /** Primary only: the scheme's division for `aggregate` ("Division 1"). */
  division: string | null;
  /** 1-based position, best first — by `aggregate` (then average) for
   * Primary, `average` for O-Level, `principalAverage` for A-Level. Null
   * (unranked) with no score yet. */
  rank: number | null;
  subjects: ReportCardStudentSubject[];
}

export interface ExamReportCard {
  exam: { id: string; name: string; termName: string; publishedAt: string | null };
  class: { id: string; name: string; phase: SchoolLevel };
  stream: { id: string; name: string } | null;
  subjects: ReportCardSubject[];
  /** Principal-subject grade counts (O-Level: every subject, since there's
   * no principal/subsidiary split at that phase). */
  gradeDistribution: { grade: string; count: number }[];
  /** A-Level only — subsidiary-subject grade counts, on the separate
   * subsidiary scheme (its own grade vocabulary, e.g. Pass/Fail). Empty for
   * O-Level. */
  subsidiaryGradeDistribution: { grade: string; count: number }[];
  /** Primary only — the aggregate rule in force (from the school's PLE
   * scheme) and how many students landed in each division. */
  aggregation: { subjectCount: number; divisions: GradeDivision[] } | null;
  divisionDistribution: { division: string; count: number }[];
  /** Only populated when viewing the whole class (no stream filter) and the
   * class actually has streams. */
  streamAverages: { streamId: string; streamName: string; average: number }[];
  students: ReportCardStudent[];
  /** By principalAverage for A-Level, average for O-Level — see ReportCardStudent. */
  topPerformers: ReportCardStudent[];
  needsAttention: ReportCardStudent[];
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

export class ExamPublishedError extends Error {
  constructor() {
    super("This exam's results have been published. Ask a school admin to unpublish it before editing marks.");
    this.name = "ExamPublishedError";
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

export class UnknownClassError extends Error {
  constructor() {
    super("That class doesn't exist for this school.");
    this.name = "UnknownClassError";
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
  publishedAt: string | null;
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
    published_at: string | null;
  }>(
    `select se.id, se.school_id, se.academic_year_id, se.term_id, t.name as term_name,
            se.name, se.starts_on, se.ends_on, se.marks_due_on, se.status, se.published_at,
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
    publishedAt: r.published_at,
  };
}

interface SlotRef {
  subjectId: string;
  classId: string;
  streamId: string | null;
}

interface ResolvedSlot {
  subject: { id: string; code: string; name: string; hasVariant: boolean; variants: SubjectVariantSummary[] };
  klass: { id: string; name: string };
  stream: { id: string; name: string } | null;
}

// Confirms the (subject, class, stream) triple is a real teaching slot for this
// exam's academic year, and returns its display names plus the subject's
// variant configuration (empty unless it has one).
async function resolveSlot(exam: ExamContext, slot: SlotRef): Promise<ResolvedSlot> {
  const { rows } = await pool.query<{
    subject_id: string;
    subject_code: string;
    subject_name: string;
    has_variant: boolean;
    variants: SubjectVariantSummary[];
    class_id: string;
    class_name: string;
    stream_id: string | null;
    stream_name: string | null;
  }>(
    `select sta.subject_id, sub.code as subject_code, sub.name as subject_name, sub.has_variant,
            (select coalesce(json_agg(json_build_object(
                     'id', sv.id, 'name', sv.name, 'code', sv.code,
                     'contributionPercent', sv.contribution_percent
                   ) order by sv.code), '[]'::json)
               from subject_variant sv where sv.subject_id = sub.id) as variants,
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
    subject: {
      id: r.subject_id,
      code: r.subject_code,
      name: r.subject_name,
      hasVariant: r.has_variant,
      variants: r.variants,
    },
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
// Once the whole exam is published, nobody may edit until a school admin
// unpublishes it — a published grade shouldn't silently drift out of sync
// with a mark someone then changes.
function canEdit(exam: ExamContext, submitted: boolean, actor: MarkSheetActor): boolean {
  if (exam.publishedAt !== null) return false;
  if (submitted) return false;
  if (isAdmin(actor.role)) return exam.status === "active";
  return exam.marksEntryOpen;
}

function assertEditable(exam: ExamContext, submitted: boolean, actor: MarkSheetActor): void {
  if (exam.publishedAt !== null) throw new ExamPublishedError();
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

// The subject's final mark from its variant scores — a weighted sum, computed
// fresh every read, never stored. Rules:
//   - every variant absent      -> the subject itself is absent (null score)
//   - any variant still unmarked (and not absent) -> not yet computable
//     (null score, not absent — "incomplete", distinct from "absent")
//   - every variant has a real score -> the weighted sum
export function mergeVariantScore(
  variantScores: VariantScore[],
  variants: SubjectVariantSummary[],
): { rawScore: number | null; isAbsent: boolean } {
  if (variantScores.length === 0) return { rawScore: null, isAbsent: false };
  if (variantScores.every((v) => v.isAbsent)) return { rawScore: null, isAbsent: true };
  if (variantScores.some((v) => v.rawScore === null)) return { rawScore: null, isAbsent: false };
  const contributionById = new Map(variants.map((v) => [v.id, v.contributionPercent]));
  const weighted = variantScores.reduce(
    (sum, v) => sum + (v.rawScore! * (contributionById.get(v.variantId) ?? 0)) / 100,
    0,
  );
  return { rawScore: Math.round(weighted * 100) / 100, isAbsent: false };
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
    subject_variant_id: string | null;
    raw_score: string | null;
    is_absent: boolean;
    computed_grade: string | null;
  }>(
    `select student_user_id, subject_variant_id, raw_score, is_absent, computed_grade
       from exam_result where school_exam_id = $1 and subject_id = $2`,
    [exam.id, slot.subjectId],
  );
  const byStudent = new Map<string, typeof marks>();
  for (const m of marks) {
    const list = byStudent.get(m.student_user_id);
    if (list) list.push(m);
    else byStudent.set(m.student_user_id, [m]);
  }

  const { hasVariant, variants } = resolved.subject;

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
      publishedAt: exam.publishedAt,
    },
    subject: resolved.subject,
    class: resolved.klass,
    stream: resolved.stream,
    submitted,
    submittedAt,
    editable: canEdit(exam, submitted, actor),
    rows: students.map((s) => {
      const studentMarks = byStudent.get(s.studentUserId) ?? [];
      if (!hasVariant) {
        const m = studentMarks[0];
        return {
          studentUserId: s.studentUserId,
          studentName: s.studentName,
          systemId: s.systemId,
          rawScore: m && m.raw_score !== null ? Number(m.raw_score) : null,
          isAbsent: m?.is_absent ?? false,
          computedGrade: m?.computed_grade ?? null,
        };
      }
      const variantScores: VariantScore[] = variants.map((v) => {
        const m = studentMarks.find((x) => x.subject_variant_id === v.id);
        return {
          variantId: v.id,
          rawScore: m && m.raw_score !== null ? Number(m.raw_score) : null,
          isAbsent: m?.is_absent ?? false,
        };
      });
      const merged = mergeVariantScore(variantScores, variants);
      // Publishing writes the SAME grade (of the merged score) onto every
      // variant row for a student — any row's computed_grade is the subject's.
      const computedGrade = studentMarks.find((m) => m.computed_grade !== null)?.computed_grade ?? null;
      return {
        studentUserId: s.studentUserId,
        studentName: s.studentName,
        systemId: s.systemId,
        rawScore: merged.rawScore,
        isAbsent: merged.isAbsent,
        variantScores,
        computedGrade,
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
  const resolved = await resolveSlot(exam, slot);
  await assertActorOwnsSlot(exam, slot, actor);
  const submitted = (await isSlotSubmitted(exam, slot)) !== null;
  assertEditable(exam, submitted, actor);

  const { hasVariant, variants } = resolved.subject;
  const validVariantIds = new Set(variants.map((v) => v.id));

  const client = await pool.connect();
  try {
    await client.query("begin");
    const allowed = new Set((await roster(client, exam, slot)).map((r) => r.studentUserId));

    for (const entry of entries) {
      if (!allowed.has(entry.studentUserId)) continue; // silently skip anyone off the sheet
      // A variant subject needs a real variant id per entry; a plain subject
      // ignores any stray one — either way this is one column on one sheet.
      const variantId = hasVariant ? (entry.variantId ?? null) : null;
      if (hasVariant && (!variantId || !validVariantIds.has(variantId))) continue;

      const value = normaliseScore(entry);
      if (value === null) {
        await client.query(
          `delete from exam_result
             where school_exam_id = $1 and subject_id = $2 and student_user_id = $3
               and coalesce(subject_variant_id, $4) = coalesce($5::uuid, $4)`,
          [exam.id, slot.subjectId, entry.studentUserId, STREAM_SENTINEL, variantId],
        );
        continue;
      }
      await client.query(
        `insert into exam_result
           (school_exam_id, student_user_id, subject_id, subject_variant_id, raw_score, is_absent, entered_by)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (school_exam_id, student_user_id, subject_id, coalesce(subject_variant_id, '00000000-0000-0000-0000-000000000000'))
         do update
           set raw_score = excluded.raw_score,
               is_absent = excluded.is_absent,
               entered_by = excluded.entered_by,
               updated_at = now()`,
        [exam.id, entry.studentUserId, slot.subjectId, variantId, value.rawScore, value.isAbsent, actor.userId],
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
  const resolved = await resolveSlot(exam, slot);
  await assertActorOwnsSlot(exam, slot, actor);
  const alreadySubmitted = (await isSlotSubmitted(exam, slot)) !== null;
  if (alreadySubmitted) return getMarkSheet(schoolId, examId, slot, actor);
  assertEditable(exam, false, actor);

  // "Marked" means one exam_result row per variant (or just one, for a plain
  // subject) — a student who's only had their Theory paper entered isn't done.
  const requiredPerStudent = resolved.subject.hasVariant ? resolved.subject.variants.length : 1;
  const students = await roster(pool, exam, slot);
  const { rows: marked } = await pool.query<{ student_user_id: string; n: string }>(
    `select student_user_id, count(*)::text as n from exam_result
      where school_exam_id = $1 and subject_id = $2 and student_user_id = any($3::uuid[])
      group by student_user_id`,
    [exam.id, slot.subjectId, students.map((s) => s.studentUserId)],
  );
  const countByStudent = new Map(marked.map((m) => [m.student_user_id, Number(m.n)]));
  const missing = students.filter((s) => (countByStudent.get(s.studentUserId) ?? 0) < requiredPerStudent).length;
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
              -- A student counts as "entered" once they have one exam_result
              -- row per subject variant (or just one, for a plain subject) —
              -- matches submitMarkSheet's completeness rule.
              select count(*) from (
                select er.student_user_id
                  from exam_result er
                  join student_enrollment en2 on en2.student_user_id = er.student_user_id
                 where er.school_exam_id = $3 and er.subject_id = sta.subject_id
                   and en2.school_id = $1 and en2.academic_year_id = $2
                   and en2.class_id = sta.class_id and en2.status = 'active'
                   and (sta.stream_id is null or en2.stream_id = sta.stream_id)
                 group by er.student_user_id
                having count(*) >= greatest(1, (
                  select count(*) from subject_variant sv where sv.subject_id = sta.subject_id
                ))
              ) complete
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
    published_at: string | null;
  }>(
    `select distinct se.id, se.academic_year_id, se.term_id, t.name as term_name, se.name,
            se.starts_on, se.ends_on, se.marks_due_on, se.status, se.published_at,
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
      publishedAt: e.published_at,
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

// ─── Student / parent self-service (published results only) ───────────────

export interface PublishedExamSummary {
  id: string;
  name: string;
  termName: string;
  startsOn: string;
  endsOn: string;
  publishedAt: string;
}

// Every exam a student has published results for. Scoped entirely by their
// own exam_result rows — no need to know their class/stream, same shortcut
// publishSchoolExam relies on.
export async function listPublishedExamsForStudent(
  schoolId: string,
  studentUserId: string,
): Promise<PublishedExamSummary[]> {
  const { rows } = await pool.query<{
    id: string;
    name: string;
    term_name: string;
    starts_on: string;
    ends_on: string;
    published_at: string;
  }>(
    `select distinct se.id, se.name, t.name as term_name, se.starts_on, se.ends_on, se.published_at
       from exam_result er
       join school_exam se on se.id = er.school_exam_id
       join terms t on t.id = se.term_id
      where er.student_user_id = $1 and se.school_id = $2 and se.published_at is not null
      order by se.starts_on desc`,
    [studentUserId, schoolId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    termName: r.term_name,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    publishedAt: r.published_at,
  }));
}

export interface StudentSubjectResult {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  hasVariant: boolean;
  variantScores?: { variantId: string; name: string; rawScore: number | null; isAbsent: boolean }[];
  rawScore: number | null;
  isAbsent: boolean;
  computedGrade: string | null;
  comment: string | null;
}

export interface StudentExamResult {
  exam: { id: string; name: string; termName: string; startsOn: string; endsOn: string; publishedAt: string };
  subjects: StudentSubjectResult[];
}

// A single student's full breakdown for one published exam. Returns null if
// the exam doesn't belong to this school, isn't published, or the student has
// no results on it at all — every case is a plain 404 to the caller.
export async function getStudentExamResult(
  schoolId: string,
  examId: string,
  studentUserId: string,
): Promise<StudentExamResult | null> {
  const { rows: examRows } = await pool.query<{
    id: string;
    name: string;
    term_name: string;
    starts_on: string;
    ends_on: string;
    published_at: string | null;
  }>(
    `select se.id, se.name, t.name as term_name, se.starts_on, se.ends_on, se.published_at
       from school_exam se
       join terms t on t.id = se.term_id
      where se.id = $1 and se.school_id = $2`,
    [examId, schoolId],
  );
  const exam = examRows[0];
  if (!exam || !exam.published_at) return null;

  const { rows } = await pool.query<{
    subject_id: string;
    subject_name: string;
    subject_code: string;
    has_variant: boolean;
    subject_variant_id: string | null;
    variant_name: string | null;
    variant_contribution_percent: string | null;
    raw_score: string | null;
    is_absent: boolean;
    computed_grade: string | null;
    grading_scheme_id: string | null;
    comment: string | null;
  }>(
    `select er.subject_id, sub.name as subject_name, sub.code as subject_code, sub.has_variant,
            er.subject_variant_id, sv.name as variant_name, sv.contribution_percent as variant_contribution_percent,
            er.raw_score, er.is_absent, er.computed_grade, er.grading_scheme_id,
            gb.comment
       from exam_result er
       join subject sub on sub.id = er.subject_id
       left join subject_variant sv on sv.id = er.subject_variant_id
       left join grade_band gb
         on gb.grading_scheme_id = er.grading_scheme_id and gb.label = er.computed_grade
      where er.school_exam_id = $1 and er.student_user_id = $2
      order by sub.name, sv.code`,
    [examId, studentUserId],
  );
  if (rows.length === 0) return null;

  const bySubject = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = bySubject.get(r.subject_id);
    if (list) list.push(r);
    else bySubject.set(r.subject_id, [r]);
  }

  const subjects: StudentSubjectResult[] = [...bySubject.values()].map((subjectRows) => {
    const first = subjectRows[0];
    const computedGrade = subjectRows.find((r) => r.computed_grade !== null)?.computed_grade ?? null;
    const comment = subjectRows.find((r) => r.comment !== null)?.comment ?? null;

    if (!first.has_variant) {
      return {
        subjectId: first.subject_id,
        subjectName: first.subject_name,
        subjectCode: first.subject_code,
        hasVariant: false,
        rawScore: first.raw_score !== null ? Number(first.raw_score) : null,
        isAbsent: first.is_absent,
        computedGrade,
        comment,
      };
    }

    const variantRows = subjectRows.filter((r) => r.subject_variant_id !== null);
    const variantScores = variantRows.map((r) => ({
      variantId: r.subject_variant_id!,
      name: r.variant_name ?? "",
      rawScore: r.raw_score !== null ? Number(r.raw_score) : null,
      isAbsent: r.is_absent,
    }));
    const merged = mergeVariantScore(
      variantScores.map((v) => ({ variantId: v.variantId, rawScore: v.rawScore, isAbsent: v.isAbsent })),
      variantRows.map((r) => ({
        id: r.subject_variant_id!,
        name: r.variant_name ?? "",
        code: r.variant_name ?? "",
        contributionPercent: r.variant_contribution_percent !== null ? Number(r.variant_contribution_percent) : 0,
      })),
    );
    return {
      subjectId: first.subject_id,
      subjectName: first.subject_name,
      subjectCode: first.subject_code,
      hasVariant: true,
      variantScores,
      rawScore: merged.rawScore,
      isAbsent: merged.isAbsent,
      computedGrade,
      comment,
    };
  });

  return {
    exam: {
      id: exam.id,
      name: exam.name,
      termName: exam.term_name,
      startsOn: exam.starts_on,
      endsOn: exam.ends_on,
      publishedAt: exam.published_at,
    },
    subjects,
  };
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
      publishedAt: exam.publishedAt,
    },
    slots,
  };
}

// Compiles one class's (or one stream's) results for an exam into a report
// card: per-subject summary (reusing examCompletion's numbers, scoped down),
// per-student totals/rank/overall grade, and the aggregates the studio's
// charts need. Everything here is read fresh from exam_result — nothing is
// stored, so it always reflects the latest marks.
export async function getExamReportCard(
  schoolId: string,
  examId: string,
  classId: string,
  streamId: string | null,
): Promise<ExamReportCard> {
  const exam = await loadExam(schoolId, examId);

  const { rows: classRows } = await pool.query<{
    id: string;
    class_name: string;
    stage_phase: SchoolLevel;
    stream_id: string | null;
    stream_name: string | null;
  }>(
    `select c.id, cs.name as class_name, cs.phase as stage_phase, st.id as stream_id, st.name as stream_name
       from classes c
       join curriculum_stage cs on cs.id = c.curriculum_stage_id
       left join streams st on st.id = $3
      where c.id = $1 and c.school_id = $2`,
    [classId, schoolId, streamId],
  );
  if (!classRows[0]) throw new UnknownClassError();
  const klass = classRows[0];

  const { rows: rosterRows } = await pool.query<{
    student_user_id: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    system_id: string | null;
    stream_id: string | null;
    stream_name: string | null;
  }>(
    `select en.student_user_id, s.first_name, s.middle_name, s.last_name, u.system_id,
            st.id as stream_id, st.name as stream_name
       from student_enrollment en
       join students s on s.user_id = en.student_user_id
       join users u on u.id = en.student_user_id
       left join streams st on st.id = en.stream_id
      where en.school_id = $1 and en.academic_year_id = $2 and en.class_id = $3
        and en.status = 'active'
        and ($4::uuid is null or en.stream_id = $4::uuid)
      order by s.last_name, s.first_name`,
    [schoolId, exam.academicYearId, classId, streamId],
  );

  const isALevel = klass.stage_phase === "A_LEVEL";
  const isPrimary = klass.stage_phase === "PRIMARY";
  const examOut = { id: exam.id, name: exam.name, termName: exam.termName, publishedAt: exam.publishedAt };
  const classOut = { id: klass.id, name: klass.class_name, phase: klass.stage_phase };
  const streamOut = klass.stream_id ? { id: klass.stream_id, name: klass.stream_name ?? "" } : null;

  if (rosterRows.length === 0) {
    return {
      exam: examOut,
      class: classOut,
      stream: streamOut,
      subjects: [],
      gradeDistribution: [],
      subsidiaryGradeDistribution: [],
      aggregation: null,
      divisionDistribution: [],
      streamAverages: [],
      students: [],
      topPerformers: [],
      needsAttention: [],
    };
  }

  const studentIds = rosterRows.map((r) => r.student_user_id);

  const { rows: resultRows } = await pool.query<{
    student_user_id: string;
    subject_id: string;
    subject_code: string;
    subject_name: string;
    subject_category: string;
    subject_is_examinable: boolean;
    raw_score: string | null;
    is_absent: boolean;
    computed_grade: string | null;
    subject_variant_id: string | null;
    variant_name: string | null;
    contribution_percent: string | null;
  }>(
    `select er.student_user_id, er.subject_id, sub.code as subject_code, sub.name as subject_name,
            sub.category as subject_category, sub.is_examinable as subject_is_examinable,
            er.raw_score, er.is_absent, er.computed_grade,
            er.subject_variant_id, sv.name as variant_name, sv.contribution_percent
       from exam_result er
       join subject sub on sub.id = er.subject_id
       left join subject_variant sv on sv.id = er.subject_variant_id
      where er.school_exam_id = $1 and er.student_user_id = any($2::uuid[])`,
    [examId, studentIds],
  );

  // A-Level: "subsidiary" is General Paper plus whichever subsidiary the
  // student's combination adds (subject.category = 'subsidiary' identifies
  // both, school-agnostically). Everything else is a combination's own
  // (principal) member. O-Level has no such split — everything reports as
  // "principal" and the phase-specific fields below are simply left null.
  function roleOf(category: string): ReportSubjectRole {
    return category === "subsidiary" ? "subsidiary" : "principal";
  }

  interface MergedSubjectScore {
    subjectId: string;
    subjectName: string;
    role: ReportSubjectRole;
    isExaminable: boolean;
    hasVariant: boolean;
    variantScores: { name: string; rawScore: number | null; isAbsent: boolean }[];
    rawScore: number | null;
    isAbsent: boolean;
    computedGrade: string | null;
  }
  const byStudentSubject = new Map<string, typeof resultRows>();
  for (const r of resultRows) {
    const key = `${r.student_user_id}:${r.subject_id}`;
    const list = byStudentSubject.get(key);
    if (list) list.push(r);
    else byStudentSubject.set(key, [r]);
  }
  const mergedByStudent = new Map<string, MergedSubjectScore[]>();
  for (const [key, group] of byStudentSubject) {
    const studentUserId = key.slice(0, key.indexOf(":"));
    const first = group[0];
    const hasVariant = group.some((g) => g.subject_variant_id);
    let rawScore: number | null;
    let isAbsent: boolean;
    let variantScores: MergedSubjectScore["variantScores"] = [];
    if (hasVariant) {
      variantScores = group.map((g) => ({
        name: g.variant_name ?? "",
        rawScore: g.raw_score !== null ? Number(g.raw_score) : null,
        isAbsent: g.is_absent,
      }));
      const merged = mergeVariantScore(
        group.map((g) => ({
          variantId: g.subject_variant_id!,
          rawScore: g.raw_score !== null ? Number(g.raw_score) : null,
          isAbsent: g.is_absent,
        })),
        group.map((g) => ({
          id: g.subject_variant_id!,
          name: g.variant_name ?? "",
          code: "",
          contributionPercent: g.contribution_percent !== null ? Number(g.contribution_percent) : 0,
        })),
      );
      rawScore = merged.rawScore;
      isAbsent = merged.isAbsent;
    } else {
      rawScore = first.raw_score !== null ? Number(first.raw_score) : null;
      isAbsent = first.is_absent;
    }
    const computedGrade = group.find((g) => g.computed_grade !== null)?.computed_grade ?? null;
    const list = mergedByStudent.get(studentUserId) ?? [];
    list.push({
      subjectId: first.subject_id,
      subjectName: first.subject_name,
      role: roleOf(first.subject_category),
      isExaminable: first.subject_is_examinable,
      hasVariant,
      variantScores,
      rawScore,
      isAbsent,
      computedGrade,
    });
    mergedByStudent.set(studentUserId, list);
  }

  function averageOf(subjects: MergedSubjectScore[]): number | null {
    const scored = subjects.filter((s) => !s.isAbsent && s.rawScore !== null);
    if (scored.length === 0) return null;
    return Math.round((scored.reduce((sum, s) => sum + s.rawScore!, 0) / scored.length) * 100) / 100;
  }

  // O-Level: one scheme ("any" role scope) for the whole blended average.
  // A-Level: two separate schemes, matching how each subject's own grade was
  // already computed — principal-subject scheme for the principal average,
  // subsidiary scheme for the subsidiary average. Never blended together.
  type Band = { label: string; min: number; max: number; points: number | null; comment: string | null };
  let aggregation: ExamReportCard["aggregation"] = null;
  async function loadBands(roleScope: string): Promise<Band[]> {
    const { rows: schemeRows } = await pool.query<{
      grading_scheme_id: string;
      aggregate_subject_count: number | null;
      divisions: GradeDivision[] | null;
    }>(
      `select sgs.grading_scheme_id, gs.aggregate_subject_count, gs.divisions
         from school_grading_scheme sgs
         join grading_scheme gs on gs.id = sgs.grading_scheme_id
        where sgs.school_id=$1 and sgs.applies_to=$2 and sgs.role_scope=$3`,
      [schoolId, klass.stage_phase, roleScope],
    );
    const scheme = schemeRows[0];
    if (!scheme) return [];
    if (isPrimary && scheme.aggregate_subject_count && scheme.divisions) {
      aggregation = { subjectCount: scheme.aggregate_subject_count, divisions: scheme.divisions };
    }
    const { rows } = await pool.query<{
      label: string;
      min_pct: string;
      max_pct: string;
      points: number | null;
      comment: string | null;
    }>(
      `select label, min_pct, max_pct, points, comment from grade_band where grading_scheme_id = $1`,
      [scheme.grading_scheme_id],
    );
    return rows.map((r) => ({
      label: r.label,
      min: Number(r.min_pct),
      max: Number(r.max_pct),
      points: r.points,
      comment: r.comment,
    }));
  }
  function bandOf(bands: Band[], score: number | null): Band | null {
    if (score === null) return null;
    return bands.find((b) => score >= b.min && score <= b.max) ?? null;
  }
  function bandFor(bands: Band[], avg: number | null) {
    const band = bandOf(bands, avg);
    return { grade: band?.label ?? null, comment: band?.comment ?? null };
  }
  const primaryBands = await loadBands(isALevel ? "principal" : "any");
  const subsidiaryBands = isALevel ? await loadBands("subsidiary") : [];

  // PLE-style aggregate: the points of the best N examinable subjects,
  // summed (lower is better). Needs a score in at least N of them — an
  // absent or unmarked PLE subject leaves the pupil unaggregated, the same
  // way UNEB leaves a candidate with a missing paper ungraded.
  function pointsOf(s: MergedSubjectScore): number | null {
    if (!isPrimary || s.isAbsent) return null;
    return bandOf(primaryBands, s.rawScore)?.points ?? null;
  }
  function aggregateOf(subjects: MergedSubjectScore[]): { aggregate: number | null; division: string | null } {
    const rule = aggregation;
    if (!rule) return { aggregate: null, division: null };
    const points = subjects
      .filter((s) => s.isExaminable)
      .map(pointsOf)
      .filter((p): p is number => p !== null)
      .sort((a, b) => a - b);
    if (points.length < rule.subjectCount) return { aggregate: null, division: null };
    const aggregate = points.slice(0, rule.subjectCount).reduce((a, b) => a + b, 0);
    const division =
      rule.divisions.find((d) => aggregate >= d.minAggregate && aggregate <= d.maxAggregate)?.label ?? null;
    return { aggregate, division };
  }

  const students: ReportCardStudent[] = rosterRows.map((r) => {
    const subjects = mergedByStudent.get(r.student_user_id) ?? [];
    const base = {
      studentUserId: r.student_user_id,
      studentName: [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" "),
      systemId: r.system_id,
      streamId: r.stream_id,
      streamName: r.stream_name,
      rank: null as number | null,
      subjects: subjects
        .map((s) => ({
          subjectId: s.subjectId,
          subjectName: s.subjectName,
          role: s.role,
          hasVariant: s.hasVariant,
          variantScores: s.hasVariant ? s.variantScores : undefined,
          rawScore: s.rawScore,
          isAbsent: s.isAbsent,
          computedGrade: s.computedGrade,
          isExaminable: s.isExaminable,
          points: pointsOf(s),
          bandGrade: isPrimary && !s.isAbsent ? bandOf(primaryBands, s.rawScore)?.label ?? null : null,
        }))
        .sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
    };
    if (!isALevel) {
      const avg = averageOf(subjects);
      const { grade, comment } = bandFor(primaryBands, avg);
      return {
        ...base,
        ...aggregateOf(subjects),
        average: avg,
        overallGrade: grade,
        overallComment: comment,
        principalAverage: null,
        principalGrade: null,
        principalComment: null,
        subsidiaryAverage: null,
        subsidiaryGrade: null,
        subsidiaryComment: null,
      };
    }
    const principalAvg = averageOf(subjects.filter((s) => s.role === "principal"));
    const subsidiaryAvg = averageOf(subjects.filter((s) => s.role === "subsidiary"));
    const principalBand = bandFor(primaryBands, principalAvg);
    const subsidiaryBand = bandFor(subsidiaryBands, subsidiaryAvg);
    return {
      ...base,
      aggregate: null,
      division: null,
      average: null,
      overallGrade: null,
      overallComment: null,
      principalAverage: principalAvg,
      principalGrade: principalBand.grade,
      principalComment: principalBand.comment,
      subsidiaryAverage: subsidiaryAvg,
      subsidiaryGrade: subsidiaryBand.grade,
      subsidiaryComment: subsidiaryBand.comment,
    };
  });

  // Ranking, top performers and "needs attention" all key off average for
  // O-Level, principalAverage for A-Level — subsidiaries never count toward
  // a student's standing.
  // Primary ranks by aggregate first (lower is better); anyone without a
  // full aggregate yet falls back to their average, after every aggregated
  // pupil.
  const rankValue = (s: ReportCardStudent): number | null => (isALevel ? s.principalAverage : s.average);
  const isRanked = (s: ReportCardStudent): boolean => rankValue(s) !== null || s.aggregate !== null;
  function compareStanding(a: ReportCardStudent, b: ReportCardStudent): number {
    if (isPrimary && (a.aggregate !== null || b.aggregate !== null)) {
      if (a.aggregate === null) return 1;
      if (b.aggregate === null) return -1;
      if (a.aggregate !== b.aggregate) return a.aggregate - b.aggregate;
    }
    return (rankValue(b) ?? -1) - (rankValue(a) ?? -1);
  }
  const ranked = [...students].sort(compareStanding);
  let position = 0;
  for (const s of ranked) {
    if (!isRanked(s)) continue;
    position += 1;
    s.rank = position;
  }

  // Subject summary: reuse examCompletion's per-slot roster/entered/submitted
  // (it's already correct — same teaching-assignment logic), scoped to this
  // class, plus a class average computed from the merged scores above.
  const completion = await examCompletion(schoolId, examId);
  const subjectSlots = completion.slots.filter(
    (s) => s.classId === classId && (s.streamId === null || s.streamId === streamId),
  );
  const { rows: subjectCategoryRows } = await pool.query<{ id: string; category: string; short_name: string }>(
    `select id, category, short_name from subject where id = any($1::uuid[])`,
    [subjectSlots.map((s) => s.subjectId)],
  );
  const categoryBySubjectId = new Map(subjectCategoryRows.map((r) => [r.id, r.category]));
  const shortNameBySubjectId = new Map(subjectCategoryRows.map((r) => [r.id, r.short_name]));
  function subjectAverage(subjectId: string): number | null {
    const scores: number[] = [];
    for (const list of mergedByStudent.values()) {
      const m = list.find((x) => x.subjectId === subjectId);
      if (m && !m.isAbsent && m.rawScore !== null) scores.push(m.rawScore);
    }
    if (scores.length === 0) return null;
    return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;
  }
  const subjects: ReportCardSubject[] = subjectSlots
    .map((s) => ({
      subjectId: s.subjectId,
      subjectCode: s.subjectCode,
      subjectName: s.subjectName,
      subjectShortName: shortNameBySubjectId.get(s.subjectId) ?? s.subjectCode,
      role: roleOf(categoryBySubjectId.get(s.subjectId) ?? ""),
      teacherName: s.teacherName,
      rosterCount: s.rosterCount,
      enteredCount: s.enteredCount,
      submitted: s.submitted,
      average: subjectAverage(s.subjectId),
    }))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName));

  // Split by role: A-Level's principal scheme (A-E) and subsidiary scheme
  // (Pass/Fail) use unrelated grade vocabularies — counting them together
  // would put "Pass" in the same bar chart as "C", which means nothing. For
  // O-Level, every subject is "principal" so this is just the one chart.
  function countGrades(role: ReportSubjectRole): { grade: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const list of mergedByStudent.values()) {
      for (const m of list) {
        if (!m.computedGrade || m.role !== role) continue;
        counts.set(m.computedGrade, (counts.get(m.computedGrade) ?? 0) + 1);
      }
    }
    return [...counts.entries()].map(([grade, count]) => ({ grade, count })).sort((a, b) => a.grade.localeCompare(b.grade));
  }
  const gradeDistribution = countGrades("principal");
  const subsidiaryGradeDistribution = isALevel ? countGrades("subsidiary") : [];

  const divisionCounts = new Map<string, number>();
  for (const s of students) {
    if (s.division) divisionCounts.set(s.division, (divisionCounts.get(s.division) ?? 0) + 1);
  }
  const divisionOrder = (aggregation as ExamReportCard["aggregation"])?.divisions.map((d) => d.label) ?? [];
  const divisionDistribution = divisionOrder
    .filter((d) => divisionCounts.has(d))
    .map((division) => ({ division, count: divisionCounts.get(division)! }));

  const streamAvgMap = new Map<string, { streamId: string; streamName: string; sum: number; n: number }>();
  if (!streamId) {
    for (const s of students) {
      const value = rankValue(s);
      if (value === null || !s.streamId) continue;
      const entry = streamAvgMap.get(s.streamId) ?? {
        streamId: s.streamId,
        streamName: s.streamName ?? "",
        sum: 0,
        n: 0,
      };
      entry.sum += value;
      entry.n += 1;
      streamAvgMap.set(s.streamId, entry);
    }
  }
  const streamAverages = [...streamAvgMap.values()]
    .map((e) => ({ streamId: e.streamId, streamName: e.streamName, average: Math.round((e.sum / e.n) * 100) / 100 }))
    .sort((a, b) => b.average - a.average);

  const scoredStudents = students.filter((s) => rankValue(s) !== null);
  const topPerformers = [...students].filter(isRanked).sort(compareStanding).slice(0, 5);
  const needsAttention = scoredStudents
    .filter((s) => rankValue(s)! < 40)
    .sort((a, b) => rankValue(a)! - rankValue(b)!)
    .slice(0, 5);

  return {
    exam: examOut,
    class: classOut,
    stream: streamOut,
    subjects,
    gradeDistribution,
    subsidiaryGradeDistribution,
    aggregation,
    divisionDistribution,
    streamAverages,
    students,
    topPerformers,
    needsAttention,
  };
}
