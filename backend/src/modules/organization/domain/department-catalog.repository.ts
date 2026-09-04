import { pool } from "../../../shared/db/index.js";

// The platform-wide, super_admin-seeded catalog of common non-academic
// departments (docs/design/departments-module.md §2-3) — a school toggles
// these on rather than typing free text, same "selection, not construction"
// principle already used for A-Level combinations.

export interface DepartmentCatalogEntry {
  id: string;
  name: string;
  departmentType: "academic" | "non_academic";
}

export async function listDepartmentCatalog(): Promise<DepartmentCatalogEntry[]> {
  const result = await pool.query<{ id: string; name: string; department_type: "academic" | "non_academic" }>(
    `select id, name, department_type from department_catalog order by name`,
  );
  return result.rows.map((r) => ({ id: r.id, name: r.name, departmentType: r.department_type }));
}
