import { pool } from "../../../shared/db/index.js";

// The org chart tree (docs/design/organization-studio.md §1) — every node,
// from Head Teacher down to a generic "Cleaner" slot, is one `position` row
// connected via `parent_position_id`. The chart itself is just this tree,
// rendered; there's no separate chart structure to maintain.

export type PositionCategory = "executive" | "department_head" | "teacher" | "non_teaching";

export interface PositionHolder {
  staffPositionId: string;
  staffId: string;
  staffName: string;
  staffSystemId: string | null;
  startDate: string;
}

export interface PositionRecord {
  id: string;
  schoolId: string;
  title: string;
  category: PositionCategory;
  parentPositionId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  isUnique: boolean;
  isAcademicRoot: boolean;
  createdAt: string;
  holders: PositionHolder[];
}

export interface PositionInput {
  title: string;
  category: PositionCategory;
  parentPositionId?: string | null;
  departmentId?: string | null;
  isUnique?: boolean;
}

interface PositionRow {
  id: string;
  school_id: string;
  title: string;
  category: PositionCategory;
  parent_position_id: string | null;
  department_id: string | null;
  department_name: string | null;
  is_unique: boolean;
  is_academic_root: boolean;
  created_at: string;
}

const SELECT_POSITION = `
  select p.id, p.school_id, p.title, p.category, p.parent_position_id,
         p.department_id, d.name as department_name, p.is_unique, p.is_academic_root, p.created_at
  from position p
  left join department d on d.id = p.department_id
`;

function mapRow(row: PositionRow): Omit<PositionRecord, "holders"> {
  return {
    id: row.id,
    schoolId: row.school_id,
    title: row.title,
    category: row.category,
    parentPositionId: row.parent_position_id,
    departmentId: row.department_id,
    departmentName: row.department_name,
    isUnique: row.is_unique,
    isAcademicRoot: row.is_academic_root,
    createdAt: row.created_at,
  };
}

export class UnknownReferenceError extends Error {
  constructor(field: string) {
    super(`Unknown or out-of-school ${field}`);
    this.name = "UnknownReferenceError";
  }
}

export class CyclicPositionError extends Error {
  constructor() {
    super("A position can't be its own ancestor — pick a different parent");
    this.name = "CyclicPositionError";
  }
}

export class PositionInUseError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "PositionInUseError";
  }
}

export class PositionAlreadyHeldError extends Error {
  constructor() {
    super("This position already has an active holder — end their term first");
    this.name = "PositionAlreadyHeldError";
  }
}

export class StaffNotAssignedError extends Error {
  constructor() {
    super("This staff member has no active assignment at this school");
    this.name = "StaffNotAssignedError";
  }
}

// The whole tree, each node with its current holder(s) — "current" meaning
// status='active', same precedent as getActiveAssignmentAtSchool /
// getActiveEnrollment (an active row is looked up by status alone, not by
// requiring the caller to pin a specific academic year).
export async function listPositions(schoolId: string): Promise<PositionRecord[]> {
  const positions = await pool.query<PositionRow>(`${SELECT_POSITION} where p.school_id = $1 order by p.title`, [
    schoolId,
  ]);

  const holders = await pool.query<{
    position_id: string;
    staff_position_id: string;
    staff_id: string;
    first_name: string;
    last_name: string;
    system_id: string | null;
    start_date: string;
  }>(
    `select sp.position_id, sp.id as staff_position_id, sp.staff_id, sp.start_date,
            sf.first_name, sf.last_name, u.system_id
     from staff_position sp
     join position p on p.id = sp.position_id
     join staff sf on sf.user_id = sp.staff_id
     join users u on u.id = sf.user_id
     where p.school_id = $1 and sp.status = 'active'`,
    [schoolId],
  );

  const holdersByPosition = new Map<string, PositionHolder[]>();
  for (const h of holders.rows) {
    const list = holdersByPosition.get(h.position_id) ?? [];
    list.push({
      staffPositionId: h.staff_position_id,
      staffId: h.staff_id,
      staffName: [h.first_name, h.last_name].filter(Boolean).join(" "),
      staffSystemId: h.system_id,
      startDate: h.start_date,
    });
    holdersByPosition.set(h.position_id, list);
  }

  return positions.rows.map((row) => ({ ...mapRow(row), holders: holdersByPosition.get(row.id) ?? [] }));
}

async function assertParentBelongsToSchool(schoolId: string, parentPositionId: string): Promise<void> {
  const parent = await pool.query(`select 1 from position where id = $1 and school_id = $2`, [
    parentPositionId,
    schoolId,
  ]);
  if (parent.rowCount === 0) throw new UnknownReferenceError("parentPositionId");
}

