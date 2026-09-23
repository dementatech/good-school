import type { PoolClient } from "pg";
import { pool } from "../../../shared/db/index.js";
import { sectionOfLevel, type SchoolLevel, type SchoolSection } from "../../../shared/levels.js";

// School timetables — built by hand on a class × day × period grid, with the
// server refusing clashes (a teacher in two places, a class double-booked).
// Per term: Ugandan schools re-timetable every term. The day's structure
// (periods, breaks, times) is per section — Nursery keeps a shorter day.

export type PeriodKind = "lesson" | "break" | "lunch" | "assembly" | "other";

export interface PeriodRecord {
  id: string;
  section: SchoolSection;
  label: string;
  startTime: string; // "08:00"
  endTime: string;
  kind: PeriodKind;
  sortOrder: number;
}

export interface PeriodInput {
  id?: string;
  label: string;
  startTime: string;
  endTime: string;
  kind: PeriodKind;
}

export interface SlotRecord {
  id: string;
  termId: string;
  classId: string;
  className: string;
  streamId: string | null;
  streamName: string | null;
  dayOfWeek: number;
  periodId: string;
  subjectId: string | null;
  subjectName: string | null;
  subjectShortName: string | null;
  activity: string | null;
  staffId: string | null;
  teacherName: string | null;
  room: string | null;
}

export interface SlotInput {
  termId: string;
  classId: string;
  streamId?: string | null;
  dayOfWeek: number;
  periodId: string;
  subjectId?: string | null;
  activity?: string | null;
  staffId?: string | null;
  room?: string | null;
}

export class TimetableError extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "TimetableError";
  }
}

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ─── Day structure ──────────────────────────────────────────────────────────

const hhmm = (t: string) => t.slice(0, 5);

export async function listPeriods(schoolId: string, section: SchoolSection): Promise<PeriodRecord[]> {
  const { rows } = await pool.query<{
    id: string;
    section: SchoolSection;
    label: string;
    start_time: string;
    end_time: string;
    kind: PeriodKind;
    sort_order: number;
  }>(
    `select id, section, label, start_time::text, end_time::text, kind, sort_order
       from timetable_period where school_id = $1 and section = $2
      order by start_time, sort_order`,
    [schoolId, section],
  );
  return rows.map((r) => ({
    id: r.id,
    section: r.section,
    label: r.label,
    startTime: hhmm(r.start_time),
    endTime: hhmm(r.end_time),
    kind: r.kind,
    sortOrder: r.sort_order,
  }));
}

export async function getTimetableDays(schoolId: string, section: SchoolSection): Promise<number[]> {
  const { rows } = await pool.query<{ timetable_days: number[] }>(
    `select timetable_days from school_section where school_id = $1 and section = $2`,
    [schoolId, section],
  );
  return rows[0]?.timetable_days ?? [1, 2, 3, 4, 5];
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Replaces the section's day structure. Periods keep their id (and so their
 * timetabled lessons) when sent back with it; a period left out is removed,
 * along with any lessons in it.
 */
