import "dotenv/config";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { hashPassword } from "../src/modules/auth/index.js";
import { createSchoolSubject } from "../src/modules/academic-structure/domain/subjects.repository.js";
import { pool } from "../src/shared/db/index.js";
import type { SystemIdPrefix } from "../src/shared/system-id.js";
import { standardDay } from "../src/modules/timetable/domain/timetable.repository.js";
import { MATERIALS, METHODS, NURSERY_SUBJECTS, termPlan } from "./demo-data/uganda-primary-curriculum.js";

// Presentation seed: "Mirembe Hill Nursery & Primary School", a large Kampala
// day school running Nursery (Baby/Middle/Top) and Primary (P1–P7) — 1,000
// pupils in streams, ~40 staff, and everything a term of teaching needs:
//
//   - subjects: the national primary offering (English, Mathematics,
//     Integrated Science, Social Studies, Literacy for P1–P3, Luganda, CRE,
//     PE, Creative Arts) and the school's own Nursery subjects
//   - teachers: class teachers for Nursery and P1–P3 (Uganda's thematic,
//     class-teacher-led lower primary), subject specialists for P4–P7
//     (English, Maths, Science, SST, Luganda, CRE, PE & Creative Arts);
//     head teacher, DOS, deputy; every stream has a stream teacher
//   - the current school year, with the term in progress: past terms' End of
//     Term exams and (from week 3) the Beginning of Term exams fully marked
//     and published; a Mid-Term running THIS WEEK with marks entry open and
//     about half the mark sheets in; End of Term scheduled
//   - a clash-free timetable for the current term
//   - schemes of work (NCDC topics), records of work, and this week's lesson
//     plans; daily attendance for the term so far (today left open)
//   - Nursery progress ratings for past terms, parents with a demo parent
//     login, SchoolPay codes, and the year's calendar
//
// The school is permanent — it's used for pitching to clients. Its first run
// creates it; after that the dates go stale, so before a pitch run it with
// --refresh: the school, staff, pupils, parents and logins stay exactly as
// they are, and everything dated is rebuilt around today (the year and term
// dates, exams and marks, attendance, schemes, timetable, lesson plans,
// calendar). Anything dated that was added by hand during a pitch — marks,
// attendance, lesson plans, events — is replaced too.
//
//   npm run seed-demo-primary-school                       # first time
//   npm run seed-demo-primary-school -- --refresh           # before a pitch
//   npm run seed-demo-primary-school -- --refresh --date=2027-03-10   # as if on that day

const SCHOOL_NAME = "Mirembe Hill Nursery & Primary School";
const EMAIL_DOMAIN = "mirembehill.dev";
const ADMIN_EMAIL = `admin@${EMAIL_DOMAIN}`;
const PASSWORD = "TestPass!2026";
const TOTAL_PUPILS = 1000;
const NURSERY_PER_STREAM = 30;

const NURSERY_STAGES = ["BABY", "MIDDLE", "TOP"] as const;
const LOWER_STAGES = ["P1", "P2", "P3"] as const;
const UPPER_STAGES = ["P4", "P5", "P6", "P7"] as const;
const STAGES = [...NURSERY_STAGES, ...LOWER_STAGES, ...UPPER_STAGES];
const NURSERY_STREAMS = ["Red", "Blue"];
const PRIMARY_STREAMS = ["Red", "Blue", "Green"];
const AGE: Record<string, number> = { BABY: 3, MIDDLE: 4, TOP: 5, P1: 6, P2: 7, P3: 8, P4: 9, P5: 10, P6: 11, P7: 12 };

const PRIMARY_SUBJECTS = ["ENG", "MTC", "SCI", "SST", "LIT", "LUG", "CRE", "PE", "CA"];

// A week's lessons per stream, in order (sums to the 40 Primary / 25 Nursery
// lesson periods). P1–P3 are taught entirely by the class teacher.
const WEEK_LOWER: [string, number][] = [["ENG", 7], ["MTC", 7], ["SCI", 5], ["SST", 5], ["LIT", 5], ["LUG", 4], ["CRE", 3], ["PE", 2], ["CA", 2]];
const WEEK_UPPER: [string, number][] = [["MTC", 7], ["ENG", 7], ["SCI", 7], ["SST", 7], ["LUG", 5], ["CRE", 3], ["PE", 2], ["CA", 2]];
const WEEK_NURSERY: [string, number][] = [["LANG", 4], ["NUM", 4], ["READ", 4], ["WRIT", 3], ["SOC", 3], ["HLTH", 2], ["ART", 3], ["MDD", 2]];


// ─── Staff ──────────────────────────────────────────────────────────────────

type Gender = "male" | "female";
interface StaffDef {
  first: string;
  last: string;
  gender: Gender;
  qualification: string;
  /** What they do — drives assignments below. */
  job: string;
}

const Q_ECD = "Certificate in Early Childhood Education";
const Q_G3 = "Grade III Teaching Certificate";
const Q_DPE = "Diploma in Primary Education";
const Q_BED = "Bachelor of Education (Primary)";

const s = (first: string, last: string, gender: Gender, qualification: string, job: string): StaffDef => ({
  first,
  last,
  gender,
  qualification,
  job,
});

const STAFF: StaffDef[] = [
  s("Margaret", "Nankya", "female", "Master of Education (Management)", "head"),
  s("Charles", "Mugerwa", "male", Q_BED, "deputy"),
  // Nursery stream teachers: Baby Red, Baby Blue, Middle Red, Middle Blue, Top Red, Top Blue
  s("Harriet", "Nabukenya", "female", Q_ECD, "nursery"),
  s("Josephine", "Akello", "female", Q_ECD, "nursery"),
  s("Ruth", "Namagembe", "female", Q_ECD, "nursery"),
  s("Dorothy", "Nakimuli", "female", Q_ECD, "nursery"),
  s("Brenda", "Kyomuhendo", "female", Q_ECD, "nursery"),
  s("Irene", "Nalwoga", "female", Q_ECD, "nursery"),
  // Lower primary class teachers: P1 Red … P3 Green
  s("Agnes", "Nansubuga", "female", Q_G3, "lower"),
  s("Florence", "Atim", "female", Q_G3, "lower"),
  s("Juliet", "Nambi", "female", Q_DPE, "lower"),
  s("Christine", "Nakalema", "female", Q_G3, "lower"),
  s("Robert", "Ssekandi", "male", Q_G3, "lower"),
  s("Esther", "Namusoke", "female", Q_DPE, "lower"),
  s("Moses", "Tumwine", "male", Q_DPE, "lower"),
  s("Winnie", "Nalubowa", "female", Q_G3, "lower"),
  s("Lydia", "Achan", "female", Q_G3, "lower"),
  // Upper primary subject teachers
  s("Paul", "Kasozi", "male", Q_BED, "MTC"), // also Director of Studies
  s("Godfrey", "Okot", "male", Q_DPE, "MTC"),
  s("Ivan", "Byamukama", "male", Q_G3, "MTC"),
  s("Sarah", "Nalule", "female", Q_BED, "ENG"),
  s("Joan", "Kemigisha", "female", Q_DPE, "ENG"),
  s("Denis", "Opolot", "male", Q_DPE, "ENG"),
  s("Emmanuel", "Mwesigwa", "male", Q_BED, "SCI"),
  s("Susan", "Nabwire", "female", Q_DPE, "SCI"),
  s("Ronald", "Ochieng", "male", Q_G3, "SCI"),
  s("Patrick", "Ssempijja", "male", Q_BED, "SST"),
  s("Rebecca", "Auma", "female", Q_DPE, "SST"),
  s("Henry", "Wasswa", "male", Q_G3, "SST"),
  s("Grace", "Nakitende", "female", Q_DPE, "CRE"),
  s("Joseph", "Lubega", "male", Q_G3, "CRE"),
  s("Aisha", "Nakato", "female", Q_DPE, "LUG"),
  s("Fred", "Kiwanuka", "male", Q_G3, "LUG"),
  s("Proscovia", "Nanyonga", "female", Q_G3, "LUG"),
  s("Samuel", "Kizito", "male", Q_DPE, "CRE"),
  // PE and Creative Arts (music, art & craft)
  s("Brian", "Mukiibi", "male", Q_DPE, "PECA"),
  s("Peace", "Ainembabazi", "female", Q_G3, "PECA"),
  s("Martha", "Kobusingye", "female", Q_G3, "PECA"),
];

