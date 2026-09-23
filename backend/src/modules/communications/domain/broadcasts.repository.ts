import { pool } from "../../../shared/db/index.js";
import { getCurrentAcademicYear } from "../../academic-structure/index.js";

// Admin -> every teacher, and teacher -> his own class. Both fan out through
// notifyUsers() (see notifications/index.ts) at the route layer — this
// module only resolves *who* the recipients are and keeps a record of what
// was sent, in `broadcast`. Direct SQL against classes/streams/
// student_enrollment follows the precedent already set in
// exams/domain/exam-results.repository.ts — the module-boundary rule is
// about TS imports, not the shared Postgres schema.

export async function listTeacherUserIds(schoolId: string): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `select id from users where school_id = $1 and role = 'teacher'`,
    [schoolId],
  );
  return rows.map((r) => r.id);
}

export interface OwnedClass {
  classId: string;
  streamId: string | null;
  label: string;
}

/** Classes/streams this teacher is the named teacher of, for the current
 *  academic year — the only groups they're allowed to broadcast to. */
export async function listOwnedClasses(schoolId: string, teacherUserId: string): Promise<OwnedClass[]> {
  const year = await getCurrentAcademicYear(schoolId);
  if (!year) return [];

  const { rows } = await pool.query<{ class_id: string; stream_id: string | null; label: string }>(
    `select c.id as class_id, null::uuid as stream_id, stage_label(c.school_id, cs.id) as label
       from classes c
       join curriculum_stage cs on cs.id = c.curriculum_stage_id
      where c.school_id = $1 and c.academic_year_id = $2 and c.class_teacher_id = $3
     union all
     select s.class_id, s.id as stream_id, stage_label(c.school_id, cs.id) || ' ' || s.name as label
       from streams s
       join classes c on c.id = s.class_id
       join curriculum_stage cs on cs.id = c.curriculum_stage_id
      where s.school_id = $1 and c.academic_year_id = $2 and s.stream_teacher_id = $3
      order by 3`,
    [schoolId, year.id, teacherUserId],
  );
  return rows.map((r) => ({ classId: r.class_id, streamId: r.stream_id, label: r.label }));
}

export class NotAssignedError extends Error {}

/** Throws NotAssignedError unless this teacher is the class or stream
 *  teacher for the given (classId, streamId) in the current academic year. */
async function assertOwnsClass(
  schoolId: string,
  teacherUserId: string,
  classId: string,
  streamId: string | null,
): Promise<void> {
  const owned = await listOwnedClasses(schoolId, teacherUserId);
  const match = owned.some((o) => o.classId === classId && o.streamId === streamId);
  if (!match) throw new NotAssignedError("You aren't the assigned teacher for this class.");
}

async function classRecipientUserIds(
  schoolId: string,
  academicYearId: string,
  classId: string,
  streamId: string | null,
): Promise<string[]> {
  const { rows } = await pool.query<{ student_user_id: string }>(
    `select en.student_user_id
       from student_enrollment en
      where en.school_id = $1 and en.academic_year_id = $2 and en.class_id = $3
        and en.status = 'active'
        and ($4::uuid is null or en.stream_id = $4::uuid)`,
    [schoolId, academicYearId, classId, streamId],
  );
  return rows.map((r) => r.student_user_id);
}

export interface BroadcastRecord {
  id: string;
  scope: "teachers" | "class";
  classId: string | null;
  streamId: string | null;
  title: string;
  body: string;
  recipientCount: number;
  createdAt: string;
}

function mapBroadcast(row: {
  id: string;
  scope: string;
  class_id: string | null;
  stream_id: string | null;
  title: string;
  body: string;
  recipient_count: number;
  created_at: string;
}): BroadcastRecord {
  return {
    id: row.id,
    scope: row.scope as "teachers" | "class",
    classId: row.class_id,
    streamId: row.stream_id,
    title: row.title,
    body: row.body,
    recipientCount: row.recipient_count,
    createdAt: row.created_at,
  };
}

async function recordBroadcast(input: {
  schoolId: string;
  senderUserId: string;
  scope: "teachers" | "class";
  classId?: string | null;
  streamId?: string | null;
  title: string;
  body: string;
  recipientCount: number;
}): Promise<BroadcastRecord> {
  const { rows } = await pool.query(
    `insert into broadcast (school_id, sender_user_id, scope, class_id, stream_id, title, body, recipient_count)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id, scope, class_id, stream_id, title, body, recipient_count, created_at`,
    [
      input.schoolId,
      input.senderUserId,
      input.scope,
      input.classId ?? null,
      input.streamId ?? null,
      input.title,
      input.body,
      input.recipientCount,
    ],
  );
  return mapBroadcast(rows[0]);
}

/** Resolves every teacher at the school as recipients and records the send.
 *  Returns the recipient user ids so the route can fan the notification out. */
export async function prepareTeacherBroadcast(
  schoolId: string,
  senderUserId: string,
  title: string,
  body: string,
): Promise<{ recipientUserIds: string[]; broadcast: BroadcastRecord }> {
  const recipientUserIds = await listTeacherUserIds(schoolId);
  const broadcast = await recordBroadcast({
    schoolId,
    senderUserId,
    scope: "teachers",
    title,
    body,
    recipientCount: recipientUserIds.length,
  });
  return { recipientUserIds, broadcast };
}

/** Same, for a teacher broadcasting to a class/stream they own. Throws
 *  NotAssignedError if they don't own it. */
export async function prepareClassBroadcast(
  schoolId: string,
  teacherUserId: string,
  classId: string,
  streamId: string | null,
  title: string,
  body: string,
): Promise<{ recipientUserIds: string[]; broadcast: BroadcastRecord }> {
  await assertOwnsClass(schoolId, teacherUserId, classId, streamId);
  const year = await getCurrentAcademicYear(schoolId);
  const recipientUserIds = year ? await classRecipientUserIds(schoolId, year.id, classId, streamId) : [];
  const broadcast = await recordBroadcast({
    schoolId,
    senderUserId: teacherUserId,
    scope: "class",
    classId,
    streamId,
    title,
    body,
    recipientCount: recipientUserIds.length,
  });
  return { recipientUserIds, broadcast };
}

export async function listSentBroadcasts(schoolId: string, senderUserId: string): Promise<BroadcastRecord[]> {
  const { rows } = await pool.query(
    `select id, scope, class_id, stream_id, title, body, recipient_count, created_at
       from broadcast
      where school_id = $1 and sender_user_id = $2
      order by created_at desc
      limit 50`,
    [schoolId, senderUserId],
  );
  return rows.map(mapBroadcast);
}
