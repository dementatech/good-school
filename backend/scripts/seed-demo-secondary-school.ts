import "dotenv/config";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { hashPassword } from "../src/modules/auth/index.js";
import { pool } from "../src/shared/db/index.js";
import type { SystemIdPrefix } from "../src/shared/system-id.js";
import { standardDay } from "../src/modules/timetable/domain/timetable.repository.js";
import { MATERIALS, METHODS, bandOf, termPlan } from "./demo-data/uganda-secondary-curriculum.js";

// Presentation seed: "Kasubi Ridge Secondary School", a made-up large Kampala
// day school running O-Level (S1–S4) and A-Level (S5–S6) — 1,000 learners, 50+
// staff, and everything a term of teaching needs:
//
//   - subjects: the O-Level curriculum (compulsory subjects plus electives each
//     learner chooses from) and the A-Level principals, subsidiaries and
//     General Paper, added to the UNEB catalog if they aren't there yet;
//     A-Level sciences and ICT are examined as Theory + Practical papers
//   - O-Level streams East/West/North/South; A-Level has one stream per subject
//     combination, because a stream's timetable holds one lesson per period, so
//     a stream can only follow one set of principals
//   - teachers with subject specialisms, leadership positions, a class teacher
//     for every stream
//   - the current school year, with the term in progress: past exams marked,
//     graded and published; one exam running this week with about half the mark
//     sheets in; End of Term scheduled
//   - a clash-free timetable, schemes of work, records of work, this week's
//     lesson plans, daily attendance for the term so far (today left open)
//   - parents with a demo parent login, SchoolPay codes, the year's calendar
//
// Like the primary demo school it's permanent. The first run creates it; before
// a pitch run with --refresh: people and logins stay, everything dated is
// rebuilt around today, and anything dated added by hand is replaced.
//
//   npm run seed-demo-secondary-school
//   npm run seed-demo-secondary-school -- --refresh
//   npm run seed-demo-secondary-school -- --refresh --date=2027-03-10

const SCHOOL_NAME = "Kasubi Ridge Secondary School";
const EMAIL_DOMAIN = "kasubiridge.dev";
const ADMIN_EMAIL = `admin@${EMAIL_DOMAIN}`;
const PASSWORD = "TestPass!2026";
const TOTAL_LEARNERS = 1000;
const O_LEVEL_LEARNERS = 800;
const DEMO_SURNAME = "Kayongo";

const O_STAGES = ["S1", "S2", "S3", "S4"] as const;
const A_STAGES = ["S5", "S6"] as const;
const STAGES = [...O_STAGES, ...A_STAGES];
const O_STREAMS = ["East", "West", "North", "South"];
const AGE: Record<string, number> = { S1: 13, S2: 14, S3: 15, S4: 16, S5: 17, S6: 18 };
const WEEK_PERIODS = 45;

// ─── Subjects ───────────────────────────────────────────────────────────────

interface SubjectDef {
  short: string;
  name: string;
  category: string;
}
const O_SUBJECTS: SubjectDef[] = [
  { short: "Eng", name: "English Language", category: "core" },
  { short: "Math", name: "Mathematics", category: "core" },
  { short: "Phy", name: "Physics", category: "core" },
  { short: "Chem", name: "Chemistry", category: "core" },
  { short: "Bio", name: "Biology", category: "core" },
  { short: "Hist", name: "History & Political Education", category: "core" },
  { short: "Geo", name: "Geography", category: "core" },
  { short: "Ent", name: "Entrepreneurship", category: "vocational" },
  { short: "PE", name: "Physical Education", category: "special" },
  { short: "CRE", name: "Christian Religious Education", category: "religion" },
  { short: "Kis", name: "Kiswahili", category: "special" },
  { short: "Agric", name: "Agriculture", category: "vocational" },
  { short: "ICT", name: "Information & Communication Technology", category: "vocational" },
  { short: "Art", name: "Art & Design", category: "special" },
  { short: "Lit", name: "Literature in English", category: "special" },
  { short: "Luganda", name: "Luganda", category: "special" },
];
const O_COMPULSORY_EVERYWHERE = ["Eng", "Math", "Phy", "Chem", "Bio", "Hist", "Geo"];
const A_SUBJECTS: SubjectDef[] = [
  { short: "Math", name: "Mathematics", category: "science" },
  { short: "Phy", name: "Physics", category: "science" },
  { short: "Chem", name: "Chemistry", category: "science" },
  { short: "Bio", name: "Biology", category: "science" },
  { short: "Econ", name: "Economics", category: "art" },
  { short: "Hist", name: "History", category: "art" },
  { short: "Geo", name: "Geography", category: "art" },
  { short: "Lit", name: "Literature in English", category: "art" },
  { short: "SMath", name: "Subsidiary Mathematics", category: "subsidiary" },
  { short: "ICT", name: "Subsidiary ICT", category: "subsidiary" },
];
const PAPERS: Record<string, { code: string; name: string; pct: number }[]> = {
  Phy: [{ code: "THEORY", name: "Theory", pct: 70 }, { code: "PRAC", name: "Practical", pct: 30 }],
  Chem: [{ code: "THEORY", name: "Theory", pct: 70 }, { code: "PRAC", name: "Practical", pct: 30 }],
  Bio: [{ code: "THEORY", name: "Theory", pct: 70 }, { code: "PRAC", name: "Practical", pct: 30 }],
  ICT: [{ code: "THEORY", name: "Theory", pct: 60 }, { code: "PRAC", name: "Practical", pct: 40 }],
};

// One A-Level stream per combination, with its learners out of the 200.
const COMBINATIONS: { code: string; principals: string[]; subsidiary: string; description: string; learnersPerClass: number }[] = [
  { code: "PCM", principals: ["Phy", "Chem", "Math"], subsidiary: "ICT", description: "Physics, Chemistry, Mathematics", learnersPerClass: 18 },
  { code: "PCB", principals: ["Phy", "Chem", "Bio"], subsidiary: "SMath", description: "Physics, Chemistry, Biology", learnersPerClass: 18 },
  { code: "BCG", principals: ["Bio", "Chem", "Geo"], subsidiary: "SMath", description: "Biology, Chemistry, Geography", learnersPerClass: 14 },
  { code: "MEG", principals: ["Math", "Econ", "Geo"], subsidiary: "ICT", description: "Mathematics, Economics, Geography", learnersPerClass: 16 },
  { code: "HEG", principals: ["Hist", "Econ", "Geo"], subsidiary: "ICT", description: "History, Economics, Geography", learnersPerClass: 18 },
  { code: "HEL", principals: ["Hist", "Econ", "Lit"], subsidiary: "ICT", description: "History, Economics, Literature", learnersPerClass: 16 },
];

