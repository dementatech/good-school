// Mirrors backend/src/modules/academic-structure/domain/grading-schemes.repository.ts

import type { SubjectPhase } from '@/lib/levels';

export type GradingAppliesTo = SubjectPhase;
export type GradeRoleScope = 'any' | 'principal' | 'subsidiary';

export interface GradeBand {
  id: string;
  label: string;
  minPct: number;
  maxPct: number;
  points: number | null;
  legacyEquivalent: string | null;
  comment: string;
}

export interface GradeDivision {
  label: string;
  minAggregate: number;
  maxAggregate: number;
}

export interface GradingScheme {
  id: string;
  curriculumId: string;
  regime: string;
  appliesTo: GradingAppliesTo;
  roleScope: GradeRoleScope;
  name: string;
  isActive: boolean;
  bands: GradeBand[];
  /** Aggregate schemes only (PLE: 4 subjects) — null otherwise. */
  aggregateSubjectCount: number | null;
  /** PLE divisions over the aggregate; lower aggregate is better. */
  divisions: GradeDivision[] | null;
  /** Null = shared catalog template. Set = this school's own private,
   * editable fork — never set when roleScope is 'subsidiary'. */
  schoolId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A school's current pick for one phase/role — GET/PUT /academic/school-grading-schemes. */
export interface SchoolGradingSchemeSelection {
  appliesTo: GradingAppliesTo;
  roleScope: GradeRoleScope;
  scheme: GradingScheme;
}

export const APPLIES_TO_LABEL: Record<GradingAppliesTo, string> = {
  KINDERGARTEN: 'Nursery',
  PRIMARY: 'Primary (PLE)',
  O_LEVEL: 'O-Level',
  A_LEVEL: 'A-Level',
};

export const ROLE_SCOPE_LABEL: Record<GradeRoleScope, string> = {
  any: 'Any',
  principal: 'Principal subjects',
  subsidiary: 'Subsidiary subjects',
};

// Free text on the backend (more regimes will be added) — these are just the
// two seeded today, with a friendlier label than the raw value.
export const REGIME_LABEL: Record<string, string> = {
  legacy_1_9: 'Legacy (D1–F9)',
  nlsc_a_e: 'NLSC (A–E)',
  ple_1_9: 'PLE (D1–F9, aggregates)',
  nursery_letters: 'Nursery (A–E)',
  nursery_words: 'Nursery (descriptive)',
  nursery_1_9: 'Nursery (D1–F9 style)',
};

export { submitJson, fetchList } from '@/lib/api/envelope';
