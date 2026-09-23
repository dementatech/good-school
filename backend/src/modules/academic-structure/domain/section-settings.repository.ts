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

export type AssessmentStyle = "ratings" | "marks" | "both";

export interface SectionSettings {
  section: SchoolSection;
  /** Nursery only — null for Primary/Secondary. */
  assessmentStyle: AssessmentStyle | null;
  showPositions: boolean;
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
  }>(`select section, assessment_style, show_positions from school_section where school_id = $1`, [schoolId]);
  return sections.map((section) => {
    const row = rows.find((r) => r.section === section);
    return {
      section,
      assessmentStyle: section === "KINDERGARTEN" ? row?.assessment_style ?? "ratings" : null,
      showPositions: row?.show_positions ?? DEFAULT_SHOW_POSITIONS[section],
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
  input: { assessmentStyle?: AssessmentStyle; showPositions?: boolean },
): Promise<SectionSettings> {
  const sections = sectionsOf(await levelsForSchool(schoolId));
  if (!sections.includes(section)) throw new InvalidSectionSettingsError("Unknown section.");
  if (input.assessmentStyle !== undefined && section !== "KINDERGARTEN") {
    throw new InvalidSectionSettingsError("Only the Nursery section has an assessment style.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `insert into school_section (school_id, section, assessment_style, show_positions)
       values ($1, $2, $3, $4)
       on conflict (school_id, section) do update
         set assessment_style = coalesce($3, school_section.assessment_style),
             show_positions = coalesce($4, school_section.show_positions),
             updated_at = now()`,
      [schoolId, section, input.assessmentStyle ?? null, input.showPositions ?? null],
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
