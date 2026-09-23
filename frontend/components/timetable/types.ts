// Mirrors backend/src/modules/timetable/domain/timetable.repository.ts

export type SchoolSection = 'KINDERGARTEN' | 'PRIMARY' | 'SECONDARY';
export type PeriodKind = 'lesson' | 'break' | 'lunch' | 'assembly' | 'other';

export interface Period {
  id: string;
  section: SchoolSection;
  label: string;
  startTime: string;
  endTime: string;
  kind: PeriodKind;
  sortOrder: number;
}

export interface Slot {
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

export interface ClassTimetable {
  class: { id: string; name: string; section: SchoolSection };
  stream: { id: string; name: string } | null;
  days: number[];
  periods: Period[];
  slots: Slot[];
}

export interface TermContext {
  academicYear: { id: string; name: string } | null;
  terms: { id: string; name: string; startDate: string; endDate: string }[];
  currentTermId: string | null;
}

export const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const PERIOD_KIND_LABEL: Record<PeriodKind, string> = {
  lesson: 'Lesson',
  break: 'Break',
  lunch: 'Lunch',
  assembly: 'Assembly',
  other: 'Other',
};

export const SECTION_OF_PHASE: Record<string, SchoolSection> = {
  KINDERGARTEN: 'KINDERGARTEN',
  PRIMARY: 'PRIMARY',
  O_LEVEL: 'SECONDARY',
  A_LEVEL: 'SECONDARY',
};
