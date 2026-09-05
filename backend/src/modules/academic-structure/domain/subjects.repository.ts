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
  createdAt: string;
  updatedAt: string;
}

export interface SubjectInput {
  phase: SubjectPhase;
  shortName: string;
  name: string;
  category?: SubjectCategory;
  isExaminable?: boolean;
  isActive?: boolean;
  stageIds?: string[];
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
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// coalesce so a subject with no stages returns [] not [null]
const SELECT_SUBJECT = `
  select s.id, s.curriculum_id, s.phase, s.code, s.short_name, s.name, s.category, s.is_examinable, s.is_active,
         coalesce(array_agg(ss.curriculum_stage_id) filter (where ss.curriculum_stage_id is not null), '{}') as stage_ids,
         s.status, s.proposed_by_school_id, s.reviewed_by, s.reviewed_at, s.rejection_reason, s.is_general_paper,
         s.created_at, s.updated_at
  from subject s
  left join subject_stage ss on ss.subject_id = s.id
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
    `${SELECT_SUBJECT} ${clause} group by s.id order by s.name`,
    params,
  );
  return rows.map(mapRow);
}

export async function getSubject(id: string): Promise<SubjectRecord | null> {
  const { rows } = await pool.query<SubjectRow>(
    `${SELECT_SUBJECT} where s.id = $1 group by s.id`,
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
          status, proposed_by_school_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
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
      ],
    );
    await replaceStages(client, rows[0].id, curriculumId, input.phase, input.stageIds ?? []);
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
    const current = await client.query<{ phase: SubjectPhase }>(
      `select phase from subject where id = $1`,
      [id],
    );
    if (current.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const category = input.category ?? defaultCategoryForPhase(current.rows[0].phase);
    assertCategoryValidForPhase(current.rows[0].phase, category);
    const { rows } = await client.query<{ curriculum_id: string; phase: SubjectPhase }>(
      `update subject
       set short_name = $1, name = $2, category = $3, is_examinable = $4, is_active = $5, updated_at = now()
       where id = $6
       returning curriculum_id, phase`,
      [
        input.shortName.trim(),
        input.name,
        category,
        input.isExaminable ?? true,
        input.isActive ?? true,
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
