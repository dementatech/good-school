/**
 * Numbers behind the teacher and learner dashboards. Kept apart from the screens
 * because a slip here still shows a believable figure.
 */

export interface SubjectResult {
  rawScore: number | null;
  isAbsent: boolean;
}

/** A learner's mean across subjects sat. Absent subjects don't count as zero. */
export function averageOfResults(subjects: SubjectResult[]): number | null {
  const scored = subjects.filter((s) => !s.isAbsent && s.rawScore !== null);
  if (scored.length === 0) return null;
  return Math.round((scored.reduce((sum, s) => sum + s.rawScore!, 0) / scored.length) * 10) / 10;
}

export interface TimetablePeriod {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
}

export interface TimetableSlot {
  id: string;
  dayOfWeek: number;
  periodId: string;
  className: string;
  streamName: string | null;
  subjectName: string | null;
  activity: string | null;
  room: string | null;
}

export interface TodayLesson {
  id: string;
  title: string;
  classLabel: string;
  time: string;
  startTime: string;
  room: string | null;
}

/** A class name short enough for a chart axis: Senior 1 → S1, Baby Class → BC. */
export function shortClassLabel(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.slice(0, 3);
  return words.map((word) => (/^\d+$/.test(word) ? word : word[0].toUpperCase())).join('');
}

/** Monday is 1 and Sunday is 7, matching the timetable's dayOfWeek. */
export function isoWeekday(date: Date): number {
  return date.getDay() === 0 ? 7 : date.getDay();
}

/** One teacher's lessons on a given day, earliest first. */
export function lessonsOn(
  weekday: number,
  slots: TimetableSlot[],
  periodsBySection: Record<string, TimetablePeriod[]>,
): TodayLesson[] {
  const periods = new Map(Object.values(periodsBySection).flat().map((p) => [p.id, p]));
  return slots
    .filter((slot) => slot.dayOfWeek === weekday)
    .flatMap((slot) => {
      const period = periods.get(slot.periodId);
      if (!period) return [];
      return [
        {
          id: slot.id,
          title: slot.subjectName ?? slot.activity ?? 'Lesson',
          classLabel: slot.streamName ? `${slot.className} ${slot.streamName}` : slot.className,
          time: `${period.startTime} to ${period.endTime}`,
          startTime: period.startTime,
          room: slot.room,
        },
      ];
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export interface AssignedSlot {
  submitted: boolean;
}

export interface AssignedExam {
  examId: string;
  examName: string;
  termName: string;
  marksDueOn: string | null;
  marksEntryOpen: boolean;
  slots: AssignedSlot[];
}

/** Mark sheets this teacher can and must hand in now. An exam not yet open for
 *  marks owes nothing, so it doesn't count. */
export function markSheetsOwed(exams: AssignedExam[]): number {
  return exams
    .filter((exam) => exam.marksEntryOpen)
    .reduce((sum, exam) => sum + exam.slots.filter((slot) => !slot.submitted).length, 0);
}

export interface RegisterClass {
  classId: string;
  className: string;
  classTeacherName: string | null;
  pupils: number;
  marked: number;
}

/** Classes with learners whose register hasn't been started today. */
export function registersNotTaken(classes: RegisterClass[]): RegisterClass[] {
  return classes.filter((c) => c.pupils > 0 && c.marked === 0);
}
