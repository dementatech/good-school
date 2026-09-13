// Mirrors backend/src/modules/exams/domain/exam-results.repository.ts

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
  /** Set only once the exam is published — that variant's own paper grade. */
  computedGrade?: string | null;
}

export interface MarkSheetRow {
  studentUserId: string;
  studentName: string;
  systemId: string | null;
  /** Entered mark (plain subject) or the merged weighted score (variant
   * subject, computed server-side — null while any variant is unmarked). */
  rawScore: number | null;
  isAbsent: boolean;
  /** Present only when subject.hasVariant — one entry per subject.variants. */
  variantScores?: VariantScore[];
  /** Set only once the exam is published — null until then. */
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
    status: 'active' | 'closed';
    marksEntryOpen: boolean;
    publishedAt: string | null;
  };
  subject: { id: string; code: string; name: string; hasVariant: boolean; variants: SubjectVariantSummary[] };
  class: { id: string; name: string };
  stream: { id: string; name: string } | null;
  submitted: boolean;
  submittedAt: string | null;
  editable: boolean;
  rows: MarkSheetRow[];
}

export interface ExamSlot {
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
  slots: ExamSlot[];
}

export interface ExamCompletionSlot extends ExamSlot {
  teacherName: string | null;
}

export interface ExamCompletion {
  exam: MarkSheet['exam'];
  slots: ExamCompletionSlot[];
}

/** The identifier for one mark sheet — a (subject, class, stream) triple. */
export interface SlotKey {
  subjectId: string;
  classId: string;
  streamId: string | null;
}

export const slotLabel = (s: { className: string; streamName: string | null }) =>
  s.streamName ? `${s.className} ${s.streamName}` : s.className;
