import { pool } from "../../../shared/db/index.js";
import type { SchoolLevel } from "../../../shared/levels.js";

// The daily class register: once a day the class teacher marks every pupil
// Present, Absent, Late or Excused (with a reason). A school admin can take
// or correct any class's register. Hangs off term_id as well as the date —
// schools report attendance per term.

export type AttendanceStatus = "present" | "absent" | "late" | "excused";
export const STATUSES: AttendanceStatus[] = ["present", "absent", "late", "excused"];

export interface AttendanceActor {
  userId: string;
  role: string;
}

export class AttendanceError extends Error {
  constructor(
    message: string,
    public status: 400 | 403 | 404 = 400,
  ) {
    super(message);
    this.name = "AttendanceError";
  }
}

const isAdmin = (a: AttendanceActor) => a.role !== "teacher";

// A teacher takes the register of a class they're class teacher of, or of a
// stream they're stream teacher of.
const TEACHES_SQL = `
  (c.class_teacher_id = $T
   or exists (select 1 from streams st where st.class_id = c.id and st.stream_teacher_id = $T))
`;

export interface RegisterClassSummary {
  classId: string;
  className: string;
  phase: SchoolLevel;
  classTeacherName: string | null;
  pupils: number;
  marked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
}

/** Every class the caller keeps a register for, with how far today's (or the
 * given day's) register has got. */
export async function listRegisterClasses(
  schoolId: string,
  date: string,
  actor: AttendanceActor,
  levels: SchoolLevel[] | null,
): Promise<RegisterClassSummary[]> {
  const params: unknown[] = [schoolId, date, levels];
  let teacherClause = "";
  if (!isAdmin(actor)) {
    params.push(actor.userId);
    teacherClause = `and ${TEACHES_SQL.replaceAll("$T", `$${params.length}`)}`;
  }
  const { rows } = await pool.query<{
    class_id: string;
    class_name: string;
    phase: SchoolLevel;
    class_teacher_name: string | null;
    pupils: string;
    marked: string;
    present: string;
    absent: string;
    late: string;
    excused: string;
  }>(
    `select c.id as class_id, stage_label(c.school_id, cs.id) as class_name, cs.phase,
            nullif(trim(coalesce(tf.first_name, '') || ' ' || coalesce(tf.last_name, '')), '') as class_teacher_name,
            count(distinct en.student_user_id)::text as pupils,
            count(ar.id)::text as marked,
            count(ar.id) filter (where ar.status = 'present')::text as present,
            count(ar.id) filter (where ar.status = 'absent')::text as absent,
            count(ar.id) filter (where ar.status = 'late')::text as late,
            count(ar.id) filter (where ar.status = 'excused')::text as excused
       from classes c
       join academic_years ay on ay.id = c.academic_year_id and ay.is_current
       join curriculum_stage cs on cs.id = c.curriculum_stage_id
       left join staff tf on tf.user_id = c.class_teacher_id
       left join student_enrollment en on en.class_id = c.id and en.status = 'active'
       left join attendance_record ar on ar.student_user_id = en.student_user_id
                                     and ar.attendance_date = $2 and ar.class_id = c.id
      where c.school_id = $1 and c.is_active
        and ($3::text[] is null or cs.phase = any($3::text[]))
        ${teacherClause}
      group by c.id, cs.id, cs.phase, cs.sequence_number, tf.first_name, tf.last_name
      order by cs.sequence_number`,
    params,
  );
  return rows.map((r) => ({
    classId: r.class_id,
    className: r.class_name,
    phase: r.phase,
    classTeacherName: r.class_teacher_name,
    pupils: Number(r.pupils),
    marked: Number(r.marked),
    present: Number(r.present),
    absent: Number(r.absent),
    late: Number(r.late),
    excused: Number(r.excused),
  }));
}

interface ClassCtx {
  id: string;
  name: string;
  phase: SchoolLevel;
  academicYearId: string;
  actorTeaches: boolean;
}

