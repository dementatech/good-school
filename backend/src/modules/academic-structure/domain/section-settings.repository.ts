import type { PoolClient } from "pg";
import { pool } from "../../../shared/db/index.js";
import { levelsForSchool, sectionsOf, type SchoolSection } from "../../../shared/levels.js";
import { ensureNurserySubjects } from "./subjects.repository.js";

// Per-section choices a school makes for itself (school_section):
//   - Nursery assessment style: progress ratings (default), marks, or both.
//     Many Ugandan nursery schools give marks and grades; many don't. There's
//     no national nursery exam either way, so it's the school's call.
//   - Whether report cards show a pupil's position — off by default for
//     Nursery, on for Primary/Secondary (as before this setting existed).
//   - What else report cards show (report_card_fields): the learner's photo,
//     attendance, subject remarks, signatures, ... one switch per field.

export type AssessmentStyle = "ratings" | "marks" | "both";

// Every part of a report card a school can switch on or off, with its
// default and the sections it applies to. Defaults are what report cards
// showed before this setting existed, so nothing changes until a school
// chooses — except attendance, which is new and opt-in.
export const REPORT_CARD_FIELDS = {
  schoolLogo: { default: true, sections: ["KINDERGARTEN", "PRIMARY", "SECONDARY"] },
  schoolAddress: { default: true, sections: ["KINDERGARTEN", "PRIMARY", "SECONDARY"] },
  emisNumber: { default: true, sections: ["KINDERGARTEN", "PRIMARY", "SECONDARY"] },
  studentPhoto: { default: true, sections: ["KINDERGARTEN", "PRIMARY", "SECONDARY"] },
  studentId: { default: true, sections: ["KINDERGARTEN", "PRIMARY", "SECONDARY"] },
  rowNumbers: { default: true, sections: ["KINDERGARTEN", "PRIMARY", "SECONDARY"] },
  score: { default: true, sections: ["KINDERGARTEN", "PRIMARY", "SECONDARY"] },
  grade: { default: true, sections: ["KINDERGARTEN", "PRIMARY", "SECONDARY"] },
  points: { default: true, sections: ["PRIMARY"] },
  subjectRemarks: { default: true, sections: ["KINDERGARTEN", "PRIMARY", "SECONDARY"] },
  paperBreakdown: { default: true, sections: ["SECONDARY"] },
  otherSubjects: { default: true, sections: ["PRIMARY"] },
  totalMarks: { default: true, sections: ["PRIMARY"] },
  average: { default: true, sections: ["KINDERGARTEN", "PRIMARY", "SECONDARY"] },
  overallGrade: { default: true, sections: ["KINDERGARTEN", "SECONDARY"] },
  aggregate: { default: true, sections: ["PRIMARY"] },
  division: { default: true, sections: ["PRIMARY"] },
  attendance: { default: false, sections: ["KINDERGARTEN", "PRIMARY", "SECONDARY"] },
  progressRatings: { default: true, sections: ["KINDERGARTEN"] },
  remarks: { default: true, sections: ["KINDERGARTEN", "PRIMARY", "SECONDARY"] },
  signatures: { default: true, sections: ["KINDERGARTEN", "PRIMARY", "SECONDARY"] },
  issuedDate: { default: true, sections: ["KINDERGARTEN", "PRIMARY", "SECONDARY"] },
  gradingKey: { default: true, sections: ["KINDERGARTEN", "PRIMARY", "SECONDARY"] },
} as const satisfies Record<string, { default: boolean; sections: readonly SchoolSection[] }>;

export type ReportCardField = keyof typeof REPORT_CARD_FIELDS;
export type ReportCardFields = Record<ReportCardField, boolean>;

/** A section's report card fields: the school's choices over the defaults.
 * Fields that don't apply to the section come back false. */
function reportCardFieldsOf(section: SchoolSection, saved: Partial<Record<string, boolean>> | null): ReportCardFields {
  const out = {} as ReportCardFields;
  for (const [key, field] of Object.entries(REPORT_CARD_FIELDS) as [ReportCardField, (typeof REPORT_CARD_FIELDS)[ReportCardField]][]) {
    const applies = (field.sections as readonly SchoolSection[]).includes(section);
    out[key] = applies && (typeof saved?.[key] === "boolean" ? saved[key]! : field.default);
  }
  return out;
}

export interface SectionSettings {
  section: SchoolSection;
  /** Nursery only — null for Primary/Secondary. */
  assessmentStyle: AssessmentStyle | null;
  showPositions: boolean;
  reportCard: ReportCardFields;
}

export class InvalidSectionSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSectionSettingsError";
  }
}

const DEFAULT_SHOW_POSITIONS: Record<SchoolSection, boolean> = {
  KINDERGARTEN: false,
  PRIMARY: true,
  SECONDARY: true,
};

export async function getSectionSettings(schoolId: string): Promise<SectionSettings[]> {
  const sections = sectionsOf(await levelsForSchool(schoolId));
  const { rows } = await pool.query<{
    section: SchoolSection;
    assessment_style: AssessmentStyle | null;
    show_positions: boolean | null;
    report_card_fields: Partial<Record<string, boolean>> | null;
  }>(
    `select section, assessment_style, show_positions, report_card_fields from school_section where school_id = $1`,
    [schoolId],
  );
  return sections.map((section) => {
    const row = rows.find((r) => r.section === section);
    return {
      section,
      assessmentStyle: section === "KINDERGARTEN" ? row?.assessment_style ?? "ratings" : null,
      showPositions: row?.show_positions ?? DEFAULT_SHOW_POSITIONS[section],
      reportCard: reportCardFieldsOf(section, row?.report_card_fields ?? null),
    };
  });
}

