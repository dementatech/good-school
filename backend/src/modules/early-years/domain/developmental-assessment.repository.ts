import { pool } from "../../../shared/db/index.js";
import { fileUrl, type StorageProvider } from "../../../shared/media.js";
import { listLearningAreas, type LearningAreaRecord } from "./learning-areas.repository.js";

// Kindergarten progress — one 3-point developmental rating per (pupil, term,
// learning area), plus the term's class-teacher / head-teacher remarks.
// Deliberately NOT grading_scheme/exam_result: there is no national exam at
// this stage, and dressing an internal nursery check-in up as a graded
// result would misrepresent it (docs/design/kindergarten-extension.md §3).

export type DevelopmentalRating = "emerging" | "developing" | "proficient";

export interface AssessmentActor {
  userId: string;
  role: string;
}

export interface KindergartenClassSummary {
  id: string;
  name: string;
  stageCode: string;
  academicYearId: string;
  streams: { id: string; name: string }[];
  pupilCount: number;
}

export interface AssessmentSheetPupil {
  studentUserId: string;
  name: string;
  systemId: string | null;
  photoUrl: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  streamName: string | null;
  ratings: Record<string, { rating: DevelopmentalRating | null; comment: string | null }>;
  classTeacherComment: string | null;
  headTeacherComment: string | null;
}

export interface AssessmentSheet {
  class: { id: string; name: string; classTeacherName: string | null };
  term: { id: string; name: string; startDate: string; endDate: string };
  learningAreas: LearningAreaRecord[];
  pupils: AssessmentSheetPupil[];
  /** False for a teacher who isn't this class's (or a stream's) teacher —
   * they may read, not write. Head-teacher remarks are admin-only either way. */
  canEdit: boolean;
  canEditHeadTeacherRemark: boolean;
}

export interface AssessmentEntryInput {
  studentUserId: string;
  learningAreaId: string;
  rating: DevelopmentalRating | null;
  teacherComment?: string | null;
}

export interface RemarkInput {
  studentUserId: string;
  classTeacherComment?: string | null;
  headTeacherComment?: string | null;
}

export class UnknownKindergartenClassError extends Error {
  constructor() {
    super("That kindergarten class doesn't exist for this school.");
    this.name = "UnknownKindergartenClassError";
  }
}

export class UnknownTermError extends Error {
  constructor() {
    super("That term doesn't exist for this class's academic year.");
    this.name = "UnknownTermError";
  }
}

export class NotClassTeacherError extends Error {
  constructor() {
    super("Only this class's teacher (or a school administrator) can record its assessments.");
    this.name = "NotClassTeacherError";
  }
}

export class InvalidAssessmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAssessmentError";
  }
}

const isAdmin = (actor: AssessmentActor): boolean => actor.role !== "teacher";

// A teacher may assess a class they're the class teacher of, or teach one
// of its streams.
const TEACHES_CLASS_SQL = `
  (c.class_teacher_id = $TEACHER
   or exists (select 1 from streams st where st.class_id = c.id and st.stream_teacher_id = $TEACHER))
`;

export async function listKindergartenClasses(
  schoolId: string,
  academicYearId: string,
  actor: AssessmentActor,
): Promise<KindergartenClassSummary[]> {
  const params: unknown[] = [schoolId, academicYearId];
  let teacherClause = "";
  if (!isAdmin(actor)) {
    params.push(actor.userId);
    teacherClause = `and ${TEACHES_CLASS_SQL.replaceAll("$TEACHER", `$${params.length}`)}`;
  }
  const { rows } = await pool.query<{
    id: string;
    name: string;
    stage_code: string;
    academic_year_id: string;
    streams: { id: string; name: string }[];
    pupil_count: string;
  }>(
    `select c.id, cs.name, cs.code as stage_code, c.academic_year_id,
            coalesce((select json_agg(json_build_object('id', st.id, 'name', st.name) order by st.name)
                        from streams st where st.class_id = c.id and st.is_active), '[]'::json) as streams,
            (select count(*) from student_enrollment en
              where en.class_id = c.id and en.status = 'active')::text as pupil_count
       from classes c
       join curriculum_stage cs on cs.id = c.curriculum_stage_id
      where c.school_id = $1 and c.academic_year_id = $2 and c.is_active
        and cs.phase = 'KINDERGARTEN' ${teacherClause}
      order by cs.sequence_number`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    stageCode: r.stage_code,
    academicYearId: r.academic_year_id,
    streams: r.streams,
    pupilCount: Number(r.pupil_count),
  }));
}

