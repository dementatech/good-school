import { pool } from "./db/index.js";

/**
 * The education levels a school can run, in ladder order — each is a
 * `curriculum_stage.phase` value. Kindergarten and Primary are earlier stages
 * of the same UNEB pathway as O/A-Level (see docs/design/
 * kindergarten-extension.md and primary-schools-extension.md).
 */
export type SchoolLevel = "KINDERGARTEN" | "PRIMARY" | "O_LEVEL" | "A_LEVEL";

export const SCHOOL_LEVELS: SchoolLevel[] = ["KINDERGARTEN", "PRIMARY", "O_LEVEL", "A_LEVEL"];

/** Levels that have a subject catalog. Kindergarten is taught through
 * learning areas, not subjects, so it never appears here. */
export type SubjectPhase = Exclude<SchoolLevel, "KINDERGARTEN">;

export const SUBJECT_PHASES: SubjectPhase[] = ["PRIMARY", "O_LEVEL", "A_LEVEL"];

export const LEVEL_LABEL: Record<SchoolLevel, string> = {
  KINDERGARTEN: "Kindergarten",
  PRIMARY: "Primary",
  O_LEVEL: "O-Level",
  A_LEVEL: "A-Level",
};

/** Human stage range per level, for validation messages. */
export const LEVEL_STAGE_RANGE: Record<SchoolLevel, string> = {
  KINDERGARTEN: "Baby–Top Class",
  PRIMARY: "Primary 1–7",
  O_LEVEL: "Senior 1–4",
  A_LEVEL: "Senior 5–6",
};

/**
 * SQL predicate: does school `alias` run the level named by the SQL expression
 * `phaseExpr`? e.g. `schoolOffersLevelSql("sch", "s.phase")`.
 */
export function schoolOffersLevelSql(alias: string, phaseExpr: string): string {
  return `(case ${phaseExpr}
             when 'KINDERGARTEN' then ${alias}.offers_kindergarten
             when 'PRIMARY' then ${alias}.offers_primary
             when 'O_LEVEL' then ${alias}.offers_o_level
             when 'A_LEVEL' then ${alias}.offers_a_level
             else true
           end)`;
}

/** The levels a school actually runs, ladder order. Empty for an unknown school. */
export async function levelsForSchool(schoolId: string): Promise<SchoolLevel[]> {
  const { rows } = await pool.query<{
    offers_kindergarten: boolean;
    offers_primary: boolean;
    offers_o_level: boolean;
    offers_a_level: boolean;
  }>(
    `select offers_kindergarten, offers_primary, offers_o_level, offers_a_level from schools where id = $1`,
    [schoolId],
  );
  const s = rows[0];
  if (!s) return [];
  const flags: Record<SchoolLevel, boolean> = {
    KINDERGARTEN: s.offers_kindergarten,
    PRIMARY: s.offers_primary,
    O_LEVEL: s.offers_o_level,
    A_LEVEL: s.offers_a_level,
  };
  return SCHOOL_LEVELS.filter((l) => flags[l]);
}

/**
 * A school's sections — each is effectively its own institution (EMIS even
 * registers them separately): Nursery, Primary, Secondary (O- and A-Level
 * together). A school runs one section, or Nursery + Primary under one
 * brand; Secondary never shares a school with the other two.
 */
export type SchoolSection = "KINDERGARTEN" | "PRIMARY" | "SECONDARY";

export const SECTION_LEVELS: Record<SchoolSection, SchoolLevel[]> = {
  KINDERGARTEN: ["KINDERGARTEN"],
  PRIMARY: ["PRIMARY"],
  SECONDARY: ["O_LEVEL", "A_LEVEL"],
};

const SECTIONS: SchoolSection[] = ["KINDERGARTEN", "PRIMARY", "SECONDARY"];

/** The school-admin portal's section switcher stores its choice here. */
export const SECTION_COOKIE = "gs_section";

export function sectionsOf(levels: SchoolLevel[]): SchoolSection[] {
  return SECTIONS.filter((s) => SECTION_LEVELS[s].some((l) => levels.includes(l)));
}

/**
 * The section a school admin is working in: the switcher's choice when it's
 * one of the school's sections, otherwise the school's first section. The
 * frontend applies the exact same fallback, so both always agree.
 */
export function activeSection(levels: SchoolLevel[], requested: string | undefined): SchoolSection | null {
  const sections = sectionsOf(levels);
  return sections.find((s) => s === requested) ?? sections[0] ?? null;
}

// School admins work one section at a time; teachers and other school roles
// see every level their school runs (their own classes scope them anyway).
const SECTION_SCOPED_ROLES = new Set(["school_admin", "admin"]);

/**
 * The levels a caller may see: null (everything) for a super_admin — the
 * platform itself — otherwise only their own school's levels, narrowed for a
 * school admin to the section they've switched to. A school must never see,
 * pick or be told about a level it doesn't run.
 */
export async function visibleLevelsFor(
  auth: { role: string; school_id?: string | null },
  sectionCookie?: string,
): Promise<SchoolLevel[] | null> {
  if (auth.role === "super_admin") return null;
  if (!auth.school_id) return [];
  const levels = await levelsForSchool(auth.school_id);
  if (!SECTION_SCOPED_ROLES.has(auth.role)) return levels;
  const section = activeSection(levels, sectionCookie);
  return section ? levels.filter((l) => SECTION_LEVELS[section].includes(l)) : [];
}
