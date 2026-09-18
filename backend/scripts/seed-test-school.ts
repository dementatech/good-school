import "dotenv/config";
import type { PoolClient } from "pg";
import { hashPassword } from "../src/modules/auth/index.js";
import { pool } from "../src/shared/db/index.js";
import { nextSystemId } from "../src/shared/system-id.js";

// One-off seed for QA: fleshes out the existing "Kampala Test Secondary
// School" dev record into a full 200-student school (100 O-Level, 100
// A-Level) with everything Report Card Studio would eventually need to read
// from real tables instead of its hardcoded sample data — A-Level subject
// catalog, subject combinations, classes/streams for S5-S6, enrollments,
// subject registrations, and exam_result marks for the school's existing
// "End of Term 3 Exams" exam.
//
// Idempotent: safe to re-run. Catalog/structure rows are upserted; students
// are only topped up to the target counts (existing test students are kept
// and reused, not duplicated).

// School, admin, teachers, academic year/terms, O-Level catalog and
// grading-scheme IDs are no longer hardcoded — a fresh database (a new VPS,
// a CI throwaway) has none of that. bootstrap() below finds-or-creates all
// of it (matched by natural keys: school name, user email, subject code,
// curriculum_stage code) and returns the same IDs this script used to read
// off module-level constants. Safe to re-run: every insert is a
// find-or-create, never a duplicate.

// O-Level subject catalog to find-or-create for the curriculum. `compulsory`
// is script-local bookkeeping (every student gets all compulsory subjects
// plus one pick of the non-compulsory ones) — it isn't a column in `subject`.
const O_LEVEL_SUBJECT_DEFS: {
  code: string;
  shortName: string;
  name: string;
  category: string;
  compulsory: boolean;
}[] = [
  { code: "O001", shortName: "Eng", name: "English Language", category: "core", compulsory: true },
  { code: "O002", shortName: "Math", name: "Mathematics", category: "core", compulsory: true },
  { code: "O003", shortName: "CRE", name: "Christian Religious Education", category: "elective", compulsory: false },
  { code: "O004", shortName: "Agric", name: "Agriculture", category: "elective", compulsory: false },
  { code: "O005", shortName: "Bio", name: "Biology", category: "science", compulsory: true },
  { code: "O006", shortName: "Chem", name: "Chemistry", category: "science", compulsory: true },
  { code: "O007", shortName: "Phy", name: "Physics", category: "science", compulsory: true },
  { code: "O008", shortName: "Hist", name: "History", category: "arts", compulsory: true },
  { code: "O009", shortName: "Geo", name: "Geography", category: "arts", compulsory: true },
  { code: "O010", shortName: "Luganda", name: "Luganda", category: "languages", compulsory: true },
];

const TEACHER_DEFS: { email: string; first: string; last: string; gender: "male" | "female" }[] = [
  { email: "grace.nakato@kampalatest.sc.ug", first: "Grace", last: "Nakato", gender: "female" },
  { email: "brian.okello@kampalatest.sc.ug", first: "Brian", last: "Okello", gender: "male" },
  { email: "sarah.namutebi@kampalatest.sc.ug", first: "Sarah", last: "Namutebi", gender: "female" },
  { email: "david.ssemakula@kampalatest.sc.ug", first: "David", last: "Ssemakula", gender: "male" },
  { email: "immaculate.achieng@kampalatest.sc.ug", first: "Immaculate", last: "Achieng", gender: "female" },
  { email: "patrick.mugisha@kampalatest.sc.ug", first: "Patrick", last: "Mugisha", gender: "male" },
];
const ADMIN_EMAIL = "schooladmin.test@goodschool.dev";

// A-Level subjects examined as separate papers, by short name — Theory +
// Practical, as UACE actually structures the sciences and subsidiary ICT.
// Everything else (History, Economics, GP, ...) stays a single flat score.
const VARIANT_DEFS: Record<string, { code: string; name: string; pct: number }[]> = {
  Bio: [
    { code: "THEORY", name: "Theory", pct: 70 },
    { code: "PRAC", name: "Practical", pct: 30 },
  ],
  Chem: [
    { code: "THEORY", name: "Theory", pct: 70 },
    { code: "PRAC", name: "Practical", pct: 30 },
  ],
  ICT: [
    { code: "THEORY", name: "Theory", pct: 60 },
    { code: "PRAC", name: "Practical", pct: 40 },
  ],
};

const TEST_PASSWORD = "TestPass!2026";

// ─── helpers ────────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
// Rough gaussian via sum of uniforms — good enough for believable score spread.
function gauss(mean: number, sd: number): number {
  let s = 0;
  for (let i = 0; i < 6; i++) s += Math.random();
  return mean + (s - 3) * (sd / 1.5);
}

const FIRST_NAMES_M = [
  "Kevin", "Brian", "Daniel", "Moses", "Solomon", "Patrick", "David", "Isaac",
  "Joel", "Joshua", "Simon", "Peter", "Ronald", "Emmanuel", "Ivan", "Allan",
  "Denis", "Robert", "Herbert", "Vincent", "Steven", "Andrew", "Charles", "Martin",
];
const FIRST_NAMES_F = [
  "Amara", "Grace", "Faith", "Ritah", "Patience", "Joan", "Sarah", "Immaculate",
  "Brenda", "Doreen", "Hellen", "Winnie", "Sandra", "Esther", "Diana", "Juliet",
  "Prossy", "Betty", "Evelyn", "Sharon", "Racheal", "Phiona", "Carol", "Maria",
];
const LAST_NAMES = [
  "Nsubuga", "Okello", "Namutebi", "Ssemwogerere", "Achieng", "Katamba", "Nabirye",
  "Mugisha", "Akello", "Kironde", "Tumusiime", "Nakato", "Odongo", "Adeke", "Kato",
  "Auma", "Wasswa", "Birungi", "Ssali", "Namubiru", "Kwagala", "Byaruhanga",
  "Nantongo", "Kyeyune", "Nakimuli", "Opio", "Nalubega", "Mutebi", "Kirabo", "Lubega",
];

