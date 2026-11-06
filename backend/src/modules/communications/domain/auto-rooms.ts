import { pool } from "../../../shared/db/index.js";
import { getCurrentAcademicYear } from "../../academic-structure/index.js";

// The rooms nobody creates by hand: the staff room, school announcements,
// and a class group plus a class parents group for every class (or stream,
// where the class has streams) in the current academic year.
//
// Membership is derived from data other modules own (staff accounts,
// enrollment, guardian links), so instead of hooking every one of those
// writes, a school is re-synced lazily: whenever someone opens chat, at most
// once a minute per school. New members start with everything already read,
// so joining an old group doesn't greet them with hundreds of unread messages.
//
// Direct SQL against classes/streams/student_enrollment/guardian follows the
// precedent in exams/domain/exam-results.repository.ts: the module-boundary
// rule is about TS imports, not the shared Postgres schema.

const AUTO_KINDS = ["staff_room", "announcements", "class", "class_parents"];
const RESYNC_MS = 60_000;
const lastSynced = new Map<string, number>();
const inFlight = new Map<string, Promise<void>>();

/** Syncs a school's automatic rooms unless that happened in the last minute. */
export async function ensureSchoolSynced(schoolId: string): Promise<void> {
  const last = lastSynced.get(schoolId) ?? 0;
  if (Date.now() - last < RESYNC_MS) return;
  let running = inFlight.get(schoolId);
  if (!running) {
    running = syncSchoolRooms(schoolId)
      .then(() => syncSupportRooms(schoolId))
      .finally(() => inFlight.delete(schoolId));
    inFlight.set(schoolId, running);
  }
  await running;
}

