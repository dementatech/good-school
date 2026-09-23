import { pool } from "../../../shared/db/index.js";

// Admin <-> teacher direct messaging. One thread per pair (see the
// conversation table's unique(admin_user_id, teacher_user_id)) — only the
// admin side can start one (routes.ts enforces that), either side can reply
// once it exists.

export interface ConversationSummary {
  id: string;
  otherUserId: string;
  otherName: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface ConversationMessage {
  id: string;
  senderUserId: string;
  body: string;
  createdAt: string;
}

export class NotFoundError extends Error {}
export class UnknownReferenceError extends Error {}

/** Both must exist, share `schoolId`, and hold the expected role — thrown as
 *  UnknownReferenceError otherwise (caller maps that to a 400). */
async function assertPair(schoolId: string, adminUserId: string, teacherUserId: string): Promise<void> {
  const { rows } = await pool.query<{ id: string; role: string }>(
    `select id, role from users where id = any($1::uuid[]) and school_id = $2`,
    [[adminUserId, teacherUserId], schoolId],
  );
  const roleOf = (id: string) => rows.find((r) => r.id === id)?.role;
  if (roleOf(adminUserId) !== "school_admin" || roleOf(teacherUserId) !== "teacher") {
    throw new UnknownReferenceError("Unknown admin or teacher for this school");
  }
}

export async function getOrCreateConversation(
  schoolId: string,
  adminUserId: string,
  teacherUserId: string,
): Promise<string> {
  await assertPair(schoolId, adminUserId, teacherUserId);
  const { rows } = await pool.query<{ id: string }>(
    `insert into conversation (school_id, admin_user_id, teacher_user_id)
     values ($1, $2, $3)
     on conflict (admin_user_id, teacher_user_id) do update set school_id = excluded.school_id
     returning id`,
    [schoolId, adminUserId, teacherUserId],
  );
  return rows[0].id;
}

interface ConversationRow {
  id: string;
  other_user_id: string;
  other_name: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: string;
}

const SUMMARY_FOR_ADMIN = `
  select c.id, c.teacher_user_id as other_user_id,
         trim(concat_ws(' ', s.first_name, s.last_name)) as other_name,
         lm.body as last_message, lm.created_at as last_message_at,
         (select count(*)::text from conversation_message m
           where m.conversation_id = c.id and m.sender_user_id <> $2
             and (c.admin_last_read_at is null or m.created_at > c.admin_last_read_at)) as unread_count
    from conversation c
    join staff s on s.user_id = c.teacher_user_id
    left join lateral (
      select body, created_at from conversation_message
       where conversation_id = c.id order by created_at desc limit 1
    ) lm on true
   where c.school_id = $1 and c.admin_user_id = $2
   order by coalesce(lm.created_at, c.created_at) desc
`;

const SUMMARY_FOR_TEACHER = `
  select c.id, c.admin_user_id as other_user_id,
         coalesce(u.email, 'School admin') as other_name,
         lm.body as last_message, lm.created_at as last_message_at,
         (select count(*)::text from conversation_message m
           where m.conversation_id = c.id and m.sender_user_id <> $1
             and (c.teacher_last_read_at is null or m.created_at > c.teacher_last_read_at)) as unread_count
    from conversation c
    join users u on u.id = c.admin_user_id
    left join lateral (
      select body, created_at from conversation_message
       where conversation_id = c.id order by created_at desc limit 1
    ) lm on true
   where c.teacher_user_id = $1
   order by coalesce(lm.created_at, c.created_at) desc
`;

function mapSummary(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    otherUserId: row.other_user_id,
    otherName: row.other_name,
    lastMessage: row.last_message,
    lastMessageAt: row.last_message_at,
    unreadCount: Number(row.unread_count),
  };
}

export async function countUnreadForAdmin(schoolId: string, adminUserId: string): Promise<number> {
  const { rows } = await pool.query<{ total: string }>(
    `select coalesce(sum(unread), 0)::text as total from (
       select (select count(*) from conversation_message m
                where m.conversation_id = c.id and m.sender_user_id <> $2
                  and (c.admin_last_read_at is null or m.created_at > c.admin_last_read_at)) as unread
         from conversation c
        where c.school_id = $1 and c.admin_user_id = $2
     ) t`,
    [schoolId, adminUserId],
  );
  return Number(rows[0].total);
}

export async function countUnreadForTeacher(teacherUserId: string): Promise<number> {
  const { rows } = await pool.query<{ total: string }>(
    `select coalesce(sum(unread), 0)::text as total from (
       select (select count(*) from conversation_message m
                where m.conversation_id = c.id and m.sender_user_id <> $1
                  and (c.teacher_last_read_at is null or m.created_at > c.teacher_last_read_at)) as unread
         from conversation c
        where c.teacher_user_id = $1
     ) t`,
    [teacherUserId],
  );
  return Number(rows[0].total);
}

export async function listConversationsForAdmin(
  schoolId: string,
  adminUserId: string,
): Promise<ConversationSummary[]> {
  const { rows } = await pool.query<ConversationRow>(SUMMARY_FOR_ADMIN, [schoolId, adminUserId]);
  return rows.map(mapSummary);
}

export async function listConversationsForTeacher(teacherUserId: string): Promise<ConversationSummary[]> {
  const { rows } = await pool.query<ConversationRow>(SUMMARY_FOR_TEACHER, [teacherUserId]);
  return rows.map(mapSummary);
}

interface ParticipantRow {
  school_id: string;
  admin_user_id: string;
  teacher_user_id: string;
}

/** Loads the conversation's participants for an authorization check — throws
 *  NotFoundError if it doesn't exist. */
export async function getParticipants(conversationId: string): Promise<ParticipantRow> {
  const { rows } = await pool.query<ParticipantRow>(
    `select school_id, admin_user_id, teacher_user_id from conversation where id = $1`,
    [conversationId],
  );
  if (!rows[0]) throw new NotFoundError("Conversation not found");
  return rows[0];
}

export async function listMessages(conversationId: string): Promise<ConversationMessage[]> {
  const { rows } = await pool.query<{ id: string; sender_user_id: string; body: string; created_at: string }>(
    `select id, sender_user_id, body, created_at from conversation_message
      where conversation_id = $1
      order by created_at asc`,
    [conversationId],
  );
  return rows.map((r) => ({ id: r.id, senderUserId: r.sender_user_id, body: r.body, createdAt: r.created_at }));
}

export async function postMessage(
  conversationId: string,
  senderUserId: string,
  body: string,
): Promise<ConversationMessage> {
  const { rows } = await pool.query<{ id: string; sender_user_id: string; body: string; created_at: string }>(
    `insert into conversation_message (conversation_id, sender_user_id, body)
     values ($1, $2, $3)
     returning id, sender_user_id, body, created_at`,
    [conversationId, senderUserId, body],
  );
  return { id: rows[0].id, senderUserId: rows[0].sender_user_id, body: rows[0].body, createdAt: rows[0].created_at };
}

export async function markRead(conversationId: string, userId: string, side: "admin" | "teacher"): Promise<void> {
  const column = side === "admin" ? "admin_last_read_at" : "teacher_last_read_at";
  await pool.query(`update conversation set ${column} = now() where id = $1`, [conversationId]);
}
