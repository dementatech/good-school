import type { PoolClient } from "pg";
import { pool } from "../../../shared/db/index.js";

// A staff member's time-bound relationship to one school — the gate for
// subject_teacher_assignment, same pattern as student_enrollment gates
// subject selection. See docs/design/teachers-module.md §2.
//
// Direct SQL against `academic_years` here (rather than importing from
// academic-structure) matches the existing precedent in
// students/domain/enrollments.repository.ts — modules share one Postgres
// schema, the import-boundary rule is about TS internals, not the database.

export type StaffRole = "teacher" | "head_teacher" | "deputy" | "bursar" | "admin" | "support";
export type AssignmentEntryType = "new_hire" | "transfer" | "government_posting";
export type AssignmentExitType = "transfer" | "resignation" | "retirement" | "government_reposting";
export type AssignmentStatus = "active" | "transferred_out" | "left" | "retired";

// Mirrors StaffCategory from staff.repository.ts, redeclared rather than
// imported to avoid a circular import (staff.repository.ts already imports
// createAssignment from this file). Which roles make sense for which broad
// category — the frontend's hire form only offers these per category
// already, but that's a UI constraint a direct API call can bypass, so it's
// enforced here too, the one place every assignment (hire-time and a later
// transfer/rehire period alike) actually gets written.
type StaffCategoryForRoleCheck = "administration" | "teaching" | "non_teaching" | "support";

const ROLES_FOR_CATEGORY: Record<StaffCategoryForRoleCheck, readonly StaffRole[]> = {
  teaching: ["teacher", "head_teacher", "deputy"],
  administration: ["admin", "head_teacher", "deputy"],
  non_teaching: ["bursar", "admin"],
  support: ["support"],
};

