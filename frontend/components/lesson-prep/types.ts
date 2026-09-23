// Mirrors backend/src/modules/lesson-prep/domain/lesson-prep.repository.ts

export type ReviewStatus = 'draft' | 'submitted' | 'approved' | 'returned';
export type Coverage = 'covered' | 'partly' | 'not_covered';

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  draft: 'Draft',
  submitted: 'Awaiting review',
  approved: 'Approved',
  returned: 'Returned',
};

export const STATUS_VARIANT: Record<ReviewStatus, 'default' | 'accent' | 'success' | 'muted'> = {
  draft: 'muted',
  submitted: 'accent',
  approved: 'success',
  returned: 'default',
};

export const COVERAGE_LABEL: Record<Coverage, string> = {
  covered: 'Fully covered',
  partly: 'Partly covered',
  not_covered: 'Not covered',
};

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

export interface TeachingAssignment {
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  phase: string;
  scheme: { id: string; status: ReviewStatus } | null;
}

export const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
