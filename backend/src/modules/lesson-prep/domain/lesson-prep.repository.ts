import { pool } from "../../../shared/db/index.js";
import type { SchoolLevel } from "../../../shared/levels.js";

// Lesson preparation: a scheme of work per term × class × subject (planned
// week by week), lesson plans for individual lessons, and the record of
// work — what was actually covered each week, against the scheme.
//
// Schemes and lesson plans go draft → submitted → approved, or back to the
// teacher ("returned") with the reviewer's comment. The DOS / head teacher —
// a school admin here — reviews, and "checks" each week's record of work.

export type ReviewStatus = "draft" | "submitted" | "approved" | "returned";
export type Coverage = "covered" | "partly" | "not_covered";

export interface PrepActor {
  userId: string;
  role: string;
}

export class LessonPrepError extends Error {
  constructor(
    message: string,
    public status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "LessonPrepError";
  }
}

const isAdmin = (a: PrepActor) => a.role !== "teacher";

// The reviewer's name — a school admin usually has no staff record, so they
// show as "School administrator".
const reviewerName = (col: string) => `
  case when ${col} is null then null else coalesce(
    (select trim(first_name || ' ' || last_name) from staff where user_id = ${col}),
    'School administrator') end`;
const EDITABLE: ReviewStatus[] = ["draft", "returned"];

// ─── What a teacher teaches ─────────────────────────────────────────────────

export interface TeachingAssignment {
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  phase: SchoolLevel;
  scheme: { id: string; status: ReviewStatus } | null;
}

/** The (subject, class) pairs a teacher teaches in the term's academic year —
 * each one needs a scheme of work — and the scheme, if started. */
export async function listTeachingAssignments(
  schoolId: string,
  termId: string,
  teacherId: string,
): Promise<TeachingAssignment[]> {
  const { rows } = await pool.query<{
    subject_id: string;
    subject_name: string;
    class_id: string;
    class_name: string;
    phase: SchoolLevel;
    scheme_id: string | null;
    scheme_status: ReviewStatus | null;
  }>(
    `select distinct on (sta.subject_id, sta.class_id)
            sta.subject_id, sub.name as subject_name, sta.class_id, cs.name as class_name, cs.phase,
            sw.id as scheme_id, sw.status as scheme_status
       from subject_teacher_assignment sta
       join terms t on t.id = $2 and t.school_id = $1 and t.academic_year_id = sta.academic_year_id
       join subject sub on sub.id = sta.subject_id
       join classes c on c.id = sta.class_id
       join curriculum_stage cs on cs.id = c.curriculum_stage_id
       left join scheme_of_work sw on sw.term_id = t.id and sw.class_id = sta.class_id and sw.subject_id = sta.subject_id
      where sta.school_id = $1 and sta.staff_id = $3 and sta.status = 'active'
      order by sta.subject_id, sta.class_id`,
    [schoolId, termId, teacherId],
  );
  return rows
    .map((r) => ({
      subjectId: r.subject_id,
      subjectName: r.subject_name,
      classId: r.class_id,
      className: r.class_name,
      phase: r.phase,
      scheme: r.scheme_id ? { id: r.scheme_id, status: r.scheme_status! } : null,
    }))
    .sort((a, b) => a.className.localeCompare(b.className) || a.subjectName.localeCompare(b.subjectName));
}

async function teaches(schoolId: string, teacherId: string, classId: string, subjectId: string | null) {
  if (!subjectId) {
    // A lesson with no subject (a Nursery activity) belongs to the class teacher.
    const { rowCount } = await pool.query(
      `select 1 from classes where id = $1 and school_id = $2 and class_teacher_id = $3`,
      [classId, schoolId, teacherId],
    );
    return (rowCount ?? 0) > 0;
  }
  const { rowCount } = await pool.query(
    `select 1 from subject_teacher_assignment
      where school_id = $1 and staff_id = $2 and class_id = $3 and subject_id = $4 and status = 'active'`,
    [schoolId, teacherId, classId, subjectId],
  );
  return (rowCount ?? 0) > 0;
}

// ─── Schemes of work ────────────────────────────────────────────────────────

