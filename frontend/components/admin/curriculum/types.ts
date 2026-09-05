export type Phase = 'O_LEVEL' | 'A_LEVEL';
export type SubjectCategory =
  | 'language'
  | 'science'
  | 'art'
  | 'subsidiary'
  | 'vocational'
  | 'core'
  | 'religion'
  | 'special';
export type Role = 'principal' | 'subsidiary' | 'compulsory';
export type SubjectApprovalStatus = 'pending' | 'approved' | 'rejected';

/** O-Level subjects: Core, Religious, Vocational, Special only. */
export const O_LEVEL_CATEGORIES: SubjectCategory[] = ['core', 'religion', 'vocational', 'special'];
/** A-Level subjects: Science, Art (the principal-subject areas), or Subsidiary
 * (subjects only ever taken as the combination's subsidiary slot). General
 * Paper is one specific 'subsidiary' subject — see `Subject.isGeneralPaper`. */
export const A_LEVEL_CATEGORIES: SubjectCategory[] = ['science', 'art', 'subsidiary'];

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
  shortName: string;
  name: string;
  category: SubjectCategory;
  isExaminable: boolean;
  isActive: boolean;
  stageIds: string[];
  status: SubjectApprovalStatus;
  proposedBySchoolId: string | null;
  rejectionReason: string | null;
  /** True for exactly one 'subsidiary' subject per curriculum: General
   * Paper, a system constant every A-Level student takes automatically —
   * never created or deleted through this form. */
  isGeneralPaper: boolean;
}

export interface Combination {
  id: string;
  code: string;
  name: string;
  description: string | null;
  subjects: { subjectId: string; role: Role }[];
}

export const CATEGORY_LABEL: Record<SubjectCategory, string> = {
  core: 'Core',
  religion: 'Religious Education',
  vocational: 'Vocational / Practical',
  special: 'Special',
  science: 'Science',
  art: 'Art',
  subsidiary: 'Subsidiary',
  language: 'Language',
};

export const CATEGORIES_FOR_PHASE: Record<Phase, SubjectCategory[]> = {
  O_LEVEL: O_LEVEL_CATEGORIES,
  A_LEVEL: A_LEVEL_CATEGORIES,
};

export const STATUS_LABEL: Record<SubjectApprovalStatus, string> = {
  pending: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
};
export const STATUS_VARIANT: Record<SubjectApprovalStatus, 'default' | 'accent' | 'success' | 'muted'> = {
  pending: 'accent',
  approved: 'success',
  rejected: 'muted',
};

export const PHASE_LABEL: Record<Phase, string> = { O_LEVEL: 'O-Level', A_LEVEL: 'A-Level' };
export const PHASE_RANGE: Record<Phase, string> = {
  O_LEVEL: 'Senior 1–4',
  A_LEVEL: 'Senior 5–6',
};

export { submitJson } from '@/lib/api/envelope';
