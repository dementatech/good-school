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

const SCHOOL_ID = "c9292216-8bca-4969-93c3-2099d4634728";
const CURRICULUM_ID = "44351568-07e4-421b-8e7a-0072da94518a";
const ACADEMIC_YEAR_ID = "31672260-9755-4dc5-a5f9-321713e72c4e";
const SCHOOL_EXAM_ID = "c04c8c24-1c54-4c5f-ab0e-578a302fe2c1";
const ADMIN_USER_ID = "6f242d57-dffd-4027-ae4e-fd2629fd0b72";
const TEACHER_IDS = [
  "a000a5c1-803a-4039-a254-b789c935c828",
  "95f89867-b597-4a56-94be-13ebf267c563",
  "79f44c03-409f-4cec-9b57-981605e6b792",
  "bf9cdbf3-20b4-420d-a71c-fbb61858e19a",
  "e309d358-13c1-47e9-9564-2f4dd23f1ffa",
  "d9a35c57-6f85-4151-b974-d58584b6e6b7",
];

const STAGE = {
  S1: "1239ef21-2139-4f16-b0d5-f19d593d2ab7",
  S2: "c85351f7-7210-4eef-991c-ca07448391e5",
  S3: "f686ca3c-42e9-496a-b8e9-a0ce485bb2a6",
  S4: "44a7fede-c25c-4256-8e54-afe63c695a12",
  S5: "fb532380-a786-4b9c-8eca-6984a34d19b2",
  S6: "3eb8d64b-3421-4145-a417-8c48a137aa55",
} as const;

const O_LEVEL_CLASS_ID: Record<"S1" | "S2" | "S3" | "S4", string> = {
  S1: "f088d1ba-7b78-412b-ba96-58822790e97b",
  S2: "c4d969c5-1d84-4cfe-97ea-4ad4661677cd",
  S3: "b11587fc-d481-4b3d-b195-df475edacda0",
  S4: "3c5dccb8-e957-4be3-a313-d92afebeeca1",
};
const O_LEVEL_STREAM_ID: Record<string, string> = {
  "S1:East": "1d5fc943-8017-4cb6-beaa-6c5df55def17",
  "S1:West": "85070323-7d3d-4a95-b300-9bd7aa92a034",
  "S2:East": "5b3186e2-6eed-4713-bf90-58b36239da03",
  "S2:West": "d1fe0c25-d7c2-4dca-a682-302000412931",
  "S3:East": "437343cf-be0e-407c-bb82-f46d0f578983",
  "S3:West": "4f85075a-34d9-4062-838c-764cf6632d8a",
  "S4:East": "2475230b-ef26-4b8f-9550-96a06b4663cc",
  "S4:West": "f66c98b0-191f-44c5-96ba-0f8e55b91cdc",
};

// O-Level subject catalog (existing) — code -> {id, compulsory}
const O_LEVEL_SUBJECTS: { id: string; code: string; compulsory: boolean }[] = [
  { id: "0b33b3f1-42fb-45f3-a1e9-9bd336038b5d", code: "Eng", compulsory: true },
  { id: "11431b65-8862-4d5d-82b7-da5b9e0eadfd", code: "Math", compulsory: true },
  { id: "90a71b23-ee08-4b60-a2bd-b0c817f52bbe", code: "CRE", compulsory: false },
  { id: "c1d2208e-4886-49f5-8572-56f561c4cd22", code: "Agric", compulsory: false },
  { id: "bda1cdf9-e71b-489a-a3d1-bd4d1f97f87a", code: "Bio", compulsory: true },
  { id: "a69a2886-2c94-418c-9419-47c7e129f30b", code: "Chem", compulsory: true },
  { id: "dbf92198-9da2-4506-b2c5-b3140608759d", code: "Phy", compulsory: true },
  { id: "db860766-60c4-4fa3-bb9b-b0d583cb5bd0", code: "Hist", compulsory: true },
  { id: "3e646893-874f-420e-8f58-0879fe7a8073", code: "Geo", compulsory: true },
  { id: "0684407c-dd86-431c-b832-461597a612d8", code: "Luganda", compulsory: true },
];
const GENERAL_PAPER_ID = "e56a0fa8-19d6-4a30-98d4-d810b8d3b2bd";

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

const GRADING_SCHEME = {
  O_LEVEL_ANY: "a17ae403-1967-4f8b-b8ab-732e1f987c70",
  A_LEVEL_PRINCIPAL: "d6863bf2-9aed-4a60-8875-4225535191f4",
  A_LEVEL_SUBSIDIARY: "e70e14c2-9ae0-4d69-acf8-7d77462ec616",
} as const;

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

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

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
      const existing = await client.query<{ id: string }>(
        `select id from classes where school_id = $1 and curriculum_stage_id = $2`,
        [SCHOOL_ID, STAGE[stage]],
      );
      let classId: string;
      if (existing.rows[0]) {
        classId = existing.rows[0].id;
      } else {
        const { rows } = await client.query<{ id: string }>(
          `insert into classes (school_id, academic_year_id, curriculum_stage_id, has_streams, is_active, created_by)
           values ($1,$2,$3,true,true,$4) returning id`,
          [SCHOOL_ID, ACADEMIC_YEAR_ID, STAGE[stage], ADMIN_USER_ID],
        );
        classId = rows[0].id;
      }
      aLevelClassId[stage] = classId;
      for (const streamName of ["East", "West"]) {
        const existingStream = await client.query<{ id: string }>(
          `select id from streams where school_id = $1 and class_id = $2 and name = $3`,
          [SCHOOL_ID, classId, streamName],
        );
        if (existingStream.rows[0]) {
          aLevelStreamId[`${stage}:${streamName}`] = existingStream.rows[0].id;
        } else {
          const { rows } = await client.query<{ id: string }>(
            `insert into streams (school_id, class_id, name, is_active, created_by)
             values ($1,$2,$3,true,$4) returning id`,
            [SCHOOL_ID, classId, streamName, ADMIN_USER_ID],
          );
          aLevelStreamId[`${stage}:${streamName}`] = rows[0].id;
        }
      }
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
    const passwordHash = await hashPassword(TEST_PASSWORD);
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
