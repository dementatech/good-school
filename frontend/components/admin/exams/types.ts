// Mirrors backend/src/modules/exams/domain/*.repository.ts

export interface ExamSession {
  id: string;
  examName: string;
  examCode: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SchoolExamStatus = 'active' | 'closed';

export interface SchoolExam {
  id: string;
  schoolId: string;
  examSessionId: string;
  examCode: string;
  academicYearId: string;
  academicYearName: string;
  termId: string;
  termName: string;
  name: string;
  startsOn: string;
  endsOn: string;
  marksDueOn: string;
  status: SchoolExamStatus;
  marksEntryOpen: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export { submitJson } from '@/lib/api/envelope';