export interface SchemeWeek {
  id: string;
  weekNumber: number;
  topic: string | null;
  subTopic: string | null;
  competences: string | null;
  methods: string | null;
  materials: string | null;
  references: string | null;
  remarks: string | null;
  // Record of work
  workCovered: string | null;
  coverage: Coverage | null;
  coverageRemarks: string | null;
  recordedAt: string | null;
  checkedAt: string | null;
  checkedByName: string | null;
}

export interface SchemeSummary {
  id: string;
  termId: string;
  termName: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  status: ReviewStatus;
  weeks: number;
  weeksPlanned: number;
  weeksRecorded: number;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
}

export interface Scheme extends SchemeSummary {
  reviewedByName: string | null;
  weekList: SchemeWeek[];
  canEdit: boolean;
}

const SCHEME_SUMMARY_SQL = `
  select sw.id, sw.term_id, t.name as term_name, sw.class_id, cs.name as class_name, cs.phase,
         sw.subject_id, sub.name as subject_name, sw.teacher_id,
         trim(tf.first_name || ' ' || tf.last_name) as teacher_name,
         sw.status, sw.submitted_at, sw.reviewed_at, sw.review_comment, sw.reviewed_by,
         (select count(*) from scheme_of_work_week w where w.scheme_id = sw.id)::int as weeks,
         (select count(*) from scheme_of_work_week w where w.scheme_id = sw.id and w.topic is not null)::int as weeks_planned,
         (select count(*) from scheme_of_work_week w where w.scheme_id = sw.id and w.work_covered is not null)::int as weeks_recorded
    from scheme_of_work sw
    join terms t on t.id = sw.term_id
    join classes c on c.id = sw.class_id
    join curriculum_stage cs on cs.id = c.curriculum_stage_id
    join subject sub on sub.id = sw.subject_id
    join staff tf on tf.user_id = sw.teacher_id
`;

interface SchemeRow {
  id: string;
  term_id: string;
  term_name: string;
  class_id: string;
  class_name: string;
  phase: SchoolLevel;
  subject_id: string;
  subject_name: string;
  teacher_id: string;
  teacher_name: string;
  status: ReviewStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  reviewed_by: string | null;
  weeks: number;
  weeks_planned: number;
  weeks_recorded: number;
}

const mapScheme = (r: SchemeRow): SchemeSummary => ({
  id: r.id,
  termId: r.term_id,
  termName: r.term_name,
  classId: r.class_id,
  className: r.class_name,
  subjectId: r.subject_id,
  subjectName: r.subject_name,
  teacherId: r.teacher_id,
  teacherName: r.teacher_name,
  status: r.status,
  weeks: r.weeks,
  weeksPlanned: r.weeks_planned,
  weeksRecorded: r.weeks_recorded,
  submittedAt: r.submitted_at,
  reviewedAt: r.reviewed_at,
  reviewComment: r.review_comment,
});

export async function listSchemes(
  schoolId: string,
  filter: { termId?: string; teacherId?: string; status?: ReviewStatus; levels?: SchoolLevel[] | null },
): Promise<SchemeSummary[]> {
  const { rows } = await pool.query<SchemeRow>(
    `${SCHEME_SUMMARY_SQL}
      where sw.school_id = $1
        and ($2::uuid is null or sw.term_id = $2::uuid)
        and ($3::uuid is null or sw.teacher_id = $3::uuid)
        and ($4::text is null or sw.status = $4::text)
        and ($5::text[] is null or cs.phase = any($5::text[]))
      order by sw.submitted_at desc nulls last, cs.name, sub.name`,
    [schoolId, filter.termId ?? null, filter.teacherId ?? null, filter.status ?? null, filter.levels ?? null],
  );
  return rows.map(mapScheme);
}

