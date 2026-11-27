import { randomUUID } from "node:crypto";
import { pool } from "../../src/shared/db/index.js";
import { apiOk, sessionFor, type Session } from "./app.js";

// Builders for the data most tests need. Setup that isn't itself under test
// (schools, years, logins) goes straight to the database; anything a test is
// actually checking should go through the API, as a real user would.

const uniq = () => randomUUID().slice(0, 8);

export async function uneb(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(`select id from curriculum where code = 'UNEB'`);
  return rows[0].id;
}

export async function superAdmin(): Promise<Session> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into users (school_id, system_id, email, password_hash, role)
     values (null, $1, $2, 'x', 'super_admin') returning id`,
    [`SA-${uniq()}`, `sa-${uniq()}@test.dev`],
  );
  return sessionFor(rows[0].id, "super_admin", null);
}

export interface TestSchool {
  schoolId: string;
  academicYearId: string;
  curriculumId: string;
  admin: Session;
}

/** A verified secondary school (O- and A-Level) running UNEB, with a
 * current academic year and a school admin. */
export async function createSchool(name = `Test School ${uniq()}`): Promise<TestSchool> {
  const curriculumId = await uneb();
  const school = await pool.query<{ id: string }>(
    `insert into schools (name, onboarding_status, verified_at, offers_o_level, offers_a_level)
     values ($1, 'active', now(), true, true) returning id`,
    [name],
  );
  const schoolId = school.rows[0].id;
  await pool.query(`insert into school_curriculum (school_id, curriculum_id, is_primary) values ($1, $2, true)`, [
    schoolId,
    curriculumId,
  ]);
  const user = await pool.query<{ id: string }>(
    `insert into users (school_id, system_id, email, password_hash, role)
     values ($1, $2, $3, 'x', 'school_admin') returning id`,
    [schoolId, `ADM-${uniq()}`, `admin-${uniq()}@test.dev`],
  );
  const year = await pool.query<{ id: string }>(
    `insert into academic_years (school_id, year_name, start_date, end_date, is_current, created_by)
     values ($1, '2026', '2026-02-01', '2026-12-11', true, $2) returning id`,
    [schoolId, user.rows[0].id],
  );
  return {
    schoolId,
    academicYearId: year.rows[0].id,
    curriculumId,
    admin: sessionFor(user.rows[0].id, "school_admin", schoolId),
  };
}

export interface CatalogSubject {
  id: string;
  name: string;
  shortName: string;
}

/**
 * Makes sure the platform's A-Level catalog has these subjects (by UNEB
 * code), creating them through the super-admin API. Idempotent across tests.
 */
export async function aLevelSubjects(
  sa: Session,
  defs: { unebCode: string; name: string; shortName: string; category: "science" | "art" | "subsidiary" }[],
): Promise<Record<string, CatalogSubject>> {
  const curriculumId = await uneb();
  const out: Record<string, CatalogSubject> = {};
  for (const d of defs) {
    const existing = await pool.query<{ id: string; name: string; short_name: string }>(
      `select id, name, short_name from subject
       where curriculum_id = $1 and phase = 'A_LEVEL' and uneb_code = $2 and school_id is null`,
      [curriculumId, d.unebCode],
    );
    if (existing.rows[0]) {
      const r = existing.rows[0];
      out[d.unebCode] = { id: r.id, name: r.name, shortName: r.short_name };
      continue;
    }
    const created = await apiOk<{ id: string; name: string; shortName: string }>(
      sa,
      "POST",
      `/api/v1/academic/subjects?curriculumId=${curriculumId}`,
      { phase: "A_LEVEL", name: d.name, shortName: d.shortName, category: d.category, unebCode: d.unebCode },
    );
    out[d.unebCode] = { id: created.id, name: created.name, shortName: created.shortName };
  }
  return out;
}

/** The A-Level subjects the combination tests use. */
export const ARTS_AND_SUBS = [
  { unebCode: "P210", name: "History", shortName: "HIST", category: "art" },
  { unebCode: "P220", name: "Economics", shortName: "ECON", category: "art" },
  { unebCode: "P250", name: "Geography", shortName: "GEOG", category: "art" },
  { unebCode: "P235", name: "Islamic Religious Education", shortName: "IRE", category: "art" },
  { unebCode: "P360", name: "Luganda", shortName: "LUG", category: "art" },
  { unebCode: "S475", name: "Subsidiary Mathematics", shortName: "SMATH", category: "subsidiary" },
  { unebCode: "S850", name: "Subsidiary ICT", shortName: "SICT", category: "subsidiary" },
] as const;

/** Marks subjects as offered at the school this year, through the API. */
export async function offer(school: TestSchool, subjectIds: string[]): Promise<void> {
  for (const subjectId of subjectIds) {
    await apiOk(school.admin, "POST", `/api/v1/academic/subject-offerings?academicYearId=${school.academicYearId}`, {
      subjectId,
      isOffered: true,
      isCompulsory: false,
    });
  }
}
