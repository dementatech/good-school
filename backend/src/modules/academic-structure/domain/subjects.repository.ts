import type { PoolClient } from "pg";
import { pool } from "../../../shared/db/index.js";
import { nextSequentialCode } from "./sequential-code.js";

// The subject catalog, per curriculum. `stageIds` is which curriculum stages
// offer the subject (Physics: S3–S6). Per-student subject registration is a
// later phase. See uganda-secondary-school-foundations.md §3.2.

export type SubjectCategory =
  | "language"
  | "science"
  | "art"
  | "subsidiary"
  | "vocational"
  | "core"
  | "religion"
  | "special";

/** Which secondary phase a subject belongs to — matches `curriculum_stage.phase`. */
export type SubjectPhase = "O_LEVEL" | "A_LEVEL";

/** A school-proposed subject starts `pending` and isn't usable (offerable, or
 * addable to a combination) until a super_admin approves it. A platform-added
 * (super_admin) subject is `approved` from the moment it's created. */
export type SubjectApprovalStatus = "pending" | "approved" | "rejected";

export interface SubjectRecord {
  id: string;
  curriculumId: string;
  phase: SubjectPhase;
  code: string;
  shortName: string;
  name: string;
  category: SubjectCategory;
  isExaminable: boolean;
  isActive: boolean;
  stageIds: string[];
  status: SubjectApprovalStatus;
  proposedBySchoolId: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  /** True for exactly one 'subsidiary'-category subject per curriculum: the
   * General Paper every A-Level student takes automatically. A system
   * constant, seeded when the curriculum is created — never set through
   * `createSubject`/`updateSubject`, and never deletable. */
  isGeneralPaper: boolean;
  /** Some subjects (Physics Theory + Practical, ...) are examined as separate
   * papers with different weights and merged into one subject mark. `variants`
   * is empty unless `hasVariant` is true, in which case it always has at
   * least two, with contributionPercent summing to 100. */
  hasVariant: boolean;
  variants: SubjectVariantRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface SubjectVariantRecord {
  id: string;
  name: string;
  code: string;
  contributionPercent: number;
}

export interface SubjectVariantInput {
  /** Present when editing an existing variant; omitted for a new one — ids
   * are otherwise unused since the whole set is replaced together. */
  id?: string;
  name: string;
  code: string;
  contributionPercent: number;
}

export interface SubjectInput {
  phase: SubjectPhase;
  shortName: string;
  name: string;
  category?: SubjectCategory;
  isExaminable?: boolean;
  isActive?: boolean;
  stageIds?: string[];
  /** Omit both to leave the variant configuration untouched. Once the
   * subject has any exam_result, changing either throws VariantsLockedError. */
  hasVariant?: boolean;
  variants?: SubjectVariantInput[];
}

interface SubjectRow {
  id: string;
  curriculum_id: string;
  phase: SubjectPhase;
  code: string;
  short_name: string;
  name: string;
  category: SubjectCategory;
  is_examinable: boolean;
  is_active: boolean;
  stage_ids: string[] | null;
  status: SubjectApprovalStatus;
  proposed_by_school_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  is_general_paper: boolean;
  has_variant: boolean;
  variants: SubjectVariantRecord[] | null;
  created_at: string;
  updated_at: string;
}

const mapRow = (r: SubjectRow): SubjectRecord => ({
  id: r.id,
  curriculumId: r.curriculum_id,
  phase: r.phase,
  code: r.code,
  shortName: r.short_name,
  name: r.name,
  category: r.category,
  isExaminable: r.is_examinable,
  isActive: r.is_active,
  stageIds: r.stage_ids ?? [],
  status: r.status,
  proposedBySchoolId: r.proposed_by_school_id,
  reviewedBy: r.reviewed_by,
  reviewedAt: r.reviewed_at,
  rejectionReason: r.rejection_reason,
  isGeneralPaper: r.is_general_paper,
  hasVariant: r.has_variant,
  variants: r.variants ?? [],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// Scalar subqueries rather than joins for stage_ids/variants — a subject can
// have several of each, and joining both in one query would cross-multiply
// the rows before the array/json aggregation ever ran.
const SELECT_SUBJECT = `
  select s.id, s.curriculum_id, s.phase, s.code, s.short_name, s.name, s.category, s.is_examinable, s.is_active,
         (select coalesce(array_agg(ss.curriculum_stage_id), '{}')
            from subject_stage ss where ss.subject_id = s.id) as stage_ids,
         s.status, s.proposed_by_school_id, s.reviewed_by, s.reviewed_at, s.rejection_reason, s.is_general_paper,
         s.has_variant,
         (select coalesce(json_agg(json_build_object(
                  'id', sv.id, 'name', sv.name, 'code', sv.code,
                  'contributionPercent', sv.contribution_percent
                ) order by sv.code), '[]'::json)
            from subject_variant sv where sv.subject_id = s.id) as variants,
         s.created_at, s.updated_at
  from subject s
`;

export interface ListSubjectsFilter {
  curriculumId?: string;
  phase?: SubjectPhase;
  status?: SubjectApprovalStatus;
  /** Restrict to `approved` subjects plus this school's own proposals
   * (any status) — the visibility rule for a non-super-admin caller. */
  visibleToSchoolId?: string;
}

export async function listSubjects(filter: ListSubjectsFilter = {}): Promise<SubjectRecord[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.curriculumId) {
    params.push(filter.curriculumId);
    where.push(`s.curriculum_id = $${params.length}`);
  }
  if (filter.phase) {
    params.push(filter.phase);
    where.push(`s.phase = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`s.status = $${params.length}`);
  }
  if (filter.visibleToSchoolId) {
    params.push(filter.visibleToSchoolId);
    where.push(`(s.status = 'approved' or s.proposed_by_school_id = $${params.length})`);
  }
  const clause = where.length ? `where ${where.join(" and ")}` : "";
  const { rows } = await pool.query<SubjectRow>(
    `${SELECT_SUBJECT} ${clause} order by s.name`,
    params,
  );
  return rows.map(mapRow);
}

export async function getSubject(id: string): Promise<SubjectRecord | null> {
  const { rows } = await pool.query<SubjectRow>(
    `${SELECT_SUBJECT} where s.id = $1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export class InvalidSubjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSubjectError";
  }
}

/** O-Level subjects are only ever one of these four categories — the
 * science/art/subsidiary split belongs to A-Level (principal subject areas +
 * subsidiary-only subjects), not the O-Level syllabus. */
export const O_LEVEL_CATEGORIES: SubjectCategory[] = ["core", "religion", "vocational", "special"];

/** A-Level subjects are Science or Art (the two principal-subject areas) or
 * 'subsidiary' — subjects only ever taken as the combination's subsidiary
 * slot. General Paper is one specific 'subsidiary' subject (flagged
 * `isGeneralPaper`) that every A-Level student takes automatically —
 * category alone doesn't identify it, since other real subsidiary subjects
 * (e.g. Sub-ICT) share the category. See docs/design/
 * subject-selection-module.md §3.1. */
export const A_LEVEL_CATEGORIES: SubjectCategory[] = ["science", "art", "subsidiary"];

function defaultCategoryForPhase(phase: SubjectPhase): SubjectCategory {
  return phase === "O_LEVEL" ? "core" : "science";
}

function assertCategoryValidForPhase(phase: SubjectPhase, category: SubjectCategory): void {
  const allowed = phase === "O_LEVEL" ? O_LEVEL_CATEGORIES : A_LEVEL_CATEGORIES;
  if (!allowed.includes(category)) {
    const label = phase === "O_LEVEL" ? "An O-Level" : "An A-Level";
    throw new InvalidSubjectError(`${label} subject's category must be one of: ${allowed.join(", ")}.`);
  }
}

async function replaceStages(
  client: import("pg").PoolClient,
  subjectId: string,
  curriculumId: string,
  phase: SubjectPhase,
  stageIds: string[],
): Promise<void> {
  await client.query(`delete from subject_stage where subject_id = $1`, [subjectId]);
  if (stageIds.length === 0) return;

  const unique = [...new Set(stageIds)];
  // Every chosen stage must be in this curriculum AND match the subject's
  // phase — an O-Level subject can only be offered at S1–S4, never S5/S6.
  const valid = await client.query<{ id: string }>(
    `select id from curriculum_stage
      where curriculum_id = $1 and phase = $2 and id = any($3::uuid[])`,
    [curriculumId, phase, unique],
  );
  if (valid.rowCount !== unique.length) {
    const label = phase === "A_LEVEL" ? "an A-Level" : "an O-Level";
    const range = phase === "A_LEVEL" ? "Senior 5–6" : "Senior 1–4";
    throw new InvalidSubjectError(
      `Every stage for ${label} subject must be ${range} stage of this curriculum.`,
    );
  }

  await client.query(
    `insert into subject_stage (subject_id, curriculum_stage_id)
     select $1, unnest($2::uuid[]) on conflict do nothing`,
    [subjectId, unique],
  );
}

export class VariantsLockedError extends Error {
  constructor() {
    super(
      "This subject already has recorded marks — its variants can't be changed. " +
        "Create a new subject instead.",
    );
    this.name = "VariantsLockedError";
  }
}

// Validates a desired variant set and returns it normalised (trimmed name,
// upper-cased code) — never mutates, never touches the database.
function assertVariantsValid(
  hasVariant: boolean,
  variants: SubjectVariantInput[] | undefined,
): SubjectVariantInput[] {
  if (!hasVariant) return [];
  const list = variants ?? [];
  if (list.length < 2) {
    throw new InvalidSubjectError("A subject with variants needs at least two.");
  }
  const seen = new Set<string>();
  let sum = 0;
  const normalised = list.map((v) => {
    const code = v.code.trim().toUpperCase();
    if (!code || !v.name.trim()) {
      throw new InvalidSubjectError("Every variant needs a name and a code.");
    }
    if (seen.has(code)) throw new InvalidSubjectError(`Duplicate variant code "${code}".`);
    seen.add(code);
    if (!(v.contributionPercent > 0 && v.contributionPercent <= 100)) {
      throw new InvalidSubjectError("Each variant's contribution must be between 0 and 100.");
    }
    sum += v.contributionPercent;
    return { id: v.id, name: v.name.trim(), code, contributionPercent: v.contributionPercent };
  });
  // Rounded to cents to tolerate float noise (33.33 + 33.33 + 33.34, etc.)
  // without accepting a genuinely wrong split.
  if (Math.round(sum * 100) !== 10000) {
    throw new InvalidSubjectError(
      `Variant contributions must add up to 100% (currently ${sum}%).`,
    );
  }
  return normalised;
}

const variantSignature = (v: { code: string; contributionPercent: number }) =>
  `${v.code.toUpperCase()}:${v.contributionPercent}`;

function variantsEqual(
  a: { code: string; contributionPercent: number }[],
  b: { code: string; contributionPercent: number }[],
): boolean {
  if (a.length !== b.length) return false;
  const sa = a.map(variantSignature).sort();
  const sb = b.map(variantSignature).sort();
  return sa.every((v, i) => v === sb[i]);
}

async function hasRecordedResults(client: PoolClient, subjectId: string): Promise<boolean> {
  const { rowCount } = await client.query(`select 1 from exam_result where subject_id = $1 limit 1`, [
    subjectId,
  ]);
  return (rowCount ?? 0) > 0;
}

async function currentVariants(client: PoolClient, subjectId: string): Promise<SubjectVariantRecord[]> {
  const { rows } = await client.query<{ id: string; name: string; code: string; contribution_percent: string }>(
    `select id, name, code, contribution_percent from subject_variant where subject_id = $1 order by code`,
    [subjectId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    contributionPercent: Number(r.contribution_percent),
  }));
}

// Replaces the whole variant set in one go — same delete-then-insert pattern
// as replaceStages. Caller is responsible for the lock check.
async function replaceVariants(
  client: PoolClient,
  subjectId: string,
  variants: SubjectVariantInput[],
): Promise<void> {
  await client.query(`delete from subject_variant where subject_id = $1`, [subjectId]);
  for (const v of variants) {
    await client.query(
      `insert into subject_variant (subject_id, name, code, contribution_percent)
       values ($1, $2, $3, $4)`,
      [subjectId, v.name, v.code, v.contributionPercent],
    );
  }
}

export interface CreateSubjectContext {
  /** null (super_admin) => created pre-approved; set (a school's own
   * proposal) => created `pending`, awaiting super_admin review. */
  proposedBySchoolId: string | null;
}

export async function createSubject(
  curriculumId: string,
  input: SubjectInput,
  context: CreateSubjectContext,
): Promise<SubjectRecord | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const owner = await client.query(`select 1 from curriculum where id = $1`, [curriculumId]);
    if (owner.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const category = input.category ?? defaultCategoryForPhase(input.phase);
    assertCategoryValidForPhase(input.phase, category);
    const variants = assertVariantsValid(input.hasVariant ?? false, input.variants);
    const code = await nextSequentialCode(client, {
      table: "subject",
      column: "code",
      prefix: "S",
      where: "curriculum_id = $1 and phase = $2",
      params: [curriculumId, input.phase],
    });
    const status: SubjectApprovalStatus = context.proposedBySchoolId ? "pending" : "approved";
    const { rows } = await client.query<{ id: string }>(
      `insert into subject
         (curriculum_id, phase, code, short_name, name, category, is_examinable, is_active,
          status, proposed_by_school_id, has_variant)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
      [
        curriculumId,
        input.phase,
        code,
        input.shortName.trim(),
        input.name,
        category,
        input.isExaminable ?? true,
        input.isActive ?? true,
        status,
        context.proposedBySchoolId,
        input.hasVariant ?? false,
      ],
    );
    await replaceStages(client, rows[0].id, curriculumId, input.phase, input.stageIds ?? []);
    if (variants.length > 0) await replaceVariants(client, rows[0].id, variants);
    await client.query("COMMIT");
    return getSubject(rows[0].id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateSubject(
  id: string,
  input: SubjectInput,
): Promise<SubjectRecord | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Phase and code are fixed at creation — an O-Level subject never becomes
    // an A-Level one (different syllabi), and code is a system-assigned id,
    // never re-typed.
    const current = await client.query<{ phase: SubjectPhase; has_variant: boolean }>(
      `select phase, has_variant from subject where id = $1`,
      [id],
    );
    if (current.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const category = input.category ?? defaultCategoryForPhase(current.rows[0].phase);
    assertCategoryValidForPhase(current.rows[0].phase, category);

    // Only touch variants when the caller actually sent something about them
    // — omitting both fields means "leave as is". Re-submitting the current
    // configuration unchanged is also a no-op, so editing an unrelated field
    // (e.g. the name) on a subject that already has marks never trips the lock.
    const touchesVariants = input.hasVariant !== undefined || input.variants !== undefined;
    const nextHasVariant = touchesVariants ? input.hasVariant ?? current.rows[0].has_variant : current.rows[0].has_variant;
    let nextVariants: SubjectVariantInput[] = [];
    let variantsChanged = false;
    if (touchesVariants) {
      nextVariants = assertVariantsValid(nextHasVariant, input.variants);
      variantsChanged = nextHasVariant !== current.rows[0].has_variant;
      if (!variantsChanged && nextHasVariant) {
        variantsChanged = !variantsEqual(await currentVariants(client, id), nextVariants);
      }
      if (variantsChanged && (await hasRecordedResults(client, id))) {
        await client.query("ROLLBACK");
        throw new VariantsLockedError();
      }
    }

    const { rows } = await client.query<{ curriculum_id: string; phase: SubjectPhase }>(
      `update subject
       set short_name = $1, name = $2, category = $3, is_examinable = $4, is_active = $5,
           has_variant = $6, updated_at = now()
       where id = $7
       returning curriculum_id, phase`,
      [
        input.shortName.trim(),
        input.name,
        category,
        input.isExaminable ?? true,
        input.isActive ?? true,
        nextHasVariant,
        id,
      ],
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    if (input.stageIds) {
      await replaceStages(client, id, rows[0].curriculum_id, rows[0].phase, input.stageIds);
    }
    if (variantsChanged) await replaceVariants(client, id, nextVariants);
    await client.query("COMMIT");
    return getSubject(id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteSubject(id: string): Promise<boolean> {
  const { rows } = await pool.query<{ is_general_paper: boolean }>(
    `select is_general_paper from subject where id = $1`,
    [id],
  );
  if (rows.length === 0) return false;
  if (rows[0].is_general_paper) {
    throw new InvalidSubjectError("General Paper is a system constant and can't be deleted.");
  }
  const result = await pool.query(`delete from subject where id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Every A-Level curriculum needs exactly one General Paper subject — a
 * system constant, never created through `createSubject` (no route ever sets
 * `isGeneralPaper`). Idempotent: called when a curriculum is created, and
 * safe to call again for a curriculum that already has one.
 */
export async function ensureGeneralPaperSubject(
  client: import("pg").PoolClient,
  curriculumId: string,
): Promise<void> {
  const existing = await client.query(
    `select 1 from subject where curriculum_id = $1 and is_general_paper`,
    [curriculumId],
  );
  if ((existing.rowCount ?? 0) > 0) return;

  const code = await nextSequentialCode(client, {
    table: "subject",
    column: "code",
    prefix: "S",
    where: "curriculum_id = $1 and phase = $2",
    params: [curriculumId, "A_LEVEL"],
  });
  await client.query(
    `insert into subject
       (curriculum_id, phase, code, short_name, name, category, is_examinable, is_active,
        status, is_general_paper)
     values ($1, 'A_LEVEL', $2, 'GP', 'General Paper', 'subsidiary', true, true, 'approved', true)`,
    [curriculumId, code],
  );
}

export class SubjectNotPendingError extends Error {
  constructor() {
    super("This subject isn't awaiting approval.");
    this.name = "SubjectNotPendingError";
  }
}

export async function approveSubject(id: string, reviewerId: string): Promise<SubjectRecord | null> {
  const { rows } = await pool.query<{ id: string }>(
    `update subject
     set status = 'approved', reviewed_by = $1, reviewed_at = now(), rejection_reason = null, updated_at = now()
     where id = $2 and status = 'pending'
     returning id`,
    [reviewerId, id],
  );
  if (rows.length === 0) {
    const exists = await getSubject(id);
    if (!exists) return null;
    throw new SubjectNotPendingError();
  }
  return getSubject(id);
}

export async function rejectSubject(
  id: string,
  reviewerId: string,
  reason: string,
): Promise<SubjectRecord | null> {
  const { rows } = await pool.query<{ id: string }>(
    `update subject
     set status = 'rejected', reviewed_by = $1, reviewed_at = now(), rejection_reason = $2, updated_at = now()
     where id = $3 and status = 'pending'
     returning id`,
    [reviewerId, reason, id],
  );
  if (rows.length === 0) {
    const exists = await getSubject(id);
    if (!exists) return null;
    throw new SubjectNotPendingError();
  }
  return getSubject(id);
}