async function loadClass(schoolId: string, classId: string, actor: AttendanceActor): Promise<ClassCtx> {
  const { rows } = await pool.query<{
    id: string;
    name: string;
    phase: SchoolLevel;
    academic_year_id: string;
    actor_teaches: boolean;
  }>(
    `select c.id, stage_label(c.school_id, cs.id) as name, cs.phase, c.academic_year_id, ${TEACHES_SQL.replaceAll("$T", "$3")} as actor_teaches
       from classes c join curriculum_stage cs on cs.id = c.curriculum_stage_id
      where c.id = $1 and c.school_id = $2`,
    [classId, schoolId, actor.userId],
  );
  const r = rows[0];
  if (!r) throw new AttendanceError("That class doesn't exist for this school.", 404);
  if (!isAdmin(actor) && !r.actor_teaches) {
    throw new AttendanceError("Only this class's teacher (or a school administrator) can take its register.", 403);
  }
  return { id: r.id, name: r.name, phase: r.phase, academicYearId: r.academic_year_id, actorTeaches: r.actor_teaches };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(date: string): void {
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) throw new AttendanceError("Invalid date.");
  // "Today" in the school's timezone (East Africa, UTC+3) — a register can't
  // be taken for a day that hasn't happened yet.
  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  if (date > today) throw new AttendanceError("You can't take the register for a future date.");
}

export interface RegisterPupil {
  studentUserId: string;
  name: string;
  systemId: string | null;
  streamName: string | null;
  status: AttendanceStatus | null;
  reason: string | null;
}

export interface Register {
  class: { id: string; name: string };
  date: string;
  term: { id: string; name: string } | null;
  pupils: RegisterPupil[];
  lastUpdatedAt: string | null;
}

async function termFor(schoolId: string, academicYearId: string, date: string) {
  const { rows } = await pool.query<{ id: string; name: string }>(
    `select id, name from terms
      where school_id = $1 and academic_year_id = $2 and $3::date between start_date and end_date
      limit 1`,
    [schoolId, academicYearId, date],
  );
  return rows[0] ?? null;
}

