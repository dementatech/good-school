import { pool } from "../../../shared/db/index.js";
import { SECTION_LEVELS, type SchoolLevel, type SchoolSection } from "../../../shared/levels.js";
import {
  SELECT_SLOT,
  TimetableError,
  getTimetableDays,
  listPeriods,
  mapSlot,
  type PeriodRecord,
  type SlotRecord,
  type SlotRow,
} from "./timetable.repository.js";

// Timetable generator — a first draft of a whole section's week in one go,
// from what the school has already set up: its classes (and streams), the
// subjects each class takes, the teachers assigned to them, and the school
// day. The admin previews the draft and only then applies it; the manual grid
// stays the place for fine-tuning.
//
// How many lessons a subject gets is the school's to say. Where it hasn't
// said, the week is shared out by subject weight — PLE core subjects most,
// languages next, then religion, then everything else — so every class's week
// is full. Placement is a greedy fill (hardest lessons first) repeated with
// different shuffles, keeping the best: no teacher in two places (across
// sections too, by clock time), no class double-booked, a subject spread
// over the week, core subjects leaning to the morning.
//
// Deliberately simple for now — room constraints, teacher availability and
// fixed periods (e.g. games on Friday afternoon) come once we've seen how
// schools actually build theirs.

export interface GenerateInput {
  termId: string;
  section: SchoolSection;
  /** Lessons a week per subject the school has fixed; the rest are shared out. */
  lessonsPerWeek?: Record<string, number>;
  /** Keep what's already on the timetable and fill around it. */
  keepExisting?: boolean;
  /** A different seed gives a different (equally valid) arrangement. */
  seed?: number;
}

export interface GeneratedLesson {
  classId: string;
  streamId: string | null;
  dayOfWeek: number;
  periodId: string;
  subjectId: string;
  staffId: string | null;
}

export interface GenerationUnit {
  key: string;
  classId: string;
  className: string;
  streamId: string | null;
  streamName: string | null;
  /** Lesson periods in the week. */
  capacity: number;
  /** Lessons on the draft (kept + new). */
  filled: number;
}

export interface GenerationSubject {
  subjectId: string;
  name: string;
  shortName: string | null;
  /** What the week gives it when the school doesn't fix it (the usual class's share). */
  autoLessons: number;
  /** The school's own number, if fixed. */
  lessonsPerWeek: number | null;
}

export interface GenerationPlan {
  termId: string;
  section: SchoolSection;
  seed: number;
  days: number[];
  periods: PeriodRecord[];
  units: GenerationUnit[];
  subjects: GenerationSubject[];
  /** The draft's whole grid — kept lessons and new ones (new ids start "new-"). */
  slots: SlotRecord[];
  /** Just the new lessons — what apply writes. */
  lessons: GeneratedLesson[];
  unplaced: { unitKey: string; unitName: string; subjectName: string; teacherName: string | null; missing: number }[];
  warnings: string[];
  /** Lessons already on this section's timetable that applying would remove. */
  replaces: number;
}

// ─── Loading ────────────────────────────────────────────────────────────────

interface SubjectRow {
  id: string;
  name: string;
  short_name: string | null;
  category: string | null;
  stage_ids: string[];
}

interface UnitInfo extends GenerationUnit {
  stageId: string;
  phase: SchoolLevel;
  classTeacherId: string | null;
}

interface ExistingSlot {
  id: string;
  class_id: string;
  stream_id: string | null;
  day_of_week: number;
  period_id: string;
  subject_id: string | null;
  staff_id: string | null;
  start_time: string;
  end_time: string;
  in_section: boolean;
}

const CORE_NAME = /english|math|number|numeracy|literacy|language|reading|science|social stud/i;