// A week's lessons per stream. Whatever's left of the 45 periods goes to a
// non-teaching activity, which also gives the timetable room to fit.
const WEEK_LOWER: [string, number][] = [["Eng", 5], ["Math", 5], ["Phy", 4], ["Chem", 4], ["Bio", 4], ["Hist", 3], ["Geo", 3], ["Ent", 3], ["PE", 2], ["CRE", 2], ["Kis", 2]];
const WEEK_UPPER: [string, number][] = [["Eng", 6], ["Math", 6], ["Phy", 5], ["Chem", 5], ["Bio", 5], ["Hist", 4], ["Geo", 4]];
const LOWER_ELECTIVE_LESSONS = 2;
const UPPER_ELECTIVE_LESSONS = 3;
const A_PRINCIPAL_LESSONS = 11;
const A_SUBSIDIARY_LESSONS = 5;
const A_GP_LESSONS = 5;

// Each O-Level stream teaches three electives. S1–S2 learners take one of them,
// S3–S4 learners two, so a stream's learners don't all sit the same subjects.
const ELECTIVES_LOWER: Record<string, string[]> = {
  East: ["Agric", "ICT", "Luganda"],
  West: ["ICT", "Art", "Lit"],
  North: ["Agric", "Art", "Luganda"],
  South: ["ICT", "Lit", "Agric"],
};
const ELECTIVES_UPPER: Record<string, string[]> = {
  East: ["CRE", "Ent", "ICT"],
  West: ["Ent", "Agric", "Lit"],
  North: ["CRE", "ICT", "Art"],
  South: ["Ent", "Luganda", "ICT"],
};

/** Which group of teachers takes a subject. */
function jobFor(phase: "O" | "A", short: string): string {
  if (short === "GP" || short === "Lit") return "LIT";
  if (short === "SMath" || short === "Math") return "MATH";
  if (short === "Ent" || short === "Econ") return "ECON";
  const jobs: Record<string, string> = {
    Eng: "ENG", Phy: "PHY", Chem: "CHEM", Bio: "BIO", Hist: "HIST", Geo: "GEO", PE: "PE", CRE: "CRE",
    Kis: "KIS", Agric: "AGRIC", ICT: "ICT", Art: "ART", Luganda: "LUG",
  };
  const job = jobs[short];
  if (!job) throw new Error(`No teachers for ${phase}-Level ${short}.`);
  return job;
}

// ─── Staff ──────────────────────────────────────────────────────────────────

type Gender = "male" | "female";
interface StaffDef {
  first: string;
  last: string;
  gender: Gender;
  qualification: string;
  job: string;
}
const Q_BSC = "Bachelor of Science with Education";
const Q_BA = "Bachelor of Arts with Education";
const Q_DIP = "Diploma in Secondary Education";
const Q_MED = "Master of Education";
const q = (first: string, last: string, gender: Gender, qualification: string, job: string): StaffDef => ({ first, last, gender, qualification, job });

const STAFF: StaffDef[] = [
  q("Beatrice", "Nakayima", "female", `${Q_MED} (Management)`, "head"),
  q("Stephen", "Ogwal", "male", Q_MED, "deputy"),
  q("Vincent", "Kalyango", "male", `${Q_MED} (Mathematics)`, "MATH"), // also Director of Studies
  q("Doreen", "Atuhairwe", "female", Q_BSC, "MATH"),
  q("Julius", "Ssenyonga", "male", Q_BSC, "MATH"),
  q("Alex", "Ocen", "male", Q_BSC, "MATH"),
  q("Phiona", "Namuli", "female", Q_BSC, "MATH"),
  q("Edward", "Kintu", "male", Q_DIP, "MATH"),
  q("Hellen", "Nakazibwe", "female", Q_BA, "ENG"),
  q("Andrew", "Mutyaba", "male", Q_BA, "ENG"),
  q("Carol", "Apio", "female", Q_BA, "ENG"),
  q("Simon", "Ssozi", "male", Q_DIP, "ENG"),
  q("Geoffrey", "Tumukunde", "male", Q_BSC, "PHY"),
  q("Lillian", "Nanteza", "female", Q_BSC, "PHY"),
  q("Micheal", "Ariko", "male", Q_BSC, "PHY"),
  q("Nelson", "Bagonza", "male", Q_BSC, "PHY"),
  q("Rashid", "Ssemanda", "male", Q_DIP, "PHY"),
  q("Immaculate", "Nassozi", "female", Q_BSC, "CHEM"),
  q("Herbert", "Tugume", "male", Q_BSC, "CHEM"),
  q("Sandra", "Ayebare", "female", Q_BSC, "CHEM"),
  q("Dickson", "Odoi", "male", Q_BSC, "CHEM"),
  q("Evelyn", "Nakirya", "female", Q_BSC, "CHEM"),
  q("Tonny", "Sekimpi", "male", Q_DIP, "CHEM"),
  q("Diana", "Namatovu", "female", Q_BSC, "BIO"),
  q("Steven", "Muwonge", "male", Q_BSC, "BIO"),
  q("Harriet", "Alum", "female", Q_BSC, "BIO"),
  q("Ambrose", "Rukundo", "male", Q_BSC, "BIO"),
  q("Sylvia", "Nabaweesi", "female", Q_DIP, "BIO"),
  q("Francis", "Oketcho", "male", Q_BA, "HIST"),
  q("Rose", "Nabukalu", "female", Q_BA, "HIST"),
  q("Isaac", "Bakaluba", "male", Q_BA, "HIST"),
  q("Teddy", "Nakabiri", "female", Q_DIP, "HIST"),
  q("Richard", "Ainomugisha", "male", Q_BA, "GEO"),
  q("Stella", "Kyarimpa", "female", Q_BA, "GEO"),
  q("Peter", "Okwir", "male", Q_BA, "GEO"),
  q("Angela", "Nakyejwe", "female", Q_BA, "GEO"),
  q("Musa", "Kiggundu", "male", Q_DIP, "GEO"),
  q("Vivian", "Kobugabe", "female", Q_BA, "ECON"),
  q("Kenneth", "Lutaaya", "male", "Bachelor of Economics with Education", "ECON"),
  q("Mariam", "Nabunya", "female", Q_BA, "ECON"),
  q("Oscar", "Ebong", "male", Q_DIP, "ECON"),
  q("Catherine", "Namagga", "female", Q_BA, "LIT"),
  q("Timothy", "Rwabwogo", "male", Q_BA, "LIT"),
  q("Gorret", "Nalukwago", "female", Q_BA, "LIT"),
  q("Silver", "Ssebuufu", "male", Q_DIP, "LIT"),
  q("Ronald", "Ojara", "male", "Bachelor of Information Technology", "ICT"),
  q("Priscilla", "Nyakato", "female", "Bachelor of Information Technology", "ICT"),
  q("Hassan", "Kamoga", "male", Q_DIP, "ICT"),
  q("Jane", "Nakibuuka", "female", "Bachelor of Divinity", "CRE"),
  q("Lawrence", "Otim", "male", Q_DIP, "CRE"),
  q("Abdul", "Mwanje", "male", Q_DIP, "PE"),
  q("Zainab", "Nakandi", "female", Q_BA, "KIS"),
  q("Emma", "Tibenderana", "male", "Bachelor of Agriculture with Education", "AGRIC"),
  q("Sharifah", "Nabatta", "female", "Bachelor of Industrial Art", "ART"),
  q("Mathias", "Sserunjogi", "male", Q_BA, "LUG"),
];