export async function getRegister(
  schoolId: string,
  classId: string,
  date: string,
  streamId: string | null,
  actor: AttendanceActor,
): Promise<Register> {
  const klass = await loadClass(schoolId, classId, actor);
  assertDate(date);
  const [term, pupils] = await Promise.all([
    termFor(schoolId, klass.academicYearId, date),
    pool.query<{
      student_user_id: string;
      first_name: string;
      middle_name: string | null;
      last_name: string;
      system_id: string | null;
      stream_name: string | null;
      status: AttendanceStatus | null;
      reason: string | null;
      updated_at: string | null;
    }>(
      `select en.student_user_id, s.first_name, s.middle_name, s.last_name, u.system_id, st.name as stream_name,
              ar.status, ar.reason, ar.updated_at
         from student_enrollment en
         join students s on s.user_id = en.student_user_id
         join users u on u.id = en.student_user_id
         left join streams st on st.id = en.stream_id
         left join attendance_record ar on ar.student_user_id = en.student_user_id and ar.attendance_date = $3
        where en.school_id = $1 and en.class_id = $2 and en.status = 'active'
          and ($4::uuid is null or en.stream_id = $4::uuid)
        order by s.last_name, s.first_name`,
      [schoolId, classId, date, streamId],
    ),
  ]);
  const updated = pupils.rows.map((p) => p.updated_at).filter(Boolean).sort().pop() ?? null;
  return {
    class: { id: klass.id, name: klass.name },
    date,
    term,
    pupils: pupils.rows.map((p) => ({
      studentUserId: p.student_user_id,
      name: [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(" "),
      systemId: p.system_id,
      streamName: p.stream_name,
      status: p.status,
      reason: p.reason,
    })),
    lastUpdatedAt: updated,
  };
}

export interface RegisterEntry {
  studentUserId: string;
  status: AttendanceStatus | null;
  reason?: string | null;
}

export async function saveRegister(
  schoolId: string,
  classId: string,
  date: string,
  entries: RegisterEntry[],
  actor: AttendanceActor,
): Promise<number> {
  const klass = await loadClass(schoolId, classId, actor);
  assertDate(date);
  const term = await termFor(schoolId, klass.academicYearId, date);
  const ids = [...new Set(entries.map((e) => e.studentUserId))];
  if (ids.length === 0) return 0;
  const { rowCount } = await pool.query(
    `select 1 from student_enrollment
      where school_id = $1 and class_id = $2 and status = 'active' and student_user_id = any($3::uuid[])`,
    [schoolId, classId, ids],
  );
  if (rowCount !== ids.length) throw new AttendanceError("One or more pupils aren't in this class.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const e of entries) {
      if (e.status === null) {
        await client.query(`delete from attendance_record where student_user_id = $1 and attendance_date = $2`, [
          e.studentUserId,
          date,
        ]);
        continue;
      }
      if (!STATUSES.includes(e.status)) throw new AttendanceError(`Unknown status "${e.status}".`);
      await client.query(
        `insert into attendance_record
           (school_id, student_user_id, class_id, term_id, attendance_date, status, reason, recorded_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (student_user_id, attendance_date) do update
           set status = excluded.status, reason = excluded.reason, class_id = excluded.class_id,
               term_id = excluded.term_id, recorded_by = excluded.recorded_by, updated_at = now()`,
        [
          schoolId,
          e.studentUserId,
          classId,
          term?.id ?? null,
          date,
          e.status,
          e.status === "present" ? null : e.reason?.trim() || null,
          actor.userId,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return entries.length;
}

export interface ClassRate {
  classId: string;
  className: string;
  daysTaken: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  /** Present + late over everything marked, 0–100. Null with nothing marked. */
  rate: number | null;
}

export interface FrequentAbsentee {
  studentUserId: string;
  name: string;
  className: string;
  absences: number;
}

/** Attendance rates per class over a date range, and the pupils absent most. */
export async function attendanceSummary(
  schoolId: string,
  from: string,
  to: string,
  levels: SchoolLevel[] | null,
): Promise<{ classes: ClassRate[]; frequentAbsentees: FrequentAbsentee[] }> {
  const [classes, absentees] = await Promise.all([
    pool.query<{
      class_id: string;
      class_name: string;
      days: string;
      present: string;
      absent: string;
      late: string;
      excused: string;
    }>(
      `select c.id as class_id, stage_label(c.school_id, cs.id) as class_name,
              count(distinct ar.attendance_date)::text as days,
              count(*) filter (where ar.status = 'present')::text as present,
              count(*) filter (where ar.status = 'absent')::text as absent,
              count(*) filter (where ar.status = 'late')::text as late,
              count(*) filter (where ar.status = 'excused')::text as excused
         from classes c
         join academic_years ay on ay.id = c.academic_year_id and ay.is_current
         join curriculum_stage cs on cs.id = c.curriculum_stage_id
         left join attendance_record ar on ar.class_id = c.id and ar.attendance_date between $2 and $3
        where c.school_id = $1 and ($4::text[] is null or cs.phase = any($4::text[]))
        group by c.id, cs.id, cs.sequence_number
        order by cs.sequence_number`,
      [schoolId, from, to, levels],
    ),
    pool.query<{ student_user_id: string; name: string; class_name: string; absences: string }>(
      `select ar.student_user_id, trim(s.first_name || ' ' || s.last_name) as name, stage_label(c.school_id, cs.id) as class_name,
              count(*)::text as absences
         from attendance_record ar
         join students s on s.user_id = ar.student_user_id
         join classes c on c.id = ar.class_id
         join curriculum_stage cs on cs.id = c.curriculum_stage_id
        where ar.school_id = $1 and ar.status = 'absent' and ar.attendance_date between $2 and $3
          and ($4::text[] is null or cs.phase = any($4::text[]))
        group by ar.student_user_id, s.first_name, s.last_name, c.school_id, cs.id
        order by count(*) desc
        limit 10`,
      [schoolId, from, to, levels],
    ),
  ]);
  return {
    classes: classes.rows.map((r) => {
      const present = Number(r.present);
      const late = Number(r.late);
      const total = present + late + Number(r.absent) + Number(r.excused);
      return {
        classId: r.class_id,
        className: r.class_name,
        daysTaken: Number(r.days),
        present,
        absent: Number(r.absent),
        late,
        excused: Number(r.excused),
        rate: total ? Math.round(((present + late) / total) * 1000) / 10 : null,
      };
    }),
    frequentAbsentees: absentees.rows.map((r) => ({
      studentUserId: r.student_user_id,
      name: r.name,
      className: r.class_name,
      absences: Number(r.absences),
    })),
  };
}

export interface StudentAttendanceHistory {
  totals: Record<AttendanceStatus, number>;
  records: { date: string; status: AttendanceStatus; reason: string | null }[];
}

/** One pupil's register marks for a term (or everything, newest first). */
export async function studentAttendance(
  schoolId: string,
  studentUserId: string,
  termId: string | null,
): Promise<StudentAttendanceHistory> {
  const { rows } = await pool.query<{ date: string; status: AttendanceStatus; reason: string | null }>(
    `select to_char(attendance_date, 'YYYY-MM-DD') as date, status, reason
       from attendance_record
      where school_id = $1 and student_user_id = $2 and ($3::uuid is null or term_id = $3::uuid)
      order by attendance_date desc`,
    [schoolId, studentUserId, termId],
  );
  const totals = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const r of rows) totals[r.status]++;
  return { totals, records: rows };
}