export async function getScheme(schoolId: string, id: string, actor: PrepActor): Promise<Scheme> {
  const { rows } = await pool.query<SchemeRow & { reviewed_by_name: string | null }>(
    `${SCHEME_SUMMARY_SQL.replace(
      "sw.reviewed_by,",
      `sw.reviewed_by, ${reviewerName("sw.reviewed_by")} as reviewed_by_name,`,
    )}
      where sw.id = $1 and sw.school_id = $2`,
    [id, schoolId],
  );
  const r = rows[0];
  if (!r) throw new LessonPrepError("That scheme of work doesn't exist.", 404);
  if (!isAdmin(actor) && r.teacher_id !== actor.userId) throw new LessonPrepError("That scheme isn't yours.", 403);
  const weeks = await pool.query<{
    id: string;
    week_number: number;
    topic: string | null;
    sub_topic: string | null;
    competences: string | null;
    methods: string | null;
    materials: string | null;
    references_text: string | null;
    remarks: string | null;
    work_covered: string | null;
    coverage: Coverage | null;
    coverage_remarks: string | null;
    recorded_at: string | null;
    checked_at: string | null;
    checked_by_name: string | null;
  }>(
    `select w.*, ${reviewerName("w.checked_by")} as checked_by_name
       from scheme_of_work_week w where w.scheme_id = $1 order by w.week_number`,
    [id],
  );
  return {
    ...mapScheme(r),
    reviewedByName: r.reviewed_by_name,
    canEdit: r.teacher_id === actor.userId && EDITABLE.includes(r.status),
    weekList: weeks.rows.map((w) => ({
      id: w.id,
      weekNumber: w.week_number,
      topic: w.topic,
      subTopic: w.sub_topic,
      competences: w.competences,
      methods: w.methods,
      materials: w.materials,
      references: w.references_text,
      remarks: w.remarks,
      workCovered: w.work_covered,
      coverage: w.coverage,
      coverageRemarks: w.coverage_remarks,
      recordedAt: w.recorded_at,
      checkedAt: w.checked_at,
      checkedByName: w.checked_by_name,
    })),
  };
}

/** Starts a scheme for one of the teacher's (subject, class) pairs, with one
 * empty week per week of the term. */
export async function createScheme(
  schoolId: string,
  actor: PrepActor,
  input: { termId: string; classId: string; subjectId: string },
): Promise<Scheme> {
  const term = await pool.query<{ start_date: string; end_date: string; academic_year_id: string }>(
    `select start_date::text, end_date::text, academic_year_id from terms where id = $1 and school_id = $2`,
    [input.termId, schoolId],
  );
  if (!term.rows[0]) throw new LessonPrepError("Unknown term.", 404);
  if (!(await teaches(schoolId, actor.userId, input.classId, input.subjectId))) {
    throw new LessonPrepError("You can only write a scheme of work for a subject you teach in that class.", 403);
  }
  const existing = await pool.query<{ id: string }>(
    `select id from scheme_of_work where term_id = $1 and class_id = $2 and subject_id = $3`,
    [input.termId, input.classId, input.subjectId],
  );
  if (existing.rows[0]) return getScheme(schoolId, existing.rows[0].id, actor);

  const days =
    (Date.parse(term.rows[0].end_date) - Date.parse(term.rows[0].start_date)) / 86_400_000 + 1;
  const weeks = Math.min(20, Math.max(1, Math.ceil(days / 7)));
  const client = await pool.connect();
  let id: string;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string }>(
      `insert into scheme_of_work (school_id, term_id, class_id, subject_id, teacher_id)
       values ($1, $2, $3, $4, $5) returning id`,
      [schoolId, input.termId, input.classId, input.subjectId, actor.userId],
    );
    id = rows[0].id;
    await client.query(
      `insert into scheme_of_work_week (scheme_id, week_number) select $1, generate_series(1, $2)`,
      [id, weeks],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getScheme(schoolId, id, actor);
}

export interface SchemeWeekInput {
  weekNumber: number;
  topic?: string | null;
  subTopic?: string | null;
  competences?: string | null;
  methods?: string | null;
  materials?: string | null;
  references?: string | null;
  remarks?: string | null;
}

const clean = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);

async function ownScheme(schoolId: string, id: string, actor: PrepActor) {
  const { rows } = await pool.query<{ teacher_id: string; status: ReviewStatus }>(
    `select teacher_id, status from scheme_of_work where id = $1 and school_id = $2`,
    [id, schoolId],
  );
  if (!rows[0]) throw new LessonPrepError("That scheme of work doesn't exist.", 404);
  if (rows[0].teacher_id !== actor.userId) throw new LessonPrepError("That scheme isn't yours.", 403);
  return rows[0];
}

