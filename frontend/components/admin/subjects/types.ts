// Mirrors backend/src/modules/academic-structure/domain/{subject-offering,
// school-combinations}.repository.ts and students/domain/{student-subjects,
// student-combinations}.repository.ts

export type SubjectPhase = 'O_LEVEL' | 'A_LEVEL';
export type CombinationRole = 'principal' | 'subsidiary' | 'compulsory';

export interface CatalogSubject {
  id: string;
  curriculumId: string;
  phase: SubjectPhase;
  code: string;
  name: string;
  category: string;
  isActive: boolean;
}

export interface SubjectOffering {
  id: string;
  schoolId: string;
  academicYearId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  subjectCategory: string;
  subjectPhase: SubjectPhase;
  isOffered: boolean;
  isCompulsory: boolean;
}

export interface CatalogCombination {
  id: string;
  curriculumId: string;
  code: string;
  name: string;
  subjects: { subjectId: string; role: CombinationRole }[];
}

export interface SchoolCombinationMember {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  role: CombinationRole;
}

export interface SchoolCombination {
  id: string;
  schoolId: string;
  academicYearId: string;
  catalogCombinationId: string | null;
  code: string;
  name: string;
  description: string | null;
  isOffered: boolean;
  minClassSize: number | null;
  subjects: SchoolCombinationMember[];
}

export interface AcademicYear {
  id: string;
  yearName: string;
  isCurrent: boolean;
}

export const CATEGORY_LABEL: Record<string, string> = {
  core: 'Core',
  religion: 'Religious Education',
  vocational: 'Vocational / Practical',
  science: 'Science',
  humanity: 'Humanity',
  language: 'Language',
  general: 'General',
};