/** How much of the week a subject deserves, relative to the others. */
function weightOf(s: SubjectRow): number {
  if (s.category === "core") return 3;
  if (s.category === "language" || CORE_NAME.test(s.name)) return 2;
  if (s.category === "religion") return 1.5;
  return 1;
}

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Shares `total` lessons out by weight, largest remainder first. */
function shareByWeight(total: number, items: { id: string; weight: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  const sum = items.reduce((a, i) => a + i.weight, 0);
  if (total <= 0 || sum === 0) {
    items.forEach((i) => out.set(i.id, 0));
    return out;
  }
  const exact = items.map((i) => ({ id: i.id, raw: (total * i.weight) / sum }));
  exact.forEach((e) => out.set(e.id, Math.floor(e.raw)));
  let left = total - exact.reduce((a, e) => a + Math.floor(e.raw), 0);
  for (const e of [...exact].sort((a, b) => b.raw - Math.floor(b.raw) - (a.raw - Math.floor(a.raw)))) {
    if (left-- <= 0) break;
    out.set(e.id, out.get(e.id)! + 1);
  }
  return out;
}

/** As shareByWeight, but no subject gets more than `cap` — with too few
 * subjects to fill the week, the rest stay free periods rather than one
 * subject taking the whole day. */
function shareOut(total: number, items: { id: string; weight: number }[], cap: number): Map<string, number> {
  const out = new Map<string, number>();
  let remaining = total;
  let open = items;
  for (;;) {
    const share = shareByWeight(remaining, open);
    const over = open.filter((i) => share.get(i.id)! > cap);
    if (over.length === 0) {
      share.forEach((v, k) => out.set(k, v));
      return out;
    }
    over.forEach((i) => out.set(i.id, cap));
    remaining -= cap * over.length;
    open = open.filter((i) => !over.includes(i));
  }
}

// Small seeded PRNG — so a seed reproduces the same draft.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Generate ───────────────────────────────────────────────────────────────

export async function generateTimetable(schoolId: string, input: GenerateInput): Promise<GenerationPlan> {
  const { termId, section } = input;
  const keepExisting = !!input.keepExisting;
  const seed = Number.isInteger(input.seed) ? input.seed! : Math.floor(Math.random() * 1e9);
  const fixed = input.lessonsPerWeek ?? {};
  const levels = SECTION_LEVELS[section];

  const term = await pool.query<{ academic_year_id: string }>(
    `select academic_year_id from terms where id = $1 and school_id = $2`,
    [termId, schoolId],
  );
  if (!term.rows[0]) throw new TimetableError("Unknown term.", 404);
  const yearId = term.rows[0].academic_year_id;

  const [allPeriods, days] = await Promise.all([listPeriods(schoolId, section), getTimetableDays(schoolId, section)]);
  const periods = allPeriods.filter((p) => p.kind === "lesson");
  if (periods.length === 0) throw new TimetableError("Set up the school day first — it has no lesson periods yet.");

  const [classRows, subjectRows, assignmentRows, existingRows] = await Promise.all([
    pool.query<{ id: string; name: string; stage_id: string; phase: SchoolLevel; has_streams: boolean; class_teacher_id: string | null }>(
      `select c.id, stage_label(c.school_id, cs.id) as name, cs.id as stage_id, cs.phase, c.has_streams, c.class_teacher_id
         from classes c join curriculum_stage cs on cs.id = c.curriculum_stage_id
        where c.school_id = $1 and c.academic_year_id = $2 and c.is_active and cs.phase = any($3::text[])
        order by cs.sequence_number`,
      [schoolId, yearId, levels],
    ),
    pool.query<SubjectRow & { phase: SchoolLevel }>(
      `select s.id, s.name, s.short_name, s.category, s.phase,
              coalesce(array(select ss.curriculum_stage_id::text from subject_stage ss where ss.subject_id = s.id), '{}') as stage_ids
         from subject_offering o join subject s on s.id = o.subject_id
        where o.school_id = $1 and o.academic_year_id = $2 and o.is_offered
          and s.phase = any($3::text[]) and (s.school_id is null or s.school_id = $1)
        order by s.name`,
      [schoolId, yearId, levels],
    ),
    pool.query<{ subject_id: string; class_id: string; stream_id: string | null; staff_id: string }>(
      `select subject_id, class_id, stream_id, staff_id from subject_teacher_assignment
        where school_id = $1 and academic_year_id = $2 and status = 'active' and is_lead`,
      [schoolId, yearId],
    ),
    // Everything on this term's timetable, with clock times — other sections'
    // lessons still keep their teachers busy.
    pool.query<ExistingSlot>(
      `select sl.id, sl.class_id, sl.stream_id, sl.day_of_week, sl.period_id, sl.subject_id, sl.staff_id,
              tp.start_time::text, tp.end_time::text, cs.phase = any($3::text[]) as in_section
         from timetable_slot sl
         join timetable_period tp on tp.id = sl.period_id
         join classes c on c.id = sl.class_id
         join curriculum_stage cs on cs.id = c.curriculum_stage_id
        where sl.school_id = $1 and sl.term_id = $2`,
      [schoolId, termId, levels],
    ),
  ]);
  if (classRows.rows.length === 0) throw new TimetableError("This section has no classes this year.");

  const streamRows = await pool.query<{ id: string; class_id: string; name: string; stream_teacher_id: string | null }>(
    `select id, class_id, name, stream_teacher_id from streams where class_id = any($1::uuid[]) and is_active order by name`,
    [classRows.rows.map((c) => c.id)],
  );

  // A streamed class is timetabled stream by stream; otherwise as one class.
  const units: UnitInfo[] = [];
  for (const c of classRows.rows) {
    const streams = c.has_streams ? streamRows.rows.filter((s) => s.class_id === c.id) : [];
    const base = { classId: c.id, className: c.name, stageId: c.stage_id, phase: c.phase, capacity: periods.length * days.length, filled: 0 };
    if (streams.length === 0) {
      units.push({ ...base, key: c.id, streamId: null, streamName: null, classTeacherId: c.class_teacher_id });
    } else {
      for (const s of streams) {
        units.push({ ...base, key: `${c.id}:${s.id}`, streamId: s.id, streamName: s.name, classTeacherId: s.stream_teacher_id ?? c.class_teacher_id });
      }
    }
  }
  // At most two lessons of a subject a day, unless the school fixes more.
  const cap = days.length * 2;
  const unitName = (u: UnitInfo) => (u.streamName ? `${u.className} ${u.streamName}` : u.className);

  const subjects = subjectRows.rows;
  const subjectsFor = (u: UnitInfo) =>
    subjects.filter((s) => s.phase === u.phase && (s.stage_ids.length === 0 || s.stage_ids.includes(u.stageId)));

  // Lead teacher: the stream's own assignment, else the class's, else the class teacher.
  const teacherFor = (u: UnitInfo, subjectId: string): string | null => {
    const forClass = assignmentRows.rows.filter((a) => a.class_id === u.classId && a.subject_id === subjectId);
    return (
      forClass.find((a) => u.streamId && a.stream_id === u.streamId)?.staff_id ??
      forClass.find((a) => a.stream_id === null)?.staff_id ??
      u.classTeacherId
    );
  };

  const periodIndex = new Map(periods.map((p, i) => [p.id, i]));
  const periodTimes = periods.map((p) => [minutes(p.startTime), minutes(p.endTime)] as const);

  // What stays: other sections always; this section's own only when keeping.
  const kept = existingRows.rows.filter((r) => !r.in_section || keepExisting);
  const replaces = keepExisting ? 0 : existingRows.rows.filter((r) => r.in_section).length;

  const warnings: string[] = [];
  const unitSubjects = new Map<string, { subject: SubjectRow; count: number; staffId: string | null }[]>();
  const autoCounts = new Map<string, number[]>();
  const noTeacher = new Map<string, string[]>();
  const freePeriods = new Map<string, number>();
  const teacherAsked = new Map<string, number>();

  for (const u of units) {
    const list = subjectsFor(u);
    if (list.length === 0) {
      warnings.push(`${unitName(u)} has no subjects offered — offer some in Subjects first.`);
      unitSubjects.set(u.key, []);
      continue;
    }
    const auto = shareOut(u.capacity, list.map((s) => ({ id: s.id, weight: weightOf(s) })), cap);
    list.forEach((s) => autoCounts.set(s.id, [...(autoCounts.get(s.id) ?? []), auto.get(s.id)!]));

    const fixedTotal = list.reduce((a, s) => a + (fixed[s.id] ?? 0), 0);
    const free = list.filter((s) => fixed[s.id] === undefined);
    const shared = shareOut(
      Math.max(0, u.capacity - fixedTotal),
      free.map((s) => ({ id: s.id, weight: weightOf(s) })),
      cap,
    );
    const planned = list.map((s) => ({ subject: s, count: fixed[s.id] ?? shared.get(s.id)!, staffId: teacherFor(u, s.id) }));
    const total = planned.reduce((a, p) => a + p.count, 0);
    if (total > u.capacity) {
      warnings.push(`${unitName(u)} is asked for ${total} lessons a week but has only ${u.capacity} lesson periods.`);
    } else if (total < u.capacity) {
      freePeriods.set(unitName(u), u.capacity - total);
    }
    for (const p of planned) {
      if (p.count > 0 && !p.staffId) noTeacher.set(p.subject.name, [...(noTeacher.get(p.subject.name) ?? []), unitName(u)]);
      if (p.count > 0 && p.staffId) teacherAsked.set(p.staffId, (teacherAsked.get(p.staffId) ?? 0) + p.count);
    }
    unitSubjects.set(u.key, planned);
  }
  for (const [subject, where] of noTeacher) {
    warnings.push(`No teacher assigned for ${subject} in ${where.join(", ")} — those lessons are placed without one.`);
  }
  if (freePeriods.size > 0) {
    warnings.push(
      `Too few subjects to fill the week (at most ${cap} lessons of one subject): ` +
        [...freePeriods].map(([name, n]) => `${name} ${n} free`).join(", ") +
        ". Offer more subjects, or fix more lessons per week.",
    );
  }

  // ── Placement, several shuffles, keep the best ──
  const days0 = days;
  type Attempt = { lessons: GeneratedLesson[]; unplaced: Map<string, number>; penalty: number };

  const attempt = (rand: () => number): Attempt => {
    const unitBusy = new Map<string, Set<string>>(); // unit key → "day:periodIdx"
    const teacherBusy = new Map<string, [number, number, number][]>(); // staff → [day, start, end]
    const dayCount = new Map<string, number>(); // unit:subject:day → lessons
    const cell = (d: number, pi: number) => `${d}:${pi}`;
    const busyOf = (k: string) => unitBusy.get(k) ?? unitBusy.set(k, new Set()).get(k)!;
    const addTeacher = (staffId: string, d: number, start: number, end: number) =>
      (teacherBusy.get(staffId) ?? teacherBusy.set(staffId, []).get(staffId)!).push([d, start, end]);

    for (const r of kept) {
      if (r.staff_id) addTeacher(r.staff_id, r.day_of_week, minutes(r.start_time), minutes(r.end_time));
      if (!r.in_section) continue;
      const pi = periodIndex.get(r.period_id);
      if (pi === undefined) continue;
      // A whole-class lesson blocks every stream of the class.
      for (const u of units) {
        if (u.classId !== r.class_id || (r.stream_id && u.streamId !== r.stream_id)) continue;
        busyOf(u.key).add(cell(r.day_of_week, pi));
        if (r.subject_id) {
          const k = `${u.key}:${r.subject_id}:${r.day_of_week}`;
          dayCount.set(k, (dayCount.get(k) ?? 0) + 1);
        }
      }
    }

    // Lessons still to place, per unit and subject (kept ones count toward the week).
    const todo: { u: UnitInfo; subject: SubjectRow; staffId: string | null; count: number; weight: number }[] = [];
    for (const u of units) {
      for (const p of unitSubjects.get(u.key) ?? []) {
        const already = kept.filter(
          (r) => r.in_section && r.class_id === u.classId && (!r.stream_id || r.stream_id === u.streamId) && r.subject_id === p.subject.id,
        ).length;
        const need = p.count - already;
        for (let i = 0; i < need; i++) todo.push({ u, subject: p.subject, staffId: p.staffId, count: p.count, weight: weightOf(p.subject) });
      }
    }
    // Hardest first: busiest teachers, then the subjects with most lessons.
    const load = new Map<string, number>();
    todo.forEach((t) => t.staffId && load.set(t.staffId, (load.get(t.staffId) ?? 0) + 1));
    const order = todo
      .map((t) => ({ t, r: rand() }))
      .sort(
        (a, b) =>
          (b.t.staffId ? load.get(b.t.staffId)! : 0) - (a.t.staffId ? load.get(a.t.staffId)! : 0) ||
          b.t.count - a.t.count ||
          a.r - b.r,
      )
      .map((x) => x.t);

    const lessons: GeneratedLesson[] = [];
    const unplaced = new Map<string, number>();
    let penalty = 0;

    for (const t of order) {
      const busy = busyOf(t.u.key);
      const perDay = Math.ceil(t.count / days0.length);
      let pick: { d: number; pi: number; score: number } | null = null;
      for (const d of days0) {
        const onDay = dayCount.get(`${t.u.key}:${t.subject.id}:${d}`) ?? 0;
        for (let pi = 0; pi < periods.length; pi++) {
          if (busy.has(cell(d, pi))) continue;
          const [start, end] = periodTimes[pi];
          if (t.staffId && (teacherBusy.get(t.staffId) ?? []).some(([bd, bs, be]) => bd === d && bs < end && start < be)) continue;
          let score = rand() * 0.5;
          if (onDay >= perDay) score += 20; // more than its share of one day
          else if (onDay > 0) {
            // A second lesson the same day: fine as a double, less so apart.
            const adjacent = lessons.some(
              (l) =>
                l.dayOfWeek === d &&
                l.subjectId === t.subject.id &&
                l.classId === t.u.classId &&
                l.streamId === t.u.streamId &&
                Math.abs(periodIndex.get(l.periodId)! - pi) === 1,
            );
            score += adjacent ? 2 : 6;
          }
          // Core subjects in the morning, the rest later in the day.
          score += t.weight >= 2 ? pi * 0.6 : (periods.length - 1 - pi) * 0.3;
          if (!pick || score < pick.score) pick = { d, pi, score };
        }
      }
      if (!pick) {
        const k = `${t.u.key}|${t.subject.id}`;
        unplaced.set(k, (unplaced.get(k) ?? 0) + 1);
        continue;
      }
      penalty += pick.score;
      busy.add(cell(pick.d, pick.pi));
      const [start, end] = periodTimes[pick.pi];
      if (t.staffId) addTeacher(t.staffId, pick.d, start, end);
      const k = `${t.u.key}:${t.subject.id}:${pick.d}`;
      dayCount.set(k, (dayCount.get(k) ?? 0) + 1);
      lessons.push({
        classId: t.u.classId,
        streamId: t.u.streamId,
        dayOfWeek: pick.d,
        periodId: periods[pick.pi].id,
        subjectId: t.subject.id,
        staffId: t.staffId,
      });
    }
    return { lessons, unplaced, penalty };
  };

  let best: Attempt | null = null;
  for (let i = 0; i < 24; i++) {
    const a = attempt(mulberry32(seed + i * 7919));
    const missing = (x: Attempt) => [...x.unplaced.values()].reduce((s, n) => s + n, 0);
    if (!best || missing(a) < missing(best) || (missing(a) === missing(best) && a.penalty < best.penalty)) best = a;
  }

  // ── The draft, shaped like the real grid ──
  const staffIds = [...new Set(best!.lessons.map((l) => l.staffId).filter((s): s is string => !!s))];
  const names = await pool.query<{ user_id: string; name: string }>(
    `select user_id, trim(first_name || ' ' || last_name) as name from staff where user_id = any($1::uuid[])`,
    [staffIds],
  );
  const teacherName = new Map(names.rows.map((r) => [r.user_id, r.name]));
  const weekPeriods = periods.length * days.length;
  const overloaded = [...teacherAsked].filter(([, n]) => n > weekPeriods);
  if (overloaded.length > 0) {
    const overNames = await pool.query<{ user_id: string; name: string }>(
      `select user_id, trim(first_name || ' ' || last_name) as name from staff where user_id = any($1::uuid[])`,
      [overloaded.map(([id]) => id)],
    );
    const nameOf = new Map(overNames.rows.map((r) => [r.user_id, r.name]));
    warnings.push(
      `More lessons than the week has periods (${weekPeriods}): ` +
        overloaded.map(([id, n]) => `${nameOf.get(id) ?? "a teacher"} ${n}`).join(", ") +
        ". Share their classes with other teachers in Subject Teachers.",
    );
  }
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const unitByKey = new Map(units.map((u) => [u.key, u]));

  const keptSlots = keepExisting
    ? (
        await pool.query<SlotRow>(
          `${SELECT_SLOT} where sl.id = any($1::uuid[])`,
          [kept.filter((r) => r.in_section).map((r) => r.id)],
        )
      ).rows.map(mapSlot)
    : [];
  const newSlots: SlotRecord[] = best!.lessons.map((l, i) => {
    const u = units.find((x) => x.classId === l.classId && x.streamId === l.streamId)!;
    const s = subjectById.get(l.subjectId)!;
    return {
      id: `new-${i}`,
      termId,
      classId: l.classId,
      className: u.className,
      streamId: l.streamId,
      streamName: u.streamName,
      dayOfWeek: l.dayOfWeek,
      periodId: l.periodId,
      subjectId: l.subjectId,
      subjectName: s.name,
      subjectShortName: s.short_name,
      activity: null,
      staffId: l.staffId,
      teacherName: l.staffId ? (teacherName.get(l.staffId) ?? null) : null,
      room: null,
    };
  });
  const slots = [...keptSlots, ...newSlots];
  for (const u of units) {
    u.filled = slots.filter((s) => s.classId === u.classId && (!s.streamId || s.streamId === u.streamId)).length;
  }

  const unplaced = [...best!.unplaced.entries()].map(([k, missing]) => {
    const [unitKey, subjectId] = k.split("|");
    const u = unitByKey.get(unitKey)!;
    const staffId = teacherFor(u, subjectId);
    return {
      unitKey,
      unitName: unitName(u),
      subjectName: subjectById.get(subjectId)!.name,
      teacherName: staffId ? (teacherName.get(staffId) ?? null) : null,
      missing,
    };
  });

  // The usual share for each subject — what the settings table shows as "auto".
  const mostCommon = (xs: number[]) => {
    const tally = new Map<number, number>();
    xs.forEach((x) => tally.set(x, (tally.get(x) ?? 0) + 1));
    return [...tally.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;
  };

  return {
    termId,
    section,
    seed,
    days,
    periods: allPeriods,
    units: units.map(({ key, classId, className, streamId, streamName, capacity, filled }) => ({
      key,
      classId,
      className,
      streamId,
      streamName,
      capacity,
      filled,
    })),
    subjects: subjects
      .filter((s) => autoCounts.has(s.id))
      .map((s) => ({
        subjectId: s.id,
        name: s.name,
        shortName: s.short_name,
        autoLessons: mostCommon(autoCounts.get(s.id)!),
        lessonsPerWeek: fixed[s.id] ?? null,
      })),
    slots,
    lessons: best!.lessons,
    unplaced,
    warnings,
    replaces,
  };
}

// ─── Apply ──────────────────────────────────────────────────────────────────

/**
 * Writes a previewed draft. Unless keeping, this section's lessons for the
 * term are replaced wholesale. Everything is re-checked against the school's
 * data; a clash that crept in since the preview (someone edited the grid)
 * refuses the whole thing rather than half-apply it.
 */
export async function applyGeneratedTimetable(
  schoolId: string,
  input: { termId: string; section: SchoolSection; keepExisting?: boolean; lessons: GeneratedLesson[] },
  actorId: string,
): Promise<{ created: number; removed: number }> {
  const { termId, section, lessons } = input;
  const levels = SECTION_LEVELS[section];
  const term = await pool.query<{ academic_year_id: string }>(
    `select academic_year_id from terms where id = $1 and school_id = $2`,
    [termId, schoolId],
  );
  if (!term.rows[0]) throw new TimetableError("Unknown term.", 404);
  const yearId = term.rows[0].academic_year_id;

  const [classes, streams, periods, days, offered, staff] = await Promise.all([
    pool.query<{ id: string; phase: SchoolLevel }>(
      `select c.id, cs.phase from classes c join curriculum_stage cs on cs.id = c.curriculum_stage_id
        where c.school_id = $1 and c.academic_year_id = $2 and cs.phase = any($3::text[])`,
      [schoolId, yearId, levels],
    ),
    pool.query<{ id: string; class_id: string }>(`select s.id, s.class_id from streams s where s.school_id = $1`, [schoolId]),
    listPeriods(schoolId, section),
    getTimetableDays(schoolId, section),
    pool.query<{ id: string; phase: SchoolLevel }>(
      `select s.id, s.phase from subject_offering o join subject s on s.id = o.subject_id
        where o.school_id = $1 and o.academic_year_id = $2 and o.is_offered`,
      [schoolId, yearId],
    ),
    pool.query<{ id: string }>(`select id from users where school_id = $1`, [schoolId]),
  ]);
  const classPhase = new Map(classes.rows.map((c) => [c.id, c.phase]));
  const streamClass = new Map(streams.rows.map((s) => [s.id, s.class_id]));
  const lessonPeriods = new Set(periods.filter((p) => p.kind === "lesson").map((p) => p.id));
  const subjectPhase = new Map(offered.rows.map((s) => [s.id, s.phase]));
  const staffIds = new Set(staff.rows.map((s) => s.id));

  for (const l of lessons) {
    const phase = classPhase.get(l.classId);
    if (
      !phase ||
      (l.streamId && streamClass.get(l.streamId) !== l.classId) ||
      !days.includes(l.dayOfWeek) ||
      !lessonPeriods.has(l.periodId) ||
      subjectPhase.get(l.subjectId) !== phase ||
      (l.staffId && !staffIds.has(l.staffId))
    ) {
      throw new TimetableError("The draft no longer matches the school's set-up — generate it again.", 409);
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`timetable:${termId}`]);
    let removed = 0;
    if (!input.keepExisting) {
      const del = await client.query(
        `delete from timetable_slot where school_id = $1 and term_id = $2 and class_id = any($3::uuid[])`,
        [schoolId, termId, classes.rows.map((c) => c.id)],
      );
      removed = del.rowCount ?? 0;
    }
    if (lessons.length > 0) {
      await client.query(
        `insert into timetable_slot
           (school_id, term_id, class_id, stream_id, day_of_week, period_id, subject_id, staff_id, created_by)
         select $1, $2, l.class_id, l.stream_id, l.day_of_week, l.period_id, l.subject_id, l.staff_id, $3
           from unnest($4::uuid[], $5::uuid[], $6::int[], $7::uuid[], $8::uuid[], $9::uuid[])
                as l(class_id, stream_id, day_of_week, period_id, subject_id, staff_id)`,
        [
          schoolId,
          termId,
          actorId,
          lessons.map((l) => l.classId),
          lessons.map((l) => l.streamId),
          lessons.map((l) => l.dayOfWeek),
          lessons.map((l) => l.periodId),
          lessons.map((l) => l.subjectId),
          lessons.map((l) => l.staffId),
        ],
      );
    }
    await client.query("COMMIT");
    return { created: lessons.length, removed };
  } catch (err) {
    await client.query("ROLLBACK");
    if ((err as { code?: string }).code === "23505") {
      throw new TimetableError("The timetable changed since this draft was made — generate it again.", 409);
    }
    throw err;
  } finally {
    client.release();
  }
}
