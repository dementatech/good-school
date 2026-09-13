import type { PoolClient } from "pg";
import { pool } from "../../../shared/db/index.js";

// Grading schemes — turns a raw exam_result.raw_score into a letter/points
// grade. See migration 1700000055000_grading-scheme-catalog.cjs and
// 1700000056000_school-editable-grading-ranges.cjs for the full history:
// per-school (Step 2) -> curriculum-wide catalog (super-admin manages it,
// like subject/subject_variant/combination), schools just picked from it
// -> fork-on-customize (this): the catalog stays as super-admin-managed
// templates, but a school editing O-Level/Principal ranges forks its own
// private copy (`grading_scheme.school_id` set) the first time, leaving
// the shared template and every other school untouched. Subsidiary can
// never be forked (DB check constraint) — it's a fixed UACE mechanic.
//
// `regime` (legacy_1_9 / nlsc_a_e) is free text, same convention as
// curriculum_stage.phase. `roleScope` ('any' | 'principal' | 'subsidiary')
// exists because A-Level principal and subsidiary subjects are graded on
// genuinely DIFFERENT scales (A-E worth 5/4/3/2/1 points vs. a 2-band
// Fail/Pass worth 0/1) — not a UI nuance, the bands themselves differ, so
// one A-Level phase needs two catalog schemes. O-Level has no such
// distinction and is always 'any'. resolveSubjectRoleScope below is what
// decides, per (student, subject), which one applies.

export type GradingAppliesTo = "O_LEVEL" | "A_LEVEL";
export type GradeRoleScope = "any" | "principal" | "subsidiary";

export interface GradeBandRecord {
  id: string;
  label: string;
  minPct: number;
  maxPct: number;
  points: number | null;
  legacyEquivalent: string | null;
  /** The sentence shown on a report card ("Excellent", "Subsidiary Pass") —
   * distinct from the short `label` ("A", "Pass"). */
  comment: string;
}

