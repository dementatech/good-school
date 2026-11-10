// UNEB A-Level subject codes and the combination rules that key off them.
// `subject.uneb_code` is set by the platform admin in the catalog (never by a
// school) and is how the system recognises "Principal Mathematics" or
// "Subsidiary ICT" regardless of what a subject is called locally. See
// docs/design/subject-selection-module.md §3.1–§3.2a.
//
// Shared (not module-internal) because academic-structure validates
// combinations with it and students enforces it when assigning one.
// Mirrored in frontend/lib/uneb.ts — keep the two in step.

export type UnebSubjectKind = "science" | "arts" | "subsidiary" | "general_paper";

export interface UnebSubject {
  code: string;
  name: string;
  kind: UnebSubjectKind;
}

export const UNEB_A_LEVEL_SUBJECTS: UnebSubject[] = [
  { code: "S101", name: "General Paper", kind: "general_paper" },
  { code: "P210", name: "History", kind: "arts" },
  { code: "P220", name: "Economics", kind: "arts" },
  { code: "P230", name: "Entrepreneurship Education", kind: "arts" },
  { code: "P235", name: "Islamic Religious Education", kind: "arts" },
  { code: "P245", name: "Christian Religious Education (Divinity)", kind: "arts" },
  { code: "P250", name: "Geography", kind: "arts" },
  { code: "P310", name: "Literature in English", kind: "arts" },
  { code: "P320", name: "Kiswahili", kind: "arts" },
  { code: "P330", name: "French", kind: "arts" },
  { code: "P340", name: "German", kind: "arts" },
  { code: "P350", name: "Arabic", kind: "arts" },
  { code: "P360", name: "Luganda", kind: "arts" },
  { code: "P615", name: "Fine Art", kind: "arts" },
  { code: "P425", name: "Mathematics", kind: "science" },
  { code: "P510", name: "Physics", kind: "science" },
  { code: "P515", name: "Agriculture", kind: "science" },
  { code: "P525", name: "Chemistry", kind: "science" },
  { code: "P530", name: "Biology", kind: "science" },
  { code: "S475", name: "Subsidiary Mathematics", kind: "subsidiary" },
  { code: "S850", name: "Subsidiary ICT", kind: "subsidiary" },
];

export const UNEB_CODES = new Set(UNEB_A_LEVEL_SUBJECTS.map((s) => s.code));
export const GENERAL_PAPER_CODE = "S101";
export const SUB_MATH = "S475";
export const SUB_ICT = "S850";
const PRINCIPAL_MATH = "P425";
const ECONOMICS = "P220";
/** Science principals that, without Principal Mathematics, call for Sub-Maths. */
const SCIENCE_PRINCIPALS = new Set(["P510", "P515", "P525", "P530"]);

export function unebSubjectName(code: string): string {
  return UNEB_A_LEVEL_SUBJECTS.find((s) => s.code === code)?.name ?? code;
}

export interface SubsidiaryRule {
  /** The one subsidiary UNEB requires, or null when the student may choose
   * between Subsidiary Mathematics and Subsidiary ICT. */
  required: typeof SUB_MATH | typeof SUB_ICT | null;
  reason: string;
}

/**
 * Which subsidiary a combination's principals call for (§3.2a):
 * - Principal Mathematics → Subsidiary ICT
 * - Economics without Principal Mathematics → Subsidiary Mathematics
 * - A science principal (Physics, Chemistry, Biology, Agriculture) without
 *   Principal Mathematics → Subsidiary Mathematics
 * - Anything else → the student chooses.
 * Principals without a UNEB code are ignored — the rule can only act on
 * subjects the catalog has identified.
 */
export function subsidiaryRuleFor(principalCodes: (string | null)[]): SubsidiaryRule {
  const codes = new Set(principalCodes.filter((c): c is string => Boolean(c)));
  if (codes.has(PRINCIPAL_MATH)) {
    return { required: SUB_ICT, reason: "Principal Mathematics is taken with Subsidiary ICT" };
  }
  if (codes.has(ECONOMICS)) {
    return { required: SUB_MATH, reason: "Economics without Principal Mathematics is taken with Subsidiary Mathematics" };
  }
  if ([...codes].some((c) => SCIENCE_PRINCIPALS.has(c))) {
    return {
      required: SUB_MATH,
      reason: "A science combination without Principal Mathematics is taken with Subsidiary Mathematics",
    };
  }
  return { required: null, reason: "The student may choose Subsidiary Mathematics or Subsidiary ICT" };
}

export const PRINCIPALS_PER_COMBINATION = 3;

/**
 * Commonly offered Ugandan A-Level combinations, by principal UNEB codes.
 * Seeded into a curriculum's catalog on request; the subsidiary follows
 * `subsidiaryRuleFor`. A starting list, not an exhaustive one — the platform
 * admin can still add any other combination by hand.
 */
export const STANDARD_COMBINATIONS: { code: string; principals: [string, string, string] }[] = [
  // Sciences
  { code: "PCM", principals: ["P510", "P525", "P425"] },
  { code: "PCB", principals: ["P510", "P525", "P530"] },
  { code: "BCM", principals: ["P530", "P525", "P425"] },
  { code: "BCG", principals: ["P530", "P525", "P250"] },
  { code: "BCA", principals: ["P530", "P525", "P515"] },
  { code: "PEM", principals: ["P510", "P220", "P425"] },
  { code: "MEG", principals: ["P425", "P220", "P250"] },
  { code: "MEE", principals: ["P425", "P220", "P230"] },
  // Arts
  { code: "HEG", principals: ["P210", "P220", "P250"] },
  { code: "HEL", principals: ["P210", "P220", "P310"] },
  { code: "HED", principals: ["P210", "P220", "P245"] },
  { code: "HEI", principals: ["P210", "P220", "P235"] },
  { code: "HGL", principals: ["P210", "P250", "P310"] },
  { code: "HLD", principals: ["P210", "P310", "P245"] },
  { code: "GEE", principals: ["P250", "P220", "P230"] },
];
