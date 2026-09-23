import "dotenv/config";
import type { PoolClient } from "pg";
import { hashPassword } from "../src/modules/auth/index.js";
import { pool } from "../src/shared/db/index.js";
import { nextSystemId } from "../src/shared/system-id.js";
import { standardDay, type PeriodInput } from "../src/modules/timetable/domain/timetable.repository.js";

// Demo seed for a Kindergarten + Primary school ("Kampala Junior School"):
// Baby/Middle/Top Class and P1–P7 with pupils, the primary subject offering
// and teacher assignments, a fully-marked Mid-Term exam (so the report card
// shows PLE aggregates and divisions), and Term 2 + Term 3 developmental
// assessments for every kindergarten pupil.
//
// Idempotent: safe to re-run. Everything is find-or-create by natural key;
// pupils are topped up to the target per class, never duplicated.

const SCHOOL_NAME = "Kampala Junior School";
const ADMIN_EMAIL = "admin@kampalajunior.dev";
const PASSWORD = "TestPass!2026";
const EMAIL_DOMAIN = "kampalajunior.dev";

const KINDERGARTEN_PUPILS_PER_CLASS = 14;
const PRIMARY_PUPILS_PER_CLASS = 22;

// Class teachers, in class order: Baby, Middle, Top, P1 … P7.
const TEACHER_DEFS: { first: string; last: string; gender: "male" | "female" }[] = [
  { first: "Harriet", last: "Nabukenya", gender: "female" },
  { first: "Josephine", last: "Akello", gender: "female" },
  { first: "Ruth", last: "Namagembe", gender: "female" },
  { first: "Agnes", last: "Nansubuga", gender: "female" },
  { first: "Florence", last: "Atim", gender: "female" },
  { first: "Robert", last: "Ssekandi", gender: "male" },
  { first: "Moses", last: "Tumwine", gender: "male" },
  { first: "Christine", last: "Nakalema", gender: "female" },
  { first: "Godfrey", last: "Okot", gender: "male" },
  { first: "Paul", last: "Kasozi", gender: "male" },
];

const STAGE_ORDER = ["BABY", "MIDDLE", "TOP", "P1", "P2", "P3", "P4", "P5", "P6", "P7"] as const;
const KINDERGARTEN_STAGES = new Set(["BABY", "MIDDLE", "TOP"]);

const FIRST_NAMES_M = [
  "Ethan", "Jonathan", "Elijah", "Ian", "Mark", "Gideon", "Derrick", "Timothy", "Arnold", "Collins",
  "Samuel", "Jordan", "Nathan", "Trevor", "Aaron", "Brian", "Joel", "Isaac", "Ivan", "Emmanuel",
];
const FIRST_NAMES_F = [
  "Mercy", "Precious", "Angel", "Blessing", "Gloria", "Martha", "Tracy", "Hope", "Rebecca", "Shanitah",
  "Esther", "Joy", "Patience", "Favour", "Talia", "Deborah", "Norah", "Annet", "Leila", "Mirembe",
];
const LAST_NAMES = [
  "Nsubuga", "Okello", "Namutebi", "Achieng", "Katamba", "Nabirye", "Mugisha", "Akello", "Kironde",
  "Tumusiime", "Nakato", "Odongo", "Adeke", "Kato", "Auma", "Wasswa", "Birungi", "Ssali", "Namubiru",
  "Byaruhanga", "Nantongo", "Kyeyune", "Opio", "Nalubega", "Mutebi", "Kirabo", "Lubega", "Ochieng",
];

