/**
 * Pure rules behind the school-admin dashboard. Kept apart from the components
 * because these fail silently: a wrong term or rate still renders as a
 * believable number.
 */

export interface DashboardTerm {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface DashboardExam {
  id: string;
  name: string;
  termName: string;
  startsOn: string;
  endsOn: string;
  marksDueOn: string | null;
  status: string;
  marksEntryOpen: boolean;
  publishedAt: string | null;
}

export interface CompletionSlot {
  rosterCount: number;
  enteredCount: number;
  submitted: boolean;
  teacherName: string | null;
}

export interface AttendanceClassSummary {
  classId: string;
  className: string;
  daysTaken: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  rate: number;
}

export interface MarksProgress {
  total: number;
  submitted: number;
  pending: number;
  percent: number;
  /** Distinct teachers who still owe at least one mark sheet. */
  pendingTeachers: string[];
}

export interface ActivityItem {
  type: 'enrollment' | 'submission';
  label: string;
  timestamp: string;
}

export interface SchoolAnalytics {
  counts: { students: number; staff: number; classes: number };
  gender: { male: number; female: number; unspecified: number };
  population: ClassPopulation[];
  activity: ActivityItem[];
}

export interface TrendPoint {
  examId: string;
  label: string;
  name: string;
  value: number;
}

export interface ClassPopulation {
  classId: string;
  code: string;
  name: string;
  boys: number;
  girls: number;
  total: number;
}

export interface DashboardNotice {
  examId: string;
  title: string;
  message: string;
}

/** Today in the viewer's own timezone. toISOString() would report yesterday
 *  for the first three hours of every Ugandan day (UTC+3). */
export function localIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatShortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The term running today, or during a holiday the one that last started. */
export function pickCurrentTerm<T extends DashboardTerm>(terms: T[], today: string): T | null {
  const started = terms
    .filter((term) => term.startDate <= today)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  return started[0] ?? null;
}

/** Pooled across classes so a small class can't count as much as a large one.
 *  Uses the same formula as the backend's per-class rate: late counts as
 *  attending. Null when no register has been taken. */
export function overallAttendanceRate(classes: AttendanceClassSummary[]): number | null {
  let attended = 0;
  let marked = 0;
  for (const c of classes) {
    attended += c.present + c.late;
    marked += c.present + c.late + c.absent + c.excused;
  }
  return marked === 0 ? null : Math.round((attended / marked) * 1000) / 10;
}

export function summariseMarks(slots: CompletionSlot[]): MarksProgress {
  const submitted = slots.filter((slot) => slot.submitted).length;
  const pendingTeachers = new Set<string>();
  for (const slot of slots) {
    if (!slot.submitted && slot.teacherName) pendingTeachers.add(slot.teacherName);
  }
  return {
    total: slots.length,
    submitted,
    pending: slots.length - submitted,
    percent: slots.length === 0 ? 0 : Math.round((submitted / slots.length) * 100),
    pendingTeachers: [...pendingTeachers],
  };
}

/** Exams still in play, soonest first. */
export function ongoingExams<T extends DashboardExam>(exams: T[]): T[] {
  return exams.filter((exam) => exam.status === 'active').sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}

export function latestPublishedExam<T extends DashboardExam>(exams: T[]): T | null {
  return (
    exams
      .filter((exam) => exam.publishedAt)
      .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))[0] ?? null
  );
}

export function examStatusLabel(exam: DashboardExam, today: string): string {
  if (exam.marksEntryOpen) return 'Marks open';
  return exam.startsOn > today ? 'Upcoming' : 'Marks closed';
}

/**
 * The one thing most worth the head's attention today: an exam whose mark
 * sheets are outstanding, otherwise the next exam to start. Null when nothing
 * needs saying, because an invented alert would teach people to ignore it.
 */
export function pickNotice(
  exams: DashboardExam[],
  progress: Record<string, MarksProgress | undefined>,
  today: string,
): DashboardNotice | null {
  const ongoing = ongoingExams(exams);

  const open = ongoing.find((exam) => {
    const marks = progress[exam.id];
    return exam.marksEntryOpen && marks && marks.total > 0;
  });
  if (open) {
    const marks = progress[open.id]!;
    if (marks.pending === 0) {
      return {
        examId: open.id,
        title: open.name,
        message: `All ${marks.total} mark sheets are in and ready to review.`,
      };
    }
    const due = open.marksDueOn
      ? open.marksDueOn < today
        ? ` Marks were due on ${formatShortDate(open.marksDueOn)}.`
        : ` Marks are due on ${formatShortDate(open.marksDueOn)}.`
      : '';
    return {
      examId: open.id,
      title: open.name,
      message: `${marks.pending} of ${marks.total} mark sheets are still to be submitted.${due}`,
    };
  }

  const next = ongoing.find((exam) => exam.startsOn > today);
  return next
    ? { examId: next.id, title: next.name, message: `This exam starts on ${formatShortDate(next.startsOn)}.` }
    : null;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}
