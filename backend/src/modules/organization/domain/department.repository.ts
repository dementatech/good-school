import { pool } from "../../../shared/db/index.js";
import { createPosition, getAcademicRoot } from "./position.repository.js";

// docs/design/departments-module.md §2 — a school's departments. Academic
// departments auto-generate one-per-offered-subject (§3, and
// organization-studio.md §2); non-academic departments are a catalog
// toggle-list with a custom-add secondary path.

export interface DepartmentSubject {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
}

export interface DepartmentRecord {
  id: string;
  schoolId: string;
  catalogId: string | null;
  name: string;
  departmentType: "academic" | "non_academic";
  createdAt: string;
  subjects: DepartmentSubject[];
  headOfDepartmentPositionId: string | null;
}

interface DepartmentRow {
  id: string;
  school_id: string;
  catalog_id: string | null;
  name: string;
  department_type: "academic" | "non_academic";
  created_at: string;
}

const SELECT_DEPARTMENT = `
  select id, school_id, catalog_id, name, department_type, created_at
  from department
`;

async function hydrate(schoolId: string, row: DepartmentRow): Promise<DepartmentRecord> {
  const [subjects, head] = await Promise.all([
    pool.query<{ subject_id: string; code: string; name: string }>(
      `select s.id as subject_id, s.code, s.name
       from department_subject ds
       join subject s on s.id = ds.subject_id
       where ds.department_id = $1
       order by s.name`,
      [row.id],
    ),
    pool.query<{ id: string }>(
      `select id from position where school_id = $1 and department_id = $2 and category = 'department_head'`,
      [schoolId, row.id],
    ),
  ]);

  return {
    id: row.id,
    schoolId: row.school_id,
    catalogId: row.catalog_id,
    name: row.name,
    departmentType: row.department_type,
    createdAt: row.created_at,
    subjects: subjects.rows.map((s) => ({ subjectId: s.subject_id, subjectCode: s.code, subjectName: s.name })),
    headOfDepartmentPositionId: head.rows[0]?.id ?? null,
  };
}

export async function listDepartments(schoolId: string): Promise<DepartmentRecord[]> {
  const result = await pool.query<DepartmentRow>(`${SELECT_DEPARTMENT} where school_id = $1 order by name`, [
    schoolId,
  ]);
  return Promise.all(result.rows.map((row) => hydrate(schoolId, row)));
}

// Called from academic-structure's setSubjectOffering the moment a subject
// is enabled (departments-module.md §3: "academic departments should
// auto-generate the moment a subject is enabled"). Idempotent — checked via
// department_subject, not department.name, since a school could rename its
// auto-generated department later without this re-creating a duplicate.
export async function ensureAcademicDepartment(
  schoolId: string,
  subjectId: string,
  subjectName: string,
): Promise<void> {
  const existing = await pool.query(
    `select 1 from department_subject ds
     join department d on d.id = ds.department_id
     where d.school_id = $1 and ds.subject_id = $2`,
    [schoolId, subjectId],
  );
  if ((existing.rowCount ?? 0) > 0) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const dept = await client.query<{ id: string }>(
      `insert into department (school_id, catalog_id, name, department_type)
       values ($1, null, $2, 'academic')
       returning id`,
      [schoolId, `${subjectName} Department`],
    );
    const departmentId = dept.rows[0].id;

    await client.query(`insert into department_subject (department_id, subject_id) values ($1, $2)`, [
      departmentId,
      subjectId,
    ]);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Position creation happens after the department transaction commits —
  // createPosition does its own school/parent/department validation and
  // isn't worth threading a shared client through for two inserts.
  const academicRootId = await getAcademicRoot(schoolId);
  const dept = await pool.query<{ id: string }>(
    `select d.id from department d
     join department_subject ds on ds.department_id = d.id
     where d.school_id = $1 and ds.subject_id = $2`,
    [schoolId, subjectId],
  );
  const departmentId = dept.rows[0].id;

  await createPosition(schoolId, {
    title: `Head of ${subjectName} Department`,
    category: "department_head",
    parentPositionId: academicRootId,
    departmentId,
    isUnique: true,
  });
  await createPosition(schoolId, {
    title: `${subjectName} Teacher`,
    category: "teacher",
    parentPositionId: academicRootId,
    departmentId,
    isUnique: false,
  });
}

export class UnknownCatalogEntryError extends Error {
  constructor() {
    super("Unknown department catalog entry");
    this.name = "UnknownCatalogEntryError";
  }
}

export class DepartmentAlreadyExistsError extends Error {
  constructor() {
    super("This department is already set up at this school");
    this.name = "DepartmentAlreadyExistsError";
  }
}

// Non-academic departments (departments-module.md §3): the admin toggles one
// on from the catalog and says where it sits in the tree
// (organization-studio.md §3 — "who does this report to?" as part of the
// same setup action).
export async function addNonAcademicDepartment(
  schoolId: string,
  catalogId: string,
  reportsToPositionId: string | null,
): Promise<DepartmentRecord> {
  const catalog = await pool.query<{ name: string }>(
    `select name from department_catalog where id = $1 and department_type = 'non_academic'`,
    [catalogId],
  );
  if (!catalog.rows[0]) throw new UnknownCatalogEntryError();

  const existing = await pool.query(`select 1 from department where school_id = $1 and catalog_id = $2`, [
    schoolId,
    catalogId,
  ]);
  if ((existing.rowCount ?? 0) > 0) throw new DepartmentAlreadyExistsError();

  const dept = await pool.query<{ id: string }>(
    `insert into department (school_id, catalog_id, name, department_type)
     values ($1, $2, $3, 'non_academic')
     returning id`,
    [schoolId, catalogId, catalog.rows[0].name],
  );
  const departmentId = dept.rows[0].id;

  await createPosition(schoolId, {
    title: `Head of ${catalog.rows[0].name}`,
    category: "department_head",
    parentPositionId: reportsToPositionId,
    departmentId,
    isUnique: true,
  });

  const created = await pool.query<DepartmentRow>(`${SELECT_DEPARTMENT} where id = $1`, [departmentId]);
  return hydrate(schoolId, created.rows[0]);
}

// The secondary path (departments-module.md §3): a school-specific
// department the catalog doesn't cover.
export async function addCustomDepartment(
  schoolId: string,
  name: string,
  departmentType: "academic" | "non_academic",
  reportsToPositionId: string | null,
): Promise<DepartmentRecord> {
  const dept = await pool.query<{ id: string }>(
    `insert into department (school_id, catalog_id, name, department_type)
     values ($1, null, $2, $3)
     returning id`,
    [schoolId, name, departmentType],
  );
  const departmentId = dept.rows[0].id;

  await createPosition(schoolId, {
    title: `Head of ${name}`,
    category: "department_head",
    parentPositionId: reportsToPositionId,
    departmentId,
    isUnique: true,
  });

  const created = await pool.query<DepartmentRow>(`${SELECT_DEPARTMENT} where id = $1`, [departmentId]);
  return hydrate(schoolId, created.rows[0]);
}

export async function removeDepartment(schoolId: string, id: string): Promise<boolean> {
  const positions = await pool.query<{ id: string }>(`select id from position where department_id = $1`, [id]);
  for (const p of positions.rows) {
    const holders = await pool.query(`select 1 from staff_position where position_id = $1 and status = 'active'`, [
      p.id,
    ]);
    if ((holders.rowCount ?? 0) > 0) {
      throw new Error("This department has an active position holder — end their term first");
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`delete from position where department_id = $1`, [id]);
    const result = await client.query(`delete from department where id = $1 and school_id = $2`, [id, schoolId]);
    await client.query("COMMIT");
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
