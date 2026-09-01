import { pool } from "../../../shared/db/index.js";

// Reference data — global, super_admin-managed. `curriculum` + its ordered
// `curriculum_stage` ladder (Senior 1–6 for UNEB). See
// uganda-secondary-school-foundations.md §6.

export interface CurriculumRecord {
  id: string;
  code: string;
  name: string;
  awardingBody: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CurriculumInput {
  code: string;
  name: string;
  awardingBody?: string | null;
  isActive?: boolean;
}

export interface StageRecord {
  id: string;
  curriculumId: string;
  code: string;
  name: string;
  sequenceNumber: number;
  phase: string | null;
  ageEquivalentYears: number | null;
}

export interface StageInput {
  code: string;
  name: string;
  sequenceNumber: number;
  phase?: string | null;
  ageEquivalentYears?: number | null;
}

interface CurriculumRow {
  id: string;
  code: string;
  name: string;
  awarding_body: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface StageRow {
  id: string;
  curriculum_id: string;
  code: string;
  name: string;
  sequence_number: number;
  phase: string | null;
  age_equivalent_years: number | null;
}

const mapCurriculum = (r: CurriculumRow): CurriculumRecord => ({
  id: r.id,
  code: r.code,
  name: r.name,
  awardingBody: r.awarding_body,
  isActive: r.is_active,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const mapStage = (r: StageRow): StageRecord => ({
  id: r.id,
  curriculumId: r.curriculum_id,
  code: r.code,
  name: r.name,
  sequenceNumber: r.sequence_number,
  phase: r.phase,
  ageEquivalentYears: r.age_equivalent_years,
});

const SELECT_CURRICULUM = `select id, code, name, awarding_body, is_active, created_at, updated_at from curriculum`;
const SELECT_STAGE = `select id, curriculum_id, code, name, sequence_number, phase, age_equivalent_years from curriculum_stage`;

// ── Curricula ────────────────────────────────────────────────────────────────

export async function listCurricula(): Promise<CurriculumRecord[]> {
  const { rows } = await pool.query<CurriculumRow>(`${SELECT_CURRICULUM} order by code`);
  return rows.map(mapCurriculum);
}

export async function getCurriculum(id: string): Promise<CurriculumRecord | null> {
  const { rows } = await pool.query<CurriculumRow>(`${SELECT_CURRICULUM} where id = $1`, [id]);
  return rows[0] ? mapCurriculum(rows[0]) : null;
}

/** Resolve by code (`UNEB`) — used by pickers that don't want to know the id. */
export async function getCurriculumByCode(code: string): Promise<CurriculumRecord | null> {
  const { rows } = await pool.query<CurriculumRow>(`${SELECT_CURRICULUM} where code = $1`, [
    code.toUpperCase(),
  ]);
  return rows[0] ? mapCurriculum(rows[0]) : null;
}

export async function createCurriculum(input: CurriculumInput): Promise<CurriculumRecord> {
  const { rows } = await pool.query<CurriculumRow>(
    `insert into curriculum (code, name, awarding_body, is_active)
     values ($1, $2, $3, $4)
     returning id, code, name, awarding_body, is_active, created_at, updated_at`,
    [input.code.toUpperCase(), input.name, input.awardingBody ?? null, input.isActive ?? true],
  );
  return mapCurriculum(rows[0]);
}

export async function updateCurriculum(
  id: string,
  input: CurriculumInput,
): Promise<CurriculumRecord | null> {
  const { rows } = await pool.query<CurriculumRow>(
    `update curriculum
     set code = $1, name = $2, awarding_body = $3, is_active = $4, updated_at = now()
     where id = $5
     returning id, code, name, awarding_body, is_active, created_at, updated_at`,
    [input.code.toUpperCase(), input.name, input.awardingBody ?? null, input.isActive ?? true, id],
  );
  return rows[0] ? mapCurriculum(rows[0]) : null;
}

export async function deleteCurriculum(id: string): Promise<boolean> {
  const result = await pool.query(`delete from curriculum where id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

// ── Stages ───────────────────────────────────────────────────────────────────

export async function listStages(curriculumId?: string): Promise<StageRecord[]> {
  const { rows } = curriculumId
    ? await pool.query<StageRow>(
        `${SELECT_STAGE} where curriculum_id = $1 order by sequence_number`,
        [curriculumId],
      )
    : await pool.query<StageRow>(`${SELECT_STAGE} order by curriculum_id, sequence_number`);
  return rows.map(mapStage);
}

export async function getStage(id: string): Promise<StageRecord | null> {
  const { rows } = await pool.query<StageRow>(`${SELECT_STAGE} where id = $1`, [id]);
  return rows[0] ? mapStage(rows[0]) : null;
}

export async function createStage(
  curriculumId: string,
  input: StageInput,
): Promise<StageRecord | null> {
  const owner = await pool.query(`select 1 from curriculum where id = $1`, [curriculumId]);
  if (owner.rowCount === 0) return null;
  const { rows } = await pool.query<StageRow>(
    `insert into curriculum_stage (curriculum_id, code, name, sequence_number, phase, age_equivalent_years)
     values ($1, $2, $3, $4, $5, $6)
     returning id, curriculum_id, code, name, sequence_number, phase, age_equivalent_years`,
    [
      curriculumId,
      input.code,
      input.name,
      input.sequenceNumber,
      input.phase ?? null,
      input.ageEquivalentYears ?? null,
    ],
  );
  return mapStage(rows[0]);
}

export async function updateStage(id: string, input: StageInput): Promise<StageRecord | null> {
  const { rows } = await pool.query<StageRow>(
    `update curriculum_stage
     set code = $1, name = $2, sequence_number = $3, phase = $4, age_equivalent_years = $5, updated_at = now()
     where id = $6
     returning id, curriculum_id, code, name, sequence_number, phase, age_equivalent_years`,
    [input.code, input.name, input.sequenceNumber, input.phase ?? null, input.ageEquivalentYears ?? null, id],
  );
  return rows[0] ? mapStage(rows[0]) : null;
}

export async function deleteStage(id: string): Promise<boolean> {
  const result = await pool.query(`delete from curriculum_stage where id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}