// ─── Pupils ─────────────────────────────────────────────────────────────────

const BOYS = [
  "Ethan", "Jonathan", "Elijah", "Ian", "Mark", "Gideon", "Derrick", "Timothy", "Arnold", "Collins", "Samuel",
  "Jordan", "Nathan", "Trevor", "Aaron", "Brian", "Joel", "Isaac", "Ivan", "Emmanuel", "Joshua", "Daniel", "Allan",
  "Martin", "Edwin", "Hillary", "Jeremiah", "Caleb", "Adrian", "Keith", "Ronald", "Kenneth", "Elvis", "Raymond",
  "Shafik", "Ashraf", "Travis", "Reagan", "Benjamin", "Andrew", "Titus", "Solomon", "Ezra", "Liam", "Noah",
];
const GIRLS = [
  "Mercy", "Precious", "Angel", "Blessing", "Gloria", "Martha", "Tracy", "Hope", "Rebecca", "Shanitah", "Esther",
  "Joy", "Patience", "Favour", "Talia", "Deborah", "Norah", "Annet", "Leila", "Mirembe", "Faith", "Victoria",
  "Sharon", "Pauline", "Daphne", "Ruth", "Maria", "Priscilla", "Charity", "Vanessa", "Shamim", "Hadijah", "Claire",
  "Elizabeth", "Abigail", "Hannah", "Karen", "Janet", "Doreen", "Rachael", "Trinah", "Wendy", "Zawedde", "Nakayiza",
];
const SURNAMES = [
  "Nsubuga", "Okello", "Namutebi", "Achieng", "Katamba", "Nabirye", "Mugisha", "Kironde", "Tumusiime", "Odongo",
  "Adeke", "Kato", "Wasswa", "Birungi", "Ssali", "Namubiru", "Byaruhanga", "Nantongo", "Kyeyune", "Opio",
  "Nalubega", "Mutebi", "Kirabo", "Ochen", "Ssebunya", "Asiimwe", "Kaggwa", "Nakabugo", "Tusiime", "Musoke",
  "Nabatanzi", "Ogwang", "Kawooya", "Namazzi", "Bwambale", "Ahimbisibwe", "Sserwadda", "Nanyanzi", "Ecweru",
  "Kabuye", "Nakiwala", "Matovu", "Atuhaire", "Obbo", "Kyambadde", "Nassali", "Oryem", "Ssemakula", "Nabukeera",
  "Kakooza", "Twinomujuni", "Namukwaya", "Lwanga", "Babirye", "Ssentongo", "Akullo", "Mbabazi", "Kasule",
  "Nalweyiso", "Ojok", "Kagimu", "Nakanwagi", "Lukwago", "Arinaitwe", "Walusimbi", "Namaganda", "Were", "Ssekitoleko",
];
const MOTHERS = ["Grace", "Sarah", "Esther", "Rose", "Juliet", "Prossy", "Betty", "Annet", "Florence", "Irene", "Jane", "Stella", "Harriet", "Resty", "Caroline"];
const FATHERS = ["John", "Joseph", "Peter", "Richard", "Henry", "Charles", "Ronald", "Patrick", "Denis", "Samuel", "Geoffrey", "Moses", "Francis", "Vincent", "David"];

const CLASS_TEACHER_COMMENTS = [
  "A cheerful child who participates actively in class.",
  "Shows great curiosity and loves story time.",
  "Is improving steadily; keep encouraging reading at home.",
  "Works well with friends and shares willingly.",
  "Needs support holding the pencil correctly; practise tracing at home.",
  "Very creative during drawing and music sessions.",
  "Settling in well and becoming more confident.",
];
const HEAD_TEACHER_COMMENTS = ["Good progress. Keep it up.", "A promising learner. Well done.", "Encouraging term. Continue supporting at home."];
const LEARNING_AREAS = [
  "Language & Communication",
  "Reading Readiness",
  "Writing Readiness",
  "Mathematical Concepts",
  "Our Environment",
  "Health Habits",
  "Relating with Others",
  "Creative Arts & Music",
  "Physical Development",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

// Seeded PRNG, so a fresh run on any database gives the same school.
let rngState = 20260924;
function rand(): number {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: readonly T[]): T => arr[randInt(0, arr.length - 1)];
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
function gauss(mean: number, sd: number): number {
  let t = 0;
  for (let i = 0; i < 6; i++) t += rand();
  return mean + (t - 3) * (sd / 0.7071);
}
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const isoDate = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
};
const weekday = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d; // 1 = Monday … 7 = Sunday
};
const minDate = (a: string, b: string) => (a < b ? a : b);
function schoolDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (weekday(d) <= 5) out.push(d);
  return out;
}

/** Multi-row insert in chunks that stay under Postgres's parameter limit. */
async function insertRows(client: PoolClient, table: string, cols: string[], rows: unknown[][], suffix = ""): Promise<void> {
  const size = Math.floor(30000 / cols.length);
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const params: unknown[] = [];
    const values = chunk.map((r) => `(${r.map((v) => (params.push(v), `$${params.length}`)).join(",")})`);
    await client.query(`insert into ${table} (${cols.join(",")}) values ${values.join(",")} ${suffix}`, params);
  }
}

/** Reserves `n` consecutive system IDs in one round trip (same scheme as nextSystemId). */
async function reserveSystemIds(client: PoolClient, prefix: SystemIdPrefix, n: number): Promise<string[]> {
  const { rows } = await client.query<{ next_value: string; yy: string }>(
    `insert into id_sequence (scope, next_value)
       values ($1 || to_char(now() at time zone 'UTC', ':YYYY'), $2)
     on conflict (scope) do update set next_value = id_sequence.next_value + $2
     returning next_value, to_char(now() at time zone 'UTC', 'YY') as yy`,
    [prefix, n],
  );
  const last = Number(rows[0].next_value);
  return Array.from({ length: n }, (_, i) => `${prefix}${rows[0].yy}${String(last - n + 1 + i).padStart(4, "0")}`);
}

async function one<T extends Record<string, unknown>>(client: PoolClient, sql: string, params: unknown[]): Promise<T> {
  const { rows } = await client.query<T>(sql, params);
  return rows[0];
}


const mondayOf = (iso: string) => addDays(iso, 1 - weekday(iso));
const mondayOnOrAfter = (iso: string) => (weekday(iso) === 1 ? iso : addDays(mondayOf(iso), 7));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// ─── The school calendar around "today" ─────────────────────────────────────

interface Term {
  name: string;
  number: number;
  start: string;
  end: string;
  /** The usual last day, before any stretching into the holidays. */
  usualEnd: string;
}

/** Uganda's usual three terms for today's year (Feb–May, May–Aug, Sep–Dec).
 * A pitch can fall in the holidays, so then the nearest term is stretched to
 * take in today — the demo always has a term in progress. */
function calendarFor(today: string): { year: number; terms: Term[]; current: Term } {
  const year = Number(today.slice(0, 4));
  const term = (number: number, from: string, weeks: number): Term => {
    const start = mondayOnOrAfter(from);
    const end = addDays(start, weeks * 7 - 3);
    return { name: `Term ${number}`, number, start, end, usualEnd: end };
  };
  const terms = [term(1, `${year}-02-01`, 13), term(2, `${year}-05-22`, 12), term(3, `${year}-09-01`, 13)];
  if (today < terms[0].start) terms[0].start = mondayOf(today);
  for (let i = 1; i < 3; i++) {
    const prev = terms[i - 1];
    const next = terms[i];
    if (today > prev.end && today < next.start) {
      if (mondayOf(today) > prev.end) next.start = mondayOf(today);
      else prev.end = today;
    }
  }
  if (today > terms[2].end) terms[2].end = addDays(mondayOf(today), 4) < today ? today : addDays(mondayOf(today), 4);
  const current = terms.find((t) => t.start <= today && today <= t.end)!;
  return { year, terms, current };
}