export async function saveSchemeWeeks(
  schoolId: string,
  id: string,
  actor: PrepActor,
  weeks: SchemeWeekInput[],
): Promise<Scheme> {
  const scheme = await ownScheme(schoolId, id, actor);
  if (!EDITABLE.includes(scheme.status)) {
    throw new LessonPrepError("This scheme has been submitted — it can't be edited until it's returned.", 409);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Only the fields sent are touched; an empty string clears one.
    const columns: [keyof SchemeWeekInput, string][] = [
      ["topic", "topic"],
      ["subTopic", "sub_topic"],
      ["competences", "competences"],
      ["methods", "methods"],
      ["materials", "materials"],
      ["references", "references_text"],
      ["remarks", "remarks"],
    ];
    for (const w of weeks) {
      const sets: string[] = [];
      const params: unknown[] = [id, w.weekNumber];
      for (const [key, col] of columns) {
        if (w[key] === undefined) continue;
        params.push(clean(w[key] as string | null));
        sets.push(`${col} = $${params.length}`);
      }
      if (sets.length === 0) continue;
      await client.query(
        `update scheme_of_work_week set ${sets.join(", ")} where scheme_id = $1 and week_number = $2`,
        params,
      );
    }
    await client.query(`update scheme_of_work set updated_at = now() where id = $1`, [id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getScheme(schoolId, id, actor);
}

export async function submitScheme(schoolId: string, id: string, actor: PrepActor): Promise<Scheme> {
  const scheme = await ownScheme(schoolId, id, actor);
  if (!EDITABLE.includes(scheme.status)) throw new LessonPrepError("This scheme is already submitted.", 409);
  const planned = await pool.query(`select 1 from scheme_of_work_week where scheme_id = $1 and topic is not null`, [id]);
  if (!planned.rowCount) throw new LessonPrepError("Plan at least one week before submitting.");
  await pool.query(
    `update scheme_of_work set status = 'submitted', submitted_at = now(), updated_at = now() where id = $1`,
    [id],
  );
  return getScheme(schoolId, id, actor);
}

export async function reviewScheme(
  schoolId: string,
  id: string,
  actor: PrepActor,
  decision: "approve" | "return",
  comment: string | null,
): Promise<Scheme> {
  if (decision === "return" && !comment?.trim()) {
    throw new LessonPrepError("Say what needs changing when returning a scheme.");
  }
  const { rowCount } = await pool.query(
    `update scheme_of_work
        set status = $3, reviewed_by = $4, reviewed_at = now(), review_comment = $5, updated_at = now()
      where id = $1 and school_id = $2 and status = 'submitted'`,
    [id, schoolId, decision === "approve" ? "approved" : "returned", actor.userId, comment?.trim() || null],
  );
  if (!rowCount) throw new LessonPrepError("Only a submitted scheme can be reviewed.", 409);
  return getScheme(schoolId, id, actor);
}

// ─── Record of work ─────────────────────────────────────────────────────────

/** What was actually covered in a week — filled in as the term runs, whatever
 * the scheme's review status. Changing it clears the DOS's check. */
export async function recordWork(
  schoolId: string,
  weekId: string,
  actor: PrepActor,
  input: { workCovered: string | null; coverage: Coverage | null; coverageRemarks: string | null },
): Promise<Scheme> {
  const { rows } = await pool.query<{ scheme_id: string; teacher_id: string }>(
    `select w.scheme_id, sw.teacher_id from scheme_of_work_week w
       join scheme_of_work sw on sw.id = w.scheme_id
      where w.id = $1 and sw.school_id = $2`,
    [weekId, schoolId],
  );
  if (!rows[0]) throw new LessonPrepError("Unknown week.", 404);
  if (rows[0].teacher_id !== actor.userId) throw new LessonPrepError("That record of work isn't yours.", 403);
  await pool.query(
    `update scheme_of_work_week
        set work_covered = $2, coverage = $3, coverage_remarks = $4,
            recorded_at = case when $2::text is null then null else now() end,
            checked_by = null, checked_at = null
      where id = $1`,
    [weekId, input.workCovered?.trim() || null, input.coverage, input.coverageRemarks?.trim() || null],
  );
  return getScheme(schoolId, rows[0].scheme_id, actor);
}

/** The DOS signs a week's record of work as checked (or un-checks it). */
export async function checkWeek(schoolId: string, weekId: string, actor: PrepActor, checked: boolean): Promise<Scheme> {
  const { rows } = await pool.query<{ scheme_id: string; work_covered: string | null }>(
    `select w.scheme_id, w.work_covered from scheme_of_work_week w
       join scheme_of_work sw on sw.id = w.scheme_id
      where w.id = $1 and sw.school_id = $2`,
    [weekId, schoolId],
  );
  if (!rows[0]) throw new LessonPrepError("Unknown week.", 404);
  if (checked && !rows[0].work_covered) throw new LessonPrepError("Nothing has been recorded for that week yet.");
  await pool.query(
    `update scheme_of_work_week set checked_by = $2, checked_at = $3 where id = $1`,
    [weekId, checked ? actor.userId : null, checked ? new Date().toISOString() : null],
  );
  return getScheme(schoolId, rows[0].scheme_id, actor);
}

// ─── Lesson plans ───────────────────────────────────────────────────────────

export interface LessonPlanInput {
  classId: string;
  streamId?: string | null;
  subjectId?: string | null;
  timetableSlotId?: string | null;
  schemeWeekId?: string | null;
  lessonDate: string;
  topic: string;
  subTopic?: string | null;
  objectives?: string | null;
  materials?: string | null;
  introduction?: string | null;
  development?: string | null;
  conclusion?: string | null;
  assessment?: string | null;
  selfEvaluation?: string | null;
}

export interface LessonPlan {
  id: string;
  teacherId: string;
  teacherName: string;
  termId: string | null;
  classId: string;
  className: string;
  streamId: string | null;
  streamName: string | null;
  subjectId: string | null;
  subjectName: string | null;
  timetableSlotId: string | null;
  schemeWeekId: string | null;
  schemeWeekNumber: number | null;
  lessonDate: string;
  topic: string;
  subTopic: string | null;
  objectives: string | null;
  materials: string | null;
  introduction: string | null;
  development: string | null;
  conclusion: string | null;
  assessment: string | null;
  selfEvaluation: string | null;
  status: ReviewStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  reviewedByName: string | null;
  canEdit: boolean;
}

const PLAN_SQL = `
  select lp.*, to_char(lp.lesson_date, 'YYYY-MM-DD') as lesson_date_s,
         cs.name as class_name, cs.phase, st.name as stream_name, sub.name as subject_name,
         trim(tf.first_name || ' ' || tf.last_name) as teacher_name, w.week_number as scheme_week_number,
         ${reviewerName("lp.reviewed_by")} as reviewed_by_name
    from lesson_plan lp
    join classes c on c.id = lp.class_id
    join curriculum_stage cs on cs.id = c.curriculum_stage_id
    left join streams st on st.id = lp.stream_id
    left join subject sub on sub.id = lp.subject_id
    join staff tf on tf.user_id = lp.teacher_id
    left join scheme_of_work_week w on w.id = lp.scheme_week_id
`;

function mapPlan(r: any, actor: PrepActor): LessonPlan {
  return {
    id: r.id,
    teacherId: r.teacher_id,
    teacherName: r.teacher_name,
    termId: r.term_id,
    classId: r.class_id,
    className: r.class_name,
    streamId: r.stream_id,
    streamName: r.stream_name,
    subjectId: r.subject_id,
    subjectName: r.subject_name,
    timetableSlotId: r.timetable_slot_id,
    schemeWeekId: r.scheme_week_id,
    schemeWeekNumber: r.scheme_week_number,
    lessonDate: r.lesson_date_s,
    topic: r.topic,
    subTopic: r.sub_topic,
    objectives: r.objectives,
    materials: r.materials,
    introduction: r.introduction,
    development: r.development,
    conclusion: r.conclusion,
    assessment: r.assessment,
    selfEvaluation: r.self_evaluation,
    status: r.status,
    submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at,
    reviewComment: r.review_comment,
    reviewedByName: r.reviewed_by_name,
    canEdit: r.teacher_id === actor.userId && EDITABLE.includes(r.status),
  };
}

export async function listPlans(
  schoolId: string,
  actor: PrepActor,
  filter: { teacherId?: string; from?: string; to?: string; status?: ReviewStatus; levels?: SchoolLevel[] | null },
): Promise<LessonPlan[]> {
  const { rows } = await pool.query(
    `${PLAN_SQL}
      where lp.school_id = $1
        and ($2::uuid is null or lp.teacher_id = $2::uuid)
        and ($3::date is null or lp.lesson_date >= $3::date)
        and ($4::date is null or lp.lesson_date <= $4::date)
        and ($5::text is null or lp.status = $5::text)
        and ($6::text[] is null or cs.phase = any($6::text[]))
      order by lp.lesson_date desc, lp.created_at desc
      limit 300`,
    [schoolId, filter.teacherId ?? null, filter.from ?? null, filter.to ?? null, filter.status ?? null, filter.levels ?? null],
  );
  return rows.map((r) => mapPlan(r, actor));
}

export async function getPlan(schoolId: string, id: string, actor: PrepActor): Promise<LessonPlan> {
  const { rows } = await pool.query(`${PLAN_SQL} where lp.id = $1 and lp.school_id = $2`, [id, schoolId]);
  if (!rows[0]) throw new LessonPrepError("That lesson plan doesn't exist.", 404);
  if (!isAdmin(actor) && rows[0].teacher_id !== actor.userId) throw new LessonPrepError("That plan isn't yours.", 403);
  return mapPlan(rows[0], actor);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function validatePlanInput(schoolId: string, actor: PrepActor, input: LessonPlanInput) {
  if (!DATE_RE.test(input.lessonDate)) throw new LessonPrepError("Invalid lesson date.");
  if (!input.topic?.trim()) throw new LessonPrepError("A lesson plan needs a topic.");
  const cls = await pool.query<{ academic_year_id: string }>(
    `select academic_year_id from classes where id = $1 and school_id = $2`,
    [input.classId, schoolId],
  );
  if (!cls.rows[0]) throw new LessonPrepError("Unknown class.", 404);
  if (!(await teaches(schoolId, actor.userId, input.classId, input.subjectId ?? null))) {
    throw new LessonPrepError("You can only plan lessons you teach.", 403);
  }
  if (input.timetableSlotId) {
    const { rowCount } = await pool.query(
      `select 1 from timetable_slot where id = $1 and school_id = $2 and class_id = $3`,
      [input.timetableSlotId, schoolId, input.classId],
    );
    if (!rowCount) throw new LessonPrepError("That timetabled lesson isn't for this class.");
  }
  if (input.schemeWeekId) {
    const { rowCount } = await pool.query(
      `select 1 from scheme_of_work_week w join scheme_of_work sw on sw.id = w.scheme_id
        where w.id = $1 and sw.school_id = $2 and sw.class_id = $3`,
      [input.schemeWeekId, schoolId, input.classId],
    );
    if (!rowCount) throw new LessonPrepError("That scheme week isn't for this class.");
  }
  const term = await pool.query<{ id: string }>(
    `select id from terms where school_id = $1 and academic_year_id = $2 and $3::date between start_date and end_date`,
    [schoolId, cls.rows[0].academic_year_id, input.lessonDate],
  );
  return term.rows[0]?.id ?? null;
}

export async function createPlan(schoolId: string, actor: PrepActor, input: LessonPlanInput): Promise<LessonPlan> {
  const termId = await validatePlanInput(schoolId, actor, input);
  const { rows } = await pool.query<{ id: string }>(
    `insert into lesson_plan
       (school_id, teacher_id, term_id, class_id, stream_id, subject_id, timetable_slot_id, scheme_week_id,
        lesson_date, topic, sub_topic, objectives, materials, introduction, development, conclusion,
        assessment, self_evaluation)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     returning id`,
    [
      schoolId, actor.userId, termId, input.classId, input.streamId || null, input.subjectId || null,
      input.timetableSlotId || null, input.schemeWeekId || null, input.lessonDate, input.topic.trim(),
      clean(input.subTopic) ?? null, clean(input.objectives) ?? null, clean(input.materials) ?? null,
      clean(input.introduction) ?? null, clean(input.development) ?? null, clean(input.conclusion) ?? null,
      clean(input.assessment) ?? null, clean(input.selfEvaluation) ?? null,
    ],
  );
  return getPlan(schoolId, rows[0].id, actor);
}

/** Edits a draft or returned plan. The self-evaluation — written after the
 * lesson — stays editable once the plan is approved. */
export async function updatePlan(
  schoolId: string,
  id: string,
  actor: PrepActor,
  input: LessonPlanInput,
): Promise<LessonPlan> {
  const current = await getPlan(schoolId, id, actor);
  if (current.teacherId !== actor.userId) throw new LessonPrepError("That plan isn't yours.", 403);
  if (!EDITABLE.includes(current.status)) {
    await pool.query(`update lesson_plan set self_evaluation = $2, updated_at = now() where id = $1`, [
      id,
      clean(input.selfEvaluation) ?? null,
    ]);
    return getPlan(schoolId, id, actor);
  }
  const termId = await validatePlanInput(schoolId, actor, input);
  await pool.query(
    `update lesson_plan
        set term_id = $2, class_id = $3, stream_id = $4, subject_id = $5, timetable_slot_id = $6,
            scheme_week_id = $7, lesson_date = $8, topic = $9, sub_topic = $10, objectives = $11,
            materials = $12, introduction = $13, development = $14, conclusion = $15, assessment = $16,
            self_evaluation = $17, updated_at = now()
      where id = $1`,
    [
      id, termId, input.classId, input.streamId || null, input.subjectId || null, input.timetableSlotId || null,
      input.schemeWeekId || null, input.lessonDate, input.topic.trim(), clean(input.subTopic) ?? null,
      clean(input.objectives) ?? null, clean(input.materials) ?? null, clean(input.introduction) ?? null,
      clean(input.development) ?? null, clean(input.conclusion) ?? null, clean(input.assessment) ?? null,
      clean(input.selfEvaluation) ?? null,
    ],
  );
  return getPlan(schoolId, id, actor);
}

export async function deletePlan(schoolId: string, id: string, actor: PrepActor): Promise<void> {
  const { rowCount } = await pool.query(
    `delete from lesson_plan where id = $1 and school_id = $2 and teacher_id = $3 and status in ('draft', 'returned')`,
    [id, schoolId, actor.userId],
  );
  if (!rowCount) throw new LessonPrepError("Only your own draft or returned plans can be deleted.", 409);
}

export async function submitPlan(schoolId: string, id: string, actor: PrepActor): Promise<LessonPlan> {
  const { rowCount } = await pool.query(
    `update lesson_plan set status = 'submitted', submitted_at = now(), updated_at = now()
      where id = $1 and school_id = $2 and teacher_id = $3 and status in ('draft', 'returned')`,
    [id, schoolId, actor.userId],
  );
  if (!rowCount) throw new LessonPrepError("Only your own draft or returned plans can be submitted.", 409);
  return getPlan(schoolId, id, actor);
}

export async function reviewPlan(
  schoolId: string,
  id: string,
  actor: PrepActor,
  decision: "approve" | "return",
  comment: string | null,
): Promise<LessonPlan> {
  if (decision === "return" && !comment?.trim()) {
    throw new LessonPrepError("Say what needs changing when returning a plan.");
  }
  const { rowCount } = await pool.query(
    `update lesson_plan
        set status = $3, reviewed_by = $4, reviewed_at = now(), review_comment = $5, updated_at = now()
      where id = $1 and school_id = $2 and status = 'submitted'`,
    [id, schoolId, decision === "approve" ? "approved" : "returned", actor.userId, comment?.trim() || null],
  );
  if (!rowCount) throw new LessonPrepError("Only a submitted plan can be reviewed.", 409);
  return getPlan(schoolId, id, actor);
}

// ─── Compliance (DOS view) ──────────────────────────────────────────────────

export interface TeacherCompliance {
  teacherId: string;
  teacherName: string;
  subjectsToPlan: number;
  schemesApproved: number;
  schemesSubmitted: number;
  schemesInProgress: number;
  lessonsPerWeek: number;
  plansThisWeek: number;
  weeksRecorded: number;
  weeksDue: number;
}

/** Per teacher, for a term: how many of their (subject, class) pairs have a
 * scheme and at what stage; this week's lesson plans against their timetabled
 * lessons; and records of work against the weeks gone so far. */
export async function compliance(
  schoolId: string,
  termId: string,
  levels: SchoolLevel[] | null,
): Promise<{ currentWeek: number; teachers: TeacherCompliance[] }> {
  const term = await pool.query<{ start_date: string; end_date: string }>(
    `select start_date::text, end_date::text from terms where id = $1 and school_id = $2`,
    [termId, schoolId],
  );
  if (!term.rows[0]) throw new LessonPrepError("Unknown term.", 404);
  const now = Date.now() + 3 * 3600_000;
  const start = Date.parse(term.rows[0].start_date);
  const end = Date.parse(term.rows[0].end_date);
  const currentWeek = now < start ? 0 : Math.ceil((Math.min(now, end) - start + 1) / (7 * 86_400_000));

  // This week, Monday to Sunday, in East Africa Time.
  const today = new Date(now);
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const { rows } = await pool.query<{
    teacher_id: string;
    teacher_name: string;
    subjects_to_plan: number;
    approved: number;
    submitted: number;
    in_progress: number;
    lessons_per_week: number;
    plans_this_week: number;
    weeks_recorded: number;
  }>(
    `with pairs as (
       select distinct sta.staff_id, sta.subject_id, sta.class_id
         from subject_teacher_assignment sta
         join terms t on t.id = $2 and t.academic_year_id = sta.academic_year_id
         join classes c on c.id = sta.class_id
         join curriculum_stage cs on cs.id = c.curriculum_stage_id
        where sta.school_id = $1 and sta.status = 'active'
          and ($3::text[] is null or cs.phase = any($3::text[]))
     )
     select p.staff_id as teacher_id, trim(tf.first_name || ' ' || tf.last_name) as teacher_name,
            count(*)::int as subjects_to_plan,
            count(sw.id) filter (where sw.status = 'approved')::int as approved,
            count(sw.id) filter (where sw.status = 'submitted')::int as submitted,
            count(sw.id) filter (where sw.status in ('draft', 'returned'))::int as in_progress,
            (select count(*) from timetable_slot sl where sl.term_id = $2 and sl.staff_id = p.staff_id)::int
              as lessons_per_week,
            (select count(*) from lesson_plan lp where lp.teacher_id = p.staff_id and lp.school_id = $1
                and lp.lesson_date between $4 and $5)::int as plans_this_week,
            coalesce(sum((select count(*) from scheme_of_work_week w
                            where w.scheme_id = sw.id and w.work_covered is not null)), 0)::int as weeks_recorded
       from pairs p
       join staff tf on tf.user_id = p.staff_id
       left join scheme_of_work sw on sw.term_id = $2 and sw.class_id = p.class_id and sw.subject_id = p.subject_id
      group by p.staff_id, tf.first_name, tf.last_name
      order by tf.first_name, tf.last_name`,
    [schoolId, termId, levels, iso(monday), iso(sunday)],
  );
  return {
    currentWeek,
    teachers: rows.map((r) => ({
      teacherId: r.teacher_id,
      teacherName: r.teacher_name,
      subjectsToPlan: r.subjects_to_plan,
      schemesApproved: r.approved,
      schemesSubmitted: r.submitted,
      schemesInProgress: r.in_progress,
      lessonsPerWeek: r.lessons_per_week,
      plansThisWeek: r.plans_this_week,
      weeksRecorded: r.weeks_recorded,
      weeksDue: currentWeek * r.subjects_to_plan,
    })),
  };
}
