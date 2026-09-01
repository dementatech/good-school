import { pool } from "../../../shared/db/index.js";
import type { SchoolCurriculumRef } from "./schools.repository.js";

// Per-school curriculum attach/detach, addressed by school id — for the
// super-admin onboarding screen. (academic-structure has a sibling module that
// does the same thing scoped to the caller's own JWT school.)

export async function listForSchool(schoolId: string): Promise<SchoolCurriculumRef[]> {
  const { rows } = await pool.query<{
    curriculum_id: string;
    code: string;
    name: string;
    is_primary: boolean;
  }>(
    `select sc.curriculum_id, c.code, c.name, sc.is_primary
       from school_curriculum sc
       join curriculum c on c.id = sc.curriculum_id
      where sc.school_id = $1
      order by c.code`,
    [schoolId],
  );
  return rows.map((r) => ({
    curriculumId: r.curriculum_id,
    code: r.code,
    name: r.name,
    isPrimary: r.is_primary,
  }));
}

export async function attach(
  schoolId: string,
  curriculumId: string,
  makePrimary: boolean,
): Promise<"ok" | "school_not_found" | "curriculum_not_found"> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const school = await client.query(`select 1 from schools where id = $1`, [schoolId]);
    if (school.rowCount === 0) {
      await client.query("ROLLBACK");
      return "school_not_found";
    }
    const curriculum = await client.query(`select 1 from curriculum where id = $1`, [curriculumId]);
    if (curriculum.rowCount === 0) {
      await client.query("ROLLBACK");
      return "curriculum_not_found";
    }

    // First curriculum a school gets is primary by default.
    const existing = await client.query<{ n: string }>(
      `select count(*)::text as n from school_curriculum where school_id = $1`,
      [schoolId],
    );
    const primary = makePrimary || Number(existing.rows[0].n) === 0;

    if (primary) {
      await client.query(
        `update school_curriculum set is_primary = false where school_id = $1 and is_primary`,
        [schoolId],
      );
    }
    await client.query(
      `insert into school_curriculum (school_id, curriculum_id, is_primary)
       values ($1, $2, $3)
       on conflict (school_id, curriculum_id) do update set is_primary = excluded.is_primary or school_curriculum.is_primary`,
      [schoolId, curriculumId, primary],
    );
    await client.query("COMMIT");
    return "ok";
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function setPrimary(
  schoolId: string,
  curriculumId: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const owns = await client.query(
      `select 1 from school_curriculum where school_id = $1 and curriculum_id = $2`,
      [schoolId, curriculumId],
    );
    if (owns.rowCount === 0) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query(
      `update school_curriculum set is_primary = (curriculum_id = $2) where school_id = $1`,
      [schoolId, curriculumId],
    );
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function detach(schoolId: string, curriculumId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `delete from school_curriculum where school_id = $1 and curriculum_id = $2`,
    [schoolId, curriculumId],
  );
  return (rowCount ?? 0) > 0;
}
