// Mirrors backend/src/modules/exams/domain/exam-results.repository.ts

export interface MarkSheetRow {
  studentUserId: string;
  studentName: string;
  systemId: string | null;
  rawScore: number | null;
  isAbsent: boolean;
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
  };
  subject: { id: string; code: string; name: string };
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
