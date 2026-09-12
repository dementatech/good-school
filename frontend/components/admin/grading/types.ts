// Mirrors backend/src/modules/academic-structure/domain/grading-schemes.repository.ts

export type GradingAppliesTo = 'O_LEVEL' | 'A_LEVEL';

export interface GradeBand {
  id: string;
  label: string;
  minPct: number;
  maxPct: number;
  points: number | null;
  legacyEquivalent: string | null;
}

export interface GradingScheme {
  id: string;
  schoolId: string;
  curriculumId: string;
  regime: string;
  appliesTo: GradingAppliesTo;
  name: string;
  isActive: boolean;
  bands: GradeBand[];
  createdAt: string;
  updatedAt: string;
}

export const APPLIES_TO_LABEL: Record<GradingAppliesTo, string> = {
  O_LEVEL: 'O-Level',
  A_LEVEL: 'A-Level',
};

// Free text on the backend (more regimes will be added) — these are just the
// two seeded today, with a friendlier label than the raw value.
export const REGIME_LABEL: Record<string, string> = {
  legacy_1_9: 'Legacy (D1–F9)',
  nlsc_a_e: 'NLSC (A–E)',
};

export { submitJson, fetchList } from '@/lib/api/envelope';
