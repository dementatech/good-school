export type Phase = 'O_LEVEL' | 'A_LEVEL';
export type SubjectCategory =
  | 'language'
  | 'science'
  | 'humanity'
  | 'vocational'
  | 'core'
  | 'general';
export type Role = 'principal' | 'subsidiary' | 'compulsory';

export interface Curriculum {
  id: string;
  code: string;
  name: string;
  awardingBody: string | null;
  isActive: boolean;
}

export interface Stage {
  id: string;
  curriculumId: string;
  code: string;
  name: string;
  sequenceNumber: number;
  phase: string | null;
  ageEquivalentYears: number | null;
}

export interface Subject {
  id: string;
  phase: Phase;
  code: string;
  name: string;
  category: SubjectCategory;
  isExaminable: boolean;
  isActive: boolean;
  stageIds: string[];
}

export interface Combination {
  id: string;
  code: string;
  name: string;
  description: string | null;
  subjects: { subjectId: string; role: Role }[];
}

export const CATEGORIES: SubjectCategory[] = [
  'language',
  'science',
  'humanity',
  'vocational',
  'core',
  'general',
];

export const PHASE_LABEL: Record<Phase, string> = { O_LEVEL: 'O-Level', A_LEVEL: 'A-Level' };
export const PHASE_RANGE: Record<Phase, string> = {
  O_LEVEL: 'Senior 1–4',
  A_LEVEL: 'Senior 5–6',
};

export { submitJson } from '@/lib/api/envelope';