function randomName(): { first: string; last: string; gender: "male" | "female" } {
  const gender = Math.random() < 0.5 ? "male" : "female";
  const first = pick(gender === "male" ? FIRST_NAMES_M : FIRST_NAMES_F);
  const last = pick(LAST_NAMES);
  return { first, last, gender };
}

function dobForAge(age: number): string {
  const year = 2026 - age;
  const month = randInt(1, 12);
  const day = randInt(1, 28);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function batchInsert(
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
  conflictClause = "",
  chunkSize = 200,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values: unknown[] = [];
    const tuples = chunk.map((row, r) => {
      const placeholders = row.map((_, c) => `$${r * row.length + c + 1}`);
      values.push(...row);
      return `(${placeholders.join(",")})`;
    });
    await client.query(
      `insert into ${table} (${columns.join(",")}) values ${tuples.join(",")} ${conflictClause}`,
      values,
    );
  }
}

// ─── grade band cache ───────────────────────────────────────────────────────

interface Band {
  label: string;
  min: number;
  max: number;
}
const bandCache = new Map<string, Band[]>();

async function loadBands(client: PoolClient, schemeId: string): Promise<Band[]> {
  if (bandCache.has(schemeId)) return bandCache.get(schemeId)!;
  const { rows } = await client.query<{ label: string; min_pct: string; max_pct: string }>(
    `select label, min_pct, max_pct from grade_band where grading_scheme_id = $1`,
    [schemeId],
  );
  const bands = rows.map((r) => ({ label: r.label, min: Number(r.min_pct), max: Number(r.max_pct) }));
  bandCache.set(schemeId, bands);
  return bands;
}

async function gradeFor(client: PoolClient, schemeId: string, score: number): Promise<string> {
  const bands = await loadBands(client, schemeId);
  const band = bands.find((b) => score >= b.min && score <= b.max);
  return band?.label ?? bands[0].label;
}

// ─── bootstrap helpers ──────────────────────────────────────────────────────

// A class (school_id, curriculum_stage_id) plus its named streams — shared by
// the O-Level (S1-S4) bootstrap below and the existing A-Level (S5/S6) step.
async function ensureClassWithStreams(
  client: PoolClient,
  schoolId: string,
  academicYearId: string,
  stageId: string,
  adminUserId: string,
  streamNames: string[],
): Promise<{ classId: string; streamId: Record<string, string> }> {
  const existing = await client.query<{ id: string }>(
    `select id from classes where school_id = $1 and curriculum_stage_id = $2`,
    [schoolId, stageId],
  );
  let classId: string;
  if (existing.rows[0]) {
    classId = existing.rows[0].id;
  } else {
    const { rows } = await client.query<{ id: string }>(
      `insert into classes (school_id, academic_year_id, curriculum_stage_id, has_streams, is_active, created_by)
       values ($1,$2,$3,true,true,$4) returning id`,
      [schoolId, academicYearId, stageId, adminUserId],
    );
    classId = rows[0].id;
  }
  const streamId: Record<string, string> = {};
  for (const name of streamNames) {
    const existingStream = await client.query<{ id: string }>(
      `select id from streams where school_id = $1 and class_id = $2 and name = $3`,
      [schoolId, classId, name],
    );
    if (existingStream.rows[0]) {
      streamId[name] = existingStream.rows[0].id;
    } else {
      const { rows } = await client.query<{ id: string }>(
        `insert into streams (school_id, class_id, name, is_active, created_by)
         values ($1,$2,$3,true,$4) returning id`,
        [schoolId, classId, name, adminUserId],
      );
      streamId[name] = rows[0].id;
    }
  }
  return { classId, streamId };
}

async function ensureTeacherUser(
  client: PoolClient,
  schoolId: string,
  passwordHash: string,
  def: { email: string; first: string; last: string; gender: "male" | "female" },
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `select id from users where school_id = $1 and email = $2`,
    [schoolId, def.email],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const systemId = await nextSystemId(client, "T");
  const { rows } = await client.query<{ id: string }>(
    `insert into users (school_id, system_id, email, password_hash, role) values ($1,$2,$3,$4,'teacher') returning id`,
    [schoolId, systemId, def.email, passwordHash],
  );
  const userId = rows[0].id;
  await client.query(
    `insert into staff (user_id, first_name, last_name, gender, employment_type, is_active)
     values ($1,$2,$3,$4,'government',true)
     on conflict (user_id) do nothing`,
    [userId, def.first, def.last, def.gender],
  );
  return userId;
}

interface BootstrapResult {
  schoolId: string;
  curriculumId: string;
  academicYearId: string;
  schoolExamId: string;
  adminUserId: string;
  teacherIds: string[];
  stage: Record<"S1" | "S2" | "S3" | "S4" | "S5" | "S6", string>;
  oLevelClassId: Record<"S1" | "S2" | "S3" | "S4", string>;
  oLevelStreamId: Record<string, string>;
  oLevelSubjects: { id: string; code: string; compulsory: boolean }[];
  generalPaperId: string;
  gradingScheme: { O_LEVEL_ANY: string; A_LEVEL_PRINCIPAL: string; A_LEVEL_SUBSIDIARY: string };
  passwordHash: string;
}

