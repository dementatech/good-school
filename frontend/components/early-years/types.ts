// Mirrors backend/src/modules/early-years/domain/*.repository.ts

export type DevelopmentalRating = 'emerging' | 'developing' | 'proficient';

export const RATINGS: DevelopmentalRating[] = ['emerging', 'developing', 'proficient'];

export const RATING_LABEL: Record<DevelopmentalRating, string> = {
  emerging: 'Emerging',
  developing: 'Developing',
  proficient: 'Proficient',
};

export const RATING_SHORT: Record<DevelopmentalRating, string> = {
  emerging: 'E',
  developing: 'D',
  proficient: 'P',
};

/** What each rating means — printed on the progress report's legend. */
export const RATING_MEANING: Record<DevelopmentalRating, string> = {
  emerging: 'Beginning to show this skill with a lot of support',
  developing: 'Shows this skill sometimes, with some support',
  proficient: 'Shows this skill confidently on their own',
};

export const RATING_CHIP: Record<DevelopmentalRating, string> = {
  emerging: 'bg-warning-bg text-warning border-warning/40',
  developing: 'bg-primary-50 text-primary-700 border-primary-700/30',
  proficient: 'bg-success-bg text-success border-success/40',
};

export interface LearningArea {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface KindergartenClass {
  id: string;
  name: string;
  stageCode: string;
  academicYearId: string;
  streams: { id: string; name: string }[];
  pupilCount: number;
}

export interface TermSummary {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface EarlyYearsOverview {
  academicYear: { id: string; name: string } | null;
  terms: TermSummary[];
  currentTermId: string | null;
  classes: KindergartenClass[];
}

export interface AreaRating {
  rating: DevelopmentalRating | null;
  comment: string | null;
}

export interface SheetPupil {
  studentUserId: string;
  name: string;
  systemId: string | null;
  photoUrl: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  streamName: string | null;
  ratings: Record<string, AreaRating>;
  classTeacherComment: string | null;
  headTeacherComment: string | null;
}

export interface AssessmentSheet {
  class: { id: string; name: string; classTeacherName: string | null };
  term: TermSummary;
  learningAreas: LearningArea[];
  pupils: SheetPupil[];
  canEdit: boolean;
  canEditHeadTeacherRemark: boolean;
}