// ─── Learners ───────────────────────────────────────────────────────────────

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

// ─── Who teaches what ───────────────────────────────────────────────────────

interface StreamPlan {
  stage: string;
  phase: "O" | "A";
  name: string;
  size: number;
  /** subject short name → lessons a week */
  week: Map<string, number>;
  electives: string[];
  combination?: (typeof COMBINATIONS)[number];
}

function streamPlans(): StreamPlan[] {
  const plans: StreamPlan[] = [];
  for (const stage of O_STAGES) {
    const lower = bandOf(stage) === "LOWER";
    for (const name of O_STREAMS) {
      const electives = (lower ? ELECTIVES_LOWER : ELECTIVES_UPPER)[name];
      const week = new Map(lower ? WEEK_LOWER : WEEK_UPPER);
      for (const e of electives) week.set(e, lower ? LOWER_ELECTIVE_LESSONS : UPPER_ELECTIVE_LESSONS);
      plans.push({ stage, phase: "O", name, size: O_LEVEL_LEARNERS / (O_STAGES.length * O_STREAMS.length), week, electives });
    }
  }
  for (const stage of A_STAGES) {
    for (const combination of COMBINATIONS) {
      const week = new Map<string, number>(combination.principals.map((p) => [p, A_PRINCIPAL_LESSONS]));
      week.set(combination.subsidiary, A_SUBSIDIARY_LESSONS);
      week.set("GP", A_GP_LESSONS);
      plans.push({ stage, phase: "A", name: combination.code, size: combination.learnersPerClass, week, electives: [], combination });
    }
  }
  const total = plans.reduce((n, p) => n + p.size, 0);
  if (total !== TOTAL_LEARNERS) throw new Error(`The streams add up to ${total} learners, not ${TOTAL_LEARNERS}.`);
  for (const p of plans) {
    const lessons = [...p.week.values()].reduce((a, b) => a + b, 0);
    if (lessons > WEEK_PERIODS) throw new Error(`${p.stage} ${p.name} has ${lessons} lessons for ${WEEK_PERIODS} periods.`);
  }
  return plans;
}

