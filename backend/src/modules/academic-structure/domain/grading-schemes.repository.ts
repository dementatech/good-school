import type { PoolClient } from "pg";
import { pool } from "../../../shared/db/index.js";

// Exams roadmap Step 2 — grading schemes. See migration
// 1700000053000_grading-schemes.cjs for the schema and the scope note (no
// exam_result wiring or locking yet — that's Step 3, publish time).
//
// Per-school (not curriculum-wide like subject_variant): each school owns
// its own grading_scheme rows, seeded from defaults, then freely editable.
// `regime` is free text (legacy_1_9 / nlsc_a_e today), same convention as
// curriculum_stage.phase — deliberately not a DB enum.

export type GradingAppliesTo = "O_LEVEL" | "A_LEVEL";

export interface GradeBandRecord {
  id: string;
  label: string;
  minPct: number;
  maxPct: number;
  points: number | null;
  legacyEquivalent: string | null;
}

export interface GradingSchemeRecord {
  id: string;
  schoolId: string;
  curriculumId: string;
  regime: string;
  appliesTo: GradingAppliesTo;
  name: string;
  isActive: boolean;
  bands: GradeBandRecord[];
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
}

export interface GradingSchemeInput {
  curriculumId: string;
  regime: string;
  appliesTo: GradingAppliesTo;
  name: string;
  isActive?: boolean;
  bands: GradeBandInput[];
}

interface SchemeRow {
  id: string;
  school_id: string;
  curriculum_id: string;
  regime: string;
  applies_to: GradingAppliesTo;
  name: string;
  is_active: boolean;
  bands: GradeBandRecord[];
  created_at: string;
  updated_at: string;
}

const SELECT_SCHEME = `
  select gs.id, gs.school_id, gs.curriculum_id, gs.regime, gs.applies_to, gs.name, gs.is_active,
         gs.created_at, gs.updated_at,
         (select coalesce(json_agg(json_build_object(
                  'id', gb.id, 'label', gb.label,
                  'minPct', gb.min_pct, 'maxPct', gb.max_pct,
                  'points', gb.points, 'legacyEquivalent', gb.legacy_equivalent
                ) order by gb.min_pct), '[]'::json)
            from grade_band gb where gb.grading_scheme_id = gs.id) as bands
    from grading_scheme gs
`;