export interface TermSummary {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export async function listYearTerms(schoolId: string, academicYearId: string): Promise<TermSummary[]> {
  const { rows } = await pool.query<{ id: string; name: string; start_date: string; end_date: string }>(
    `select id, name, to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date
       from terms where school_id = $1 and academic_year_id = $2
      order by start_date`,
    [schoolId, academicYearId],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, startDate: r.start_date, endDate: r.end_date }));
}

interface ClassContext {
  id: string;
  name: string;
  academicYearId: string;
  classTeacherName: string | null;
  actorTeaches: boolean;
}

async function loadClass(schoolId: string, classId: string, actor: AssessmentActor): Promise<ClassContext> {
  const { rows } = await pool.query<{
    id: string;
    name: string;
    academic_year_id: string;
    teacher_first: string | null;
    teacher_last: string | null;
    actor_teaches: boolean;
  }>(
    `select c.id, cs.name, c.academic_year_id, tf.first_name as teacher_first, tf.last_name as teacher_last,
            ${TEACHES_CLASS_SQL.replaceAll("$TEACHER", "$3")} as actor_teaches
       from classes c
       join curriculum_stage cs on cs.id = c.curriculum_stage_id
       left join staff tf on tf.user_id = c.class_teacher_id
      where c.id = $1 and c.school_id = $2 and cs.phase = 'KINDERGARTEN'`,
    [classId, schoolId, actor.userId],
  );
  const r = rows[0];
  if (!r) throw new UnknownKindergartenClassError();
  return {
    id: r.id,
    name: r.name,
    academicYearId: r.academic_year_id,
    classTeacherName: [r.teacher_first, r.teacher_last].filter(Boolean).join(" ") || null,
    actorTeaches: r.actor_teaches,
  };
}

async function loadTerm(schoolId: string, academicYearId: string, termId: string) {
  const { rows } = await pool.query<{ id: string; name: string; start_date: string; end_date: string }>(
    `select id, name, to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date
       from terms where id = $1 and school_id = $2 and academic_year_id = $3`,
    [termId, schoolId, academicYearId],
  );
  if (!rows[0]) throw new UnknownTermError();
  return { id: rows[0].id, name: rows[0].name, startDate: rows[0].start_date, endDate: rows[0].end_date };
}