const CLASS_TEACHER_COMMENTS = [
  "A cheerful child who participates actively in class.",
  "Shows great curiosity and loves story time.",
  "Is improving steadily; keep encouraging reading at home.",
  "Works well with friends and shares willingly.",
  "Needs support holding the pencil correctly; practice tracing at home.",
  "Very creative during drawing and music sessions.",
  "Settling in well and becoming more confident.",
];
const HEAD_TEACHER_COMMENTS = [
  "Good progress. Keep it up.",
  "A promising learner. Well done.",
  "Encouraging term. Continue supporting at home.",
];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function gauss(mean: number, sd: number): number {
  let s = 0;
  for (let i = 0; i < 6; i++) s += Math.random();
  return mean + (s - 3) * (sd / 1.5);
}
function dobForAge(age: number): string {
  return `${2026 - age}-${String(randInt(1, 12)).padStart(2, "0")}-${String(randInt(1, 28)).padStart(2, "0")}`;
}

async function findOrCreate(client: PoolClient, findSql: string, findParams: unknown[], insertSql: string, insertParams: unknown[]): Promise<string> {
  const found = await client.query<{ id: string }>(findSql, findParams);
  if (found.rows[0]) return found.rows[0].id;
  const { rows } = await client.query<{ id: string }>(insertSql, insertParams);
  return rows[0].id;
}