async function bootstrap(client: PoolClient): Promise<BootstrapResult> {
  const passwordHash = await hashPassword(TEST_PASSWORD);

  const { rows: curRows } = await client.query<{ id: string }>(`select id from curriculum where code = 'UNEB'`);
  if (!curRows[0]) {
    throw new Error("UNEB curriculum not found — run migrations first (npm run migrate:up).");
  }
  const curriculumId = curRows[0].id;

  const { rows: stageRows } = await client.query<{ id: string; code: string }>(
    `select id, code from curriculum_stage where curriculum_id = $1`,
    [curriculumId],
  );
  const stage = Object.fromEntries(stageRows.map((r) => [r.code, r.id])) as BootstrapResult["stage"];

  const existingSchool = await client.query<{ id: string }>(
    `select id from schools where name = $1`,
    ["Kampala Test Secondary School"],
  );
  let schoolId: string;
  if (existingSchool.rows[0]) {
    schoolId = existingSchool.rows[0].id;
  } else {
    const { rows } = await client.query<{ id: string }>(
      `insert into schools (name, onboarding_status, verified_at, district, ownership_type, school_type, gender_composition, phone, email)
       values ($1,'active',now(),'Kampala','private','mixed','mixed','+256700000000',$2)
       returning id`,
      ["Kampala Test Secondary School", ADMIN_EMAIL],
    );
    schoolId = rows[0].id;
  }

  await client.query(
    `insert into school_curriculum (school_id, curriculum_id, is_primary) values ($1,$2,true)
     on conflict (school_id, curriculum_id) do nothing`,
    [schoolId, curriculumId],
  );

  const existingAdmin = await client.query<{ id: string }>(
    `select id from users where school_id = $1 and email = $2`,
    [schoolId, ADMIN_EMAIL],
  );
  let adminUserId: string;
  if (existingAdmin.rows[0]) {
    adminUserId = existingAdmin.rows[0].id;
  } else {
    const systemId = await nextSystemId(client, "A");
    const { rows } = await client.query<{ id: string }>(
      `insert into users (school_id, system_id, email, password_hash, role) values ($1,$2,$3,$4,'school_admin') returning id`,
      [schoolId, systemId, ADMIN_EMAIL, passwordHash],
    );
    adminUserId = rows[0].id;
  }

  const teacherIds: string[] = [];
  for (const t of TEACHER_DEFS) {
    teacherIds.push(await ensureTeacherUser(client, schoolId, passwordHash, t));
  }

  const existingYear = await client.query<{ id: string }>(
    `select id from academic_years where school_id = $1 and year_name = $2`,
    [schoolId, "2026"],
  );
  let academicYearId: string;
  if (existingYear.rows[0]) {
    academicYearId = existingYear.rows[0].id;
  } else {
    const { rows } = await client.query<{ id: string }>(
      `insert into academic_years (school_id, year_name, start_date, end_date, is_current, created_by)
       values ($1,'2026','2026-02-01','2026-12-11',true,$2) returning id`,
      [schoolId, adminUserId],
    );
    academicYearId = rows[0].id;
  }

  // "Current" term is derived from the calendar (today's date falling inside
  // [start_date, end_date]), not a flag — see terms.repository.ts's
  // getCurrentTerm. Term 3's window below is picked to contain "now" for a
  // freshly-seeded school.
  const termDefs = [
    { name: "Term 1", start: "2026-02-01", end: "2026-05-08", current: false },
    { name: "Term 2", start: "2026-05-25", end: "2026-08-14", current: false },
    { name: "Term 3", start: "2026-09-07", end: "2026-12-11", current: true },
  ];
  let currentTermId = "";
  for (const t of termDefs) {
    const existing = await client.query<{ id: string }>(
      `select id from terms where academic_year_id = $1 and name = $2`,
      [academicYearId, t.name],
    );
    let termId: string;
    if (existing.rows[0]) {
      termId = existing.rows[0].id;
    } else {
      const { rows } = await client.query<{ id: string }>(
        `insert into terms (school_id, academic_year_id, name, start_date, end_date, created_by)
         values ($1,$2,$3,$4,$5,$6) returning id`,
        [schoolId, academicYearId, t.name, t.start, t.end, adminUserId],
      );
      termId = rows[0].id;
    }
    if (t.current) currentTermId = termId;
  }

  const { rows: sessionRows } = await client.query<{ id: string }>(
    `insert into exam_session (exam_name, exam_code, description, is_active)
     values ('End of Term Exam','EOT','Standard end-of-term summative assessment', true)
     on conflict (exam_code) do update set updated_at = now()
     returning id`,
  );
  const examSessionId = sessionRows[0].id;

  const { rows: examRows } = await client.query<{ id: string }>(
    `insert into school_exam (school_id, exam_session_id, academic_year_id, term_id, name, starts_on, ends_on, marks_due_on, status, created_by)
     values ($1,$2,$3,$4,'End of Term 3 Exams','2026-11-16','2026-11-27','2026-12-04','active',$5)
     on conflict (school_id, academic_year_id, term_id, name) do update set updated_at = now()
     returning id`,
    [schoolId, examSessionId, academicYearId, currentTermId, adminUserId],
  );
  const schoolExamId = examRows[0].id;

  const oLevelSubjectDbId: Record<string, string> = {};
  for (const s of O_LEVEL_SUBJECT_DEFS) {
    const { rows } = await client.query<{ id: string }>(
      `insert into subject (curriculum_id, phase, code, short_name, name, category, status)
       values ($1,'O_LEVEL',$2,$3,$4,$5,'approved')
       on conflict (curriculum_id, phase, code) do update set updated_at = now()
       returning id`,
      [curriculumId, s.code, s.shortName, s.name, s.category],
    );
    oLevelSubjectDbId[s.shortName] = rows[0].id;
  }
  for (const subjectId of Object.values(oLevelSubjectDbId)) {
    for (const stageCode of ["S1", "S2", "S3", "S4"] as const) {
      await client.query(
        `insert into subject_stage (subject_id, curriculum_stage_id) values ($1,$2) on conflict do nothing`,
        [subjectId, stage[stageCode]],
      );
    }
  }
  const oLevelSubjects = O_LEVEL_SUBJECT_DEFS.map((s) => ({
    id: oLevelSubjectDbId[s.shortName],
    code: s.shortName,
    compulsory: s.compulsory,
  }));

  const { rows: gpRows } = await client.query<{ id: string }>(
    `select id from subject where curriculum_id = $1 and is_general_paper = true`,
    [curriculumId],
  );
  if (!gpRows[0]) {
    throw new Error("General Paper subject not found for UNEB curriculum — migrations may be out of date.");
  }
  const generalPaperId = gpRows[0].id;

  async function schemeId(name: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `select id from grading_scheme where curriculum_id = $1 and name = $2`,
      [curriculumId, name],
    );
    if (!rows[0]) throw new Error(`Grading scheme "${name}" not found — migrations may be out of date.`);
    return rows[0].id;
  }
  const gradingScheme = {
    O_LEVEL_ANY: await schemeId("NLSC O-Level"),
    A_LEVEL_PRINCIPAL: await schemeId("NLSC A-Level (Principal)"),
    A_LEVEL_SUBSIDIARY: await schemeId("NLSC A-Level (Subsidiary)"),
  };

  const oLevelClassId: BootstrapResult["oLevelClassId"] = { S1: "", S2: "", S3: "", S4: "" };
  const oLevelStreamId: Record<string, string> = {};
  for (const stageCode of ["S1", "S2", "S3", "S4"] as const) {
    const { classId, streamId } = await ensureClassWithStreams(
      client,
      schoolId,
      academicYearId,
      stage[stageCode],
      adminUserId,
      ["East", "West"],
    );
    oLevelClassId[stageCode] = classId;
    for (const [name, id] of Object.entries(streamId)) oLevelStreamId[`${stageCode}:${name}`] = id;
  }

  return {
    schoolId,
    curriculumId,
    academicYearId,
    schoolExamId,
    adminUserId,
    teacherIds,
    stage,
    oLevelClassId,
    oLevelStreamId,
    oLevelSubjects,
    generalPaperId,
    gradingScheme,
    passwordHash,
  };
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("Bootstrapping Kampala Test Secondary School (school, admin, teachers, academic year/terms, O-Level catalog)...");
    const {
      schoolId: SCHOOL_ID,
      curriculumId: CURRICULUM_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      schoolExamId: SCHOOL_EXAM_ID,
      adminUserId: ADMIN_USER_ID,
      teacherIds: TEACHER_IDS,
      stage: STAGE,
      oLevelClassId: O_LEVEL_CLASS_ID,
      oLevelStreamId: O_LEVEL_STREAM_ID,
      oLevelSubjects: O_LEVEL_SUBJECTS,
      generalPaperId: GENERAL_PAPER_ID,
      gradingScheme: GRADING_SCHEME,
      passwordHash,
    } = await bootstrap(client);

    console.log("1/11 A-Level subject catalog...");
    const aLevelSubjectDefs = [
      { code: "S002", shortName: "Math", name: "Mathematics", category: "science" },
      { code: "S003", shortName: "Phy", name: "Physics", category: "science" },
      { code: "S004", shortName: "Chem", name: "Chemistry", category: "science" },
      { code: "S005", shortName: "Bio", name: "Biology", category: "science" },
      { code: "S006", shortName: "Econ", name: "Economics", category: "art" },
      { code: "S007", shortName: "Hist", name: "History", category: "art" },
      { code: "S008", shortName: "Geo", name: "Geography", category: "art" },
      { code: "S009", shortName: "Lit", name: "Literature in English", category: "art" },
      { code: "S010", shortName: "SMath", name: "Subsidiary Mathematics", category: "subsidiary" },
      { code: "S011", shortName: "ICT", name: "Subsidiary ICT", category: "subsidiary" },
    ];
    const aLevelSubjectId: Record<string, string> = {};
    for (const s of aLevelSubjectDefs) {
      const { rows } = await client.query<{ id: string }>(
        `insert into subject (curriculum_id, phase, code, short_name, name, category, status)
         values ($1, 'A_LEVEL', $2, $3, $4, $5, 'approved')
         on conflict (curriculum_id, phase, code) do update set updated_at = now()
         returning id`,
        [CURRICULUM_ID, s.code, s.shortName, s.name, s.category],
      );
      aLevelSubjectId[s.shortName] = rows[0].id;
    }
    // subject_stage: A-Level subjects + GP offered in both S5 and S6.
    for (const subjectId of [...Object.values(aLevelSubjectId), GENERAL_PAPER_ID]) {
      for (const stageId of [STAGE.S5, STAGE.S6]) {
        await client.query(
          `insert into subject_stage (subject_id, curriculum_stage_id) values ($1, $2) on conflict do nothing`,
          [subjectId, stageId],
        );
      }
    }

    // Theory/Practical variants for Bio, Chem, Subsidiary ICT — demonstrates
    // the platform's variant-subject support (weighted merge on the mark
    // sheet and report card) rather than every subject being one flat score.
    const aLevelVariantId: Record<string, Record<string, string>> = {};
    const aLevelSubjectIdToShortName = new Map(Object.entries(aLevelSubjectId).map(([short, id]) => [id, short]));
    for (const [shortName, defs] of Object.entries(VARIANT_DEFS)) {
      const subjectId = aLevelSubjectId[shortName];
      await client.query(`update subject set has_variant = true, updated_at = now() where id = $1`, [subjectId]);
      aLevelVariantId[shortName] = {};
      for (const v of defs) {
        const { rows } = await client.query<{ id: string }>(
          `insert into subject_variant (subject_id, name, code, contribution_percent)
           values ($1, $2, $3, $4)
           on conflict (subject_id, code) do update set name = excluded.name, contribution_percent = excluded.contribution_percent
           returning id`,
          [subjectId, v.name, v.code, v.pct],
        );
        aLevelVariantId[shortName][v.code] = rows[0].id;
      }
    }

    console.log("2/11 A-Level combinations (catalog + school adoption)...");
    const combos = [
      { code: "PCM", desc: "Physics, Chemistry, Mathematics", members: ["Phy", "Chem", "Math"] },
      { code: "PCB", desc: "Physics, Chemistry, Biology", members: ["Phy", "Chem", "Bio"] },
      { code: "HEG", desc: "History, Economics, Geography", members: ["Hist", "Econ", "Geo"] },
      { code: "HEL", desc: "History, Economics, Literature", members: ["Hist", "Econ", "Lit"] },
    ];
    const schoolCombinationId: Record<string, string> = {};
    const comboMemberSubjectIds: Record<string, string[]> = {};
    for (const combo of combos) {
      const { rows: catRows } = await client.query<{ id: string }>(
        `insert into subject_combination (curriculum_id, code, description, is_active)
         values ($1, $2, $3, true)
         on conflict (curriculum_id, code) do update set description = excluded.description, updated_at = now()
         returning id`,
        [CURRICULUM_ID, combo.code, combo.desc],
      );
      const catalogId = catRows[0].id;
      await client.query(`delete from combination_subject where combination_id = $1`, [catalogId]);
      const memberIds = combo.members.map((m) => aLevelSubjectId[m]);
      comboMemberSubjectIds[combo.code] = memberIds;
      for (let i = 0; i < memberIds.length; i++) {
        await client.query(
          `insert into combination_subject (combination_id, subject_id, role, sort_order) values ($1,$2,'principal',$3)`,
          [catalogId, memberIds[i], i],
        );
      }

      const { rows: schoolRows } = await client.query<{ id: string }>(
        `insert into school_combination (school_id, academic_year_id, catalog_combination_id, code, description, is_offered)
         values ($1, $2, $3, $4, $5, true)
         on conflict (school_id, academic_year_id, code) do update set description = excluded.description, updated_at = now()
         returning id`,
        [SCHOOL_ID, ACADEMIC_YEAR_ID, catalogId, combo.code, combo.desc],
      );
      const schoolComboId = schoolRows[0].id;
      schoolCombinationId[combo.code] = schoolComboId;
      await client.query(`delete from school_combination_subject where school_combination_id = $1`, [schoolComboId]);
      for (let i = 0; i < memberIds.length; i++) {
        await client.query(
          `insert into school_combination_subject (school_combination_id, subject_id, role, sort_order) values ($1,$2,'principal',$3)`,
          [schoolComboId, memberIds[i], i],
        );
      }
    }

    console.log("3/11 School grading scheme selection...");
    const schemeSelections: [string, string, string][] = [
      [SCHOOL_ID, "O_LEVEL", GRADING_SCHEME.O_LEVEL_ANY],
      [SCHOOL_ID, "A_LEVEL", GRADING_SCHEME.A_LEVEL_PRINCIPAL],
    ];
    await client.query(
      `insert into school_grading_scheme (school_id, applies_to, role_scope, grading_scheme_id, updated_at)
       values ($1,'O_LEVEL','any',$2,now())
       on conflict (school_id, applies_to, role_scope) do update set grading_scheme_id = excluded.grading_scheme_id, updated_at = now()`,
      [SCHOOL_ID, GRADING_SCHEME.O_LEVEL_ANY],
    );
    await client.query(
      `insert into school_grading_scheme (school_id, applies_to, role_scope, grading_scheme_id, updated_at)
       values ($1,'A_LEVEL','principal',$2,now())
       on conflict (school_id, applies_to, role_scope) do update set grading_scheme_id = excluded.grading_scheme_id, updated_at = now()`,
      [SCHOOL_ID, GRADING_SCHEME.A_LEVEL_PRINCIPAL],
    );
    await client.query(
      `insert into school_grading_scheme (school_id, applies_to, role_scope, grading_scheme_id, updated_at)
       values ($1,'A_LEVEL','subsidiary',$2,now())
       on conflict (school_id, applies_to, role_scope) do update set grading_scheme_id = excluded.grading_scheme_id, updated_at = now()`,
      [SCHOOL_ID, GRADING_SCHEME.A_LEVEL_SUBSIDIARY],
    );
    void schemeSelections;

    console.log("4/11 S5/S6 classes + streams...");
    const aLevelClassId: Record<"S5" | "S6", string> = { S5: "", S6: "" };
    const aLevelStreamId: Record<string, string> = {};
    for (const stage of ["S5", "S6"] as const) {
      const { classId, streamId } = await ensureClassWithStreams(
        client,
        SCHOOL_ID,
        ACADEMIC_YEAR_ID,
        STAGE[stage],
        ADMIN_USER_ID,
        ["East", "West"],
      );
      aLevelClassId[stage] = classId;
      for (const [name, id] of Object.entries(streamId)) aLevelStreamId[`${stage}:${name}`] = id;
    }

    console.log("5/11 Topping up O-Level students to 100...");
    const oLevelTargets: { stage: "S1" | "S2" | "S3" | "S4"; stream: "East" | "West"; target: number }[] = [
      { stage: "S1", stream: "East", target: 13 },
      { stage: "S1", stream: "West", target: 12 },
      { stage: "S2", stream: "East", target: 13 },
      { stage: "S2", stream: "West", target: 12 },
      { stage: "S3", stream: "East", target: 13 },
      { stage: "S3", stream: "West", target: 12 },
      { stage: "S4", stream: "East", target: 13 },
      { stage: "S4", stream: "West", target: 12 },
    ];
    let newOLevel = 0;
    let newALevel = 0;

    // studentUserId -> { subjectIds, roleScope map } for exam_result generation
    const oLevelRoster: { userId: string; subjectIds: string[] }[] = [];
    const aLevelRoster: {
      userId: string;
      principalIds: string[];
      subsidiaryIds: string[]; // GP + chosen subsidiary
    }[] = [];

    for (const t of oLevelTargets) {
      const classId = O_LEVEL_CLASS_ID[t.stage];
      const streamId = O_LEVEL_STREAM_ID[`${t.stage}:${t.stream}`];
      const existing = await client.query<{ student_user_id: string }>(
        `select student_user_id from student_enrollment where school_id=$1 and class_id=$2 and stream_id=$3 and status='active'`,
        [SCHOOL_ID, classId, streamId],
      );
      for (const row of existing.rows) {
        oLevelRoster.push({ userId: row.student_user_id, subjectIds: [] });
      }
      const toCreate = Math.max(0, t.target - existing.rowCount);
      const age = 13 + (["S1", "S2", "S3", "S4"].indexOf(t.stage));
      for (let i = 0; i < toCreate; i++) {
        const { first, last, gender } = randomName();
        const systemId = await nextSystemId(client, "S");
        const email = `${systemId.toLowerCase()}@kampalatest.sc.ug`;
        const { rows: userRows } = await client.query<{ id: string }>(
          `insert into users (school_id, system_id, email, password_hash, role) values ($1,$2,$3,$4,'student') returning id`,
          [SCHOOL_ID, systemId, email, passwordHash],
        );
        const userId = userRows[0].id;
        await client.query(
          `insert into students (user_id, first_name, last_name, date_of_birth, gender) values ($1,$2,$3,$4,$5)`,
          [userId, first, last, dobForAge(age), gender],
        );
        await client.query(
          `insert into student_enrollment (student_user_id, school_id, academic_year_id, class_id, stream_id, entry_date, entry_type, status)
           values ($1,$2,$3,$4,$5,'2026-02-01','new_admission','active')`,
          [userId, SCHOOL_ID, ACADEMIC_YEAR_ID, classId, streamId],
        );
        oLevelRoster.push({ userId, subjectIds: [] });
        newOLevel++;
      }
    }

    console.log("6/11 Registering O-Level subjects (8 compulsory + 1 optional)...");
    const oLevelSubjectRows: unknown[][] = [];
    for (const student of oLevelRoster) {
      const subjectIds = O_LEVEL_SUBJECTS.filter((s) => s.compulsory).map((s) => s.id);
      const optional = pick(O_LEVEL_SUBJECTS.filter((s) => !s.compulsory));
      subjectIds.push(optional.id);
      student.subjectIds = subjectIds;
      for (const subjectId of subjectIds) {
        oLevelSubjectRows.push([student.userId, SCHOOL_ID, subjectId, ACADEMIC_YEAR_ID]);
      }
    }
    await batchInsert(
      client,
      "student_subject",
      ["student_user_id", "school_id", "subject_id", "academic_year_id"],
      oLevelSubjectRows,
      "on conflict (student_user_id, subject_id, academic_year_id) do nothing",
    );

    console.log("7/11 Assigning O-Level subject teachers (class-wide)...");
    let assignTeacherCursor = 0;
    const nextAssignTeacher = () => TEACHER_IDS[assignTeacherCursor++ % TEACHER_IDS.length];
    async function ensureTeacherAssignment(subjectId: string, classId: string): Promise<void> {
      const existing = await client.query(
        `select 1 from subject_teacher_assignment
           where school_id=$1 and academic_year_id=$2 and subject_id=$3 and class_id=$4
             and status='active' and is_lead=true`,
        [SCHOOL_ID, ACADEMIC_YEAR_ID, subjectId, classId],
      );
      if (existing.rowCount) return;
      await client.query(
        `insert into subject_teacher_assignment
           (school_id, subject_id, academic_year_id, class_id, stream_id, staff_id, is_lead, status, start_date, assigned_by)
         values ($1,$2,$3,$4,null,$5,true,'active','2026-02-01',$6)`,
        [SCHOOL_ID, subjectId, ACADEMIC_YEAR_ID, classId, nextAssignTeacher(), ADMIN_USER_ID],
      );
    }
    for (const classId of Object.values(O_LEVEL_CLASS_ID)) {
      for (const subject of O_LEVEL_SUBJECTS) {
        await ensureTeacherAssignment(subject.id, classId);
      }
    }

    console.log("8/11 Creating 100 A-Level students + combinations...");
    const aLevelTargets: { stage: "S5" | "S6"; stream: "East" | "West"; target: number }[] = [
      { stage: "S5", stream: "East", target: 25 },
      { stage: "S5", stream: "West", target: 25 },
      { stage: "S6", stream: "East", target: 25 },
      { stage: "S6", stream: "West", target: 25 },
    ];
    const subsidiaryOptions = ["SMath", "ICT"];
    let comboCounter = 0;
    const aLevelSubjectRows: unknown[][] = [];
    const studentCombinationRows: unknown[][] = [];

    for (const t of aLevelTargets) {
      const classId = aLevelClassId[t.stage];
      const streamId = aLevelStreamId[`${t.stage}:${t.stream}`];
      const existing = await client.query<{ student_user_id: string }>(
        `select student_user_id from student_enrollment where school_id=$1 and class_id=$2 and stream_id=$3 and status='active'`,
        [SCHOOL_ID, classId, streamId],
      );
      for (const row of existing.rows) {
        const combo = await client.query<{ subject_id: string; subsidiary_subject_id: string }>(
          `select scs.subject_id, sc.subsidiary_subject_id
             from student_combination sc
             join school_combination_subject scs on scs.school_combination_id = sc.school_combination_id
            where sc.student_user_id = $1 and sc.academic_year_id = $2`,
          [row.student_user_id, ACADEMIC_YEAR_ID],
        );
        if (combo.rows.length) {
          aLevelRoster.push({
            userId: row.student_user_id,
            principalIds: combo.rows.map((r) => r.subject_id),
            subsidiaryIds: [GENERAL_PAPER_ID, combo.rows[0].subsidiary_subject_id],
          });
        }
      }
      const toCreate = Math.max(0, t.target - existing.rowCount);
      const age = t.stage === "S5" ? 17 : 18;
      for (let i = 0; i < toCreate; i++) {
        const { first, last, gender } = randomName();
        const systemId = await nextSystemId(client, "S");
        const email = `${systemId.toLowerCase()}@kampalatest.sc.ug`;
        const { rows: userRows } = await client.query<{ id: string }>(
          `insert into users (school_id, system_id, email, password_hash, role) values ($1,$2,$3,$4,'student') returning id`,
          [SCHOOL_ID, systemId, email, passwordHash],
        );
        const userId = userRows[0].id;
        await client.query(
          `insert into students (user_id, first_name, last_name, date_of_birth, gender) values ($1,$2,$3,$4,$5)`,
          [userId, first, last, dobForAge(age), gender],
        );
        const entryType = t.stage === "S5" ? "re_admission_s5" : "transfer";
        await client.query(
          `insert into student_enrollment (student_user_id, school_id, academic_year_id, class_id, stream_id, entry_date, entry_type, status)
           values ($1,$2,$3,$4,$5,'2026-02-01',$6,'active')`,
          [userId, SCHOOL_ID, ACADEMIC_YEAR_ID, classId, streamId, entryType],
        );

        const combo = combos[comboCounter % combos.length];
        comboCounter++;
        const isScience = combo.code === "PCM" || combo.code === "PCB";
        const subsidiaryChoice = isScience
          ? Math.random() < 0.7 ? "SMath" : "ICT"
          : Math.random() < 0.9 ? "ICT" : "SMath";
        const subsidiarySubjectId = aLevelSubjectId[subsidiaryOptions.includes(subsidiaryChoice) ? subsidiaryChoice : "ICT"];

        studentCombinationRows.push([
          userId,
          SCHOOL_ID,
          schoolCombinationId[combo.code],
          subsidiarySubjectId,
          ACADEMIC_YEAR_ID,
          "confirmed",
          ADMIN_USER_ID,
        ]);

        const principalIds = comboMemberSubjectIds[combo.code];
        const subsidiaryIds = [GENERAL_PAPER_ID, subsidiarySubjectId];
        for (const subjectId of [...principalIds, ...subsidiaryIds]) {
          aLevelSubjectRows.push([userId, SCHOOL_ID, subjectId, ACADEMIC_YEAR_ID]);
        }
        aLevelRoster.push({ userId, principalIds, subsidiaryIds });
        newALevel++;
      }
    }

    await batchInsert(
      client,
      "student_combination",
      [
        "student_user_id",
        "school_id",
        "school_combination_id",
        "subsidiary_subject_id",
        "academic_year_id",
        "status",
        "confirmed_by",
      ],
      studentCombinationRows,
    );
    await batchInsert(
      client,
      "student_subject",
      ["student_user_id", "school_id", "subject_id", "academic_year_id"],
      aLevelSubjectRows,
      "on conflict (student_user_id, subject_id, academic_year_id) do nothing",
    );

    console.log("9/11 Assigning A-Level subject teachers (class-wide)...");
    const allALevelSubjectIds = [...Object.values(aLevelSubjectId), GENERAL_PAPER_ID];
    for (const classId of Object.values(aLevelClassId)) {
      for (const subjectId of allALevelSubjectIds) {
        await ensureTeacherAssignment(subjectId, classId);
      }
    }

    console.log("10/11 Generating exam results for the existing 'End of Term 3 Exams' exam...");
    // A subject just made variant-bearing (Bio/Chem/ICT) may still have old
    // flat rows from before this script tracked variants — the unique
    // constraint is keyed by (..., variant_id), so a flat row (variant_id
    // null) would sit alongside the new per-variant rows instead of being
    // replaced by them. Clear those out first.
    const variantSubjectIds = Object.keys(VARIANT_DEFS).map((short) => aLevelSubjectId[short]);
    await client.query(
      `delete from exam_result where school_exam_id = $1 and subject_id = any($2::uuid[]) and subject_variant_id is null`,
      [SCHOOL_EXAM_ID, variantSubjectIds],
    );
    const examResultRows: unknown[][] = [];
    let teacherCursor = 0;
    const nextTeacher = () => TEACHER_IDS[teacherCursor++ % TEACHER_IDS.length];

    // A-Level subjects go through this instead of a flat push: Bio/Chem/ICT
    // are examined as Theory + Practical, so each gets one exam_result row
    // per variant, graded off their weighted merge — never a single flat
    // score — exactly like publishSchoolExam merges a real submission.
    async function pushALevelResult(
      subjectId: string,
      studentUserId: string,
      ability: number,
      schemeId: string,
      bias: number,
      sd: number,
    ): Promise<void> {
      const shortName = aLevelSubjectIdToShortName.get(subjectId);
      const variantDefs = shortName ? VARIANT_DEFS[shortName] : undefined;
      const isAbsent = Math.random() < 0.03;

      if (!variantDefs) {
        if (isAbsent) {
          examResultRows.push([SCHOOL_EXAM_ID, studentUserId, subjectId, null, null, true, nextTeacher(), null, null]);
          return;
        }
        const score = Math.round(clamp(gauss(ability + bias, sd), 0, 100));
        const grade = await gradeFor(client, schemeId, score);
        examResultRows.push([
          SCHOOL_EXAM_ID, studentUserId, subjectId, null, score, false, nextTeacher(), grade, schemeId,
        ]);
        return;
      }

      if (isAbsent) {
        for (const v of variantDefs) {
          const variantId = aLevelVariantId[shortName!][v.code];
          examResultRows.push([SCHOOL_EXAM_ID, studentUserId, subjectId, variantId, null, true, nextTeacher(), null, null]);
        }
        return;
      }
      const perVariant = variantDefs.map((v) => ({
        variantId: aLevelVariantId[shortName!][v.code],
        pct: v.pct,
        score: Math.round(clamp(gauss(ability + bias, sd), 0, 100)),
      }));
      const merged = perVariant.reduce((sum, v) => sum + (v.score * v.pct) / 100, 0);
      const grade = await gradeFor(client, schemeId, Math.round(merged * 100) / 100);
      const teacher = nextTeacher();
      for (const v of perVariant) {
        examResultRows.push([
          SCHOOL_EXAM_ID, studentUserId, subjectId, v.variantId, v.score, false, teacher, grade, schemeId,
        ]);
      }
    }

    for (const student of oLevelRoster) {
      const ability = clamp(gauss(58, 20), 15, 98);
      for (const subjectId of student.subjectIds) {
        const isAbsent = Math.random() < 0.03;
        if (isAbsent) {
          examResultRows.push([SCHOOL_EXAM_ID, student.userId, subjectId, null, null, true, nextTeacher(), null, null]);
          continue;
        }
        const score = Math.round(clamp(gauss(ability, 9), 0, 100));
        const grade = await gradeFor(client, GRADING_SCHEME.O_LEVEL_ANY, score);
        examResultRows.push([
          SCHOOL_EXAM_ID,
          student.userId,
          subjectId,
          null,
          score,
          false,
          nextTeacher(),
          grade,
          GRADING_SCHEME.O_LEVEL_ANY,
        ]);
      }
    }
    for (const student of aLevelRoster) {
      const ability = clamp(gauss(60, 18), 15, 98);
      for (const subjectId of student.principalIds) {
        await pushALevelResult(subjectId, student.userId, ability, GRADING_SCHEME.A_LEVEL_PRINCIPAL, 0, 9);
      }
      for (const subjectId of student.subsidiaryIds) {
        await pushALevelResult(subjectId, student.userId, ability, GRADING_SCHEME.A_LEVEL_SUBSIDIARY, 5, 12);
      }
    }
    await batchInsert(
      client,
      "exam_result",
      [
        "school_exam_id",
        "student_user_id",
        "subject_id",
        "subject_variant_id",
        "raw_score",
        "is_absent",
        "entered_by",
        "computed_grade",
        "grading_scheme_id",
      ],
      examResultRows,
      "on conflict (school_exam_id, student_user_id, subject_id, coalesce(subject_variant_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing",
    );

    console.log("11/11 Marking subjects as submitted for the exam...");
    // exam_subject_submission: one row per (subject, class) — class-wide, no
    // stream — matching the class-wide subject_teacher_assignment rows above,
    // so the compile board's "submitted" check (which reads off the
    // assignment's own stream scope, always null here) actually finds them.
    // Clears any stale per-stream rows from an earlier version of this script
    // before reinserting, since those never match a class-wide assignment.
    await client.query(`delete from exam_subject_submission where school_exam_id = $1`, [SCHOOL_EXAM_ID]);
    const submissions: { subjectId: string; classId: string }[] = [];
    for (const classId of Object.values(O_LEVEL_CLASS_ID)) {
      for (const s of O_LEVEL_SUBJECTS) submissions.push({ subjectId: s.id, classId });
    }
    for (const classId of Object.values(aLevelClassId)) {
      for (const subjectId of allALevelSubjectIds) submissions.push({ subjectId, classId });
    }
    await batchInsert(
      client,
      "exam_subject_submission",
      ["school_exam_id", "subject_id", "class_id", "submitted_by"],
      submissions.map((s) => [SCHOOL_EXAM_ID, s.subjectId, s.classId, ADMIN_USER_ID]),
      "on conflict (school_exam_id, subject_id, class_id, coalesce(stream_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing",
    );

    await client.query("COMMIT");

    console.log("\nDone.");
    console.log(`  New O-Level students created: ${newOLevel} (total O-Level roster: ${oLevelRoster.length})`);
    console.log(`  New A-Level students created: ${newALevel} (total A-Level roster: ${aLevelRoster.length})`);
    console.log(`  Exam results inserted (attempted, dupes skipped): ${examResultRows.length}`);
    console.log(`  All seeded students share password: ${TEST_PASSWORD}`);
    console.log(`  Login identifiers are each student's system_id (e.g. S260025) or their @kampalatest.sc.ug email.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
