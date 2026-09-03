import { pool } from "../../../shared/db/index.js";

// A school's O-Level subject offering — which catalog subjects (super_admin's
// "constants", from `subject`) it runs this year, and which of those are
// compulsory *here*. Per-school, per-year — not a truth on `subject` itself.
// See docs/design/subject-selection-module.md §2.3.

export interface SubjectOfferingRecord {
  id: string;
  schoolId: string;
  academicYearId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  subjectCategory: string;
  subjectPhase: "O_LEVEL" | "A_LEVEL";
  isOffered: boolean;
  isCompulsory: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SubjectOfferingInput {
  subjectId: string;
  isOffered: boolean;
  isCompulsory: boolean;
}

interface SubjectOfferingRow {
  id: string;
  school_id: string;
  academic_year_id: string;
  subject_id: string;
  subject_code: string;
  subject_name: string;
  subject_category: string;
  subject_phase: "O_LEVEL" | "A_LEVEL";
  is_offered: boolean;
  is_compulsory: boolean;
  created_at: string;
  updated_at: string;
}

const SELECT_OFFERING = `
  select o.id, o.school_id, o.academic_year_id, o.subject_id,
         s.code as subject_code, s.name as subject_name, s.category as subject_category,
         s.phase as subject_phase, o.is_offered, o.is_compulsory, o.created_at, o.updated_at
  from subject_offering o
  join subject s on s.id = o.subject_id
`;

function mapRow(row: SubjectOfferingRow): SubjectOfferingRecord {
  return {
    id: row.id,
    schoolId: row.school_id,
    academicYearId: row.academic_year_id,
    subjectId: row.subject_id,
    subjectCode: row.subject_code,
    subjectName: row.subject_name,
    subjectCategory: row.subject_category,
    subjectPhase: row.subject_phase,
    isOffered: row.is_offered,
    isCompulsory: row.is_compulsory,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class UnknownSubjectError extends Error {
  constructor() {
    super("Unknown subject, or not part of a curriculum this school runs");
    this.name = "UnknownSubjectError";
  }
}

export class AlwaysOnSubjectError extends Error {
  constructor() {
    super(
      "This subject is compulsory for every school and can't be turned off — " +
        "core O-Level subjects and General Paper are never optional.",
    );
    this.name = "AlwaysOnSubjectError";
  }
}

export class LastReligiousSubjectError extends Error {
  constructor() {
    super("Every school must offer at least one Religious Education subject.");
    this.name = "LastReligiousSubjectError";
  }
}

// A subject the platform itself decides can never be turned off, once it's
// offered: O-Level 'core' (the 7 nationally-mandated subjects — see
// docs/design/subject-selection-module.md §2.1) and A-Level 'general'
// (General Paper — compulsory for every A-Level student, §3.1). Neither is
// a school's choice to make.
function isAlwaysOnCategory(category: string): boolean {
  return category === "core" || category === "general";
}

// Seeds a subject_offering row (offered + compulsory) for every always-on
// subject this school's curricula carry, for the given year — idempotent,
// safe to call on every read. This is what makes "core is compulsory by
// default, not something admins configure away" true from a school's very
// first visit to this page, not just something enforced reactively.
async function seedAlwaysOnOfferings(schoolId: string, academicYearId: string): Promise<void> {
  await pool.query(
    `insert into subject_offering (school_id, subject_id, academic_year_id, is_offered, is_compulsory)
     select $1, s.id, $2, true, true
     from subject s
     join school_curriculum sc on sc.curriculum_id = s.curriculum_id and sc.school_id = $1
     where s.category in ('core', 'general') and s.is_active
     on conflict (school_id, subject_id, academic_year_id) do nothing`,
    [schoolId, academicYearId],
  );
}

export async function listSubjectOfferings(
  schoolId: string,
  academicYearId: string,
  phase?: "O_LEVEL" | "A_LEVEL",
): Promise<SubjectOfferingRecord[]> {
  await seedAlwaysOnOfferings(schoolId, academicYearId);

  const params: unknown[] = [schoolId, academicYearId];
  let clause = `where o.school_id = $1 and o.academic_year_id = $2`;
  if (phase) {
    params.push(phase);
    clause += ` and s.phase = $3`;
  }
  const { rows } = await pool.query<SubjectOfferingRow>(
    `${SELECT_OFFERING} ${clause} order by s.name`,
    params,
  );
  return rows.map(mapRow);
}

// Upsert — the school-admin UI toggles one subject at a time (offered /
// compulsory), not a bulk save, so "set" rather than "create" is the natural
// shape. Validates the subject belongs to a curriculum this school actually
// runs (school_curriculum) — reject an unknown/foreign subject rather than
// silently creating a dangling offering.
export async function setSubjectOffering(
  schoolId: string,
  academicYearId: string,
  input: SubjectOfferingInput,
): Promise<SubjectOfferingRecord> {
  const owned = await pool.query<{ category: string }>(
    `select s.category from subject s
     join school_curriculum sc on sc.curriculum_id = s.curriculum_id
     where s.id = $1 and sc.school_id = $2`,
    [input.subjectId, schoolId],
  );
  if (owned.rowCount === 0) throw new UnknownSubjectError();
  const category = owned.rows[0].category;

  if (isAlwaysOnCategory(category) && (!input.isOffered || !input.isCompulsory)) {
    throw new AlwaysOnSubjectError();
  }

  if (category === "religion" && !input.isOffered) {
    const otherReligious = await pool.query(
      `select 1 from subject_offering o
       join subject s on s.id = o.subject_id
       where o.school_id = $1 and o.academic_year_id = $2 and s.category = 'religion'
         and o.is_offered = true and o.subject_id <> $3`,
      [schoolId, academicYearId, input.subjectId],
    );
    if ((otherReligious.rowCount ?? 0) === 0) throw new LastReligiousSubjectError();
  }

  const result = await pool.query<{ id: string }>(
    `insert into subject_offering (school_id, subject_id, academic_year_id, is_offered, is_compulsory)
     values ($1, $2, $3, $4, $5)
     on conflict (school_id, subject_id, academic_year_id) do update
       set is_offered = excluded.is_offered, is_compulsory = excluded.is_compulsory, updated_at = now()
     returning id`,
    [schoolId, input.subjectId, academicYearId, input.isOffered, input.isCompulsory],
  );

  const row = await pool.query<SubjectOfferingRow>(`${SELECT_OFFERING} where o.id = $1`, [
    result.rows[0].id,
  ]);
  return mapRow(row.rows[0]);
}

export async function removeSubjectOffering(schoolId: string, id: string): Promise<boolean> {
  const result = await pool.query(`delete from subject_offering where id = $1 and school_id = $2`, [
    id,
    schoolId,
  ]);
  return (result.rowCount ?? 0) > 0;
}