/** Shares each subject's streams among its teachers, lightest load first. */
function assignTeachers(plans: StreamPlan[]): Map<StreamPlan, Map<string, number>> {
  const load = STAFF.map(() => 0);
  const out = new Map(plans.map((p) => [p, new Map<string, number>()]));
  const demand = plans
    .flatMap((plan) => [...plan.week].map(([short, lessons]) => ({ plan, short, lessons })))
    .sort((a, b) => b.lessons - a.lessons);
  for (const { plan, short, lessons } of demand) {
    const job = jobFor(plan.phase, short);
    const pool = STAFF.flatMap((t, i) => (t.job === job ? [i] : []));
    if (pool.length === 0) throw new Error(`No ${job} teachers.`);
    const teacher = pool.reduce((best, i) => (load[i] < load[best] ? i : best));
    load[teacher] += lessons;
    out.get(plan)!.set(short, teacher);
  }
  const heaviest = Math.max(...load);
  if (heaviest > 32) throw new Error(`A ${STAFF[load.indexOf(heaviest)].job} teacher has ${heaviest} lessons a week — add a teacher.`);
  return out;
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
     values ($1, $1, 'active', now(), 'Kampala', 'Rubaga Division', 'Plot 8, Kasubi Ridge Road, Kampala',
             'private', 'licensed', 'day', 'mixed', '+256 414 671 300', $2,
             'Mrs. Beatrice Nakayima', '+256 772 671 300', 'fresh',
             false, false, true, true)
     returning id`,
    [SCHOOL_NAME, `info@${EMAIL_DOMAIN}`],
  );
  await client.query(`insert into school_curriculum (school_id, curriculum_id, is_primary) values ($1, $2, true)`, [schoolId, curriculumId]);
  await client.query(
    `insert into school_grading_scheme (school_id, applies_to, role_scope, grading_scheme_id)
     select $1, g.applies_to, g.scope, gs.id
       from (values ('O_LEVEL', 'any', 'NLSC O-Level'),
                    ('A_LEVEL', 'principal', 'NLSC A-Level (Principal)'),
                    ('A_LEVEL', 'subsidiary', 'NLSC A-Level (Subsidiary)')) as g(applies_to, scope, name)
       join grading_scheme gs on gs.name = g.name and gs.curriculum_id = $2 and gs.school_id is null`,
    [schoolId, curriculumId],
  );
  // A deliberately fake "DEMO-" EMIS number, so it never collides with a real school's.
  await client.query(
    `insert into school_section (school_id, section, emis_code, assessment_style, show_positions, report_card_fields)
     values ($1, 'SECONDARY', 'DEMO-KRS-SECONDARY', null, true, '{"attendance": true}')`,
    [schoolId],
  );
  await insertRows(
    client,
    "timetable_period",
    ["school_id", "section", "label", "start_time", "end_time", "kind", "sort_order"],
    standardDay("SECONDARY").map((p, i) => [schoolId, "SECONDARY", p.label, p.startTime, p.endTime, p.kind, i]),
  );

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
      [id, t.first, t.last, t.gender, t.qualification, t.job === "head" ? "administration" : "teaching", `${randInt(1970, 1998)}-${pad(randInt(1, 12))}-${pad(randInt(1, 28))}`],
    );
    staffIds.push(id);
  }
  const headId = staffIds[STAFF.findIndex((t) => t.job === "head")];
  const deputyId = staffIds[STAFF.findIndex((t) => t.job === "deputy")];
  const dosId = staffIds[STAFF.findIndex((t) => t.last === "Kalyango")];

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

  console.log("Subjects...");
  const subjectIds = await ensureSubjects(client, curriculumId, stageId);
  const idOf = (plan: StreamPlan, short: string) => subjectIds[plan.phase][short];
  await insertRows(
    client,
    "subject_offering",
    ["school_id", "subject_id", "academic_year_id", "is_offered", "is_compulsory"],
    [
      ...O_SUBJECTS.map((s) => [schoolId, subjectIds.O[s.short], yearId, true, O_COMPULSORY_EVERYWHERE.includes(s.short)]),
      ...A_SUBJECTS.map((s) => [schoolId, subjectIds.A[s.short], yearId, true, false]),
      [schoolId, subjectIds.A.GP, yearId, true, true],
    ],
  );

  console.log("Combinations...");
  const combinationId: Record<string, string> = {};
  for (const combo of COMBINATIONS) {
    const { id: catalogId } = await one<{ id: string }>(
      client,
      `insert into subject_combination (curriculum_id, code, description, is_active) values ($1, $2, $3, true)
       on conflict (curriculum_id, code) do update set updated_at = now() returning id`,
      [curriculumId, combo.code, combo.description],
    );
    await client.query(
      `insert into combination_subject (combination_id, subject_id, role, sort_order)
       select $1, m.subject_id, m.role, m.sort_order
         from unnest($2::uuid[], $3::text[], $4::int[]) as m(subject_id, role, sort_order)
       on conflict do nothing`,
      [
        catalogId,
        [...combo.principals.map((p) => subjectIds.A[p]), subjectIds.A[combo.subsidiary]],
        [...combo.principals.map(() => "principal"), "subsidiary"],
        [0, 1, 2, 3],
      ],
    );
    const { id } = await one<{ id: string }>(
      client,
      `insert into school_combination (school_id, academic_year_id, catalog_combination_id, code, description, is_offered)
       values ($1, $2, $3, $4, $5, true) returning id`,
      [schoolId, yearId, catalogId, combo.code, combo.description],
    );
    combinationId[combo.code] = id;
    await insertRows(
      client,
      "school_combination_subject",
      ["school_combination_id", "subject_id", "role", "sort_order"],
      [...combo.principals.map((p, i) => [id, subjectIds.A[p], "principal", i]), [id, subjectIds.A[combo.subsidiary], "subsidiary", 3]],
    );
  }

  console.log("Classes and streams...");
  const plans = streamPlans();
  const teachers = assignTeachers(plans);
  // A class teacher teaches the stream they look after, and has only the one.
  const classTeacher = new Map<StreamPlan, string>();
  const taken = new Set<number>();
  for (const plan of plans) {
    const options = [...teachers.get(plan)!.values()];
    const free = options.find((t) => !taken.has(t));
    const chosen = free ?? options[0];
    taken.add(chosen);
    classTeacher.set(plan, staffIds[chosen]);
  }
  const streamIds = new Map<StreamPlan, { classId: string; streamId: string }>();
  for (const stage of STAGES) {
    const { id: classId } = await one<{ id: string }>(
      client,
      `insert into classes (school_id, academic_year_id, curriculum_stage_id, has_streams, is_active, created_by)
       values ($1, $2, $3, true, true, $4) returning id`,
      [schoolId, yearId, stageId[stage], adminId],
    );
    const inClass = plans.filter((p) => p.stage === stage);
    for (const plan of inClass) {
      const { id: streamId } = await one<{ id: string }>(
        client,
        `insert into streams (school_id, class_id, name, stream_teacher_id, capacity, created_by)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [schoolId, classId, plan.name, classTeacher.get(plan), plan.size + 5, adminId],
      );
      streamIds.set(plan, { classId, streamId });
    }
    await client.query(`update classes set class_teacher_id = $2 where id = $1`, [classId, classTeacher.get(inClass[0])]);
  }
  await insertRows(
    client,
    "subject_teacher_assignment",
    ["school_id", "subject_id", "academic_year_id", "class_id", "stream_id", "staff_id", "is_lead", "status", "start_date", "assigned_by"],
    plans.flatMap((plan) =>
      [...teachers.get(plan)!].map(([short, teacher]) => {
        const where = streamIds.get(plan)!;
        return [schoolId, idOf(plan, short), yearId, where.classId, where.streamId, staffIds[teacher], true, "active", "2026-02-02", adminId];
      }),
    ),
  );
  await insertRows(
    client,
    "staff_subject_specialization",
    ["staff_id", "subject_id"],
    [...new Set(plans.flatMap((plan) => [...teachers.get(plan)!].map(([short, teacher]) => `${staffIds[teacher]}|${idOf(plan, short)}`)))].map((k) => k.split("|")),
  );

  console.log("1,000 learners...");
  // The demo family's children: S1 East, S3 West and S6 PCM.
  const demoStreams = [
    plans.find((p) => p.stage === "S1" && p.name === "East")!,
    plans.find((p) => p.stage === "S3" && p.name === "West")!,
    plans.find((p) => p.stage === "S6" && p.name === "PCM")!,
  ];
  const sids = await reserveSystemIds(client, "S", TOTAL_LEARNERS);
  const learners: { sid: string; first: string; last: string; dob: string; gender: Gender; plan: StreamPlan }[] = [];
  for (const plan of plans) {
    for (let k = 0; k < plan.size; k++) {
      const gender: Gender = rand() < 0.5 ? "male" : "female";
      const age = AGE[plan.stage] + (rand() < 0.15 ? 1 : 0);
      learners.push({
        sid: sids[learners.length],
        first: pick(gender === "male" ? BOYS : GIRLS),
        last: k === 0 && demoStreams.includes(plan) ? DEMO_SURNAME : pick(SURNAMES),
        dob: `${2026 - age}-${pad(randInt(1, 12))}-${pad(randInt(1, 28))}`,
        gender,
        plan,
      });
    }
  }
  const { rows: userRows } = await client.query<{ id: string; system_id: string }>(
    `insert into users (school_id, system_id, password_hash, role)
     select $1, sid, $2, 'student' from unnest($3::text[]) as sid
     returning id, system_id`,
    [schoolId, passwordHash, learners.map((l) => l.sid)],
  );
  const userBySid = new Map(userRows.map((r) => [r.system_id, r.id]));
  const withIds = learners.map((l) => ({ ...l, id: userBySid.get(l.sid)! }));
  await insertRows(
    client,
    "students",
    ["user_id", "first_name", "last_name", "date_of_birth", "gender"],
    withIds.map((l) => [l.id, l.first, l.last, l.dob, l.gender]),
  );
  await insertRows(
    client,
    "student_enrollment",
    ["student_user_id", "school_id", "academic_year_id", "class_id", "stream_id", "entry_date", "entry_type", "status"],
    withIds.map((l) => {
      const where = streamIds.get(l.plan)!;
      return [l.id, schoolId, yearId, where.classId, where.streamId, "2026-02-02", l.plan.stage === "S5" ? "re_admission_s5" : "new_admission", "active"];
    }),
  );
  await insertRows(
    client,
    "student_payment_code",
    ["student_user_id", "school_id", "provider", "external_payment_code", "linked_by"],
    withIds.map((l, i) => [l.id, schoolId, "schoolpay", String(1006710000 + i), adminId]),
  );

  // What each learner takes: their stream's subjects, less the electives they
  // didn't choose. O-Level: S1–S2 one elective, S3–S4 two.
  const registrations: unknown[][] = [];
  const placements: unknown[][] = [];
  for (const l of withIds) {
    let shorts = [...l.plan.week.keys()];
    if (l.plan.electives.length > 0) {
      const keep = bandOf(l.plan.stage) === "LOWER" ? 1 : 2;
      const start = randInt(0, l.plan.electives.length - 1);
      const chosen = Array.from({ length: keep }, (_, i) => l.plan.electives[(start + i) % l.plan.electives.length]);
      shorts = shorts.filter((s) => !l.plan.electives.includes(s) || chosen.includes(s));
    }
    for (const short of shorts) registrations.push([l.id, schoolId, idOf(l.plan, short), yearId]);
    const combo = l.plan.combination;
    if (combo) placements.push([l.id, schoolId, combinationId[combo.code], subjectIds.A[combo.subsidiary], yearId, "confirmed", adminId]);
  }
  await insertRows(client, "student_subject", ["student_user_id", "school_id", "subject_id", "academic_year_id"], registrations);
  await insertRows(
    client,
    "student_combination",
    ["student_user_id", "school_id", "school_combination_id", "subsidiary_subject_id", "academic_year_id", "status", "confirmed_by"],
    placements,
  );

  console.log("Parents...");
  const bySurname = [...withIds].sort((a, b) => a.last.localeCompare(b.last) || a.sid.localeCompare(b.sid));
  const familySizes = [2, 1, 3, 1, 2, 1, 1];
  let family = 0;
  const links: unknown[][] = [];
  for (let i = 0; i < bySurname.length; ) {
    const surname = bySurname[i].last;
    const demo = surname === DEMO_SURNAME;
    const size = demo ? 3 : familySizes[family % familySizes.length];
    const kids: string[] = [];
    while (i < bySurname.length && bySurname[i].last === surname && kids.length < size) kids.push(bySurname[i++].id);
    const guardians: { first: string; relationship: string }[] = demo
      ? [{ first: "Agatha", relationship: "Mother" }, { first: "Robert", relationship: "Father" }]
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

/** Finds each subject in the shared UNEB catalog, adding what's missing. Papers
 * are only added to a subject this run creates, so a subject another school
 * already marks as one flat score stays that way. */
async function ensureSubjects(
  client: PoolClient,
  curriculumId: string,
  stageId: Record<string, string>,
): Promise<{ O: Record<string, string>; A: Record<string, string> }> {
  const ensure = async (phase: "O_LEVEL" | "A_LEVEL", defs: SubjectDef[], stages: readonly string[]) => {
    const prefix = phase === "O_LEVEL" ? "O" : "S";
    const { rows: existing } = await client.query<{ id: string; short_name: string; code: string }>(
      `select id, short_name, code from subject where curriculum_id = $1 and phase = $2 and school_id is null`,
      [curriculumId, phase],
    );
    const ids: Record<string, string> = Object.fromEntries(existing.map((r) => [r.short_name, r.id]));
    let next = existing.reduce((max, r) => Math.max(max, Number(r.code.slice(1)) || 0), 0) + 1;
    for (const def of defs) {
      if (!ids[def.short]) {
        const { id } = await one<{ id: string }>(
          client,
          `insert into subject (curriculum_id, phase, code, short_name, name, category, status)
           values ($1, $2, $3, $4, $5, $6, 'approved') returning id`,
          [curriculumId, phase, `${prefix}${String(next++).padStart(3, "0")}`, def.short, def.name, def.category],
        );
        ids[def.short] = id;
        const papers = phase === "A_LEVEL" ? PAPERS[def.short] : undefined;
        if (papers) {
          await client.query(`update subject set has_variant = true where id = $1`, [id]);
          await insertRows(
            client,
            "subject_variant",
            ["subject_id", "name", "code", "contribution_percent"],
            papers.map((p) => [id, p.name, p.code, p.pct]),
          );
        }
      }
      await insertRows(
        client,
        "subject_stage",
        ["subject_id", "curriculum_stage_id"],
        stages.map((s) => [ids[def.short], stageId[s]]),
        "on conflict do nothing",
      );
    }
    return ids;
  };
  const O = await ensure("O_LEVEL", O_SUBJECTS, O_STAGES);
  const A = await ensure("A_LEVEL", A_SUBJECTS, A_STAGES);
  if (!A.GP) throw new Error("General Paper missing from the catalog — run migrations first.");
  await insertRows(client, "subject_stage", ["subject_id", "curriculum_stage_id"], A_STAGES.map((s) => [A.GP, stageId[s]]), "on conflict do nothing");
  return { O, A };
}

// ─── The school as it stands (read back for the timeline) ───────────────────

interface Learner {
  id: string;
  ability: number;
  subjects: Set<string>;
}
interface Lead {
  subjectId: string;
  staffId: string;
  category: string;
  variants: { id: string; pct: number }[];
}
interface Unit {
  stage: string;
  classId: string;
  streamId: string;
  streamName: string;
  teacherId: string;
  learners: Learner[];
  /** subject short name → who leads it here */
  leads: Map<string, Lead>;
}
interface Band {
  label: string;
  min: number;
  max: number;
}
interface Scheme {
  id: string;
  bands: Band[];
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
  periods: string[];
  schemes: { O: Scheme; principal: Scheme; subsidiary: Scheme };
}

// A learner's overall level, fixed by who they are — so every refresh gives the
// same learner the same kind of results.
const STREAM_BIAS: Record<string, number> = { East: 2, West: 0, North: -1, South: -2, PCM: 5, PCB: 4, BCG: 1, MEG: 3, HEG: 0, HEL: 1 };
function abilityOf(userId: string, streamName: string): number {
  const saved = rngState;
  rngState = hashOf(userId);
  const a = clamp(gauss(61 + (STREAM_BIAS[streamName] ?? 0), 13), 24, 96);
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
      order by cs.sequence_number, st.created_at`,
    [schoolId, year.id],
  );
  const { rows: enrolled } = await client.query<{ student_user_id: string; stream_id: string }>(
    `select en.student_user_id, en.stream_id from student_enrollment en join students s on s.user_id = en.student_user_id
      where en.school_id = $1 and en.academic_year_id = $2 and en.status = 'active'
      order by s.last_name, s.first_name`,
    [schoolId, year.id],
  );
  const { rows: registered } = await client.query<{ student_user_id: string; subject_id: string }>(
    `select student_user_id, subject_id from student_subject where school_id = $1 and academic_year_id = $2 and status in ('active', 'added')`,
    [schoolId, year.id],
  );
  const subjectsOf = new Map<string, Set<string>>();
  for (const r of registered) {
    if (!subjectsOf.has(r.student_user_id)) subjectsOf.set(r.student_user_id, new Set());
    subjectsOf.get(r.student_user_id)!.add(r.subject_id);
  }
  const { rows: leads } = await client.query<{ stream_id: string; short_name: string; subject_id: string; staff_id: string; category: string }>(
    `select sta.stream_id, s.short_name, sta.subject_id, sta.staff_id, s.category
       from subject_teacher_assignment sta join subject s on s.id = sta.subject_id
      where sta.school_id = $1 and sta.academic_year_id = $2 and sta.status = 'active' and sta.is_lead`,
    [schoolId, year.id],
  );
  const { rows: variantRows } = await client.query<{ id: string; subject_id: string; contribution_percent: string }>(
    `select id, subject_id, contribution_percent from subject_variant where subject_id = any($1::uuid[])`,
    [[...new Set(leads.map((l) => l.subject_id))]],
  );
  const units: Unit[] = streams.map((st) => ({
    stage: st.code,
    classId: st.class_id,
    streamId: st.id,
    streamName: st.name,
    teacherId: st.stream_teacher_id,
    learners: enrolled
      .filter((e) => e.stream_id === st.id)
      .map((e) => ({ id: e.student_user_id, ability: abilityOf(e.student_user_id, st.name), subjects: subjectsOf.get(e.student_user_id) ?? new Set<string>() })),
    leads: new Map(
      leads
        .filter((l) => l.stream_id === st.id)
        .map((l) => [
          l.short_name,
          {
            subjectId: l.subject_id,
            staffId: l.staff_id,
            category: l.category,
            variants: variantRows.filter((v) => v.subject_id === l.subject_id).map((v) => ({ id: v.id, pct: Number(v.contribution_percent) })),
          },
        ]),
    ),
  }));
  const { rows: periodRows } = await client.query<{ id: string }>(
    `select id from timetable_period where school_id = $1 and section = 'SECONDARY' and kind = 'lesson' order by start_time`,
    [schoolId],
  );
  const scheme = async (appliesTo: string, roleScope: string): Promise<Scheme> => {
    const { grading_scheme_id: id } = await one<{ grading_scheme_id: string }>(
      client,
      `select grading_scheme_id from school_grading_scheme where school_id = $1 and applies_to = $2 and role_scope = $3`,
      [schoolId, appliesTo, roleScope],
    );
    const { rows } = await client.query<{ label: string; min_pct: string; max_pct: string }>(
      `select label, min_pct, max_pct from grade_band where grading_scheme_id = $1`,
      [id],
    );
    return { id, bands: rows.map((b) => ({ label: b.label, min: Number(b.min_pct), max: Number(b.max_pct) })) };
  };
  return {
    id: schoolId,
    adminId: admin.id,
    adminSid: admin.system_id,
    dosId: dos.staff_id,
    yearId: year.id,
    yearName: year.year_name,
    termIds: Object.fromEntries(terms.map((t) => [t.term_number, t.id])),
    units,
    periods: periodRows.map((r) => r.id),
    schemes: { O: await scheme("O_LEVEL", "any"), principal: await scheme("A_LEVEL", "principal"), subsidiary: await scheme("A_LEVEL", "subsidiary") },
  };
}

// ─── Timetable ──────────────────────────────────────────────────────────────

interface Placed {
  day: number;
  period: number;
  short: string;
}

/** Places every stream's week: no teacher in two places, no stream double-booked,
 * a subject spread over the week. Greedy, busiest teachers first; when a lesson
 * has nowhere to go it moves another lesson out of the way, and a failed attempt
 * starts again with a different shuffle. */
function buildTimetable(units: Unit[], plans: Map<Unit, Map<string, number>>, periodCount: number): Map<Unit, Placed[]> {
  const load = new Map<string, number>();
  for (const unit of units) {
    for (const [short, n] of plans.get(unit)!) {
      const staffId = unit.leads.get(short)!.staffId;
      load.set(staffId, (load.get(staffId) ?? 0) + n);
    }
  }
  for (let attempt = 0; attempt < 200; attempt++) {
    const busy = new Set<string>();
    const grids = new Map<Unit, (string | null)[][]>(
      units.map((u) => [u, Array.from({ length: 5 }, () => Array<string | null>(periodCount).fill(null))]),
    );
    const key = (staffId: string, day: number, period: number) => `${staffId}|${day}|${period}`;
    const onDay = (unit: Unit, short: string, day: number) => grids.get(unit)![day].filter((s) => s === short).length;
    const cap = (unit: Unit, short: string) => Math.max(2, Math.ceil(plans.get(unit)!.get(short)! / 5));
    const put = (unit: Unit, short: string, day: number, period: number) => {
      grids.get(unit)![day][period] = short;
      busy.add(key(unit.leads.get(short)!.staffId, day, period));
    };
    const lift = (unit: Unit, short: string, day: number, period: number) => {
      grids.get(unit)![day][period] = null;
      busy.delete(key(unit.leads.get(short)!.staffId, day, period));
    };
    const canGo = (unit: Unit, short: string, day: number, period: number) =>
      !busy.has(key(unit.leads.get(short)!.staffId, day, period)) && onDay(unit, short, day) < cap(unit, short);

    const jobs = units
      .flatMap((unit) => [...plans.get(unit)!].map(([short, n]) => ({ unit, short, n, order: rand() })))
      .sort((a, b) => load.get(b.unit.leads.get(b.short)!.staffId)! - load.get(a.unit.leads.get(a.short)!.staffId)! || b.n - a.n || a.order - b.order);

    let failed = false;
    outer: for (const { unit, short, n } of jobs) {
      const grid = grids.get(unit)!;
      for (let placed = 0; placed < n; placed++) {
        const options: { day: number; period: number; score: number }[] = [];
        for (let day = 0; day < 5; day++) {
          for (let period = 0; period < periodCount; period++) {
            if (grid[day][period] === null && canGo(unit, short, day, period)) {
              options.push({ day, period, score: onDay(unit, short, day) * 10 + period * 0.2 + rand() * 3 });
            }
          }
        }
        if (options.length > 0) {
          const best = options.reduce((a, b) => (b.score < a.score ? b : a));
          put(unit, short, best.day, best.period);
          continue;
        }
        // Move a lesson from a slot this one could use to an empty slot of its own.
        let moved = false;
        search: for (let day = 0; day < 5; day++) {
          for (let period = 0; period < periodCount; period++) {
            const other = grid[day][period];
            if (other === null || other === short || !canGo(unit, short, day, period)) continue;
            for (let d2 = 0; d2 < 5; d2++) {
              for (let p2 = 0; p2 < periodCount; p2++) {
                if (grid[d2][p2] !== null) continue;
                lift(unit, other, day, period);
                if (canGo(unit, other, d2, p2)) {
                  put(unit, other, d2, p2);
                  put(unit, short, day, period);
                  moved = true;
                  break search;
                }
                put(unit, other, day, period);
              }
            }
          }
        }
        if (!moved) {
          failed = true;
          break outer;
        }
      }
    }
    if (failed) continue;
    return new Map(
      units.map((unit) => [
        unit,
        grids.get(unit)!.flatMap((row, day) => row.flatMap((short, period) => (short ? [{ day: day + 1, period, short }] : []))),
      ]),
    );
  }
  throw new Error("Couldn't fit the timetable after 200 attempts.");
}

/** How many lessons a stream's subject gets, rebuilt from who's assigned to it. */
function weekFor(unit: Unit): Map<string, number> {
  const band = bandOf(unit.stage);
  if (band === "A") {
    return new Map(
      [...unit.leads].map(([short, lead]) => [
        short,
        short === "GP" ? A_GP_LESSONS : lead.category === "subsidiary" ? A_SUBSIDIARY_LESSONS : A_PRINCIPAL_LESSONS,
      ]),
    );
  }
  const base = new Map(band === "LOWER" ? WEEK_LOWER : WEEK_UPPER);
  const elective = band === "LOWER" ? LOWER_ELECTIVE_LESSONS : UPPER_ELECTIVE_LESSONS;
  return new Map([...unit.leads.keys()].map((short) => [short, base.get(short) ?? elective]));
}

// ─── Everything dated, rebuilt around today ─────────────────────────────────

const SUBJECT_BIAS: Record<string, number> = { Math: -6, Phy: -5, Chem: -4, Bio: -1, SMath: -2, Eng: 2, Hist: 1, Geo: 2, Econ: 0, Lit: 3, Ent: 5, CRE: 6, PE: 9, Art: 6, Agric: 4, ICT: 5, Kis: 3, Luganda: 6, GP: 2 };
const gradeOf = (score: number, scheme: Scheme) => scheme.bands.find((b) => score >= b.min && score <= b.max)?.label ?? null;

async function seedTimeline(client: PoolClient, school: School, today: string): Promise<void> {
  rngState = hashOf(today);
  const { year, terms, current } = calendarFor(today);
  const termId = (t: Term) => school.termIds[t.number];
  const week = Math.floor(daysBetween(current.start, today) / 7) + 1;
  const termWeeks = Math.ceil((daysBetween(current.start, current.end) + 1) / 7);
  const monday = mondayOf(today) < current.start ? current.start : mondayOf(today);
  const yesterday = addDays(today, -1);
  console.log(`Calendar: ${year}, ${current.name} (${current.start} to ${current.end}), week ${week}.`);

  // ── Clear what's dated ──
  const sid = school.id;
  await client.query(`delete from lesson_plan where school_id = $1`, [sid]);
  await client.query(`delete from timetable_slot where school_id = $1`, [sid]);
  await client.query(`delete from scheme_of_work where school_id = $1`, [sid]);
  await client.query(`delete from attendance_record where school_id = $1`, [sid]);
  await client.query(`delete from school_exam where school_id = $1`, [sid]);
  await client.query(`delete from school_event where school_id = $1`, [sid]);

  // ── Year, terms, and the dates that hang off them ──
  await client.query(`update academic_years set year_name = $2, start_date = $3, end_date = $4 where id = $1`, [school.yearId, String(year), terms[0].start, terms[2].end]);
  for (const t of terms) {
    await client.query(`update terms set start_date = $2, end_date = $3 where id = $1`, [termId(t), t.start, t.end]);
  }
  const yearShift = year - Number(school.yearName);
  if (yearShift) {
    // Learners stay in the same classes, so they keep the same ages.
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
    add(bot, `Beginning of ${current.name} Exams`, botOf(current), "all", -1);
    add(mid, `Mid-Term ${current.number} Exams`, midOf(current), "all", 1);
    const ends = minDate(eotWindow.ends, today);
    add(eot, `End of ${current.name} Exams`, { starts: eotWindow.starts, ends, due: addDays(today, 7) }, "some", 0);
  } else {
    add(bot, `Beginning of ${current.name} Exams`, botOf(current), "all", -1);
    add(mid, `Mid-Term ${current.number} Exams`, midOf(current), "all", 1);
    add(eot, `End of ${current.name} Exams`, eotWindow, "all", 0);
    add(mid, `${current.name} Holiday Revision Test`, live, "some", 2);
  }
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
      const aLevel = bandOf(unit.stage) === "A";
      for (const [short, lead] of unit.leads) {
        const progress = done ? 1 : rand() < 0.5 ? 1 : rand() < 0.4 ? 0.6 : 0;
        if (progress === 0) continue;
        const takers = unit.learners.filter((l) => l.subjects.has(lead.subjectId));
        const scheme = !aLevel ? school.schemes.O : lead.category === "subsidiary" ? school.schemes.subsidiary : school.schemes.principal;
        for (const l of takers.slice(0, Math.round(takers.length * progress))) {
          const row = (variantId: string | null, score: number | null, grade: string | null) =>
            results.push([examId, l.id, lead.subjectId, variantId, score, score === null, 100, lead.staffId, grade, grade ? scheme.id : null]);
          const paper = () => Math.round(clamp(gauss(l.ability + (SUBJECT_BIAS[short] ?? 3) + exam.drift, 7), 4, 99));
          const absent = rand() < 0.006;
          if (lead.variants.length === 0) {
            const score = absent ? null : paper();
            row(null, score, done && score !== null ? gradeOf(score, scheme) : null);
          } else {
            // Papers are entered separately and graded as one subject, on the
            // same weighting publishSchoolExam uses.
            const scores = lead.variants.map((v) => ({ v, score: absent ? null : paper() }));
            const merged = absent ? null : Math.round(scores.reduce((sum, s) => sum + (s.score! * s.v.pct) / 100, 0) * 100) / 100;
            const grade = done && merged !== null ? gradeOf(merged, scheme) : null;
            for (const s of scores) row(s.v.id, s.score, grade);
          }
        }
        if (progress === 1) {
          submissions.push([examId, lead.subjectId, unit.classId, unit.streamId, lead.staffId, `${minDate(exam.due, today)}T10:00:00Z`]);
        }
      }
    }
    await insertRows(
      client,
      "exam_result",
      ["school_exam_id", "student_user_id", "subject_id", "subject_variant_id", "raw_score", "is_absent", "max_mark", "entered_by", "computed_grade", "grading_scheme_id"],
      results,
    );
    await insertRows(client, "exam_subject_submission", ["school_exam_id", "subject_id", "class_id", "stream_id", "submitted_by", "submitted_at"], submissions);
    marks += results.length;
  }

  // ── Attendance: every school day of the term up to yesterday ──
  console.log("Attendance...");
  const attendance: unknown[][] = [];
  const days = schoolDays(current.start, minDate(yesterday, current.end));
  for (const unit of school.units) {
    for (const l of unit.learners) {
      const frail = rand() < 0.06; // a few learners miss school often
      for (const day of days) {
        const r = rand();
        const status = r < (frail ? 0.18 : 0.035) ? "absent" : r < (frail ? 0.22 : 0.05) ? "late" : r < (frail ? 0.24 : 0.058) ? "excused" : "present";
        const reason = status === "absent" ? pick(["Sick", "Not communicated", "Family function", "School fees", null]) : status === "excused" ? "Hospital visit" : null;
        attendance.push([sid, l.id, unit.classId, termId(current), day, status, reason, unit.teacherId]);
      }
    }
  }
  await insertRows(client, "attendance_record", ["school_id", "student_user_id", "class_id", "term_id", "attendance_date", "status", "reason", "recorded_by"], attendance);

  // ── Schemes of work and records of work (one per class and subject) ──
  console.log("Schemes of work...");
  const weekFriday = (w: number) => addDays(current.start, (w - 1) * 7 + 4);
  const schemeWeekIds = new Map<string, string>(); // `${classId}|${subjectId}` → this week's row
  let schemes = 0;
  for (const stage of STAGES) {
    const inClass = school.units.filter((u) => u.stage === stage);
    const seen = new Set<string>();
    for (const unit of inClass) {
      for (const [short, { subjectId, staffId }] of unit.leads) {
        if (seen.has(subjectId)) continue;
        seen.add(subjectId);
        const roll = rand();
        const status = roll < 0.72 ? "approved" : roll < 0.87 ? "submitted" : roll < 0.95 ? "returned" : "draft";
        const reviewed = status === "approved" || status === "returned";
        const { id: schemeId } = await one<{ id: string }>(
          client,
          `insert into scheme_of_work (school_id, term_id, class_id, subject_id, teacher_id, status, submitted_at,
                                       reviewed_by, reviewed_at, review_comment)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
          [
            sid, termId(current), unit.classId, subjectId, staffId, status,
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
            `The learner understands and applies ${w.subTopic.toLowerCase()}.`,
            METHODS[w.week % METHODS.length],
            MATERIALS[short] ?? "Charts, textbooks and worksheets",
            bandOf(stage) === "A" ? `UACE ${short} syllabus; recommended textbooks` : `NCDC ${stage} curriculum; learners' textbook`,
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
        if (now) schemeWeekIds.set(`${unit.classId}|${subjectId}`, now.id);
        schemes++;
      }
    }
  }

  // ── Timetable ──
  console.log("Timetable...");
  const weeks = new Map(school.units.map((u) => [u, weekFor(u)]));
  const placed = buildTimetable(school.units, weeks, school.periods.length);
  const slots: { id: string; unit: Unit; day: number; periodId: string; short: string; subjectId: string; staffId: string }[] = [];
  const activities: unknown[][] = [];
  for (const unit of school.units) {
    const lessons = placed.get(unit)!;
    const taken = new Set(lessons.map((p) => `${p.day}|${p.period}`));
    for (const p of lessons) {
      const l = unit.leads.get(p.short)!;
      slots.push({ id: randomUUID(), unit, day: p.day, periodId: school.periods[p.period], short: p.short, subjectId: l.subjectId, staffId: l.staffId });
    }
    // Whatever's left of the week isn't taught.
    for (let day = 1; day <= 5; day++) {
      for (let period = 0; period < school.periods.length; period++) {
        if (taken.has(`${day}|${period}`)) continue;
        const activity = bandOf(unit.stage) === "A" ? "Private study" : "Clubs & games";
        activities.push([sid, termId(current), unit.classId, unit.streamId, day, school.periods[period], activity, school.adminId]);
      }
    }
  }
  await client.query(
    `insert into timetable_slot (id, school_id, term_id, created_by, class_id, stream_id, day_of_week, period_id, subject_id, staff_id)
     select l.id, $1, $2, $3, l.class_id, l.stream_id, l.day, l.period_id, l.subject_id, l.staff_id
       from unnest($4::uuid[], $5::uuid[], $6::uuid[], $7::int[], $8::uuid[], $9::uuid[], $10::uuid[])
            as l(id, class_id, stream_id, day, period_id, subject_id, staff_id)`,
    [sid, termId(current), school.adminId, slots.map((s) => s.id), slots.map((s) => s.unit.classId), slots.map((s) => s.unit.streamId),
     slots.map((s) => s.day), slots.map((s) => s.periodId), slots.map((s) => s.subjectId), slots.map((s) => s.staffId)],
  );
  await insertRows(client, "timetable_slot", ["school_id", "term_id", "class_id", "stream_id", "day_of_week", "period_id", "activity", "created_by"], activities);

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
      `By the end of the lesson, learners should be able to: explain ${sub.toLowerCase()}; apply it to a new problem; complete the class exercise correctly.`,
      MATERIALS[sl.short] ?? "Charts, textbooks and worksheets",
      `Review of the previous lesson through oral questions, then introduce ${sub.toLowerCase()}.`,
      "Step 1: teacher explanation and worked examples. Step 2: learners work in groups. Step 3: groups present; teacher corrects misconceptions.",
      "Summary on the chalkboard; learners make notes in their books.",
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
  const uneb = addDays(mondayOnOrAfter(`${year}-10-12`), 0);
  const events: [string, string, string, string, string][] = [
    ["Liberation Day", `${year}-01-26`, "holiday", "all", "Public holiday."],
    ["Archbishop Janani Luwum Day", `${year}-02-16`, "holiday", "all", "Public holiday."],
    ["International Women's Day", `${year}-03-08`, "holiday", "all", "Public holiday."],
    ["Labour Day", `${year}-05-01`, "holiday", "all", "Public holiday."],
    ["Martyrs' Day", `${year}-06-03`, "holiday", "all", "Public holiday."],
    ["Heroes' Day", `${year}-06-09`, "holiday", "all", "Public holiday."],
    ["Independence Day", `${year}-10-09`, "holiday", "all", "Public holiday — no classes."],
    ["UCE and UACE begin", uneb, "exam", "all", "UNEB national examinations begin for S4 and S6 candidates."],
    ["S6 career guidance day", addDays(terms[1].start, 33), "other", "students", "University and career talks for S5 and S6."],
    ["Inter-house sports day", addDays(terms[1].start, 47), "other", "all", "At the school playground from 9:00 am. Parents are welcome."],
    ["Speech and prize-giving day", addDays(terms[2].end, -1), "other", "all", "Prizes for the year's best learners."],
  ];
  for (const t of terms) {
    events.push([`${t.name} begins`, t.start, "other", "all", "Lessons start at 8:00 am."]);
    events.push([`${t.name} ends`, t.end, "holiday", "all", "Reports are issued."]);
    events.push(["Staff meeting", addDays(t.start, 23), "meeting", "staff", `${t.name} planning and schemes of work review.`]);
    events.push(["Visiting day", addDays(t.start, 27), "other", "parents", "Parents meet class teachers and view learners' books."]);
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
  console.log(`  School: ${SCHOOL_NAME} (O-Level + A-Level)`);
  console.log(`  Password for every account: ${PASSWORD}`);
  console.log(`  School admin:        ${ADMIN_EMAIL} (or ${school.adminSid})`);
  console.log(`  Head teacher:        beatrice.nakayima@${EMAIL_DOMAIN}`);
  console.log(`  Director of Studies: vincent.kalyango@${EMAIL_DOMAIN} (DOS portal at /dos; teaches Mathematics)`);
  console.log(`  English teacher:     hellen.nakazibwe@${EMAIL_DOMAIN}`);
  console.log(`  Chemistry teacher:   immaculate.nassozi@${EMAIL_DOMAIN}`);
  console.log(`  Demo parent:         parent.demo@${EMAIL_DOMAIN} (Agatha ${DEMO_SURNAME} — 3 children: S1, S3, S6)`);
  console.log(`  Other teachers:      firstname.lastname@${EMAIL_DOMAIN}; learners log in with their S-number.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
