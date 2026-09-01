import { pool } from "../../../shared/db/index.js";

// Which curricula a school runs. A school opts in to UNEB (and later Cambridge
// etc.); classes/streams can then only reference stages of a curriculum the
// school runs.

export interface SchoolCurriculumRecord {
  curriculumId: string;
  code: string;
  name: string;
  createdAt: string;
}

interface Row {
  curriculum_id: string;
  code: string;
  name: string;
  created_at: string;
}

export async function listSchoolCurricula(schoolId: string): Promise<SchoolCurriculumRecord[]> {
  const { rows } = await pool.query<Row>(
    `select sc.curriculum_id, c.code, c.name, sc.created_at
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
    createdAt: r.created_at,
  }));
}

export async function addSchoolCurriculum(
  schoolId: string,
  curriculumId: string,
): Promise<boolean> {
  const owner = await pool.query(`select 1 from curriculum where id = $1`, [curriculumId]);
  if (owner.rowCount === 0) return false;
  await pool.query(
    `insert into school_curriculum (school_id, curriculum_id)
     values ($1, $2) on conflict do nothing`,
    [schoolId, curriculumId],
  );
  return true;
}

export async function removeSchoolCurriculum(
  schoolId: string,
  curriculumId: string,
): Promise<boolean> {
  const result = await pool.query(
    `delete from school_curriculum where school_id = $1 and curriculum_id = $2`,
    [schoolId, curriculumId],
  );
  return (result.rowCount ?? 0) > 0;
}