async function ensureUser(
  client: PoolClient,
  schoolId: string,
  email: string,
  role: "school_admin" | "teacher" | "student",
  passwordHash: string,
): Promise<{ id: string; created: boolean }> {
  const existing = await client.query<{ id: string }>(`select id from users where school_id = $1 and email = $2`, [
    schoolId,
    email,
  ]);
  if (existing.rows[0]) return { id: existing.rows[0].id, created: false };
  const prefix = role === "school_admin" ? "A" : role === "teacher" ? "T" : "S";
  const systemId = await nextSystemId(client, prefix);
  const { rows } = await client.query<{ id: string }>(
    `insert into users (school_id, system_id, email, password_hash, role) values ($1,$2,$3,$4,$5) returning id`,
    [schoolId, systemId, email, passwordHash, role],
  );
  return { id: rows[0].id, created: true };
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const passwordHash = await hashPassword(PASSWORD);

    const { rows: curRows } = await client.query<{ id: string }>(`select id from curriculum where code = 'UNEB'`);
    if (!curRows[0]) throw new Error("UNEB curriculum not found — run migrations first (npm run migrate:up).");
    const curriculumId = curRows[0].id;

    const { rows: stageRows } = await client.query<{ id: string; code: string }>(
      `select id, code from curriculum_stage where curriculum_id = $1`,
      [curriculumId],
    );
    const stageId = Object.fromEntries(stageRows.map((r) => [r.code, r.id]));
    for (const code of STAGE_ORDER) {
      if (!stageId[code]) throw new Error(`Stage ${code} missing — run migration 1700000063000 first.`);
    }

    console.log("1/7 School, admin, teachers...");
    const schoolId = await findOrCreate(
      client,
      `select id from schools where name = $1`,
      [SCHOOL_NAME],
      `insert into schools (name, onboarding_status, verified_at, district, ownership_type, school_type,
                            gender_composition, phone, email, head_teacher_name,
                            offers_kindergarten, offers_primary, offers_o_level, offers_a_level)
       values ($1,'active',now(),'Kampala','private','day','mixed','+256700111222',$2,'Mrs. Margaret Nankya',
               true, true, false, false)
       returning id`,
      [SCHOOL_NAME, ADMIN_EMAIL],
    );
    await client.query(
      `update schools set offers_kindergarten = true, offers_primary = true,
                          offers_o_level = false, offers_a_level = false
        where id = $1`,
      [schoolId],
    );
    await client.query(
      `insert into school_curriculum (school_id, curriculum_id, is_primary) values ($1,$2,true)
       on conflict (school_id, curriculum_id) do nothing`,
      [schoolId, curriculumId],
    );
    await client.query(
      `insert into school_grading_scheme (school_id, applies_to, role_scope, grading_scheme_id)
       select $1, 'PRIMARY', 'any', id from grading_scheme
        where curriculum_id = $2 and regime = 'ple_1_9' and school_id is null
       on conflict do nothing`,
      [schoolId, curriculumId],
    );

    // EMIS registers each section as its own institution. Deliberately fake
    // "DEMO-" numbers, so they can never collide with a real school's.
    for (const [section, emis] of [
      ["KINDERGARTEN", "DEMO-KJS-NURSERY"],
      ["PRIMARY", "DEMO-KJS-PRIMARY"],
    ]) {
      await client.query(
        `insert into school_section (school_id, section, emis_code) values ($1, $2, $3)
         on conflict (school_id, section) do nothing`,
        [schoolId, section, emis],
      );
    }

    const admin = await ensureUser(client, schoolId, ADMIN_EMAIL, "school_admin", passwordHash);
    const adminUserId = admin.id;

    const teacherIds: string[] = [];
    for (const t of TEACHER_DEFS) {
      const email = `${t.first}.${t.last}@${EMAIL_DOMAIN}`.toLowerCase();
      const { id, created } = await ensureUser(client, schoolId, email, "teacher", passwordHash);
      if (created) {
        await client.query(
          `insert into staff (user_id, first_name, last_name, gender, employment_type, is_active)
           values ($1,$2,$3,$4,'private',true) on conflict (user_id) do nothing`,
          [id, t.first, t.last, t.gender],
        );
      }
      teacherIds.push(id);
    }

    console.log("2/7 Academic year and terms...");
    const academicYearId = await findOrCreate(
      client,
      `select id from academic_years where school_id = $1 and year_name = '2026'`,
      [schoolId],
      `insert into academic_years (school_id, year_name, start_date, end_date, is_current, created_by)
       values ($1,'2026','2026-02-01','2026-12-11',true,$2) returning id`,
      [schoolId, adminUserId],
    );
    const termDefs = [
      { name: "Term 1", number: 1, start: "2026-02-01", end: "2026-05-08" },
      { name: "Term 2", number: 2, start: "2026-05-25", end: "2026-08-14" },
      { name: "Term 3", number: 3, start: "2026-09-07", end: "2026-12-11" },
    ];
    const termId: Record<string, string> = {};
    for (const t of termDefs) {
      termId[t.name] = await findOrCreate(
        client,
        `select id from terms where academic_year_id = $1 and name = $2`,
        [academicYearId, t.name],
        `insert into terms (school_id, academic_year_id, name, term_number, start_date, end_date, created_by)
         values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [schoolId, academicYearId, t.name, t.number, t.start, t.end, adminUserId],
      );
    }

    // An active staff assignment is what makes a teacher show up in the
    // class-teacher and subject-teacher pickers.
    for (const id of teacherIds) {
      await client.query(
        `insert into staff_assignment (staff_id, school_id, academic_year_id, role, entry_date, entry_type, status)
         select $1, $2, $3, 'teacher', '2026-02-01', 'new_hire', 'active'
          where not exists (select 1 from staff_assignment
                             where staff_id = $1 and academic_year_id = $3 and status = 'active')`,
        [id, schoolId, academicYearId],
      );
    }

    console.log("3/7 Classes (Baby Class – Primary 7) and pupils...");
    const classId: Record<string, string> = {};
    const roster: Record<string, string[]> = {};
    let newPupils = 0;
    for (const [i, code] of STAGE_ORDER.entries()) {
      classId[code] = await findOrCreate(
        client,
        `select id from classes where school_id = $1 and academic_year_id = $2 and curriculum_stage_id = $3`,
        [schoolId, academicYearId, stageId[code]],
        `insert into classes (school_id, academic_year_id, curriculum_stage_id, has_streams, class_teacher_id, is_active, created_by)
         values ($1,$2,$3,false,$4,true,$5) returning id`,
        [schoolId, academicYearId, stageId[code], teacherIds[i], adminUserId],
      );
      await client.query(`update classes set class_teacher_id = coalesce(class_teacher_id, $2) where id = $1`, [
        classId[code],
        teacherIds[i],
      ]);

      const existing = await client.query<{ student_user_id: string }>(
        `select student_user_id from student_enrollment where class_id = $1 and status = 'active'`,
        [classId[code]],
      );
      roster[code] = existing.rows.map((r) => r.student_user_id);
      const target = KINDERGARTEN_STAGES.has(code) ? KINDERGARTEN_PUPILS_PER_CLASS : PRIMARY_PUPILS_PER_CLASS;
      const age = 3 + i;
      for (let n = roster[code].length; n < target; n++) {
        const gender = Math.random() < 0.5 ? "male" : "female";
        const first = pick(gender === "male" ? FIRST_NAMES_M : FIRST_NAMES_F);
        const last = pick(LAST_NAMES);
        const systemId = await nextSystemId(client, "S");
        const { rows } = await client.query<{ id: string }>(
          `insert into users (school_id, system_id, email, password_hash, role) values ($1,$2,$3,$4,'student') returning id`,
          [schoolId, systemId, `${systemId.toLowerCase()}@${EMAIL_DOMAIN}`, passwordHash],
        );
        const userId = rows[0].id;
        await client.query(
          `insert into students (user_id, first_name, last_name, date_of_birth, gender) values ($1,$2,$3,$4,$5)`,
          [userId, first, last, dobForAge(age), gender],
        );
        await client.query(
          `insert into student_enrollment (student_user_id, school_id, academic_year_id, class_id, stream_id, entry_date, entry_type, status)
           values ($1,$2,$3,$4,null,'2026-02-01','new_admission','active')`,
          [userId, schoolId, academicYearId, classId[code]],
        );
        roster[code].push(userId);
        newPupils++;
      }
    }

    console.log("4/7 Primary subject offering and teacher assignments...");
    const { rows: subjects } = await client.query<{ id: string; short_name: string; stage_codes: string[] }>(
      `select s.id, s.short_name,
              array_agg(cs.code) as stage_codes
         from subject s
         join subject_stage ss on ss.subject_id = s.id
         join curriculum_stage cs on cs.id = ss.curriculum_stage_id
        where s.curriculum_id = $1 and s.phase = 'PRIMARY' and s.status = 'approved'
          and s.short_name in ('ENG','MTC','SCI','SST','LIT','LUG','CRE')
        group by s.id, s.short_name`,
      [curriculumId],
    );
    for (const s of subjects) {
      await client.query(
        `insert into subject_offering (school_id, subject_id, academic_year_id, is_offered, is_compulsory)
         values ($1,$2,$3,true,true)
         on conflict (school_id, subject_id, academic_year_id) do nothing`,
        [schoolId, s.id, academicYearId],
      );
    }
    // Primary is class-teacher-led: each P-class's own teacher leads its subjects.
    const slots: { subjectId: string; classCode: string }[] = [];
    for (const [i, code] of STAGE_ORDER.entries()) {
      if (KINDERGARTEN_STAGES.has(code)) continue;
      for (const s of subjects) {
        if (!s.stage_codes.includes(code)) continue;
        slots.push({ subjectId: s.id, classCode: code });
        const exists = await client.query(
          `select 1 from subject_teacher_assignment
            where school_id=$1 and academic_year_id=$2 and subject_id=$3 and class_id=$4 and status='active' and is_lead`,
          [schoolId, academicYearId, s.id, classId[code]],
        );
        if (exists.rowCount) continue;
        await client.query(
          `insert into subject_teacher_assignment
             (school_id, subject_id, academic_year_id, class_id, stream_id, staff_id, is_lead, status, start_date, assigned_by)
           values ($1,$2,$3,$4,null,$5,true,'active','2026-02-01',$6)`,
          [schoolId, s.id, academicYearId, classId[code], teacherIds[i], adminUserId],
        );
      }
    }

    console.log("5/7 Mid-Term exam with marks for P1–P7...");
    const { rows: sessionRows } = await client.query<{ id: string }>(
      `insert into exam_session (exam_name, exam_code, description, is_active)
       values ('Mid-Term Exams', 'MID', 'Mid-term assessment', true)
       on conflict (exam_code) do update set updated_at = now()
       returning id`,
    );
    const { rows: examRows } = await client.query<{ id: string }>(
      `insert into school_exam (school_id, exam_session_id, academic_year_id, term_id, name, starts_on, ends_on, marks_due_on, status, created_by)
       values ($1,$2,$3,$4,'Mid-Term 3 Exams','2026-10-12','2026-10-16','2026-10-23','active',$5)
       on conflict (school_id, academic_year_id, term_id, name) do update set updated_at = now()
       returning id`,
      [schoolId, sessionRows[0].id, academicYearId, termId["Term 3"], adminUserId],
    );
    const examId = examRows[0].id;

    // One "ability" per pupil so their subjects correlate — gives a believable
    // spread of aggregates from Division 1 through Ungraded.
    let resultCount = 0;
    for (const slot of slots) {
      for (const pupil of roster[slot.classCode]) {
        const seed = [...pupil].reduce((a, ch) => a + ch.charCodeAt(0), 0);
        const ability = 35 + (seed % 55);
        const score = Math.round(clamp(gauss(ability, 9), 8, 99));
        const r = await client.query(
          `insert into exam_result (school_exam_id, student_user_id, subject_id, subject_variant_id, raw_score, is_absent, entered_by)
           values ($1,$2,$3,null,$4,false,$5)
           on conflict (school_exam_id, student_user_id, subject_id,
                        coalesce(subject_variant_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing`,
          [examId, pupil, slot.subjectId, score, adminUserId],
        );
        resultCount += r.rowCount ?? 0;
      }
      await client.query(
        `insert into exam_subject_submission (school_exam_id, subject_id, class_id, submitted_by)
         values ($1,$2,$3,$4)
         on conflict (school_exam_id, subject_id, class_id,
                      coalesce(stream_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing`,
        [examId, slot.subjectId, classId[slot.classCode], adminUserId],
      );
    }

    console.log("6/7 Kindergarten learning areas...");
    // Same defaults the app seeds on first visit (learning-areas.repository.ts).
    const areaNames = [
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
    for (const [i, name] of areaNames.entries()) {
      await client.query(
        `insert into learning_area (school_id, name, sort_order) values ($1,$2,$3) on conflict do nothing`,
        [schoolId, name, i + 1],
      );
    }
    const { rows: areas } = await client.query<{ id: string }>(
      `select id from learning_area where school_id = $1 and is_active order by sort_order`,
      [schoolId],
    );

    console.log("7/7 Term 2 and Term 3 developmental assessments...");
    const ratings = ["emerging", "developing", "proficient"] as const;
    let assessmentCount = 0;
    for (const [termIndex, term] of (["Term 2", "Term 3"] as const).entries()) {
      for (const code of ["BABY", "MIDDLE", "TOP"]) {
        const classTeacher = teacherIds[STAGE_ORDER.indexOf(code as (typeof STAGE_ORDER)[number])];
        for (const pupil of roster[code]) {
          const seed = [...pupil].reduce((a, ch) => a + ch.charCodeAt(0), 0);
          for (const area of areas) {
            // Term 3 tends to be a notch better than Term 2 — visible progress.
            const level = clamp(Math.round(gauss(0.45 + termIndex * 0.35 + (seed % 3) * 0.35, 0.7)), 0, 2);
            const r = await client.query(
              `insert into developmental_assessment
                 (school_id, student_user_id, term_id, learning_area_id, rating, recorded_by)
               values ($1,$2,$3,$4,$5,$6)
               on conflict (student_user_id, term_id, learning_area_id) do nothing`,
              [schoolId, pupil, termId[term], area.id, ratings[level], classTeacher],
            );
            assessmentCount += r.rowCount ?? 0;
          }
          await client.query(
            `insert into developmental_remark
               (school_id, student_user_id, term_id, class_teacher_comment, head_teacher_comment, updated_by)
             values ($1,$2,$3,$4,$5,$6)
             on conflict (student_user_id, term_id) do nothing`,
            [
              schoolId,
              pupil,
              termId[term],
              pick(CLASS_TEACHER_COMMENTS),
              term === "Term 2" ? pick(HEAD_TEACHER_COMMENTS) : null,
              classTeacher,
            ],
          );
        }
      }
    }

    console.log("8/8 Term 3 timetables (Nursery and Primary)...");
    // The standard school day per section (same as the app's "Start from a
    // standard day"), then a full week per class — Primary is class-teacher
    // led, so every lesson is taught by the class's own teacher (no clashes).
    const days = [1, 2, 3, 4, 5];
    const dayPlans: Record<"KINDERGARTEN" | "PRIMARY", PeriodInput[]> = {
      KINDERGARTEN: standardDay("KINDERGARTEN"),
      PRIMARY: standardDay("PRIMARY"),
    };
    const periodIds: Record<string, string[]> = {};
    for (const section of ["KINDERGARTEN", "PRIMARY"] as const) {
      const existing = await client.query<{ id: string; kind: string }>(
        `select id, kind from timetable_period where school_id = $1 and section = $2 order by start_time`,
        [schoolId, section],
      );
      if (existing.rowCount === 0) {
        for (const [i, p] of dayPlans[section].entries()) {
          await client.query(
            `insert into timetable_period (school_id, section, label, start_time, end_time, kind, sort_order)
             values ($1, $2, $3, $4, $5, $6, $7)`,
            [schoolId, section, p.label, p.startTime, p.endTime, p.kind, i],
          );
        }
      }
      const rows = await client.query<{ id: string }>(
        `select id from timetable_period where school_id = $1 and section = $2 and kind = 'lesson' order by start_time`,
        [schoolId, section],
      );
      periodIds[section] = rows.rows.map((r) => r.id);
    }
    const nurseryActivities = [
      "Language & News",
      "Number Games",
      "Story Time",
      "Writing Patterns",
      "Music & Movement",
      "Our Environment",
      "Art & Craft",
    ];
    let timetabled = 0;
    for (const [i, code] of STAGE_ORDER.entries()) {
      const cls = classId[code];
      const already = await client.query(`select 1 from timetable_slot where class_id = $1 and term_id = $2 limit 1`, [
        cls,
        termId["Term 3"],
      ]);
      if (already.rowCount) continue;
      const isNursery = KINDERGARTEN_STAGES.has(code);
      const periods = periodIds[isNursery ? "KINDERGARTEN" : "PRIMARY"];
      const classSubjects = subjects.filter((s) => s.stage_codes.includes(code));
      for (const day of days) {
        for (const [pi, periodId] of periods.entries()) {
          const k = (day - 1) * periods.length + pi;
          const subjectId = isNursery ? null : classSubjects[k % classSubjects.length].id;
          const activity = isNursery ? nurseryActivities[(k + i) % nurseryActivities.length] : null;
          await client.query(
            `insert into timetable_slot (school_id, term_id, class_id, day_of_week, period_id, subject_id, activity, staff_id)
             values ($1, $2, $3, $4, $5, $6, $7, $8)
             on conflict do nothing`,
            [schoolId, termId["Term 3"], cls, day, periodId, subjectId, activity, teacherIds[i]],
          );
          timetabled++;
        }
      }
    }

    await client.query("COMMIT");

    const { rows: adminRow } = await client.query<{ system_id: string }>(`select system_id from users where id = $1`, [
      adminUserId,
    ]);
    console.log("\nDone.");
    console.log(`  School: ${SCHOOL_NAME} (Kindergarten + Primary)`);
    console.log(`  School admin login: ${ADMIN_EMAIL} or ${adminRow[0].system_id} / ${PASSWORD}`);
    console.log(`  Teachers: firstname.lastname@${EMAIL_DOMAIN} / ${PASSWORD} (e.g. harriet.nabukenya@${EMAIL_DOMAIN} — Baby Class)`);
    console.log(`  New pupils: ${newPupils}; exam marks inserted: ${resultCount}; assessments inserted: ${assessmentCount}`);
    console.log(`  Timetabled lessons added: ${timetabled}`);
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