export interface StaffAssignmentRecord {
  id: string;
  staffId: string;
  schoolId: string;
  academicYearId: string;
  academicYearName: string;
  role: StaffRole;
  entryDate: string;
  entryType: AssignmentEntryType;
  exitDate: string | null;
  exitType: AssignmentExitType | null;
  status: AssignmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StaffAssignmentInput {
  academicYearId: string;
  role: StaffRole;
  entryDate: string;
  entryType: AssignmentEntryType;
}

interface StaffAssignmentRow {
  id: string;
  staff_id: string;
  school_id: string;
  academic_year_id: string;
  academic_year_name: string;
  role: StaffRole;
  entry_date: string;
  entry_type: AssignmentEntryType;
  exit_date: string | null;
  exit_type: AssignmentExitType | null;
  status: AssignmentStatus;
  created_at: string;
  updated_at: string;
}

const SELECT_ASSIGNMENT = `
  select sa.id, sa.staff_id, sa.school_id, sa.academic_year_id, ay.year_name as academic_year_name,
         sa.role, sa.entry_date, sa.entry_type, sa.exit_date, sa.exit_type, sa.status,
         sa.created_at, sa.updated_at
  from staff_assignment sa
  join academic_years ay on ay.id = sa.academic_year_id
`;

function mapRow(row: StaffAssignmentRow): StaffAssignmentRecord {
  return {
    id: row.id,
    staffId: row.staff_id,
    schoolId: row.school_id,
    academicYearId: row.academic_year_id,
    academicYearName: row.academic_year_name,
    role: row.role,
    entryDate: row.entry_date,
    entryType: row.entry_type,
    exitDate: row.exit_date,
    exitType: row.exit_type,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class UnknownReferenceError extends Error {
  constructor(field: string) {
    super(`Unknown or out-of-school ${field}`);
    this.name = "UnknownReferenceError";
  }
}

export class ActiveAssignmentExistsError extends Error {
  constructor() {
    super("This staff member already has an active assignment at this school");
    this.name = "ActiveAssignmentExistsError";
  }
}

export class RoleNotAllowedForCategoryError extends Error {
  constructor(role: string, category: string) {
    super(`"${role}" isn't a valid role for ${category.replace("_", "-")} staff`);
    this.name = "RoleNotAllowedForCategoryError";
  }
}

async function assertYearBelongsToSchool(
  client: PoolClient,
  schoolId: string,
  academicYearId: string,
): Promise<void> {
  const year = await client.query(
    `select 1 from academic_years where id = $1 and school_id = $2`,
    [academicYearId, schoolId],
  );
  if (year.rowCount === 0) throw new UnknownReferenceError("academicYearId");
}

// Unlike students (at most one active enrollment ever), a staff member can be
// active at more than one school at once — teaching at two schools is normal
// here (§2). "Active at *this* school" is still at most one row, enforced by
// staff_assignment_one_active_per_school.
export async function getActiveAssignmentAtSchool(
  schoolId: string,
  staffId: string,
): Promise<StaffAssignmentRecord | null> {
  const result = await pool.query<StaffAssignmentRow>(
    `${SELECT_ASSIGNMENT} where sa.school_id = $1 and sa.staff_id = $2 and sa.status = 'active'`,
    [schoolId, staffId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function listAssignments(
  schoolId: string,
  staffId: string,
): Promise<StaffAssignmentRecord[]> {
  const result = await pool.query<StaffAssignmentRow>(
    `${SELECT_ASSIGNMENT} where sa.school_id = $1 and sa.staff_id = $2
     order by sa.entry_date desc, sa.created_at desc`,
    [schoolId, staffId],
  );
  return result.rows.map(mapRow);
}

// Every staff member currently active at this school this year — the
// fallback candidate pool for "who can I assign to teach this" when no one
// with a matching specialization is found (teachers-module.md §4.4).
export async function listActiveStaffIds(schoolId: string): Promise<string[]> {
  const result = await pool.query<{ staff_id: string }>(
    `select staff_id from staff_assignment where school_id = $1 and status = 'active'`,
    [schoolId],
  );
  return result.rows.map((r) => r.staff_id);
}

// Shared by createStaff's own transaction (passed an existing `client`) and
// the standalone POST /:id/assignments route. Rejects a second active row at
// the same school — 409, never silently supersedes (same reasoning as
// createEnrollment).
export async function createAssignment(
  client: PoolClient,
  schoolId: string,
  staffId: string,
  input: StaffAssignmentInput,
): Promise<StaffAssignmentRecord> {
  await assertYearBelongsToSchool(client, schoolId, input.academicYearId);

  const staffCategory = await client.query<{ category: StaffCategoryForRoleCheck }>(
    `select category from staff where user_id = $1`,
    [staffId],
  );
  const category = staffCategory.rows[0]?.category;
  if (category && !ROLES_FOR_CATEGORY[category].includes(input.role)) {
    throw new RoleNotAllowedForCategoryError(input.role, category);
  }

  const active = await client.query(
    `select 1 from staff_assignment where school_id = $1 and staff_id = $2 and status = 'active'`,
    [schoolId, staffId],
  );
  if ((active.rowCount ?? 0) > 0) throw new ActiveAssignmentExistsError();

  const result = await client.query<{ id: string }>(
    `insert into staff_assignment
       (staff_id, school_id, academic_year_id, role, entry_date, entry_type, status)
     values ($1, $2, $3, $4, $5, $6, 'active')
     returning id`,
    [staffId, schoolId, input.academicYearId, input.role, input.entryDate, input.entryType],
  );

  const created = await client.query<StaffAssignmentRow>(`${SELECT_ASSIGNMENT} where sa.id = $1`, [
    result.rows[0].id,
  ]);
  return mapRow(created.rows[0]);
}

export async function endAssignment(
  schoolId: string,
  assignmentId: string,
  input: { exitDate: string; exitType: AssignmentExitType },
): Promise<StaffAssignmentRecord | null> {
  const status: AssignmentStatus =
    input.exitType === "resignation"
      ? "left"
      : input.exitType === "retirement"
        ? "retired"
        : "transferred_out";

  const result = await pool.query<{ id: string }>(
    `update staff_assignment
     set exit_date = $1, exit_type = $2, status = $3, updated_at = now()
     where id = $4 and school_id = $5 and status = 'active'
     returning id`,
    [input.exitDate, input.exitType, status, assignmentId, schoolId],
  );
  if (result.rowCount === 0) return null;

  const updated = await pool.query<StaffAssignmentRow>(`${SELECT_ASSIGNMENT} where sa.id = $1`, [
    result.rows[0].id,
  ]);
  return mapRow(updated.rows[0]);
}