// ─── The school itself (first run only) ─────────────────────────────────────

async function seedSchool(client: PoolClient): Promise<string> {
  const passwordHash = await hashPassword(PASSWORD);

  const curriculumId = (await one<{ id: string }>(client, `select id from curriculum where code = 'UNEB'`, []))?.id;
  if (!curriculumId) throw new Error("UNEB curriculum not found — run migrations first (npm run migrate:up).");
  const { rows: stageRows } = await client.query<{ id: string; code: string }>(
    `select id, code from curriculum_stage where curriculum_id = $1`,
    [curriculumId],
  );
  const stageId = Object.fromEntries(stageRows.map((r) => [r.code, r.id]));
  for (const code of STAGES) if (!stageId[code]) throw new Error(`Stage ${code} missing — run migrations first.`);

  console.log("School, sections and grading...");
  const { id: schoolId } = await one<{ id: string }>(
    client,
    `insert into schools (name, legal_name, onboarding_status, verified_at, district, sub_county, address,
                          ownership_type, registration_status, school_type, gender_composition, phone, email,
                          head_teacher_name, head_teacher_contact, data_import_source,
                          offers_kindergarten, offers_primary, offers_o_level, offers_a_level)
     values ($1, $1, 'active', now(), 'Kampala', 'Rubaga Division', 'Plot 14, Mirembe Hill Road, Kampala',
             'private', 'licensed', 'day', 'mixed', '+256 414 530 210', $2,
             'Mrs. Margaret Nankya', '+256 772 530 210', 'fresh',
             true, true, false, false)
     returning id`,
    [SCHOOL_NAME, `info@${EMAIL_DOMAIN}`],
  );
  await client.query(`insert into school_curriculum (school_id, curriculum_id, is_primary) values ($1, $2, true)`, [schoolId, curriculumId]);
  await client.query(
    `insert into school_grading_scheme (school_id, applies_to, role_scope, grading_scheme_id)
     select $1, applies_to, 'any', id from grading_scheme
      where curriculum_id = $2 and school_id is null
        and ((applies_to = 'PRIMARY' and regime = 'ple_1_9') or (applies_to = 'KINDERGARTEN' and regime = 'nursery_letters'))`,
    [schoolId, curriculumId],
  );
  // Deliberately fake "DEMO-" EMIS numbers, so they never collide with a real
  // school's. Report cards show attendance — the demo has a full register.
  await client.query(
    `insert into school_section (school_id, section, emis_code, assessment_style, show_positions, report_card_fields)
     values ($1, 'KINDERGARTEN', 'DEMO-MHS-NURSERY', 'both', false, '{"attendance": true}'),
            ($1, 'PRIMARY', 'DEMO-MHS-PRIMARY', null, true, '{"attendance": true}')`,
    [schoolId],
  );
  for (const section of ["KINDERGARTEN", "PRIMARY"] as const) {
    await insertRows(
      client,
      "timetable_period",
      ["school_id", "section", "label", "start_time", "end_time", "kind", "sort_order"],
      standardDay(section).map((p, i) => [schoolId, section, p.label, p.startTime, p.endTime, p.kind, i]),
    );
  }

  console.log("Admin and staff...");
  const [adminSid] = await reserveSystemIds(client, "A", 1);
  const { id: adminId } = await one<{ id: string }>(
    client,
    `insert into users (school_id, system_id, email, password_hash, role) values ($1, $2, $3, $4, 'school_admin') returning id`,
    [schoolId, adminSid, ADMIN_EMAIL, passwordHash],
  );
  const staffSids = await reserveSystemIds(client, "T", STAFF.length);
  const staffIds: string[] = [];
  for (const [i, t] of STAFF.entries()) {
    const email = `${t.first}.${t.last}@${EMAIL_DOMAIN}`.toLowerCase();
    const phone = `+256 7${pick(["01", "04", "05", "52", "72", "74", "75", "77", "78"])} ${randInt(100, 999)} ${randInt(100, 999)}`;
    const { id } = await one<{ id: string }>(
      client,
      `insert into users (school_id, system_id, email, phone_number, password_hash, role)
       values ($1, $2, $3, $4, $5, 'teacher') returning id`,
      [schoolId, staffSids[i], email, phone, passwordHash],
    );
    await client.query(
      `insert into staff (user_id, first_name, last_name, gender, qualification, employment_type, employment_basis,
                          category, date_of_birth)
       values ($1, $2, $3, $4, $5, 'private', 'fulltime', $6, $7)`,
      [id, t.first, t.last, t.gender, t.qualification, t.job === "head" ? "administration" : "teaching", `${randInt(1972, 1998)}-${pad(randInt(1, 12))}-${pad(randInt(1, 28))}`],
    );
    staffIds.push(id);
  }
  const staffWith = (job: string) => STAFF.flatMap((t, i) => (t.job === job ? [staffIds[i]] : []));
  const headId = staffWith("head")[0];
  const deputyId = staffWith("deputy")[0];
  const dosId = staffIds[STAFF.findIndex((t) => t.last === "Kasozi")];

  // The year and its terms get their real dates from the timeline step.
  console.log("Academic year...");
  const { id: yearId } = await one<{ id: string }>(
    client,
    `insert into academic_years (school_id, year_name, start_date, end_date, is_current, created_by)
     values ($1, '2026', '2026-02-02', '2026-12-04', true, $2) returning id`,
    [schoolId, adminId],
  );
  for (const n of [1, 2, 3]) {
    await client.query(
      `insert into terms (school_id, academic_year_id, name, term_number, start_date, end_date, created_by)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [schoolId, yearId, `Term ${n}`, n, `2026-0${n * 3}-01`, `2026-0${n * 3}-20`, adminId],
    );
  }
  await insertRows(
    client,
    "staff_assignment",
    ["staff_id", "school_id", "academic_year_id", "role", "entry_date", "entry_type", "status"],
    STAFF.map((t, i) => [staffIds[i], schoolId, yearId, t.job === "head" ? "head_teacher" : t.job === "deputy" ? "deputy" : "teacher", "2026-02-02", "new_hire", "active"]),
  );

  console.log("Leadership positions...");
  const position = async (title: string, parent: string | null, holder: string, academicRoot = false) => {
    const { id } = await one<{ id: string }>(
      client,
      `insert into position (school_id, title, category, parent_position_id, is_unique, is_academic_root)
       values ($1, $2, 'executive', $3, true, $4) returning id`,
      [schoolId, title, parent, academicRoot],
    );
    await client.query(
      `insert into staff_position (staff_id, position_id, academic_year_id, start_date, status) values ($1, $2, $3, '2026-02-02', 'active')`,
      [holder, id, yearId],
    );
    return id;
  };
  const headPos = await position("Head Teacher", null, headId);
  await position("Deputy Head Teacher — Academics / DOS", headPos, dosId, true);
  await position("Deputy Head Teacher — Administration", headPos, deputyId);

  console.log("Classes and streams...");
  const nurseryTeachers = staffWith("nursery");
  const lowerTeachers = staffWith("lower");
  const core = { MTC: staffWith("MTC"), ENG: staffWith("ENG"), SCI: staffWith("SCI"), SST: staffWith("SST") };
  interface NewUnit {
    stage: string;
    classId: string;
    streamId: string;
    streamName: string;
    teacherId: string;
    pupils: string[];
  }
  const units: NewUnit[] = [];
  for (const stage of STAGES) {
    const { id } = await one<{ id: string }>(
      client,
      `insert into classes (school_id, academic_year_id, curriculum_stage_id, has_streams, is_active, created_by)
       values ($1, $2, $3, true, true, $4) returning id`,
      [schoolId, yearId, stageId[stage], adminId],
    );
    const nursery = (NURSERY_STAGES as readonly string[]).includes(stage);
    for (const name of nursery ? NURSERY_STREAMS : PRIMARY_STREAMS) {
      const n = units.length;
      // Nursery and P1–P3: each stream has its own class teacher. P4–P7: a
      // different subject teacher looks after each stream.
      let teacherId: string;
      if (nursery) teacherId = nurseryTeachers[n];
      else if ((LOWER_STAGES as readonly string[]).includes(stage)) teacherId = lowerTeachers[n - 6];
      else {
        const k = n - 15; // 0..11 across P4 Red … P7 Green
        teacherId = [core.MTC, core.ENG, core.SCI, core.SST][k % 4][Math.floor(k / 4)];
      }
      const { id: streamId } = await one<{ id: string }>(
        client,
        `insert into streams (school_id, class_id, name, stream_teacher_id, capacity, created_by)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [schoolId, id, name, teacherId, nursery ? 32 : 42, adminId],
      );
      units.push({ stage, classId: id, streamId, streamName: name, teacherId, pupils: [] });
    }
    const first = units.find((u) => u.classId === id)!;
    await client.query(`update classes set class_teacher_id = $2 where id = $1`, [id, first.teacherId]);
  }

  console.log("1,000 pupils...");
  const isNursery = (u: NewUnit) => (NURSERY_STAGES as readonly string[]).includes(u.stage);
  const primaryUnits = units.filter((u) => !isNursery(u));
  const nurseryUnits = units.filter(isNursery);
  const primaryTotal = TOTAL_PUPILS - nurseryUnits.length * NURSERY_PER_STREAM;
  const sizes = new Map<NewUnit, number>();
  nurseryUnits.forEach((u) => sizes.set(u, NURSERY_PER_STREAM));
  primaryUnits.forEach((u, i) => sizes.set(u, Math.floor(primaryTotal / primaryUnits.length) + (i < primaryTotal % primaryUnits.length ? 1 : 0)));

  // The demo family's children: Top Class Red, P3 Blue and P7 Red.
  const demoKids = new Set([
    `${units.findIndex((u) => u.stage === "TOP" && u.streamName === "Red")}:0`,
    `${units.findIndex((u) => u.stage === "P3" && u.streamName === "Blue")}:0`,
    `${units.findIndex((u) => u.stage === "P7" && u.streamName === "Red")}:0`,
  ]);
  const pupilSids = await reserveSystemIds(client, "S", TOTAL_PUPILS);
  const pupilRows: { sid: string; first: string; last: string; dob: string; gender: Gender; unit: NewUnit }[] = [];
  units.forEach((unit, ui) => {
    for (let k = 0; k < sizes.get(unit)!; k++) {
      const gender: Gender = rand() < 0.5 ? "male" : "female";
      const age = AGE[unit.stage] + (rand() < 0.12 ? 1 : 0);
      pupilRows.push({
        sid: pupilSids[pupilRows.length],
        first: pick(gender === "male" ? BOYS : GIRLS),
        last: demoKids.has(`${ui}:${k}`) ? "Mukasa" : pick(SURNAMES),
        dob: `${2026 - age}-${pad(randInt(1, 12))}-${pad(randInt(1, 28))}`,
        gender,
        unit,
      });
    }
  });
  const { rows: userRows } = await client.query<{ id: string; system_id: string }>(
    `insert into users (school_id, system_id, password_hash, role)
     select $1, sid, $2, 'student' from unnest($3::text[]) as sid
     returning id, system_id`,
    [schoolId, passwordHash, pupilRows.map((p) => p.sid)],
  );
  const userBySid = new Map(userRows.map((r) => [r.system_id, r.id]));
  const pupils = pupilRows.map((p) => ({ ...p, id: userBySid.get(p.sid)! }));
  for (const p of pupils) p.unit.pupils.push(p.id);
  await insertRows(
    client,
    "students",
    ["user_id", "first_name", "last_name", "date_of_birth", "gender"],
    pupils.map((p) => [p.id, p.first, p.last, p.dob, p.gender]),
  );
  await insertRows(
    client,
    "student_enrollment",
    ["student_user_id", "school_id", "academic_year_id", "class_id", "stream_id", "entry_date", "entry_type", "status"],
    pupils.map((p) => [p.id, schoolId, yearId, p.unit.classId, p.unit.streamId, "2026-02-02", "new_admission", "active"]),
  );
  await insertRows(
    client,
    "student_payment_code",
    ["student_user_id", "school_id", "provider", "external_payment_code", "linked_by"],
    pupils.map((p, i) => [p.id, schoolId, "schoolpay", String(1004720000 + i), adminId]),
  );

  console.log("Subjects and teacher assignments...");
  const { rows: catalog } = await client.query<{ id: string; short_name: string }>(
    `select id, short_name from subject
      where curriculum_id = $1 and phase = 'PRIMARY' and school_id is null and status = 'approved'
        and short_name = any($2::text[])`,
    [curriculumId, PRIMARY_SUBJECTS],
  );
  const subjectId: Record<string, string> = Object.fromEntries(catalog.map((r) => [r.short_name, r.id]));
  for (const short of PRIMARY_SUBJECTS) if (!subjectId[short]) throw new Error(`Primary subject ${short} missing from the catalog.`);
  for (const ns of NURSERY_SUBJECTS) {
    await createSchoolSubject(schoolId, { phase: "KINDERGARTEN", name: ns.name, shortName: ns.shortName, category: ns.category }, client);
  }
  const { rows: own } = await client.query<{ id: string; short_name: string }>(
    `select id, short_name from subject where school_id = $1 and phase = 'KINDERGARTEN'`,
    [schoolId],
  );
  own.forEach((r) => (subjectId[r.short_name] = r.id));
  await insertRows(
    client,
    "subject_offering",
    ["school_id", "subject_id", "academic_year_id", "is_offered", "is_compulsory"],
    [...PRIMARY_SUBJECTS, ...NURSERY_SUBJECTS.map((n) => n.shortName)].map((short) => [schoolId, subjectId[short], yearId, true, true]),
  );

  // Who leads each subject in each stream.
  const lead: [NewUnit, string, string][] = [];
  const chunked = (list: NewUnit[], teachers: string[]) => {
    const per = Math.ceil(list.length / teachers.length);
    return (i: number) => teachers[Math.floor(i / per)];
  };
  for (const unit of nurseryUnits) NURSERY_SUBJECTS.forEach((ns) => lead.push([unit, ns.shortName, unit.teacherId]));
  const lowerUnits = primaryUnits.filter((u) => (LOWER_STAGES as readonly string[]).includes(u.stage));
  const upperUnits = primaryUnits.filter((u) => (UPPER_STAGES as readonly string[]).includes(u.stage));
  for (const unit of lowerUnits) WEEK_LOWER.forEach(([short]) => lead.push([unit, short, unit.teacherId]));
  for (const short of ["MTC", "ENG", "SCI", "SST"] as const) {
    const who = chunked(upperUnits, core[short]);
    upperUnits.forEach((unit, i) => lead.push([unit, short, who(i)]));
  }
  // Specialists work with one group of four P4–P7 streams each — the same
  // groups as the core teachers — which is what lets the timetable fit.
  for (const [short, job] of [["LUG", "LUG"], ["CRE", "CRE"], ["PE", "PECA"], ["CA", "PECA"]]) {
    const who = chunked(upperUnits, staffWith(job));
    upperUnits.forEach((unit, i) => lead.push([unit, short, who(i)]));
  }
  await insertRows(
    client,
    "subject_teacher_assignment",
    ["school_id", "subject_id", "academic_year_id", "class_id", "stream_id", "staff_id", "is_lead", "status", "start_date", "assigned_by"],
    lead.map(([unit, short, staffId]) => [schoolId, subjectId[short], yearId, unit.classId, unit.streamId, staffId, true, "active", "2026-02-02", adminId]),
  );
  await insertRows(
    client,
    "staff_subject_specialization",
    ["staff_id", "subject_id"],
    [...new Set(lead.map(([, short, staffId]) => `${staffId}|${subjectId[short]}`))].map((k) => k.split("|")),
  );
  await insertRows(client, "learning_area", ["school_id", "name", "sort_order"], LEARNING_AREAS.map((name, i) => [schoolId, name, i + 1]));

  console.log("Parents...");
  const bySurname = [...pupils].sort((a, b) => a.last.localeCompare(b.last) || a.sid.localeCompare(b.sid));
  const familySizes = [2, 1, 3, 1, 2, 1, 1];
  let family = 0;
  const links: unknown[][] = [];
  for (let i = 0; i < bySurname.length; ) {
    const surname = bySurname[i].last;
    const demo = surname === "Mukasa";
    const size = demo ? 3 : familySizes[family % familySizes.length];
    const kids: string[] = [];
    while (i < bySurname.length && bySurname[i].last === surname && kids.length < size) kids.push(bySurname[i++].id);
    const guardians: { first: string; relationship: string }[] = demo
      ? [{ first: "Sarah", relationship: "Mother" }, { first: "Joseph", relationship: "Father" }]
      : family % 3 === 0
        ? [{ first: pick(MOTHERS), relationship: "Mother" }, { first: pick(FATHERS), relationship: "Father" }]
        : [family % 3 === 1 ? { first: pick(MOTHERS), relationship: "Mother" } : { first: pick(FATHERS), relationship: "Father" }];
    for (const [gi, g] of guardians.entries()) {
      const phone = `+256 7${pick(["01", "04", "05", "52", "72", "74", "75", "77", "78"])} ${pad(family % 1000, 3)} ${randInt(100, 999)}`;
      const { id: guardianId } = await one<{ id: string }>(
        client,
        `insert into guardian (first_name, last_name, phone, relationship_to_student, source) values ($1, $2, $3, $4, 'intake') returning id`,
        [g.first, surname, phone, g.relationship],
      );
      for (const kid of kids) links.push([kid, guardianId, "parent", gi === 0, gi === 0, true]);
      if (demo && gi === 0) {
        const [sid] = await reserveSystemIds(client, "P", 1);
        const { id: userId } = await one<{ id: string }>(
          client,
          `insert into users (school_id, system_id, email, phone_number, password_hash, role)
           values (null, $1, $2, $3, $4, 'parent') returning id`,
          [sid, `parent.demo@${EMAIL_DOMAIN}`, phone, passwordHash],
        );
        await client.query(`update guardian set user_id = $1, email = $2 where id = $3`, [userId, `parent.demo@${EMAIL_DOMAIN}`, guardianId]);
      }
    }
    family++;
  }
  await insertRows(client, "student_guardian", ["student_user_id", "guardian_id", "role", "is_primary_contact", "is_fee_responsible", "is_emergency_contact"], links);

  return schoolId;
}

