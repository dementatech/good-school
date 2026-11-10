import "dotenv/config";
import { pool } from "../src/shared/db/index.js";

// Empties a school of its people and everything they generated, keeping the
// school itself ready for real use: its academic years, terms, classes,
// streams, departments, positions, subjects, combinations, grading, timetable
// periods, settings and its school admin login(s) all stay.
//
// Deleted: learners, staff, the school's guardians and the parent logins that
// only they used, exams and marks, attendance, timetable slots, schemes of
// work, lesson plans and calendar events.
//
// Chats and broadcasts stay: their rooms belong to the classes and streams
// that are kept, and the kept admins may have written in them. Deleted
// people drop out of them by the existing foreign keys (memberships go,
// their messages lose the sender).
//
// Written to clear the Kasubi Ridge demo school, but works for any school.
// Runs in one transaction. Without --apply it only reports what it would
// delete and rolls back.
//
//   npx tsx scripts/clear-school-people.ts --school "Kasubi Ridge Secondary School"
//   npx tsx scripts/clear-school-people.ts --school "Kasubi Ridge Secondary School" --apply

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// School-scoped records people generated. Children (exam results, scheme
// weeks, ...) go with them by cascade.
const ACTIVITY_TABLES = [
  "school_exam",
  "attendance_record",
  "lesson_plan",
  "scheme_of_work",
  "school_event",
  "timetable_slot",
  "subject_teacher_assignment",
  "staff_assignment",
  "prior_exam_result",
  "developmental_assessment",
  "developmental_remark",
  "student_combination",
  "student_subject",
  "student_payment_code",
  "student_enrollment",
];

// Setup rows that record who made them without an on-delete rule; they're
// kept, so they're handed to the school admin first.
const CREATOR_COLUMNS: [table: string, column: string][] = [
  ["academic_years", "created_by"],
  ["terms", "created_by"],
  ["classes", "created_by"],
  ["streams", "created_by"],
  ["school_settings", "updated_by"],
];

async function main() {
  const schoolName = arg("school");
  const apply = process.argv.includes("--apply");
  if (!schoolName) {
    console.error('Usage: tsx scripts/clear-school-people.ts --school "<exact school name>" [--apply]');
    process.exit(2);
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    const school = await client.query<{ id: string }>(`select id from schools where name = $1`, [schoolName]);
    if (school.rowCount !== 1) throw new Error(`Expected exactly one school named "${schoolName}", found ${school.rowCount}.`);
    const sid = school.rows[0].id;

    const admins = await client.query<{ id: string; email: string | null }>(
      `select id, email from users where school_id = $1 and role = 'school_admin' order by created_at`,
      [sid],
    );
    if (admins.rowCount === 0) throw new Error("This school has no school admin to keep — refusing to empty it.");
    const keepIds = admins.rows.map((a) => a.id);
    console.log(`School: ${schoolName}`);
    console.log(`Keeping school admin login(s): ${admins.rows.map((a) => a.email ?? a.id).join(", ")}`);

    const counts: [string, number][] = [];

    for (const [table, column] of CREATOR_COLUMNS) {
      await client.query(
        `update ${table} set ${column} = $2
          where school_id = $1 and ${column} is not null and not (${column} = any($3::uuid[]))`,
        [sid, keepIds[0], keepIds],
      );
    }

    // Guardians aren't school-scoped — note the ones linked to this school's
    // learners now, before the learners (and those links) are deleted.
    const guardians = await client.query<{ id: string }>(
      `select distinct sg.guardian_id as id
         from student_guardian sg join users u on u.id = sg.student_user_id
        where u.school_id = $1`,
      [sid],
    );
    const guardianIds = guardians.rows.map((g) => g.id);

    for (const table of ACTIVITY_TABLES) {
      const r = await client.query(`delete from ${table} where school_id = $1`, [sid]);
      counts.push([table, r.rowCount ?? 0]);
    }

    const people = await client.query<{ role: string; n: string }>(
      `with gone as (
         delete from users where school_id = $1 and not (id = any($2::uuid[])) returning role
       ) select role, count(*)::text as n from gone group by role order by role`,
      [sid, keepIds],
    );
    for (const p of people.rows) counts.push([`users (${p.role})`, Number(p.n)]);

    // Guardians left with no learner anywhere, then parent logins left with
    // no guardian record.
    const goneGuardians = await client.query<{ user_id: string | null }>(
      `delete from guardian g
        where g.id = any($1::uuid[])
          and not exists (select 1 from student_guardian sg where sg.guardian_id = g.id)
        returning g.user_id`,
      [guardianIds],
    );
    counts.push(["guardian", goneGuardians.rowCount ?? 0]);
    const parentIds = [...new Set(goneGuardians.rows.map((g) => g.user_id).filter((id): id is string => !!id))];
    const parents = await client.query(
      `delete from users u
        where u.id = any($1::uuid[]) and u.role = 'parent'
          and not exists (select 1 from guardian g where g.user_id = u.id)`,
      [parentIds],
    );
    counts.push(["users (parent logins)", parents.rowCount ?? 0]);

    console.log("");
    for (const [what, n] of counts) if (n > 0) console.log(`  ${what.padEnd(28)} ${n}`);

    if (apply) {
      await client.query("commit");
      console.log("\nDone — deleted.");
    } else {
      await client.query("rollback");
      console.log("\nDry run — nothing was changed. Add --apply to delete.");
    }
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
