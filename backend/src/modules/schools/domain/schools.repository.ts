import { pool } from "../../../shared/db/index.js";

export interface SchoolSummary {
  id: string;
  name: string;
  userCount: number;
  createdAt: string;
}

interface SchoolRow {
  id: string;
  name: string;
  user_count: string;
  created_at: string;
}

function mapRow(row: SchoolRow): SchoolSummary {
  return {
    id: row.id,
    name: row.name,
    userCount: Number(row.user_count),
    createdAt: row.created_at,
  };
}

export async function listSchools(): Promise<SchoolSummary[]> {
  const result = await pool.query<SchoolRow>(
    `select s.id, s.name, s.created_at,
            (select count(*) from users u where u.school_id = s.id) as user_count
     from schools s
     order by s.created_at desc`,
  );
  return result.rows.map(mapRow);
}

export async function createSchool(name: string): Promise<SchoolSummary> {
  const result = await pool.query<SchoolRow>(
    `insert into schools (name) values ($1)
     returning id, name, created_at, 0::text as user_count`,
    [name],
  );
  return mapRow(result.rows[0]);
}