export interface GradingSchemeRecord {
  id: string;
  curriculumId: string;
  regime: string;
  appliesTo: GradingAppliesTo;
  roleScope: GradeRoleScope;
  name: string;
  isActive: boolean;
  bands: GradeBandRecord[];
  /** Null = shared catalog template. Set = one school's own private,
   * editable fork (see editSchoolGradingRanges) — never true when
   * roleScope is 'subsidiary'. */
  schoolId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A band mid-edit — no id needed on input since the whole set is replaced
 * together, same precedent as SubjectVariantInput. */
export interface GradeBandInput {
  label: string;
  minPct: number;
  maxPct: number;
  points?: number | null;
  legacyEquivalent?: string | null;
  comment: string;
}

export interface GradingSchemeInput {
  regime: string;
  appliesTo: GradingAppliesTo;
  /** Omit (or 'any') for O-Level. Required for a real A-Level scheme —
   * 'any' is still accepted there for a not-yet-split placeholder like the
   * seeded Legacy scheme, just not reachable through the school picker
   * (its three cards are O-Level/any, A-Level/principal, A-Level/subsidiary). */
  roleScope?: GradeRoleScope;
  name: string;
  isActive?: boolean;
  bands: GradeBandInput[];
}

export interface SchoolGradingSchemeSelection {
  appliesTo: GradingAppliesTo;
  roleScope: GradeRoleScope;
  scheme: GradingSchemeRecord;
}

interface SchemeRow {
  id: string;
  curriculum_id: string;
  regime: string;
  applies_to: GradingAppliesTo;
  role_scope: GradeRoleScope;
  name: string;
  is_active: boolean;
  bands: GradeBandRecord[];
  school_id: string | null;
  created_at: string;
  updated_at: string;
}

// `gs` is the required alias for grading_scheme wherever this is spliced in.
const BANDS_JSON = `
  (select coalesce(json_agg(json_build_object(
           'id', gb.id, 'label', gb.label,
           'minPct', gb.min_pct, 'maxPct', gb.max_pct,
           'points', gb.points, 'legacyEquivalent', gb.legacy_equivalent,
           'comment', gb.comment
         ) order by gb.min_pct), '[]'::json)
     from grade_band gb where gb.grading_scheme_id = gs.id)
`;

const SELECT_SCHEME = `
  select gs.id, gs.curriculum_id, gs.regime, gs.applies_to, gs.role_scope, gs.name, gs.is_active,
         gs.school_id, gs.created_at, gs.updated_at, ${BANDS_JSON} as bands
    from grading_scheme gs
`;

function mapRow(r: SchemeRow): GradingSchemeRecord {
  return {
    id: r.id,
    curriculumId: r.curriculum_id,
    regime: r.regime,
    appliesTo: r.applies_to,
    roleScope: r.role_scope,
    name: r.name,
    isActive: r.is_active,
    schoolId: r.school_id,
    bands: r.bands.map((b) => ({
      id: b.id,
      label: b.label,
      minPct: Number(b.minPct),
      maxPct: Number(b.maxPct),
      points: b.points === null || b.points === undefined ? null : Number(b.points),
      legacyEquivalent: b.legacyEquivalent ?? null,
      comment: b.comment,
    })),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class InvalidGradingSchemeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGradingSchemeError";
  }
}

export class GradingSchemeInUseError extends Error {
  constructor() {
    super("This grading scheme has graded published results and can't be deleted.");
    this.name = "GradingSchemeInUseError";
  }
}

export class UnknownGradingSchemeError extends Error {
  constructor() {
    super("That grading scheme doesn't exist.");
    this.name = "UnknownGradingSchemeError";
  }
}

export class GradingSchemeMismatchError extends Error {
  constructor() {
    super("That scheme doesn't belong to this phase/subject track.");
    this.name = "GradingSchemeMismatchError";
  }
}

export class NoGradingSchemeSelectedError extends Error {
  constructor() {
    super("Pick a grade system for this phase first (\"Change Grade System\") before customizing its ranges.");
    this.name = "NoGradingSchemeSelectedError";
  }
}

const isPgError = (err: unknown, code: string): boolean =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === code;

// O-Level never gets a principal/subsidiary split — that distinction is an
// A-Level combination concept. A-Level accepts 'any' too (the seeded Legacy
// placeholder uses it), just not reachable through the school picker.
function assertRoleScopeValid(appliesTo: GradingAppliesTo, roleScope: GradeRoleScope | undefined): GradeRoleScope {
  const scope = roleScope ?? "any";
  if (appliesTo === "O_LEVEL" && scope !== "any") {
    throw new InvalidGradingSchemeError("O-Level schemes don't have a principal/subsidiary distinction.");
  }
  return scope;
}

// Pure validation — never touches the database. Bands must be gapless,
// non-overlapping, and fully cover 0-100 once sorted by minPct, so every
// possible score resolves to exactly one band. Adjacent bands are expected
// to "touch" at hundredths (e.g. 70.00-79.99, 80.00-100.00) since raw_score
// is numeric(5,2) — the same precision grade_band itself uses.
function assertBandsValid(bands: GradeBandInput[]): GradeBandInput[] {
  if (bands.length === 0) {
    throw new InvalidGradingSchemeError("A grading scheme needs at least one band.");
  }
  const seen = new Set<string>();
  const normalised = bands.map((b) => {
    const label = b.label.trim();
    if (!label) throw new InvalidGradingSchemeError("Every band needs a label.");
    if (seen.has(label)) throw new InvalidGradingSchemeError(`Duplicate band label "${label}".`);
    seen.add(label);
    if (!(b.minPct >= 0 && b.maxPct <= 100 && b.minPct <= b.maxPct)) {
      throw new InvalidGradingSchemeError(`Band "${label}" needs 0 <= min <= max <= 100.`);
    }
    const comment = b.comment.trim();
    if (!comment) throw new InvalidGradingSchemeError(`Band "${label}" needs a comment (shown on the report card).`);
    return {
      label,
      minPct: Math.round(b.minPct * 100) / 100,
      maxPct: Math.round(b.maxPct * 100) / 100,
      points: b.points ?? null,
      legacyEquivalent: b.legacyEquivalent?.trim() || null,
      comment,
    };
  });
  const sorted = [...normalised].sort((a, b) => a.minPct - b.minPct);
  if (sorted[0].minPct !== 0) {
    throw new InvalidGradingSchemeError("Bands must start at 0%.");
  }
  if (sorted[sorted.length - 1].maxPct !== 100) {
    throw new InvalidGradingSchemeError("Bands must reach 100%.");
  }
  for (let i = 1; i < sorted.length; i++) {
    const expectedMin = Math.round((sorted[i - 1].maxPct + 0.01) * 100) / 100;
    if (sorted[i].minPct !== expectedMin) {
      throw new InvalidGradingSchemeError(
        `Bands "${sorted[i - 1].label}" and "${sorted[i].label}" leave a gap or overlap — ` +
          `"${sorted[i].label}" should start at ${expectedMin}%.`,
      );
    }
  }
  return normalised;
}

/** The band a raw score falls into, or null if the scheme has no bands (the
 * Legacy placeholder) or the score falls outside every band — shouldn't
 * happen for a valid (assertBandsValid-passed) scheme and a 0-100 score,
 * but callers shouldn't assume a match. Pure — no DB, no storage. */
export function computeGrade(rawScore: number, bands: GradeBandRecord[]): GradeBandRecord | null {
  return bands.find((b) => rawScore >= b.minPct && rawScore <= b.maxPct) ?? null;
}

async function replaceBands(client: PoolClient, schemeId: string, bands: GradeBandInput[]): Promise<void> {
  await client.query(`delete from grade_band where grading_scheme_id = $1`, [schemeId]);
  for (const b of bands) {
    await client.query(
      `insert into grade_band (grading_scheme_id, label, min_pct, max_pct, points, legacy_equivalent, comment)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [schemeId, b.label, b.minPct, b.maxPct, b.points ?? null, b.legacyEquivalent ?? null, b.comment],
    );
  }
}

// ─── Catalog (super-admin) ──────────────────────────────────────────────────

export async function getGradingScheme(id: string): Promise<GradingSchemeRecord | null> {
  const { rows } = await pool.query<SchemeRow>(`${SELECT_SCHEME} where gs.id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

// Catalog listing only — always excludes school-owned forks, so a school
// customizing its own ranges never clutters the platform-wide catalog view.
export async function listGradingSchemes(
  curriculumId?: string,
  appliesTo?: GradingAppliesTo,
  roleScope?: GradeRoleScope,
): Promise<GradingSchemeRecord[]> {
  const conditions: string[] = ["gs.school_id is null"];
  const params: unknown[] = [];
  if (curriculumId) {
    params.push(curriculumId);
    conditions.push(`gs.curriculum_id = $${params.length}`);
  }
  if (appliesTo) {
    params.push(appliesTo);
    conditions.push(`gs.applies_to = $${params.length}`);
  }
  if (roleScope) {
    params.push(roleScope);
    conditions.push(`gs.role_scope = $${params.length}`);
  }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  const { rows } = await pool.query<SchemeRow>(
    `${SELECT_SCHEME} ${where} order by gs.applies_to, gs.role_scope, gs.name`,
    params,
  );
  return rows.map(mapRow);
}

export async function createGradingScheme(
  curriculumId: string,
  input: GradingSchemeInput,
): Promise<GradingSchemeRecord> {
  const roleScope = assertRoleScopeValid(input.appliesTo, input.roleScope);
  const bands = assertBandsValid(input.bands);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ id: string }>(
      `insert into grading_scheme (curriculum_id, regime, applies_to, role_scope, name, is_active)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [curriculumId, input.regime, input.appliesTo, roleScope, input.name.trim(), input.isActive ?? true],
    );
    await replaceBands(client, rows[0].id, bands);
    await client.query("commit");
    return (await getGradingScheme(rows[0].id))!;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

// appliesTo/roleScope/curriculum are fixed at creation — same precedent as
// a subject's phase/code being immutable after creation. A real change of
// grading track is a new scheme, not a retrofit of one schools may already
// have selected.
export async function updateGradingScheme(
  id: string,
  input: GradingSchemeInput,
): Promise<GradingSchemeRecord | null> {
  const bands = assertBandsValid(input.bands);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rowCount } = await client.query(
      `update grading_scheme set regime = $1, name = $2, is_active = $3, updated_at = now() where id = $4`,
      [input.regime, input.name.trim(), input.isActive ?? true, id],
    );
    if (rowCount === 0) {
      await client.query("rollback");
      return null;
    }
    await replaceBands(client, id, bands);
    await client.query("commit");
    return getGradingScheme(id);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteGradingScheme(id: string): Promise<boolean> {
  try {
    const { rowCount } = await pool.query(`delete from grading_scheme where id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  } catch (err) {
    if (isPgError(err, "23503")) throw new GradingSchemeInUseError();
    throw err;
  }
}

// ─── School selection ───────────────────────────────────────────────────────

export async function getSchoolGradingSchemes(schoolId: string): Promise<SchoolGradingSchemeSelection[]> {
  const { rows } = await pool.query<{
    sel_applies_to: GradingAppliesTo;
    sel_role_scope: GradeRoleScope;
  } & SchemeRow>(
    `select sgs.applies_to as sel_applies_to, sgs.role_scope as sel_role_scope,
            gs.id, gs.curriculum_id, gs.regime, gs.applies_to, gs.role_scope, gs.name, gs.is_active,
            gs.school_id, gs.created_at, gs.updated_at, ${BANDS_JSON} as bands
       from school_grading_scheme sgs
       join grading_scheme gs on gs.id = sgs.grading_scheme_id
      where sgs.school_id = $1
      order by sgs.applies_to, sgs.role_scope`,
    [schoolId],
  );
  return rows.map((r) => ({
    appliesTo: r.sel_applies_to,
    roleScope: r.sel_role_scope,
    scheme: mapRow(r),
  }));
}

export async function setSchoolGradingScheme(
  schoolId: string,
  appliesTo: GradingAppliesTo,
  roleScope: GradeRoleScope,
  gradingSchemeId: string,
): Promise<SchoolGradingSchemeSelection> {
  const scheme = await getGradingScheme(gradingSchemeId);
  if (!scheme) throw new UnknownGradingSchemeError();
  if (scheme.appliesTo !== appliesTo || scheme.roleScope !== roleScope) {
    throw new GradingSchemeMismatchError();
  }
  await pool.query(
    `insert into school_grading_scheme (school_id, applies_to, role_scope, grading_scheme_id, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (school_id, applies_to, role_scope)
       do update set grading_scheme_id = excluded.grading_scheme_id, updated_at = now()`,
    [schoolId, appliesTo, roleScope, gradingSchemeId],
  );
  return { appliesTo, roleScope, scheme };
}

// Fork-on-customize: a school adjusting O-Level or A-Level-Principal ranges
// never mutates the shared catalog template (or any other school's fork) —
// the first edit clones it into a new school-owned row, and
// school_grading_scheme is repointed at that fork. Editing an
// already-forked scheme just updates it in place. Subsidiary is fixed and
// can never be forked — enforced both here and by a DB check constraint.
export async function editSchoolGradingRanges(
  schoolId: string,
  appliesTo: GradingAppliesTo,
  roleScope: GradeRoleScope,
  bands: GradeBandInput[],
): Promise<SchoolGradingSchemeSelection> {
  if (roleScope === "subsidiary") {
    throw new InvalidGradingSchemeError("Subsidiary grading is fixed and can't be customized.");
  }
  const validated = assertBandsValid(bands);

  const client = await pool.connect();
  let targetId: string;
  try {
    await client.query("begin");
    const current = await client.query<{
      grading_scheme_id: string;
      school_id: string | null;
      curriculum_id: string;
      regime: string;
      name: string;
    }>(
      `select sgs.grading_scheme_id, gs.school_id, gs.curriculum_id, gs.regime, gs.name
         from school_grading_scheme sgs
         join grading_scheme gs on gs.id = sgs.grading_scheme_id
        where sgs.school_id = $1 and sgs.applies_to = $2 and sgs.role_scope = $3`,
      [schoolId, appliesTo, roleScope],
    );
    if (current.rows.length === 0) {
      await client.query("rollback");
      throw new NoGradingSchemeSelectedError();
    }
    const row = current.rows[0];

    if (row.school_id === schoolId) {
      targetId = row.grading_scheme_id;
    } else {
      const inserted = await client.query<{ id: string }>(
        `insert into grading_scheme (school_id, curriculum_id, regime, applies_to, role_scope, name, is_active)
         values ($1, $2, $3, $4, $5, $6, true) returning id`,
        [schoolId, row.curriculum_id, row.regime, appliesTo, roleScope, row.name],
      );
      targetId = inserted.rows[0].id;
      await client.query(
        `insert into school_grading_scheme (school_id, applies_to, role_scope, grading_scheme_id, updated_at)
         values ($1, $2, $3, $4, now())
         on conflict (school_id, applies_to, role_scope)
           do update set grading_scheme_id = excluded.grading_scheme_id, updated_at = now()`,
        [schoolId, appliesTo, roleScope, targetId],
      );
    }
    await replaceBands(client, targetId, validated);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
  return { appliesTo, roleScope, scheme: (await getGradingScheme(targetId))! };
}

// ─── Publish-time resolution ────────────────────────────────────────────────

// Which of a school's selected schemes applies to this (student, subject) —
// O-Level is always 'any'. A-Level: General Paper is graded on the
// Subsidiary scale (it isn't a combination member with a stored role, but
// the design doc groups it with subsidiary subjects for points purposes).
// Otherwise, resolved from the student's CONFIRMED combination for that
// academic year (same "status <> 'reassigned'" condition the combination's
// own unique index uses): the combination's chosen subsidiary subject maps
// to 'subsidiary'; a 'principal' or 'compulsory' member maps to 'principal'
// (compulsory reads as "still fully graded," not the pass/fail track — no
// third scale was specified). No confirmed combination, or the subject
// isn't a member of it → null, same "nothing to grade against" degrade as a
// missing scheme.
export async function resolveSubjectRoleScope(
  academicYearId: string,
  studentUserId: string,
  subject: { id: string; phase: GradingAppliesTo; isGeneralPaper: boolean },
): Promise<GradeRoleScope | null> {
  if (subject.phase === "O_LEVEL") return "any";
  if (subject.isGeneralPaper) return "subsidiary";

  const { rows } = await pool.query<{ role: "principal" | "subsidiary" | "compulsory" | null }>(
    `select case
              when sc.subsidiary_subject_id = $3 then 'subsidiary'
              else cs.role
            end as role
       from student_combination sc
       left join school_combination_subject cs
         on cs.school_combination_id = sc.school_combination_id and cs.subject_id = $3
      where sc.student_user_id = $1 and sc.academic_year_id = $2 and sc.status <> 'reassigned'
      limit 1`,
    [studentUserId, academicYearId, subject.id],
  );
  const role = rows[0]?.role;
  if (role === "subsidiary") return "subsidiary";
  if (role === "principal" || role === "compulsory") return "principal";
  return null;
}

// The scheme a subject's marks should be graded against at publish time —
// the school's currently-selected scheme for that (subject's phase, the
// grading student's role). Null when unresolvable (no role, or the school
// hasn't picked a scheme for that phase/role yet) — publish degrades
// gracefully rather than failing on this.
export async function getActiveSchemeForSubject(
  schoolId: string,
  subjectId: string,
  context: { academicYearId: string; studentUserId: string },
): Promise<GradingSchemeRecord | null> {
  const { rows: subjectRows } = await pool.query<{ phase: GradingAppliesTo; is_general_paper: boolean }>(
    `select phase, is_general_paper from subject where id = $1`,
    [subjectId],
  );
  const subject = subjectRows[0];
  if (!subject) return null;

  const roleScope = await resolveSubjectRoleScope(context.academicYearId, context.studentUserId, {
    id: subjectId,
    phase: subject.phase,
    isGeneralPaper: subject.is_general_paper,
  });
  if (!roleScope) return null;

  const { rows } = await pool.query<SchemeRow>(
    `select gs.id, gs.curriculum_id, gs.regime, gs.applies_to, gs.role_scope, gs.name, gs.is_active,
            gs.school_id, gs.created_at, gs.updated_at, ${BANDS_JSON} as bands
       from school_grading_scheme sgs
       join grading_scheme gs on gs.id = sgs.grading_scheme_id
      where sgs.school_id = $1 and sgs.applies_to = $2 and sgs.role_scope = $3`,
    [schoolId, subject.phase, roleScope],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}