export async function getAssessmentSheet(
  schoolId: string,
  classId: string,
  termId: string,
  streamId: string | null,
  actor: AssessmentActor,
  opts: { studentUserId?: string } = {},
): Promise<AssessmentSheet> {
  const klass = await loadClass(schoolId, classId, actor);
  if (!isAdmin(actor) && !klass.actorTeaches) throw new NotClassTeacherError();
  const term = await loadTerm(schoolId, klass.academicYearId, termId);
  const learningAreas = await listLearningAreas(schoolId, { activeOnly: true });

  const { rows: pupils } = await pool.query<{
    student_user_id: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    gender: string | null;
    date_of_birth: string | null;
    photo_path: string | null;
    photo_provider: StorageProvider | null;
    system_id: string | null;
    stream_name: string | null;
    class_teacher_comment: string | null;
    head_teacher_comment: string | null;
  }>(
    `select en.student_user_id, s.first_name, s.middle_name, s.last_name, s.gender,
            to_char(s.date_of_birth, 'YYYY-MM-DD') as date_of_birth,
            s.photo_path, s.photo_provider, u.system_id, st.name as stream_name,
            dr.class_teacher_comment, dr.head_teacher_comment
       from student_enrollment en
       join students s on s.user_id = en.student_user_id
       join users u on u.id = en.student_user_id
       left join streams st on st.id = en.stream_id
       left join developmental_remark dr on dr.student_user_id = en.student_user_id and dr.term_id = $3
      where en.school_id = $1 and en.class_id = $2 and en.status = 'active'
        and ($4::uuid is null or en.stream_id = $4::uuid)
        and ($5::uuid is null or en.student_user_id = $5::uuid)
      order by s.last_name, s.first_name`,
    [schoolId, classId, termId, streamId, opts.studentUserId ?? null],
  );

  const { rows: ratings } = await pool.query<{
    student_user_id: string;
    learning_area_id: string;
    rating: DevelopmentalRating | null;
    teacher_comment: string | null;
  }>(
    `select student_user_id, learning_area_id, rating, teacher_comment
       from developmental_assessment
      where school_id = $1 and term_id = $2 and student_user_id = any($3::uuid[])`,
    [schoolId, termId, pupils.map((p) => p.student_user_id)],
  );
  const byPupil = new Map<string, AssessmentSheetPupil["ratings"]>();
  for (const r of ratings) {
    const entry = byPupil.get(r.student_user_id) ?? {};
    entry[r.learning_area_id] = { rating: r.rating, comment: r.teacher_comment };
    byPupil.set(r.student_user_id, entry);
  }

  return {
    class: { id: klass.id, name: klass.name, classTeacherName: klass.classTeacherName },
    term,
    learningAreas,
    pupils: pupils.map((p) => ({
      studentUserId: p.student_user_id,
      name: [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(" "),
      systemId: p.system_id,
      photoUrl: p.photo_path
        ? fileUrl({ provider: p.photo_provider ?? "local", ref: p.photo_path, mimeType: "image/jpeg" })
        : null,
      gender: p.gender,
      dateOfBirth: p.date_of_birth,
      streamName: p.stream_name,
      ratings: byPupil.get(p.student_user_id) ?? {},
      classTeacherComment: p.class_teacher_comment,
      headTeacherComment: p.head_teacher_comment,
    })),
    canEdit: isAdmin(actor) || klass.actorTeaches,
    canEditHeadTeacherRemark: isAdmin(actor),
  };
}

const RATINGS: (DevelopmentalRating | null)[] = ["emerging", "developing", "proficient", null];

export async function saveAssessmentSheet(
  schoolId: string,
  classId: string,
  termId: string,
  entries: AssessmentEntryInput[],
  remarks: RemarkInput[],
  actor: AssessmentActor,
): Promise<void> {
  const klass = await loadClass(schoolId, classId, actor);
  if (!isAdmin(actor) && !klass.actorTeaches) throw new NotClassTeacherError();
  await loadTerm(schoolId, klass.academicYearId, termId);

  for (const e of entries) {
    if (!RATINGS.includes(e.rating)) throw new InvalidAssessmentError(`Unknown rating "${e.rating}".`);
  }
  if (!isAdmin(actor) && remarks.some((r) => r.headTeacherComment !== undefined)) {
    throw new InvalidAssessmentError("Only a school administrator can write the head teacher's remark.");
  }

  // Every pupil written to must actually be in this class, and every area
  // must be this school's — never trust ids straight off the wire.
  const pupilIds = [...new Set([...entries.map((e) => e.studentUserId), ...remarks.map((r) => r.studentUserId)])];
  if (pupilIds.length > 0) {
    const { rowCount } = await pool.query(
      `select distinct student_user_id from student_enrollment
        where school_id = $1 and class_id = $2 and status = 'active' and student_user_id = any($3::uuid[])`,
      [schoolId, classId, pupilIds],
    );
    if (rowCount !== pupilIds.length) throw new InvalidAssessmentError("One or more pupils aren't in this class.");
  }
  const areaIds = [...new Set(entries.map((e) => e.learningAreaId))];
  if (areaIds.length > 0) {
    const { rowCount } = await pool.query(
      `select 1 from learning_area where school_id = $1 and id = any($2::uuid[])`,
      [schoolId, areaIds],
    );
    if (rowCount !== areaIds.length) throw new InvalidAssessmentError("Unknown learning area.");
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const e of entries) {
      await client.query(
        `insert into developmental_assessment
           (school_id, student_user_id, term_id, learning_area_id, rating, teacher_comment, recorded_by)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (student_user_id, term_id, learning_area_id) do update
           set rating = excluded.rating,
               teacher_comment = case when $8 then excluded.teacher_comment
                                      else developmental_assessment.teacher_comment end,
               recorded_by = excluded.recorded_by, updated_at = now()`,
        [
          schoolId,
          e.studentUserId,
          termId,
          e.learningAreaId,
          e.rating,
          e.teacherComment?.trim() || null,
          actor.userId,
          e.teacherComment !== undefined,
        ],
      );
    }
    for (const r of remarks) {
      // undefined = leave that remark as it is; null/"" = clear it.
      await client.query(
        `insert into developmental_remark
           (school_id, student_user_id, term_id, class_teacher_comment, head_teacher_comment, updated_by)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (student_user_id, term_id) do update
           set class_teacher_comment = case when $7 then excluded.class_teacher_comment
                                            else developmental_remark.class_teacher_comment end,
               head_teacher_comment = case when $8 then excluded.head_teacher_comment
                                           else developmental_remark.head_teacher_comment end,
               updated_by = excluded.updated_by, updated_at = now()`,
        [
          schoolId,
          r.studentUserId,
          termId,
          r.classTeacherComment?.trim() || null,
          r.headTeacherComment?.trim() || null,
          actor.userId,
          r.classTeacherComment !== undefined,
          r.headTeacherComment !== undefined,
        ],
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