// ─── The school as it stands (read back for the timeline) ───────────────────

interface Unit {
  stage: string;
  classId: string;
  streamId: string;
  streamName: string;
  teacherId: string;
  pupils: { id: string; ability: number }[];
  /** subject short name → who leads it here */
  leads: Map<string, { subjectId: string; staffId: string }>;
}

interface School {
  id: string;
  adminId: string;
  adminSid: string;
  dosId: string;
  yearId: string;
  yearName: string;
  termIds: Record<number, string>;
  units: Unit[];
  areas: string[];
  periods: Record<"KINDERGARTEN" | "PRIMARY", string[]>;
}

// A pupil's overall level, fixed by who they are — so every refresh gives the
// same learner the same kind of results.
const streamBias: Record<string, number> = { Red: 3, Blue: 0, Green: -2 };
function abilityOf(userId: string, streamName: string): number {
  const saved = rngState;
  rngState = hashOf(userId);
  const a = clamp(gauss(62 + (streamBias[streamName] ?? 0), 13), 22, 96);
  rngState = saved;
  return a;
}

async function loadSchool(client: PoolClient, schoolId: string): Promise<School> {
  const admin = await one<{ id: string; system_id: string }>(client, `select id, system_id from users where school_id = $1 and email = $2`, [schoolId, ADMIN_EMAIL]);
  const dos = await one<{ staff_id: string }>(
    client,
    `select sp.staff_id from staff_position sp join position p on p.id = sp.position_id
      where p.school_id = $1 and p.is_academic_root and sp.status = 'active'`,
    [schoolId],
  );
  const year = await one<{ id: string; year_name: string }>(client, `select id, year_name from academic_years where school_id = $1 and is_current`, [schoolId]);
  const { rows: terms } = await client.query<{ id: string; term_number: number }>(`select id, term_number from terms where academic_year_id = $1`, [year.id]);
  const { rows: streams } = await client.query<{ id: string; class_id: string; code: string; name: string; stream_teacher_id: string }>(
    `select st.id, st.class_id, cs.code, st.name, st.stream_teacher_id
       from streams st join classes c on c.id = st.class_id join curriculum_stage cs on cs.id = c.curriculum_stage_id
      where st.school_id = $1 and c.academic_year_id = $2
      order by cs.sequence_number, array_position(array['Red', 'Blue', 'Green'], st.name)`,
    [schoolId, year.id],
  );
  const { rows: enrolled } = await client.query<{ student_user_id: string; stream_id: string }>(
    `select en.student_user_id, en.stream_id from student_enrollment en join students s on s.user_id = en.student_user_id
      where en.school_id = $1 and en.academic_year_id = $2 and en.status = 'active'
      order by s.last_name, s.first_name`,
    [schoolId, year.id],
  );
  const { rows: leads } = await client.query<{ stream_id: string; short_name: string; subject_id: string; staff_id: string }>(
    `select sta.stream_id, s.short_name, sta.subject_id, sta.staff_id
       from subject_teacher_assignment sta join subject s on s.id = sta.subject_id
      where sta.school_id = $1 and sta.academic_year_id = $2 and sta.status = 'active' and sta.is_lead`,
    [schoolId, year.id],
  );
  const units: Unit[] = streams.map((st) => ({
    stage: st.code,
    classId: st.class_id,
    streamId: st.id,
    streamName: st.name,
    teacherId: st.stream_teacher_id,
    pupils: enrolled.filter((e) => e.stream_id === st.id).map((e) => ({ id: e.student_user_id, ability: abilityOf(e.student_user_id, st.name) })),
    leads: new Map(leads.filter((l) => l.stream_id === st.id).map((l) => [l.short_name, { subjectId: l.subject_id, staffId: l.staff_id }])),
  }));
  const { rows: areas } = await client.query<{ id: string }>(`select id from learning_area where school_id = $1 and is_active order by sort_order`, [schoolId]);
  const periods = { KINDERGARTEN: [] as string[], PRIMARY: [] as string[] };
  for (const section of ["KINDERGARTEN", "PRIMARY"] as const) {
    const { rows } = await client.query<{ id: string }>(
      `select id from timetable_period where school_id = $1 and section = $2 and kind = 'lesson' order by start_time`,
      [schoolId, section],
    );
    periods[section] = rows.map((r) => r.id);
  }
  return {
    id: schoolId,
    adminId: admin.id,
    adminSid: admin.system_id,
    dosId: dos.staff_id,
    yearId: year.id,
    yearName: year.year_name,
    termIds: Object.fromEntries(terms.map((t) => [t.term_number, t.id])),
    units,
    areas: areas.map((a) => a.id),
    periods,
  };
}