export async function nurseryAssessmentStyle(schoolId: string): Promise<AssessmentStyle> {
  const { rows } = await pool.query<{ assessment_style: AssessmentStyle | null }>(
    `select assessment_style from school_section where school_id = $1 and section = 'KINDERGARTEN'`,
    [schoolId],
  );
  return rows[0]?.assessment_style ?? "ratings";
}

export async function showPositionsFor(schoolId: string, section: SchoolSection): Promise<boolean> {
  const { rows } = await pool.query<{ show_positions: boolean | null }>(
    `select show_positions from school_section where school_id = $1 and section = $2`,
    [schoolId, section],
  );
  return rows[0]?.show_positions ?? DEFAULT_SHOW_POSITIONS[section];
}

/** What a section's report cards show — positions included. */
export async function reportCardSettingsFor(
  schoolId: string,
  section: SchoolSection,
): Promise<{ showPositions: boolean; fields: ReportCardFields }> {
  const { rows } = await pool.query<{ show_positions: boolean | null; report_card_fields: Partial<Record<string, boolean>> | null }>(
    `select show_positions, report_card_fields from school_section where school_id = $1 and section = $2`,
    [schoolId, section],
  );
  return {
    showPositions: rows[0]?.show_positions ?? DEFAULT_SHOW_POSITIONS[section],
    fields: reportCardFieldsOf(section, rows[0]?.report_card_fields ?? null),
  };
}

// Turning Nursery marks on sets the school up so it can enter marks straight
// away: its starter subjects, a default grading scheme it can change, and each
// Nursery class teacher as the teacher of every Nursery subject in their class
// (Nursery is class-teacher-led) — all idempotent.
async function prepareNurseryMarks(client: PoolClient, schoolId: string): Promise<void> {
  await ensureNurserySubjects(client, schoolId);
  await client.query(
    `insert into school_grading_scheme (school_id, applies_to, role_scope, grading_scheme_id)
     select $1, 'KINDERGARTEN', 'any', gs.id
       from grading_scheme gs
       join school_curriculum sc on sc.curriculum_id = gs.curriculum_id and sc.school_id = $1
      where gs.regime = 'nursery_letters' and gs.school_id is null
      limit 1
     on conflict do nothing`,
    [schoolId],
  );
  await assignNurseryClassTeachers(client, schoolId);
}

export async function assignNurseryClassTeachers(client: PoolClient | typeof pool, schoolId: string): Promise<void> {
  await client.query(
    `insert into subject_teacher_assignment
       (school_id, subject_id, academic_year_id, class_id, stream_id, staff_id, is_lead, status, start_date)
     select c.school_id, s.id, c.academic_year_id, c.id, null, c.class_teacher_id, true, 'active', current_date
       from classes c
       join academic_years ay on ay.id = c.academic_year_id and ay.is_current
       join curriculum_stage cs on cs.id = c.curriculum_stage_id and cs.phase = 'KINDERGARTEN'
       join subject_stage ss on ss.curriculum_stage_id = cs.id
       join subject s on s.id = ss.subject_id and s.school_id = c.school_id and s.phase = 'KINDERGARTEN'
      where c.school_id = $1 and c.class_teacher_id is not null
        and not exists (
          select 1 from subject_teacher_assignment sta
           where sta.school_id = c.school_id and sta.subject_id = s.id and sta.class_id = c.id
             and sta.academic_year_id = c.academic_year_id and sta.status = 'active' and sta.is_lead
        )`,
    [schoolId],
  );
}

export async function updateSectionSettings(
  schoolId: string,
  section: SchoolSection,
  input: { assessmentStyle?: AssessmentStyle; showPositions?: boolean; reportCard?: Partial<Record<string, boolean>> },
): Promise<SectionSettings> {
  const sections = sectionsOf(await levelsForSchool(schoolId));
  if (!sections.includes(section)) throw new InvalidSectionSettingsError("Unknown section.");
  if (input.assessmentStyle !== undefined && section !== "KINDERGARTEN") {
    throw new InvalidSectionSettingsError("Only the Nursery section has an assessment style.");
  }
  // Only fields that exist and belong to this section — a Primary report
  // card can't be told to show Nursery progress ratings.
  const reportCard: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(input.reportCard ?? {})) {
    const field = REPORT_CARD_FIELDS[key as ReportCardField];
    if (!field || !(field.sections as readonly SchoolSection[]).includes(section)) {
      throw new InvalidSectionSettingsError(`"${key}" isn't a report card option for this section.`);
    }
    if (typeof value === "boolean") reportCard[key] = value;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `insert into school_section (school_id, section, assessment_style, show_positions, report_card_fields)
       values ($1, $2, $3, $4, $5::jsonb)
       on conflict (school_id, section) do update
         set assessment_style = coalesce($3, school_section.assessment_style),
             show_positions = coalesce($4, school_section.show_positions),
             report_card_fields = coalesce(school_section.report_card_fields, '{}'::jsonb) || $5::jsonb,
             updated_at = now()`,
      [schoolId, section, input.assessmentStyle ?? null, input.showPositions ?? null, JSON.stringify(reportCard)],
    );
    if (input.assessmentStyle === "marks" || input.assessmentStyle === "both") {
      await prepareNurseryMarks(client, schoolId);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return (await getSectionSettings(schoolId)).find((s) => s.section === section)!;
}