/** Forces the next ensureSchoolSynced() to run, e.g. after a class change. */
export function markSchoolStale(schoolId: string): void {
  lastSynced.delete(schoolId);
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export async function syncSchoolRooms(schoolId: string): Promise<void> {
  const year = await getCurrentAcademicYear(schoolId);
  const client = await pool.connect();
  try {
    await client.query("begin");

    // ── The two per-school rooms ──────────────────────────────────────────
    await client.query(
      `insert into chat_room (school_id, kind, title, description, only_admins_post)
       values ($1, 'staff_room', 'Staff room', 'Every school admin and teacher.', false),
              ($1, 'announcements', 'School announcements', 'News from the school administration to everyone.', true)
       on conflict (school_id, kind) where kind in ('staff_room','announcements') do nothing`,
      [schoolId],
    );

    // ── One class group and one parents group per class or stream ─────────
    if (year) {
      await client.query(
        `with groups as (
           select c.id as class_id, s.id as stream_id,
                  stage_label(c.school_id, c.curriculum_stage_id) || coalesce(' ' || s.name, '') as label
             from classes c
             left join streams s on s.class_id = c.id
            where c.school_id = $1 and c.academic_year_id = $2
         )
         insert into chat_room (school_id, kind, title, description, class_id, stream_id)
         select $1, k.kind,
                g.label || case when k.kind = 'class_parents' then ' Parents' else '' end,
                case when k.kind = 'class_parents'
                     then 'The class teacher and the parents of ' || g.label || '.'
                     else 'The teachers and learners of ' || g.label || '.' end,
                g.class_id, g.stream_id
           from groups g cross join (values ('class'), ('class_parents')) k(kind)
         on conflict (kind, class_id, (coalesce(stream_id, '${NIL_UUID}'::uuid)))
            where kind in ('class','class_parents')
         do update set title = excluded.title, archived_at = null, updated_at = now()
            where chat_room.title is distinct from excluded.title or chat_room.archived_at is not null`,
        [schoolId, year.id],
      );
    }
    // Class rooms that aren't in this year any more keep their history, read-only.
    await client.query(
      `update chat_room r set archived_at = now()
        where r.school_id = $1 and r.kind in ('class','class_parents') and r.archived_at is null
          and ($2::uuid is null or not exists (
                select 1 from classes c where c.id = r.class_id and c.academic_year_id = $2
              ))`,
      [schoolId, year?.id ?? null],
    );
    // A class that gained streams: the old whole-class room is no longer a group.
    await client.query(
      `update chat_room r set archived_at = now()
        where r.school_id = $1 and r.kind in ('class','class_parents') and r.archived_at is null
          and r.stream_id is null and exists (select 1 from streams s where s.class_id = r.class_id)`,
      [schoolId],
    );

    // ── Who should be in each room ────────────────────────────────────────
    await client.query(
      `create temp table chat_desired (room_id uuid, user_id uuid, role text) on commit drop`,
    );
    await client.query(
      `insert into chat_desired (room_id, user_id, role)
       with rooms as (
         select id, kind, class_id, stream_id from chat_room
          where school_id = $1 and kind = any($3::text[]) and archived_at is null
       ),
       staff as (
         select id, role::text as role from users
          where school_id = $1 and role in ('school_admin','teacher') and is_active
       ),
       learners as (
         select en.student_user_id as user_id, en.class_id, en.stream_id
           from student_enrollment en
           join users u on u.id = en.student_user_id and u.is_active
          where en.school_id = $1 and en.status = 'active'
            and ($2::uuid is null or en.academic_year_id = $2)
       ),
       parents as (
         select distinct g.user_id, l.class_id, l.stream_id
           from learners l
           join student_guardian sg on sg.student_user_id = l.user_id
           join guardian g on g.id = sg.guardian_id and g.merged_into_guardian_id is null
           join users gu on gu.id = g.user_id and gu.is_active
       )
       select room_id, user_id, min(role) from (
         -- Staff room: every staff member; school admins run it.
         select r.id as room_id, s.id as user_id,
                case when s.role = 'school_admin' then 'admin' else 'member' end as role
           from rooms r cross join staff s where r.kind = 'staff_room'
         union all
         -- Announcements: everyone; only school admins post.
         select r.id, s.id, case when s.role = 'school_admin' then 'admin' else 'member' end
           from rooms r cross join staff s where r.kind = 'announcements'
         union all
         select r.id, l.user_id, 'member' from rooms r cross join learners l where r.kind = 'announcements'
         union all
         select r.id, p.user_id, 'member' from rooms r cross join parents p where r.kind = 'announcements'
         union all
         -- Class and parents groups: the class and stream teacher run them.
         select r.id, t.user_id, 'admin'
           from rooms r
           join classes c on c.id = r.class_id
           left join streams st on st.id = r.stream_id
           cross join lateral (values (c.class_teacher_id), (st.stream_teacher_id)) t(user_id)
          where r.kind in ('class','class_parents') and t.user_id is not null
            and exists (select 1 from staff s where s.id = t.user_id)
         union all
         -- Subject teachers join the learners' class group.
         select r.id, sta.staff_id, 'member'
           from rooms r
           join subject_teacher_assignment sta
             on sta.class_id = r.class_id and sta.status = 'active'
            and (r.stream_id is null or sta.stream_id is null or sta.stream_id = r.stream_id)
            and ($2::uuid is null or sta.academic_year_id = $2)
          where r.kind = 'class' and exists (select 1 from staff s where s.id = sta.staff_id)
         union all
         select r.id, l.user_id, 'member'
           from rooms r join learners l
             on l.class_id = r.class_id and (r.stream_id is null or l.stream_id = r.stream_id)
          where r.kind = 'class'
         union all
         select r.id, p.user_id, 'member'
           from rooms r join parents p
             on p.class_id = r.class_id and (r.stream_id is null or p.stream_id = r.stream_id)
          where r.kind = 'class_parents'
       ) d
       group by room_id, user_id`,
      [schoolId, year?.id ?? null, AUTO_KINDS],
    );

    await client.query(
      `insert into chat_member (room_id, user_id, role, last_read_at)
       select room_id, user_id, role, now() from chat_desired
       on conflict (room_id, user_id) do update set role = excluded.role
          where chat_member.role <> excluded.role`,
    );
    await client.query(
      `delete from chat_member m
        using chat_room r
        where m.room_id = r.id and r.school_id = $1 and r.kind = any($2::text[]) and r.archived_at is null
          and not exists (select 1 from chat_desired d where d.room_id = m.room_id and d.user_id = m.user_id)`,
      [schoolId, AUTO_KINDS],
    );

    await client.query("commit");
    lastSynced.set(schoolId, Date.now());
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ── Support chats ──────────────────────────────────────────────────────────
//
// One `support` room per school: its school admins, plus the Dementa support
// team (platform owner and support agents, the people who work the support
// inbox), who run it. Synced for one school when someone there opens chat,
// and for every school when a support team member does, so the team can
// reach a school whose admins have never opened chat.

let lastAllSupportSync = 0;
let supportInFlight: Promise<void> | null = null;

/** Every school's support room, at most once a minute. */
export async function ensureAllSupportRoomsSynced(): Promise<void> {
  if (Date.now() - lastAllSupportSync < RESYNC_MS) return;
  if (!supportInFlight) {
    supportInFlight = syncSupportRooms(null)
      .then(() => {
        lastAllSupportSync = Date.now();
      })
      .finally(() => {
        supportInFlight = null;
      });
  }
  await supportInFlight;
}

/** One school's support room (or every school's, when `schoolId` is null). */
export async function syncSupportRooms(schoolId: string | null): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into chat_room (school_id, kind, title, description)
       select s.id, 'support', 'Dementa Support',
              'Your school''s chat with the Dementa support team. Every school admin at your school can see it.'
         from schools s
        where ($1::uuid is null or s.id = $1) and coalesce(s.onboarding_status, 'active') <> 'churned'
       on conflict (school_id, kind) where kind in ('staff_room','announcements','support') do nothing`,
      [schoolId],
    );
    await client.query(`create temp table support_desired (room_id uuid, user_id uuid, role text) on commit drop`);
    await client.query(
      `insert into support_desired (room_id, user_id, role)
       with rooms as (
         select id, school_id from chat_room where kind = 'support' and ($1::uuid is null or school_id = $1)
       )
       select r.id, u.id, 'member' from rooms r
         join users u on u.school_id = r.school_id and u.role = 'school_admin' and u.is_active
       union
       select r.id, u.id, 'admin' from rooms r
         cross join users u where (u.is_platform_owner or u.is_support_agent) and u.is_active`,
      [schoolId],
    );
    await client.query(
      `insert into chat_member (room_id, user_id, role, last_read_at)
       select room_id, user_id, role, now() from support_desired
       on conflict (room_id, user_id) do update set role = excluded.role where chat_member.role <> excluded.role`,
    );
    await client.query(
      `delete from chat_member m
        using chat_room r
        where m.room_id = r.id and r.kind = 'support' and ($1::uuid is null or r.school_id = $1)
          and not exists (select 1 from support_desired d where d.room_id = m.room_id and d.user_id = m.user_id)`,
      [schoolId],
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