// Walks up parent_position_id from `proposedParentId` — if it ever reaches
// `positionId`, the edit would make positionId its own ancestor.
async function assertNoCycle(
  schoolId: string,
  positionId: string,
  proposedParentId: string,
): Promise<void> {
  let cursor: string | null = proposedParentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === positionId) throw new CyclicPositionError();
    if (seen.has(cursor)) break; // defensive — an existing cycle isn't this call's to fix
    seen.add(cursor);
    const result: { rows: { parent_position_id: string | null }[] } = await pool.query(
      `select parent_position_id from position where id = $1 and school_id = $2`,
      [cursor, schoolId],
    );
    cursor = result.rows[0]?.parent_position_id ?? null;
  }
}

export async function createPosition(schoolId: string, input: PositionInput): Promise<PositionRecord> {
  if (input.parentPositionId) await assertParentBelongsToSchool(schoolId, input.parentPositionId);
  if (input.departmentId) {
    const dept = await pool.query(`select 1 from department where id = $1 and school_id = $2`, [
      input.departmentId,
      schoolId,
    ]);
    if (dept.rowCount === 0) throw new UnknownReferenceError("departmentId");
  }

  const result = await pool.query<{ id: string }>(
    `insert into position (school_id, title, category, parent_position_id, department_id, is_unique)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [
      schoolId,
      input.title,
      input.category,
      input.parentPositionId ?? null,
      input.departmentId ?? null,
      input.isUnique ?? false,
    ],
  );
  const created = await pool.query<PositionRow>(`${SELECT_POSITION} where p.id = $1`, [result.rows[0].id]);
  return { ...mapRow(created.rows[0]), holders: [] };
}

export async function updatePosition(
  schoolId: string,
  id: string,
  input: Partial<PositionInput>,
): Promise<PositionRecord | null> {
  const owns = await pool.query(`select 1 from position where id = $1 and school_id = $2`, [id, schoolId]);
  if (owns.rowCount === 0) return null;

  if (input.parentPositionId) {
    await assertParentBelongsToSchool(schoolId, input.parentPositionId);
    await assertNoCycle(schoolId, id, input.parentPositionId);
  }
  if (input.departmentId) {
    const dept = await pool.query(`select 1 from department where id = $1 and school_id = $2`, [
      input.departmentId,
      schoolId,
    ]);
    if (dept.rowCount === 0) throw new UnknownReferenceError("departmentId");
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (col: string, value: unknown) => {
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  };
  if (input.title !== undefined) push("title", input.title);
  if (input.category !== undefined) push("category", input.category);
  if (input.parentPositionId !== undefined) push("parent_position_id", input.parentPositionId);
  if (input.departmentId !== undefined) push("department_id", input.departmentId);
  if (input.isUnique !== undefined) push("is_unique", input.isUnique);

  if (sets.length > 0) {
    params.push(id);
    await pool.query(`update position set ${sets.join(", ")} where id = $${params.length}`, params);
  }

  const updated = await pool.query<PositionRow>(`${SELECT_POSITION} where p.id = $1`, [id]);
  const positions = await listPositions(schoolId);
  return positions.find((p) => p.id === id) ?? { ...mapRow(updated.rows[0]), holders: [] };
}

export async function deletePosition(schoolId: string, id: string): Promise<boolean> {
  const children = await pool.query(`select 1 from position where parent_position_id = $1`, [id]);
  if ((children.rowCount ?? 0) > 0) {
    throw new PositionInUseError("This position has other positions reporting to it — re-parent those first");
  }
  const holders = await pool.query(`select 1 from staff_position where position_id = $1 and status = 'active'`, [
    id,
  ]);
  if ((holders.rowCount ?? 0) > 0) {
    throw new PositionInUseError("This position has an active holder — end their term first");
  }

  const result = await pool.query(`delete from position where id = $1 and school_id = $2`, [id, schoolId]);
  return (result.rowCount ?? 0) > 0;
}

// One designated leadership position per school that auto-generated subject
// departments attach under (organization-studio.md §2). Clears any prior
// designee — the DB partial-unique index only stops two being true at once,
// it doesn't do the "unset the old one" half for you.
export async function setAcademicRoot(schoolId: string, positionId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const owns = await client.query(`select 1 from position where id = $1 and school_id = $2`, [
      positionId,
      schoolId,
    ]);
    if (owns.rowCount === 0) throw new UnknownReferenceError("positionId");
    await client.query(`update position set is_academic_root = false where school_id = $1`, [schoolId]);
    await client.query(`update position set is_academic_root = true where id = $1`, [positionId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getAcademicRoot(schoolId: string): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `select id from position where school_id = $1 and is_academic_root = true`,
    [schoolId],
  );
  return result.rows[0]?.id ?? null;
}

// docs/design/organization-studio.md §4 — a common secondary-school
// structure the admin can accept as-is or edit, not a hardcoded shape.
// Guards on an existing *leadership* (category='executive') position, not
// "any position at all" — a school will typically enable subjects (and so
// auto-generate department_head/teacher positions, §2) well before it ever
// gets to setting up its leadership tier, and that shouldn't permanently
// lock the template out. Re-running after the leadership tier itself exists
// still refuses, so accepting the template stays a one-time action.
export async function seedLeadershipTemplate(schoolId: string): Promise<PositionRecord[]> {
  const existing = await pool.query(
    `select 1 from position where school_id = $1 and category = 'executive' limit 1`,
    [schoolId],
  );
  if ((existing.rowCount ?? 0) > 0) {
    throw new PositionInUseError("This school already has a leadership tier set up — edit the tree directly instead");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const insert = async (title: string, category: PositionCategory, parentId: string | null) => {
      const r = await client.query<{ id: string }>(
        `insert into position (school_id, title, category, parent_position_id, is_unique)
         values ($1, $2, $3, $4, true) returning id`,
        [schoolId, title, category, parentId],
      );
      return r.rows[0].id;
    };

    const headTeacher = await insert("Head Teacher", "executive", null);
    const dosAcademics = await insert("Deputy Head Teacher — Academics / DOS", "executive", headTeacher);
    const deputyAdmin = await insert("Deputy Head Teacher — Administration", "executive", headTeacher);
    await insert("Dean of Students", "executive", deputyAdmin);
    await insert("Bursar", "executive", deputyAdmin);

    await client.query(`update position set is_academic_root = true where id = $1`, [dosAcademics]);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return listPositions(schoolId);
}

export async function listStaffPositions(schoolId: string, staffId: string): Promise<
  { id: string; positionId: string; title: string; departmentName: string | null; academicYearId: string; startDate: string; endDate: string | null; status: "active" | "ended" }[]
> {
  const result = await pool.query<{
    id: string;
    position_id: string;
    title: string;
    department_name: string | null;
    academic_year_id: string;
    start_date: string;
    end_date: string | null;
    status: "active" | "ended";
  }>(
    `select sp.id, sp.position_id, p.title, d.name as department_name, sp.academic_year_id,
            sp.start_date, sp.end_date, sp.status
     from staff_position sp
     join position p on p.id = sp.position_id
     left join department d on d.id = p.department_id
     where p.school_id = $1 and sp.staff_id = $2
     order by sp.status = 'active' desc, sp.created_at desc`,
    [schoolId, staffId],
  );
  return result.rows.map((r) => ({
    id: r.id,
    positionId: r.position_id,
    title: r.title,
    departmentName: r.department_name,
    academicYearId: r.academic_year_id,
    startDate: r.start_date,
    endDate: r.end_date,
    status: r.status,
  }));
}

// Assigns a staff member to hold a position — rejects if the position is
// `is_unique` and already has an active holder (§5), and if the staff member
// has no active `staff_assignment` at this school (same gate as
// subject_teacher_assignment, teacher-staff-module.md §2).
export async function assignStaffPosition(
  schoolId: string,
  input: { positionId: string; staffId: string; academicYearId: string; startDate: string },
): Promise<void> {
  const position = await pool.query<{ is_unique: boolean }>(
    `select is_unique from position where id = $1 and school_id = $2`,
    [input.positionId, schoolId],
  );
  if (!position.rows[0]) throw new UnknownReferenceError("positionId");

  const activeAssignment = await pool.query(
    `select 1 from staff_assignment where staff_id = $1 and school_id = $2 and status = 'active'`,
    [input.staffId, schoolId],
  );
  if ((activeAssignment.rowCount ?? 0) === 0) throw new StaffNotAssignedError();

  if (position.rows[0].is_unique) {
    const activeHolder = await pool.query(
      `select 1 from staff_position where position_id = $1 and status = 'active'`,
      [input.positionId],
    );
    if ((activeHolder.rowCount ?? 0) > 0) throw new PositionAlreadyHeldError();
  }

  await pool.query(
    `insert into staff_position (staff_id, position_id, academic_year_id, start_date, status)
     values ($1, $2, $3, $4, 'active')`,
    [input.staffId, input.positionId, input.academicYearId, input.startDate],
  );
}

export async function endStaffPosition(
  schoolId: string,
  staffPositionId: string,
  endDate: string,
): Promise<boolean> {
  const result = await pool.query(
    `update staff_position sp
     set status = 'ended', end_date = $1
     from position p
     where sp.id = $2 and sp.position_id = p.id and p.school_id = $3 and sp.status = 'active'`,
    [endDate, staffPositionId, schoolId],
  );
  return (result.rowCount ?? 0) > 0;
}