// ─── Everything dated, rebuilt around today ─────────────────────────────────

async function seedTimeline(client: PoolClient, school: School, today: string): Promise<void> {
  rngState = hashOf(today);
  const { year, terms, current } = calendarFor(today);
  const termId = (t: Term) => school.termIds[t.number];
  const week = Math.floor(daysBetween(current.start, today) / 7) + 1;
  const termWeeks = Math.ceil((daysBetween(current.start, current.end) + 1) / 7);
  const monday = mondayOf(today) < current.start ? current.start : mondayOf(today);
  const yesterday = addDays(today, -1);
  const isNursery = (u: Unit) => (NURSERY_STAGES as readonly string[]).includes(u.stage);
  console.log(`Calendar: ${year}, ${current.name} (${current.start} to ${current.end}), week ${week}.`);

  // ── Clear what's dated ──
  const sid = school.id;
  await client.query(`delete from lesson_plan where school_id = $1`, [sid]);
  await client.query(`delete from timetable_slot where school_id = $1`, [sid]);
  await client.query(`delete from scheme_of_work where school_id = $1`, [sid]);
  await client.query(`delete from attendance_record where school_id = $1`, [sid]);
  await client.query(`delete from school_exam where school_id = $1`, [sid]);
  await client.query(`delete from developmental_assessment where school_id = $1`, [sid]);
  await client.query(`delete from developmental_remark where school_id = $1`, [sid]);
  await client.query(`delete from school_event where school_id = $1`, [sid]);

  // ── Year, terms, and the dates that hang off them ──
  await client.query(`update academic_years set year_name = $2, start_date = $3, end_date = $4 where id = $1`, [school.yearId, String(year), terms[0].start, terms[2].end]);
  for (const t of terms) {
    await client.query(`update terms set start_date = $2, end_date = $3 where id = $1`, [termId(t), t.start, t.end]);
  }
  const yearShift = year - Number(school.yearName);
  if (yearShift) {
    // Pupils stay in the same classes, so they keep the same ages.
    await client.query(
      `update students set date_of_birth = date_of_birth + make_interval(years => $2)
        where user_id in (select student_user_id from student_enrollment where school_id = $1)`,
      [sid, yearShift],
    );
  }
  await client.query(`update student_enrollment set entry_date = $2 where school_id = $1`, [sid, terms[0].start]);
  await client.query(`update staff_assignment set entry_date = $2 where school_id = $1`, [sid, terms[0].start]);
  await client.query(`update subject_teacher_assignment set start_date = $2 where school_id = $1`, [sid, terms[0].start]);
  await client.query(
    `update staff_position set start_date = $2 where position_id in (select id from position where school_id = $1)`,
    [sid, terms[0].start],
  );

  // ── Exams and marks ──
  console.log("Exams and marks...");
  const session = async (code: string, name: string, description: string) =>
    (
      await one<{ id: string }>(
        client,
        `insert into exam_session (exam_name, exam_code, description, is_active) values ($1, $2, $3, true)
         on conflict (exam_code) do update set updated_at = now() returning id`,
        [name, code, description],
      )
    ).id;
  const bot = await session("BOT", "Beginning of Term Exams", "Beginning of term assessment");
  const mid = await session("MID", "Mid-Term Exams", "Mid-term assessment");
  const eot = await session("EOT", "End of Term Exams", "End of term examinations");
  type Marks = "all" | "some" | "none";
  interface Window {
    starts: string;
    ends: string;
    due: string;
  }
  const exams: ({ session: string; term: Term; name: string; marks: Marks; drift: number } & Window)[] = [];
  // Where exams fall in a term: Beginning of Term in week 1, Mid-Term in week
  // 7, End of Term in the second-last week with marks due mid-way through the last.
  const botOf = (t: Term): Window => ({ starts: addDays(t.start, 1), ends: addDays(t.start, 3), due: addDays(t.start, 9) });
  const midOf = (t: Term): Window => ({ starts: addDays(t.start, 42), ends: addDays(t.start, 44), due: addDays(t.start, 49) });
  const eotOf = (t: Term): Window => ({ starts: addDays(t.usualEnd, -11), ends: addDays(t.usualEnd, -7), due: addDays(t.usualEnd, -2) });
  for (const t of terms.filter((t) => t.number < current.number)) {
    exams.push({ session: eot, term: t, name: `End of ${t.name} Exams`, ...eotOf(t), marks: "all", drift: t.number === 1 ? -3 : 0 });
  }
  // One exam is always live: running this week with marks entry open, about
  // half the mark sheets in, some part-way, the rest waiting — for a live demo.
  const live: Window = { starts: monday, ends: minDate(addDays(monday, 4), today), due: addDays(today, 7) };
  const eotWindow = eotOf(current);
  const add = (session: string, name: string, w: Window, marks: Marks, drift: number) =>
    exams.push({ session, term: current, name, ...w, marks, drift });
  if (week <= 2) {
    add(bot, `Beginning of ${current.name} Exams`, live, "some", -1);
    add(eot, `End of ${current.name} Exams`, eotWindow, "none", 0);
  } else if (today < eotWindow.starts) {
    add(bot, `Beginning of ${current.name} Exams`, botOf(current), "all", -1);
    add(mid, `Mid-Term ${current.number} Exams`, live, "some", 1);
    add(eot, `End of ${current.name} Exams`, eotWindow, "none", 0);
  } else if (today <= eotWindow.due) {
    // End of Term week itself: that's the live one.
    add(bot, `Beginning of ${current.name} Exams`, botOf(current), "all", -1);
    add(mid, `Mid-Term ${current.number} Exams`, midOf(current), "all", 1);
    const ends = minDate(eotWindow.ends, today);
    add(eot, `End of ${current.name} Exams`, { starts: eotWindow.starts, ends, due: addDays(today, 7) }, "some", 0);
  } else {
    // In the holidays after the term: the term's exams are all in, and a
    // holiday revision test is running.
    add(bot, `Beginning of ${current.name} Exams`, botOf(current), "all", -1);
    add(mid, `Mid-Term ${current.number} Exams`, midOf(current), "all", 1);
    add(eot, `End of ${current.name} Exams`, eotWindow, "all", 0);
    add(mid, `${current.name} Holiday Revision Test`, live, "some", 2);
  }
  const subjectBias: Record<string, number> = { MTC: -6, SCI: -2, SST: 1, ENG: 2, LIT: 3, LUG: 4, CRE: 6, PE: 10, CA: 8 };
  let marks = 0;
  for (const exam of exams) {
    const done = exam.marks === "all";
    const { id: examId } = await one<{ id: string }>(
      client,
      `insert into school_exam (school_id, exam_session_id, academic_year_id, term_id, name, starts_on, ends_on,
                                marks_due_on, status, published_at, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
      [sid, exam.session, school.yearId, termId(exam.term), exam.name, exam.starts, exam.ends, exam.due,
       done ? "closed" : "active", done ? `${exam.due}T15:00:00Z` : null, school.adminId],
    );
    await client.query(
      `insert into school_event (school_id, title, event_date, event_type, audience, school_exam_id) values ($1, $2, $3, 'exam', 'all', $4)`,
      [sid, exam.name, exam.starts, examId],
    );
    if (exam.marks === "none") continue;
    const results: unknown[][] = [];
    const submissions: unknown[][] = [];
    for (const unit of school.units) {
      for (const [short, { subjectId, staffId }] of unit.leads) {
        const progress = done ? 1 : rand() < 0.5 ? 1 : rand() < 0.4 ? 0.6 : 0;
        if (progress === 0) continue;
        for (const p of unit.pupils.slice(0, Math.round(unit.pupils.length * progress))) {
          if (rand() < 0.004) {
            results.push([examId, p.id, subjectId, null, true, 100, staffId]);
          } else {
            const score = Math.round(clamp(gauss(p.ability + (subjectBias[short] ?? 3) + exam.drift, 7), 4, 99));
            results.push([examId, p.id, subjectId, score, false, 100, staffId]);
          }
        }
        if (progress === 1) {
          submissions.push([examId, subjectId, unit.classId, unit.streamId, staffId, `${minDate(exam.due, today)}T10:00:00Z`]);
        }
      }
    }
    await insertRows(client, "exam_result", ["school_exam_id", "student_user_id", "subject_id", "raw_score", "is_absent", "max_mark", "entered_by"], results);
    await insertRows(client, "exam_subject_submission", ["school_exam_id", "subject_id", "class_id", "stream_id", "submitted_by", "submitted_at"], submissions);
    marks += results.length;
  }

  // ── Nursery progress ratings for the terms already finished ──
  console.log("Nursery progress ratings...");
  const ratings = ["emerging", "developing", "proficient"];
  const assessments: unknown[][] = [];
  const remarks: unknown[][] = [];
  for (const t of terms.filter((t) => t.number < current.number)) {
    for (const unit of school.units.filter(isNursery)) {
      for (const p of unit.pupils) {
        for (const area of school.areas) {
          const level = clamp(Math.round(gauss((p.ability - 40) / 25 + (t.number - 1) * 0.35, 0.6)), 0, 2);
          assessments.push([sid, p.id, termId(t), area, ratings[level], unit.teacherId]);
        }
        remarks.push([sid, p.id, termId(t), pick(CLASS_TEACHER_COMMENTS), pick(HEAD_TEACHER_COMMENTS), unit.teacherId]);
      }
    }
  }
  await insertRows(client, "developmental_assessment", ["school_id", "student_user_id", "term_id", "learning_area_id", "rating", "recorded_by"], assessments);
  await insertRows(client, "developmental_remark", ["school_id", "student_user_id", "term_id", "class_teacher_comment", "head_teacher_comment", "updated_by"], remarks);

  // ── Attendance: every school day of the term up to yesterday ──
  console.log("Attendance...");
  const attendance: unknown[][] = [];
  const days = schoolDays(current.start, minDate(yesterday, current.end));
  for (const unit of school.units) {
    for (const p of unit.pupils) {
      const frail = rand() < 0.06; // a few pupils miss school often
      for (const day of days) {
        const r = rand();
        const status = r < (frail ? 0.18 : 0.035) ? "absent" : r < (frail ? 0.22 : 0.05) ? "late" : r < (frail ? 0.24 : 0.058) ? "excused" : "present";
        const reason = status === "absent" ? pick(["Sick", "Not communicated", "Family function", null]) : status === "excused" ? "Hospital visit" : null;
        attendance.push([sid, p.id, unit.classId, termId(current), day, status, reason, unit.teacherId]);
      }
    }
  }
  await insertRows(client, "attendance_record", ["school_id", "student_user_id", "class_id", "term_id", "attendance_date", "status", "reason", "recorded_by"], attendance);

  // ── Schemes of work and records of work ──
  console.log("Schemes of work...");
  const weekFriday = (w: number) => addDays(current.start, (w - 1) * 7 + 4);
  const schemeWeekIds = new Map<string, string>(); // `${classId}|${subjectId}` → this week's row
  let schemes = 0;
  for (const stage of STAGES) {
    const firstUnit = school.units.find((u) => u.stage === stage);
    if (!firstUnit) continue;
    const nursery = isNursery(firstUnit);
    for (const [short, { subjectId, staffId }] of firstUnit.leads) {
      const roll = rand();
      const status = roll < 0.72 ? "approved" : roll < 0.87 ? "submitted" : roll < 0.95 ? "returned" : "draft";
      const reviewed = status === "approved" || status === "returned";
      const { id: schemeId } = await one<{ id: string }>(
        client,
        `insert into scheme_of_work (school_id, term_id, class_id, subject_id, teacher_id, status, submitted_at,
                                     reviewed_by, reviewed_at, review_comment)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
        [
          sid, termId(current), firstUnit.classId, subjectId, staffId, status,
          status === "draft" ? null : `${addDays(current.start, -3)}T09:00:00Z`,
          reviewed ? school.dosId : null,
          reviewed ? `${minDate(current.start, today)}T11:00:00Z` : null,
          status === "returned" ? "Please add the competences for weeks 5–8 and list the references." : null,
        ],
      );
      const rows = termPlan(short, stage, termWeeks).map((w) => {
        const past = w.week < week;
        const recorded = status === "approved" && w.week <= week;
        return [
          schemeId, w.week, w.topic, w.subTopic,
          `The learner ${nursery ? "enjoys and takes part in" : "understands and applies"} ${w.subTopic.toLowerCase()}.`,
          METHODS[w.week % METHODS.length],
          MATERIALS[short] ?? "Charts, real objects, crayons and pictures",
          nursery ? "Nursery teacher's guide; learning-area framework" : `NCDC ${stage} syllabus; pupils' textbook`,
          recorded ? (past ? `${w.subTopic} taught as planned.` : `${w.subTopic} — started this week.`) : null,
          recorded ? (past ? (rand() < 0.88 ? "covered" : "partly") : "partly") : null,
          recorded && past && rand() < 0.1 ? "Some learners need remedial work." : null,
          recorded ? `${minDate(weekFriday(w.week), today)}T16:00:00Z` : null,
          recorded && past ? school.dosId : null,
          recorded && past ? `${minDate(addDays(weekFriday(w.week), 3), today)}T09:00:00Z` : null,
        ];
      });
      const { rows: inserted } = await client.query<{ id: string; week_number: number }>(
        `insert into scheme_of_work_week
           (scheme_id, week_number, topic, sub_topic, competences, methods, materials, references_text,
            work_covered, coverage, coverage_remarks, recorded_at, checked_by, checked_at)
         select * from unnest($1::uuid[], $2::int[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[],
                              $9::text[], $10::text[], $11::text[], $12::timestamptz[], $13::uuid[], $14::timestamptz[])
         returning id, week_number`,
        Array.from({ length: 14 }, (_, c) => rows.map((r) => r[c])),
      );
      const now = inserted.find((r) => r.week_number === Math.min(week, termWeeks));
      if (now) schemeWeekIds.set(`${firstUnit.classId}|${subjectId}`, now.id);
      schemes++;
    }
  }

  // ── Timetable ──
  // Built rather than searched for: every stream's week is the same sequence
  // of lessons (WEEK_*), rotated by 10 periods per stream within its group of
  // four, laid out day by day (lesson p is on day p mod 5). A group's streams
  // share teachers only for the same subject, and a subject's lessons sit in
  // one block of at most 10 in the sequence, so the rotation never puts a
  // teacher in two places at once — nor more than two lessons of a subject in
  // a day.
  console.log("Timetable...");
  const slots: { id: string; unit: Unit; day: number; periodId: string; short: string; subjectId: string; staffId: string }[] = [];
  const busy = new Set<string>();
  for (const layer of [["BABY", "MIDDLE", "TOP"], ["P1", "P2", "P3"], ["P4", "P5", "P6", "P7"]]) {
    const nursery = layer[0] === "BABY";
    const periods = school.periods[nursery ? "KINDERGARTEN" : "PRIMARY"];
    const weekPlan = nursery ? WEEK_NURSERY : layer[0] === "P1" ? WEEK_LOWER : WEEK_UPPER;
    const sequence = weekPlan.flatMap(([short, n]) => Array<string>(n).fill(short));
    if (sequence.length !== periods.length * 5) throw new Error(`The ${layer[0]}… week has ${sequence.length} lessons for ${periods.length * 5} periods.`);
    const step = nursery ? 5 : 10;
    school.units
      .filter((u) => layer.includes(u.stage))
      .forEach((unit, i) => {
        const shift = step * (i % 4);
        for (let p = 0; p < sequence.length; p++) {
          const short = sequence[(p - shift + sequence.length) % sequence.length];
          const l = unit.leads.get(short);
          if (!l) throw new Error(`No ${short} teacher for ${unit.stage} ${unit.streamName}.`);
          const day = (p % 5) + 1;
          const periodId = periods[Math.floor(p / 5)];
          const key = `${l.staffId}|${day}|${periodId}`;
          if (busy.has(key)) throw new Error(`Timetable clash for the ${short} teacher in ${unit.stage} ${unit.streamName}.`);
          busy.add(key);
          slots.push({ id: randomUUID(), unit, day, periodId, short, subjectId: l.subjectId, staffId: l.staffId });
        }
      });
  }
  await client.query(
    `insert into timetable_slot (id, school_id, term_id, created_by, class_id, stream_id, day_of_week, period_id, subject_id, staff_id)
     select l.id, $1, $2, $3, l.class_id, l.stream_id, l.day, l.period_id, l.subject_id, l.staff_id
       from unnest($4::uuid[], $5::uuid[], $6::uuid[], $7::int[], $8::uuid[], $9::uuid[], $10::uuid[])
            as l(id, class_id, stream_id, day, period_id, subject_id, staff_id)`,
    [sid, termId(current), school.adminId, slots.map((s) => s.id), slots.map((s) => s.unit.classId), slots.map((s) => s.unit.streamId),
     slots.map((s) => s.day), slots.map((s) => s.periodId), slots.map((s) => s.subjectId), slots.map((s) => s.staffId)],
  );

  // ── This week's lesson plans ──
  console.log("Lesson plans...");
  const { rows: weekRows } = await client.query<{ id: string; topic: string; sub_topic: string }>(
    `select id, topic, sub_topic from scheme_of_work_week where id = any($1::uuid[])`,
    [[...schemeWeekIds.values()]],
  );
  const weekById = new Map(weekRows.map((r) => [r.id, r]));
  const plans = slots.flatMap((sl) => {
    const date = addDays(mondayOf(today), sl.day - 1);
    if (date < current.start || date > current.end) return [];
    const schemeWeekId = schemeWeekIds.get(`${sl.unit.classId}|${sl.subjectId}`) ?? null;
    const w = schemeWeekId ? weekById.get(schemeWeekId) : undefined;
    const topic = w?.topic ?? "Class work";
    const sub = w?.sub_topic ?? topic;
    const status = date < today ? (rand() < 0.85 ? "approved" : "submitted") : date === today ? "submitted" : "draft";
    return [[
      sid, sl.staffId, termId(current), sl.unit.classId, sl.unit.streamId, sl.subjectId, sl.id, schemeWeekId, date,
      topic, sub,
      `By the end of the lesson, learners should be able to: explain ${sub.toLowerCase()}; give examples; complete the class exercise correctly.`,
      MATERIALS[sl.short] ?? "Charts, real objects and crayons",
      `Review of the previous lesson through oral questions, then introduce ${sub.toLowerCase()}.`,
      "Step 1: teacher explanation and demonstration. Step 2: learners work in groups. Step 3: groups present; teacher corrects misconceptions.",
      "Summary on the chalkboard; learners copy notes into their books.",
      "Written exercise of five questions, marked in class.",
      date < today ? pick(["Lesson objectives achieved.", "Most learners grasped the concept; remedial work for a few.", "Lesson went well; learners were active."]) : null,
      status,
      status === "draft" ? null : `${addDays(date, -1)}T17:00:00Z`,
      status === "approved" ? school.dosId : null,
      status === "approved" ? `${date}T07:30:00Z` : null,
    ]];
  });
  await insertRows(
    client,
    "lesson_plan",
    ["school_id", "teacher_id", "term_id", "class_id", "stream_id", "subject_id", "timetable_slot_id", "scheme_week_id",
     "lesson_date", "topic", "sub_topic", "objectives", "materials", "introduction", "development", "conclusion",
     "assessment", "self_evaluation", "status", "submitted_at", "reviewed_by", "reviewed_at"],
    plans,
  );

  // ── The year's calendar ──
  const pleStart = addDays(mondayOnOrAfter(`${year}-11-01`), 1);
  const events: [string, string, string, string, string][] = [
    ["Liberation Day", `${year}-01-26`, "holiday", "all", "Public holiday."],
    ["Archbishop Janani Luwum Day", `${year}-02-16`, "holiday", "all", "Public holiday."],
    ["International Women's Day", `${year}-03-08`, "holiday", "all", "Public holiday."],
    ["Labour Day", `${year}-05-01`, "holiday", "all", "Public holiday."],
    ["Martyrs' Day", `${year}-06-03`, "holiday", "all", "Public holiday."],
    ["Heroes' Day", `${year}-06-09`, "holiday", "all", "Public holiday."],
    ["Independence Day", `${year}-10-09`, "holiday", "all", "Public holiday — no classes."],
    ["PLE — English and Science", pleStart, "exam", "all", "Primary Leaving Examinations begin for P7 candidates."],
    ["PLE — Mathematics and Social Studies", addDays(pleStart, 1), "exam", "all", "Primary Leaving Examinations end."],
    ["Inter-house sports day", addDays(terms[1].start, 47), "other", "all", "At the school playground from 9:00 am. Parents are welcome."],
    ["Speech and prize-giving day", addDays(terms[2].end, -1), "other", "all", "Nursery graduation and prize-giving."],
  ];
  for (const t of terms) {
    events.push([`${t.name} begins`, t.start, "other", "all", "Lessons start at 8:00 am."]);
    events.push([`${t.name} ends`, t.end, "holiday", "all", "Reports are issued."]);
    events.push(["Staff meeting", addDays(t.start, 23), "meeting", "staff", `${t.name} planning and schemes of work review.`]);
    events.push(["Visiting day", addDays(t.start, 27), "other", "parents", "Parents meet class teachers and view pupils' books."]);
  }
  await insertRows(
    client,
    "school_event",
    ["school_id", "title", "event_date", "event_type", "audience", "description", "created_by"],
    events.map(([title, date, type, audience, description]) => [sid, title, date, type, audience, description, school.adminId]),
  );

  console.log(`   ${exams.length} exams (${marks} marks), ${attendance.length} attendance records, ${schemes} schemes of work,`);
  console.log(`   ${slots.length} timetabled lessons, ${plans.length} lesson plans for the week of ${mondayOf(today)}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const refresh = args.includes("--refresh");
  const dateArg = args.find((a) => a.startsWith("--date="))?.slice(7);
  if (dateArg && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) throw new Error("--date must be YYYY-MM-DD.");
  const today = dateArg ?? isoDate(new Date());

  const existing = await pool.query<{ id: string }>(`select id from schools where name = $1`, [SCHOOL_NAME]);
  if (existing.rows[0] && !refresh) {
    console.log(`${SCHOOL_NAME} already exists. To bring its dates up to today, run with --refresh.`);
    return;
  }
  if (!existing.rows[0] && refresh) {
    console.log(`${SCHOOL_NAME} doesn't exist yet — creating it.`);
  }

  const client = await pool.connect();
  let school: School;
  try {
    await client.query("BEGIN");
    const schoolId = existing.rows[0]?.id ?? (await seedSchool(client));
    school = await loadSchool(client, schoolId);
    await seedTimeline(client, school, today);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  console.log("\nDone.");
  console.log(`  School: ${SCHOOL_NAME} (Nursery + Primary)`);
  console.log(`  Password for every account: ${PASSWORD}`);
  console.log(`  School admin:        ${ADMIN_EMAIL} (or ${school.adminSid})`);
  console.log(`  Head teacher:        margaret.nankya@${EMAIL_DOMAIN}`);
  console.log(`  Director of Studies: paul.kasozi@${EMAIL_DOMAIN} (DOS portal at /dos; teaches P4–P5 Maths)`);
  console.log(`  Nursery teacher:     harriet.nabukenya@${EMAIL_DOMAIN} (Baby Class Red)`);
  console.log(`  P1 class teacher:    agnes.nansubuga@${EMAIL_DOMAIN} (P1 Red)`);
  console.log(`  P7 English teacher:  denis.opolot@${EMAIL_DOMAIN}`);
  console.log(`  Demo parent:         parent.demo@${EMAIL_DOMAIN} (Sarah Mukasa — 3 children: Top Class, P3, P7)`);
  console.log(`  Other teachers:      firstname.lastname@${EMAIL_DOMAIN}; pupils log in with their S-number.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
