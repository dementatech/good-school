/**
 * Practical lab-skills rubric — the PURE half of the old TERECO entity.
 *
 * The Supabase data-access functions (`getScorableSession`, `saveObservations`,
 * `summarisePractical`, …) moved to the backend. What remains here is the
 * rubric definition and the shared shapes the UI needs: constants, types, and
 * the version-gate helper, none of which touch the database.
 */

const LESSON_AND_ASSESSMENT = ["lesson", "assessment"] as const;
const LESSON_ONLY = ["lesson"] as const;

export const PRACTICAL_ASPECTS = [
  { code: "uses_lab_properly", label: "Uses the lab properly", contexts: LESSON_AND_ASSESSMENT },
  { code: "types_two_hands", label: "Types using two hands", contexts: LESSON_AND_ASSESSMENT },
  { code: "maintains_order", label: "Maintains order while in class", contexts: LESSON_AND_ASSESSMENT },
  { code: "navigates_independently", label: "Finds their way around the computer on their own", contexts: LESSON_AND_ASSESSMENT },
  { code: "tries_before_asking", label: "Tries first before asking for help", contexts: LESSON_AND_ASSESSMENT },
  { code: "helps_others", label: "Helps others when they are stuck", contexts: LESSON_ONLY },
  { code: "finishes_on_time", label: "Finishes work in time", contexts: LESSON_AND_ASSESSMENT },
] as const;

export type PracticalAspect = (typeof PRACTICAL_ASPECTS)[number]["code"];

export type SessionKind = "lesson" | "assessment";

export const PRACTICAL_BANDS = [
  { code: "outstanding", label: "Outstanding" },
  { code: "moderate", label: "Moderate" },
  { code: "needs_support", label: "Needs support" },
] as const;

export type PracticalBand = (typeof PRACTICAL_BANDS)[number]["code"];

export const CURRENT_RUBRIC_VERSION = 1;

const RUBRIC_VERSIONS: Record<number, readonly PracticalAspect[]> = {
  1: PRACTICAL_ASPECTS.map((a) => a.code),
};

function filterByContext(
  codes: readonly PracticalAspect[],
  kind: SessionKind,
): readonly PracticalAspect[] {
  return codes.filter((code) => {
    const aspect = PRACTICAL_ASPECTS.find((a) => a.code === code);
    return aspect ? (aspect.contexts as readonly SessionKind[]).includes(kind) : false;
  });
}

export function aspectsFor(
  version: number,
  kind: SessionKind = "lesson",
): readonly PracticalAspect[] {
  const known = RUBRIC_VERSIONS[version];
  if (known) return filterByContext(known, kind);
  console.warn(`Unknown practical rubric version ${version}; judging by v${CURRENT_RUBRIC_VERSION}.`);
  return filterByContext(RUBRIC_VERSIONS[CURRENT_RUBRIC_VERSION], kind);
}

export const aspectsForVersion = (version: number) => aspectsFor(version, "lesson");

export const MINIMUM_ROUNDS = 3;

export type ObservationSource = "tap" | "bulk";

export interface PracticalAspectRate {
  aspect: PracticalAspect;
  label: string;
  outstanding: number;
  moderate: number;
  needsSupport: number;
  observations: number;
  /** 0-100, the mean of this aspect's bands. */
  score: number;
}

export interface PracticalTermScore {
  studentId: string;
  studentName: string;
  systemId: string | null;
  roundsScored: number;
  observations: number;
  score: number | null;
  perAspect: PracticalAspectRate[];
  rubricVersions: number[];
}

export interface BlendedPerformance {
  written: number | null;
  practical: number | null;
  weight: number;
  overall: number | null;
}