function mapRow(r: SchemeRow): GradingSchemeRecord {
  return {
    id: r.id,
    schoolId: r.school_id,
    curriculumId: r.curriculum_id,
    regime: r.regime,
    appliesTo: r.applies_to,
    name: r.name,
    isActive: r.is_active,
    bands: r.bands.map((b) => ({
      id: b.id,
      label: b.label,
      minPct: Number(b.minPct),
      maxPct: Number(b.maxPct),
      points: b.points === null || b.points === undefined ? null : Number(b.points),
      legacyEquivalent: b.legacyEquivalent ?? null,
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

const isPgUniqueViolation = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";

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
    return {
      label,
      minPct: Math.round(b.minPct * 100) / 100,
      maxPct: Math.round(b.maxPct * 100) / 100,
      points: b.points ?? null,
      legacyEquivalent: b.legacyEquivalent?.trim() || null,
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

/** The band a raw score falls into, or null if the scheme has no bands (an
 * A-Level scheme not yet filled in) or the score falls outside every band —
 * shouldn't happen for a valid (assertBandsValid-passed) scheme and a
 * 0-100 score, but callers shouldn't assume a match. Pure — no DB, no
 * storage; exported for a read-time preview now and for Step 3's publish
 * step later. */
export function computeGrade(rawScore: number, bands: GradeBandRecord[]): GradeBandRecord | null {
  return bands.find((b) => rawScore >= b.minPct && rawScore <= b.maxPct) ?? null;
}

async function replaceBands(client: PoolClient, schemeId: string, bands: GradeBandInput[]): Promise<void> {
  await client.query(`delete from grade_band where grading_scheme_id = $1`, [schemeId]);
  for (const b of bands) {
    await client.query(
      `insert into grade_band (grading_scheme_id, label, min_pct, max_pct, points, legacy_equivalent)
       values ($1, $2, $3, $4, $5, $6)`,
      [schemeId, b.label, b.minPct, b.maxPct, b.points ?? null, b.legacyEquivalent ?? null],
    );
  }
}

export async function getGradingScheme(schoolId: string, id: string): Promise<GradingSchemeRecord | null> {
  const { rows } = await pool.query<SchemeRow>(`${SELECT_SCHEME} where gs.id = $1 and gs.school_id = $2`, [
    id,
    schoolId,
  ]);
  return rows[0] ? mapRow(rows[0]) : null;
}

// The scheme a subject's marks should be graded against at publish time —
// the school's active scheme for that subject's own curriculum and phase.
// Null when the school hasn't set one up (or none is active) for that
// combination; publish degrades gracefully rather than failing on this.
export async function getActiveSchemeForSubject(
  schoolId: string,
  subjectId: string,
): Promise<GradingSchemeRecord | null> {
  const { rows } = await pool.query<SchemeRow>(
    `${SELECT_SCHEME}
     where gs.school_id = $1 and gs.is_active
       and gs.curriculum_id = (select curriculum_id from subject where id = $2)
       and gs.applies_to = (select phase from subject where id = $2)`,
    [schoolId, subjectId],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function listGradingSchemes(
  schoolId: string,
  curriculumId?: string,
  appliesTo?: GradingAppliesTo,
): Promise<GradingSchemeRecord[]> {
  const conditions = ["gs.school_id = $1"];
  const params: unknown[] = [schoolId];
  if (curriculumId) {
    params.push(curriculumId);
    conditions.push(`gs.curriculum_id = $${params.length}`);
  }
  if (appliesTo) {
    params.push(appliesTo);
    conditions.push(`gs.applies_to = $${params.length}`);
  }
  const { rows } = await pool.query<SchemeRow>(
    `${SELECT_SCHEME} where ${conditions.join(" and ")} order by gs.applies_to, gs.name`,
    params,
  );
  return rows.map(mapRow);
}

export async function createGradingScheme(
  schoolId: string,
  input: GradingSchemeInput,
): Promise<GradingSchemeRecord> {
  const bands = assertBandsValid(input.bands);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ id: string }>(
      `insert into grading_scheme (school_id, curriculum_id, regime, applies_to, name, is_active)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [schoolId, input.curriculumId, input.regime, input.appliesTo, input.name.trim(), input.isActive ?? true],
    );
    await replaceBands(client, rows[0].id, bands);
    await client.query("commit");
    return (await getGradingScheme(schoolId, rows[0].id))!;
  } catch (err) {
    await client.query("rollback");
    if (isPgUniqueViolation(err)) {
      throw new InvalidGradingSchemeError(
        "Another active scheme already covers this curriculum and phase — deactivate it first.",
      );
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function updateGradingScheme(
  schoolId: string,
  id: string,
  input: GradingSchemeInput,
): Promise<GradingSchemeRecord | null> {
  const bands = assertBandsValid(input.bands);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(`select 1 from grading_scheme where id = $1 and school_id = $2`, [
      id,
      schoolId,
    ]);
    if (current.rowCount === 0) {
      await client.query("rollback");
      return null;
    }
    await client.query(
      `update grading_scheme
       set curriculum_id = $1, regime = $2, applies_to = $3, name = $4, is_active = $5, updated_at = now()
       where id = $6`,
      [input.curriculumId, input.regime, input.appliesTo, input.name.trim(), input.isActive ?? true, id],
    );
    await replaceBands(client, id, bands);
    await client.query("commit");
    return getGradingScheme(schoolId, id);
  } catch (err) {
    await client.query("rollback");
    if (isPgUniqueViolation(err)) {
      throw new InvalidGradingSchemeError(
        "Another active scheme already covers this curriculum and phase — deactivate it first.",
      );
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteGradingScheme(schoolId: string, id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`delete from grading_scheme where id = $1 and school_id = $2`, [
    id,
    schoolId,
  ]);
  return (rowCount ?? 0) > 0;
}