export async function savePeriods(
  schoolId: string,
  section: SchoolSection,
  periods: PeriodInput[],
  days: number[],
): Promise<PeriodRecord[]> {
  if (periods.length === 0) throw new TimetableError("A school day needs at least one period.");
  const cleanDays = [...new Set(days)].filter((d) => d >= 1 && d <= 6).sort();
  if (cleanDays.length === 0) throw new TimetableError("Pick at least one school day.");
  for (const p of periods) {
    if (!p.label.trim()) throw new TimetableError("Every period needs a name.");
    if (!TIME_RE.test(p.startTime) || !TIME_RE.test(p.endTime)) {
      throw new TimetableError(`"${p.label}" needs start and end times like 08:00.`);
    }
    if (p.endTime <= p.startTime) throw new TimetableError(`"${p.label}" must end after it starts.`);
  }
  const sorted = [...periods].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startTime < sorted[i - 1].endTime) {
      throw new TimetableError(`"${sorted[i - 1].label}" and "${sorted[i].label}" overlap.`);
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const keepIds = periods.filter((p) => p.id).map((p) => p.id!);
    await client.query(
      `delete from timetable_period where school_id = $1 and section = $2 and not (id = any($3::uuid[]))`,
      [schoolId, section, keepIds],
    );
    for (const [i, p] of sorted.entries()) {
      if (p.id) {
        await client.query(
          `update timetable_period set label = $4, start_time = $5, end_time = $6, kind = $7, sort_order = $8,
                  updated_at = now()
            where id = $1 and school_id = $2 and section = $3`,
          [p.id, schoolId, section, p.label.trim(), p.startTime, p.endTime, p.kind, i],
        );
      } else {
        await client.query(
          `insert into timetable_period (school_id, section, label, start_time, end_time, kind, sort_order)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [schoolId, section, p.label.trim(), p.startTime, p.endTime, p.kind, i],
        );
      }
    }
    await client.query(
      `insert into school_section (school_id, section, timetable_days) values ($1, $2, $3)
       on conflict (school_id, section) do update set timetable_days = excluded.timetable_days, updated_at = now()`,
      [schoolId, section, cleanDays],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return listPeriods(schoolId, section);
}

/** A typical Ugandan school day to start from — every row stays editable. */
export function standardDay(section: SchoolSection): PeriodInput[] {
  if (section === "KINDERGARTEN") {
    return [
      { label: "Arrival & free play", startTime: "08:00", endTime: "08:30", kind: "other" },
      { label: "Session 1", startTime: "08:30", endTime: "09:00", kind: "lesson" },
      { label: "Session 2", startTime: "09:00", endTime: "09:30", kind: "lesson" },
      { label: "Break & snack", startTime: "09:30", endTime: "10:00", kind: "break" },
      { label: "Session 3", startTime: "10:00", endTime: "10:30", kind: "lesson" },
      { label: "Session 4", startTime: "10:30", endTime: "11:00", kind: "lesson" },
      { label: "Outdoor play", startTime: "11:00", endTime: "11:30", kind: "other" },
      { label: "Session 5", startTime: "11:30", endTime: "12:00", kind: "lesson" },
      { label: "Lunch & home time", startTime: "12:00", endTime: "12:30", kind: "lunch" },
    ];
  }
  const minutes = section === "PRIMARY" ? 35 : 40;
  const at = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const out: PeriodInput[] = [];
  let t = 8 * 60;
  const lesson = (n: number) => {
    out.push({ label: `Period ${n}`, startTime: at(t), endTime: at(t + minutes), kind: "lesson" });
    t += minutes;
  };
  const pause = (label: string, kind: PeriodKind, len: number) => {
    out.push({ label, startTime: at(t), endTime: at(t + len), kind });
    t += len;
  };
  lesson(1);
  lesson(2);
  lesson(3);
  pause("Break", "break", 20);
  lesson(4);
  lesson(5);
  lesson(6);
  pause("Lunch", "lunch", 60);
  lesson(7);
  lesson(8);
  if (section === "SECONDARY") lesson(9);
  return out;
}

// ─── Grid ───────────────────────────────────────────────────────────────────

const SELECT_SLOT = `
  select sl.id, sl.term_id, sl.class_id, stage_label(c.school_id, cs.id) as class_name, sl.stream_id, st.name as stream_name,
         sl.day_of_week, sl.period_id, sl.subject_id, sub.name as subject_name,
         sub.short_name as subject_short_name, sl.activity, sl.staff_id,
         nullif(trim(coalesce(tf.first_name, '') || ' ' || coalesce(tf.last_name, '')), '') as teacher_name,
         sl.room
    from timetable_slot sl
    join classes c on c.id = sl.class_id
    join curriculum_stage cs on cs.id = c.curriculum_stage_id
    left join streams st on st.id = sl.stream_id
    left join subject sub on sub.id = sl.subject_id
    left join staff tf on tf.user_id = sl.staff_id
`;

interface SlotRow {
  id: string;
  term_id: string;
  class_id: string;
  class_name: string;
  stream_id: string | null;
  stream_name: string | null;
  day_of_week: number;
  period_id: string;
  subject_id: string | null;
  subject_name: string | null;
  subject_short_name: string | null;
  activity: string | null;
  staff_id: string | null;
  teacher_name: string | null;
  room: string | null;
}

const mapSlot = (r: SlotRow): SlotRecord => ({
  id: r.id,
  termId: r.term_id,
  classId: r.class_id,
  className: r.class_name,
  streamId: r.stream_id,
  streamName: r.stream_name,
  dayOfWeek: r.day_of_week,
  periodId: r.period_id,
  subjectId: r.subject_id,
  subjectName: r.subject_name,
  subjectShortName: r.subject_short_name,
  activity: r.activity,
  staffId: r.staff_id,
  teacherName: r.teacher_name,
  room: r.room,
});

interface ClassInfo {
  id: string;
  name: string;
  academicYearId: string;
  phase: SchoolLevel;
  section: SchoolSection;
  hasStreams: boolean;
}

export async function loadClass(schoolId: string, classId: string): Promise<ClassInfo> {
  const { rows } = await pool.query<{
    id: string;
    name: string;
    academic_year_id: string;
    phase: SchoolLevel;
    has_streams: boolean;
  }>(
    `select c.id, stage_label(c.school_id, cs.id) as name, c.academic_year_id, cs.phase, c.has_streams
       from classes c join curriculum_stage cs on cs.id = c.curriculum_stage_id
      where c.id = $1 and c.school_id = $2`,
    [classId, schoolId],
  );
  const r = rows[0];
  if (!r) throw new TimetableError("That class doesn't exist for this school.", 404);
  return {
    id: r.id,
    name: r.name,
    academicYearId: r.academic_year_id,
    phase: r.phase,
    section: sectionOfLevel(r.phase),
    hasStreams: r.has_streams,
  };
}

async function assertTermOfYear(db: PoolClient | typeof pool, schoolId: string, termId: string, yearId: string) {
  const { rowCount } = await db.query(
    `select 1 from terms where id = $1 and school_id = $2 and academic_year_id = $3`,
    [termId, schoolId, yearId],
  );
  if (!rowCount) throw new TimetableError("That term isn't in this class's academic year.", 404);
}

export interface ClassTimetable {
  class: { id: string; name: string; section: SchoolSection };
  stream: { id: string; name: string } | null;
  days: number[];
  periods: PeriodRecord[];
  slots: SlotRecord[];
}

/** A class's (or one stream's) week. A stream sees its own lessons plus any
 * the whole class takes together. */
export async function getClassTimetable(
  schoolId: string,
  termId: string,
  classId: string,
  streamId: string | null,
): Promise<ClassTimetable> {
  const klass = await loadClass(schoolId, classId);
  await assertTermOfYear(pool, schoolId, termId, klass.academicYearId);
  const [periods, days, slotRows, stream] = await Promise.all([
    listPeriods(schoolId, klass.section),
    getTimetableDays(schoolId, klass.section),
    pool.query<SlotRow>(
      `${SELECT_SLOT}
        where sl.school_id = $1 and sl.term_id = $2 and sl.class_id = $3
          and ($4::uuid is null or sl.stream_id is null or sl.stream_id = $4::uuid)
        order by sl.day_of_week`,
      [schoolId, termId, classId, streamId],
    ),
    streamId
      ? pool.query<{ id: string; name: string }>(`select id, name from streams where id = $1 and class_id = $2`, [
          streamId,
          classId,
        ])
      : Promise.resolve({ rows: [] as { id: string; name: string }[] }),
  ]);
  return {
    class: { id: klass.id, name: klass.name, section: klass.section },
    stream: stream.rows[0] ?? null,
    days,
    periods,
    slots: slotRows.rows.map(mapSlot),
  };
}

/** The lead teacher assigned to teach this subject in this class/stream — the
 * grid pre-fills it, the admin can change it. */
export async function suggestedTeacher(
  schoolId: string,
  academicYearId: string,
  subjectId: string,
  classId: string,
  streamId: string | null,
): Promise<string | null> {
  const { rows } = await pool.query<{ staff_id: string }>(
    `select staff_id from subject_teacher_assignment
      where school_id = $1 and academic_year_id = $2 and subject_id = $3 and class_id = $4
        and status = 'active' and is_lead
        and (stream_id is null or stream_id = $5::uuid)
      order by (stream_id is not null) desc
      limit 1`,
    [schoolId, academicYearId, subjectId, classId, streamId],
  );
  return rows[0]?.staff_id ?? null;
}

/** Puts (or replaces) one lesson in the grid, refusing any clash. */
export async function setSlot(schoolId: string, input: SlotInput, actorId: string): Promise<SlotRecord> {
  const klass = await loadClass(schoolId, input.classId);
  await assertTermOfYear(pool, schoolId, input.termId, klass.academicYearId);
  const streamId = input.streamId || null;
  if (streamId) {
    const { rowCount } = await pool.query(`select 1 from streams where id = $1 and class_id = $2`, [
      streamId,
      input.classId,
    ]);
    if (!rowCount) throw new TimetableError("That stream isn't part of this class.", 404);
  }
  if (!(input.dayOfWeek >= 1 && input.dayOfWeek <= 6)) throw new TimetableError("Unknown day.");
  const days = await getTimetableDays(schoolId, klass.section);
  if (!days.includes(input.dayOfWeek)) {
    throw new TimetableError(`${DAY_NAMES[input.dayOfWeek]} isn't a school day for this section.`);
  }
  const period = await pool.query<{ kind: PeriodKind; label: string }>(
    `select kind, label from timetable_period where id = $1 and school_id = $2 and section = $3`,
    [input.periodId, schoolId, klass.section],
  );
  if (!period.rows[0]) throw new TimetableError("Unknown period.", 404);
  if (period.rows[0].kind !== "lesson") {
    throw new TimetableError(`${period.rows[0].label} isn't a lesson period.`);
  }

  const subjectId = input.subjectId || null;
  const activity = input.activity?.trim() || null;
  if (!subjectId && !activity) throw new TimetableError("Pick a subject, or name the activity.");
  if (subjectId) {
    // The subject must be one this school offers at this class's level this year.
    const { rowCount } = await pool.query(
      `select 1 from subject s
         join subject_offering o on o.subject_id = s.id and o.school_id = $1 and o.academic_year_id = $3
                                and o.is_offered
        where s.id = $2 and s.phase = $4`,
      [schoolId, subjectId, klass.academicYearId, klass.phase],
    );
    if (!rowCount) throw new TimetableError("That subject isn't offered at this level this year.");
  }

  let staffId = input.staffId === undefined ? null : input.staffId || null;
  if (input.staffId === undefined && subjectId) {
    staffId = await suggestedTeacher(schoolId, klass.academicYearId, subjectId, input.classId, streamId);
  }
  if (staffId) {
    const { rowCount } = await pool.query(`select 1 from users where id = $1 and school_id = $2`, [
      staffId,
      schoolId,
    ]);
    if (!rowCount) throw new TimetableError("That teacher isn't at this school.", 404);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialise edits to the same term's grid so two admins can't race a clash in.
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`timetable:${input.termId}`]);

    // Class clash: a whole-class lesson collides with any stream's lesson at
    // the same time, and vice versa. The cell being replaced doesn't count.
    const classClash = await client.query<{ label: string }>(
      `select coalesce(sub.name, sl.activity) || coalesce(' (' || st.name || ')', '') as label
         from timetable_slot sl
         left join subject sub on sub.id = sl.subject_id
         left join streams st on st.id = sl.stream_id
        where sl.term_id = $1 and sl.class_id = $2 and sl.day_of_week = $3 and sl.period_id = $4
          and coalesce(sl.stream_id, '00000000-0000-0000-0000-000000000000') <>
              coalesce($5::uuid, '00000000-0000-0000-0000-000000000000')
          and ($5::uuid is null or sl.stream_id is null)
        limit 1`,
      [input.termId, input.classId, input.dayOfWeek, input.periodId, streamId],
    );
    if (classClash.rows[0]) {
      throw new TimetableError(
        `${klass.name} already has ${classClash.rows[0].label} at that time.`,
        409,
      );
    }

    if (staffId) {
      const teacherClash = await client.query<{ where_: string }>(
        `select stage_label(c.school_id, cs.id) || coalesce(' ' || st.name, '') || ' — ' || coalesce(sub.name, sl.activity) as where_
           from timetable_slot sl
           join classes c on c.id = sl.class_id
           join curriculum_stage cs on cs.id = c.curriculum_stage_id
           left join streams st on st.id = sl.stream_id
           left join subject sub on sub.id = sl.subject_id
          where sl.term_id = $1 and sl.staff_id = $2 and sl.day_of_week = $3 and sl.period_id = $4
            and not (sl.class_id = $5
                     and coalesce(sl.stream_id, '00000000-0000-0000-0000-000000000000') =
                         coalesce($6::uuid, '00000000-0000-0000-0000-000000000000'))
          limit 1`,
        [input.termId, staffId, input.dayOfWeek, input.periodId, input.classId, streamId],
      );
      if (teacherClash.rows[0]) {
        const name = await client.query<{ name: string }>(
          `select trim(first_name || ' ' || last_name) as name from staff where user_id = $1`,
          [staffId],
        );
        throw new TimetableError(
          `${name.rows[0]?.name ?? "That teacher"} is already teaching ${teacherClash.rows[0].where_} ` +
            `on ${DAY_NAMES[input.dayOfWeek]}, ${period.rows[0].label}.`,
          409,
        );
      }
    }

    const { rows } = await client.query<{ id: string }>(
      `insert into timetable_slot
         (school_id, term_id, class_id, stream_id, day_of_week, period_id, subject_id, activity, staff_id, room,
          created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (term_id, class_id, coalesce(stream_id, '00000000-0000-0000-0000-000000000000'::uuid),
                    day_of_week, period_id)
       do update set subject_id = excluded.subject_id, activity = excluded.activity,
                     staff_id = excluded.staff_id, room = excluded.room, updated_at = now()
       returning id`,
      [
        schoolId,
        input.termId,
        input.classId,
        streamId,
        input.dayOfWeek,
        input.periodId,
        subjectId,
        subjectId ? null : activity,
        staffId,
        input.room?.trim() || null,
        actorId,
      ],
    );
    await client.query("COMMIT");
    const out = await pool.query<SlotRow>(`${SELECT_SLOT} where sl.id = $1`, [rows[0].id]);
    return mapSlot(out.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteSlot(schoolId: string, id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`delete from timetable_slot where id = $1 and school_id = $2`, [id, schoolId]);
  return (rowCount ?? 0) > 0;
}

/** Starts a term's timetable from another term's — same classes, same lessons.
 * Only fills cells that are still empty, so it never overwrites work. */
export async function copyTimetable(
  schoolId: string,
  fromTermId: string,
  toTermId: string,
  classIds: string[],
): Promise<number> {
  const { rowCount } = await pool.query(
    `insert into timetable_slot
       (school_id, term_id, class_id, stream_id, day_of_week, period_id, subject_id, activity, staff_id, room)
     select sl.school_id, $3, sl.class_id, sl.stream_id, sl.day_of_week, sl.period_id, sl.subject_id,
            sl.activity, sl.staff_id, sl.room
       from timetable_slot sl
       join terms tf on tf.id = sl.term_id
       join terms tt on tt.id = $3 and tt.school_id = $1 and tt.academic_year_id = tf.academic_year_id
      where sl.school_id = $1 and sl.term_id = $2 and sl.class_id = any($4::uuid[])
     on conflict do nothing`,
    [schoolId, fromTermId, toTermId, classIds],
  );
  return rowCount ?? 0;
}

// ─── Views ──────────────────────────────────────────────────────────────────

/** Everything one teacher teaches this term — their personal timetable. */
export async function getTeacherTimetable(
  schoolId: string,
  termId: string,
  staffId: string,
): Promise<{ periodsBySection: Partial<Record<SchoolSection, PeriodRecord[]>>; days: number[]; slots: SlotRecord[] }> {
  const { rows } = await pool.query<SlotRow & { phase: SchoolLevel }>(
    `${SELECT_SLOT.replace("select sl.id,", "select cs.phase, sl.id,")}
      where sl.school_id = $1 and sl.term_id = $2 and sl.staff_id = $3
      order by sl.day_of_week`,
    [schoolId, termId, staffId],
  );
  const sections = [...new Set(rows.map((r) => sectionOfLevel(r.phase)))];
  const periodsBySection: Partial<Record<SchoolSection, PeriodRecord[]>> = {};
  const daySet = new Set<number>();
  for (const s of sections) {
    periodsBySection[s] = await listPeriods(schoolId, s);
    (await getTimetableDays(schoolId, s)).forEach((d) => daySet.add(d));
  }
  return { periodsBySection, days: [...daySet].sort(), slots: rows.map(mapSlot) };
}

export interface TeacherLoad {
  staffId: string;
  teacherName: string;
  lessonsPerWeek: number;
  classes: number;
}

/** Lessons per week for each teacher on the term's timetable (optionally
 * only the given levels' classes). */
export async function teacherLoads(
  schoolId: string,
  termId: string,
  levels: SchoolLevel[] | null,
): Promise<TeacherLoad[]> {
  const { rows } = await pool.query<{ staff_id: string; teacher_name: string; lessons: string; classes: string }>(
    `select sl.staff_id, trim(tf.first_name || ' ' || tf.last_name) as teacher_name,
            count(*)::text as lessons, count(distinct sl.class_id)::text as classes
       from timetable_slot sl
       join staff tf on tf.user_id = sl.staff_id
       join classes c on c.id = sl.class_id
       join curriculum_stage cs on cs.id = c.curriculum_stage_id
      where sl.school_id = $1 and sl.term_id = $2
        and ($3::text[] is null or cs.phase = any($3::text[]))
      group by sl.staff_id, tf.first_name, tf.last_name
      order by count(*) desc`,
    [schoolId, termId, levels],
  );
  return rows.map((r) => ({
    staffId: r.staff_id,
    teacherName: r.teacher_name,
    lessonsPerWeek: Number(r.lessons),
    classes: Number(r.classes),
  }));
}
