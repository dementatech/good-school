import { pool } from "../../../shared/db/index.js";
import { findPeople, isStaff, type Person } from "./people.js";

// Rooms and who is in them. Every read here is scoped by membership: a user
// only ever sees rooms they belong to. The one exception is a school admin's
// oversight view (listSchoolRooms / accessFor), which is read-only.

export type RoomKind = "direct" | "group" | "staff_room" | "announcements" | "class" | "class_parents" | "support";

export class ChatError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface RoomRow {
  id: string;
  school_id: string;
  kind: RoomKind;
  title: string | null;
  description: string | null;
  only_admins_post: boolean;
  class_id: string | null;
  stream_id: string | null;
  created_by: string | null;
  created_at: string;
  last_message_at: string | null;
  archived_at: string | null;
}

export interface LastMessage {
  id: string;
  senderUserId: string | null;
  senderName: string | null;
  body: string;
  hasAttachment: boolean;
  attachmentName: string | null;
  isVoice: boolean;
  deleted: boolean;
  createdAt: string;
}

export interface RoomSummary {
  id: string;
  schoolId: string;
  kind: RoomKind;
  title: string;
  description: string | null;
  onlyAdminsPost: boolean;
  archived: boolean;
  /** 'admin' | 'member' for a member; null in a school admin's read-only oversight view. */
  myRole: "admin" | "member" | null;
  muted: boolean;
  canPost: boolean;
  memberCount: number;
  unreadCount: number;
  lastReadAt: string | null;
  lastMessage: LastMessage | null;
  lastMessageAt: string | null;
  createdAt: string;
  /** The other person, for a direct chat. */
  other: Person | null;
  photoUrl: string | null;
}

export interface RoomMember extends Person {
  roomRole: "admin" | "member";
  lastReadAt: string | null;
}

export interface RoomDetail extends RoomSummary {
  members: RoomMember[];
  /** False when the room is too big to list everyone. */
  membersComplete: boolean;
}

/** Rooms with more members than this don't list them all, or send typing and read events. */
export const SMALL_ROOM = 300;

interface SummaryRow extends RoomRow {
  my_role: "admin" | "member" | null;
  muted: boolean | null;
  last_read_at: string | null;
  member_count: string;
  unread_count: string;
  lm_id: string | null;
  lm_sender: string | null;
  lm_body: string | null;
  lm_attachment_name: string | null;
  lm_has_attachment: boolean | null;
  lm_is_voice: boolean | null;
  lm_deleted_at: string | null;
  lm_created_at: string | null;
  other_user_id: string | null;
  school_name: string | null;
}

/** $1 = the viewing user. Expects `r` (chat_room) and `m` (their chat_member row, may be null). */
const SUMMARY_COLUMNS = `
  r.*, m.role as my_role, m.muted, m.last_read_at,
  (select count(*) from chat_member cm where cm.room_id = r.id)::text as member_count,
  case when m.user_id is null then '0' else (
    select count(*) from chat_message x
     where x.room_id = r.id and x.deleted_at is null and x.sender_user_id is distinct from $1
       and (m.last_read_at is null or x.created_at > m.last_read_at)
  )::text end as unread_count,
  lm.id as lm_id, lm.sender_user_id as lm_sender, lm.body as lm_body,
  lm.attachment_name as lm_attachment_name, lm.attachment_ref is not null as lm_has_attachment,
  lm.is_voice_note as lm_is_voice,
  lm.deleted_at as lm_deleted_at, lm.created_at as lm_created_at,
  (select sc.name from schools sc where sc.id = r.school_id) as school_name,
  case when r.kind = 'direct' then (
    select o.user_id from chat_member o where o.room_id = r.id and o.user_id <> $1 limit 1
  ) end as other_user_id`;

const LAST_MESSAGE_JOIN = `
  left join lateral (
    select id, sender_user_id, body, attachment_name, attachment_ref, is_voice_note, deleted_at, created_at
      from chat_message where room_id = r.id order by created_at desc limit 1
  ) lm on true`;

async function toSummaries(rows: SummaryRow[]): Promise<RoomSummary[]> {
  const people = await findPeople(
    rows.flatMap((r) => [r.other_user_id, r.lm_sender].filter((id): id is string => Boolean(id))),
  );
  return rows.map((r) => {
    const other = r.other_user_id ? (people.get(r.other_user_id) ?? null) : null;
    const archived = r.archived_at !== null;
    const canPost =
      r.my_role !== null && !archived && (!r.only_admins_post || r.my_role === "admin");
    return {
      id: r.id,
      schoolId: r.school_id,
      kind: r.kind,
      title:
        r.kind === "direct"
          ? (other?.name ?? "Former member")
          : // The support team sees which school; the school sees "Dementa Support".
            r.kind === "support" && r.my_role === "admin"
            ? (r.school_name ?? "School")
            : (r.title ?? "Group"),
      description: r.description,
      onlyAdminsPost: r.only_admins_post,
      archived,
      myRole: r.my_role,
      muted: r.muted ?? false,
      canPost,
      memberCount: Number(r.member_count),
      unreadCount: Number(r.unread_count),
      lastReadAt: r.last_read_at,
      lastMessage: r.lm_id
        ? {
            id: r.lm_id,
            senderUserId: r.lm_sender,
            senderName: r.lm_sender ? (people.get(r.lm_sender)?.name ?? null) : null,
            body: r.lm_deleted_at ? "" : (r.lm_body ?? ""),
            hasAttachment: Boolean(r.lm_has_attachment) && !r.lm_deleted_at,
            attachmentName: r.lm_deleted_at ? null : r.lm_attachment_name,
            isVoice: Boolean(r.lm_is_voice) && !r.lm_deleted_at,
            deleted: r.lm_deleted_at !== null,
            createdAt: r.lm_created_at!,
          }
        : null,
      lastMessageAt: r.last_message_at,
      createdAt: r.created_at,
      other,
      photoUrl: other?.photoUrl ?? null,
    };
  });
}

/** Every room the user is in, most recent activity first. A direct chat
 *  with no messages yet only shows for the person who opened it. */
export async function listRoomsForUser(userId: string): Promise<RoomSummary[]> {
  const { rows } = await pool.query<SummaryRow>(
    `select ${SUMMARY_COLUMNS}
       from chat_member m
       join chat_room r on r.id = m.room_id
       ${LAST_MESSAGE_JOIN}
      where m.user_id = $1
        and (r.kind <> 'direct' or r.last_message_at is not null or r.created_by = $1)
      order by coalesce(r.last_message_at, r.created_at) desc`,
    [userId],
  );
  return toSummaries(rows);
}

export async function getRoomSummary(roomId: string, userId: string): Promise<RoomSummary | null> {
  const { rows } = await pool.query<SummaryRow>(
    `select ${SUMMARY_COLUMNS}
       from chat_room r
       left join chat_member m on m.room_id = r.id and m.user_id = $1
       ${LAST_MESSAGE_JOIN}
      where r.id = $2`,
    [userId, roomId],
  );
  if (!rows[0]) return null;
  return (await toSummaries(rows))[0];
}

export async function getRoomDetail(roomId: string, userId: string): Promise<RoomDetail | null> {
  const summary = await getRoomSummary(roomId, userId);
  if (!summary) return null;
  const { rows } = await pool.query<{ user_id: string; role: "admin" | "member"; last_read_at: string | null }>(
    `select user_id, role, last_read_at from chat_member where room_id = $1
      order by (role = 'admin') desc, joined_at
      limit ${SMALL_ROOM}`,
    [roomId],
  );
  const people = await findPeople(rows.map((r) => r.user_id));
  const members = rows
    .map((r) => {
      const person = people.get(r.user_id);
      return person ? { ...person, roomRole: r.role, lastReadAt: r.last_read_at } : null;
    })
    .filter((m): m is RoomMember => m !== null)
    .sort((a, b) => (a.roomRole === b.roomRole ? a.name.localeCompare(b.name) : a.roomRole === "admin" ? -1 : 1));
  if (summary.kind === "direct" && summary.myRole === null) {
    // Oversight of someone else's private chat: name it after both people.
    summary.title = members.map((m) => m.name).join(" & ") || "Private chat";
    summary.other = null;
    summary.photoUrl = null;
  }
  return { ...summary, members, membersComplete: summary.memberCount <= SMALL_ROOM };
}

export async function getRoom(roomId: string): Promise<RoomRow | null> {
  const { rows } = await pool.query<RoomRow>(`select * from chat_room where id = $1`, [roomId]);
  return rows[0] ?? null;
}

export interface Access {
  room: RoomRow;
  /** Null when reading as a school admin who isn't in the room. */
  memberRole: "admin" | "member" | null;
  canPost: boolean;
  /** Room admin, or a school admin of the room's school: may moderate. */
  canModerate: boolean;
}

/** What `user` may do in a room. Throws ChatError(404) when they may not even see it. */
export async function accessFor(
  roomId: string,
  user: { user_id: string; role: string; school_id: string | null },
): Promise<Access> {
  const { rows } = await pool.query<RoomRow & { member_role: "admin" | "member" | null }>(
    `select r.*, m.role as member_role
       from chat_room r
       left join chat_member m on m.room_id = r.id and m.user_id = $2
      where r.id = $1`,
    [roomId, user.user_id],
  );
  const row = rows[0];
  const schoolAdminHere = user.role === "school_admin" && row?.school_id === user.school_id;
  if (!row || (!row.member_role && !schoolAdminHere)) throw new ChatError(404, "not_found");
  const archived = row.archived_at !== null;
  return {
    room: row,
    memberRole: row.member_role,
    canPost: row.member_role !== null && !archived && (!row.only_admins_post || row.member_role === "admin"),
    canModerate: row.member_role === "admin" || schoolAdminHere,
  };
}

export async function memberIds(roomId: string): Promise<string[]> {
  const { rows } = await pool.query<{ user_id: string }>(`select user_id from chat_member where room_id = $1`, [
    roomId,
  ]);
  return rows.map((r) => r.user_id);
}

export async function membersForNotify(
  roomId: string,
): Promise<{ user_id: string; role: string; muted: boolean }[]> {
  const { rows } = await pool.query<{ user_id: string; role: string; muted: boolean }>(
    `select m.user_id, u.role::text as role, m.muted
       from chat_member m join users u on u.id = m.user_id
      where m.room_id = $1`,
    [roomId],
  );
  return rows;
}

// ── Creating rooms ───────────────────────────────────────────────────────

export async function getOrCreateDirect(schoolId: string, userId: string, otherUserId: string): Promise<string> {
  const key = [userId, otherUserId].sort().join(":");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ id: string }>(
      `insert into chat_room (school_id, kind, direct_key, created_by)
       values ($1, 'direct', $2, $3)
       on conflict (direct_key) where direct_key is not null do update set updated_at = chat_room.updated_at
       returning id`,
      [schoolId, key, userId],
    );
    const id = rows[0].id;
    await client.query(
      `insert into chat_member (room_id, user_id) values ($1, $2), ($1, $3)
       on conflict do nothing`,
      [id, userId, otherUserId],
    );
    await client.query("commit");
    return id;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Members may only be people at the same school: staff, students, or
 *  parents of its students. Returns the ones that qualify. */
async function eligibleMembers(schoolId: string, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const { rows } = await pool.query<{ id: string }>(
    `select u.id from users u
      where u.id = any($2::uuid[]) and u.is_active and (
        (u.school_id = $1 and u.role in ('school_admin','teacher','student'))
        or (u.role = 'parent' and exists (
          select 1 from guardian g
            join student_guardian sg on sg.guardian_id = g.id
            join users su on su.id = sg.student_user_id
           where g.user_id = u.id and su.school_id = $1 and g.merged_into_guardian_id is null))
      )`,
    [schoolId, [...new Set(userIds)]],
  );
  return rows.map((r) => r.id);
}

export async function createGroup(input: {
  schoolId: string;
  creatorUserId: string;
  title: string;
  description: string | null;
  onlyAdminsPost: boolean;
  memberUserIds: string[];
}): Promise<string> {
  const members = (await eligibleMembers(input.schoolId, input.memberUserIds)).filter(
    (id) => id !== input.creatorUserId,
  );
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ id: string }>(
      `insert into chat_room (school_id, kind, title, description, only_admins_post, created_by)
       values ($1, 'group', $2, $3, $4, $5) returning id`,
      [input.schoolId, input.title, input.description, input.onlyAdminsPost, input.creatorUserId],
    );
    const id = rows[0].id;
    await client.query(`insert into chat_member (room_id, user_id, role, last_read_at) values ($1, $2, 'admin', now())`, [
      id,
      input.creatorUserId,
    ]);
    if (members.length > 0) {
      await client.query(
        `insert into chat_member (room_id, user_id) select $1, unnest($2::uuid[]) on conflict do nothing`,
        [id, members],
      );
    }
    await client.query("commit");
    return id;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function updateRoom(
  roomId: string,
  patch: { title?: string; description?: string | null; onlyAdminsPost?: boolean },
): Promise<void> {
  await pool.query(
    `update chat_room set
       title = coalesce($2, title),
       description = case when $3::boolean then $4 else description end,
       only_admins_post = coalesce($5, only_admins_post),
       updated_at = now()
     where id = $1`,
    [roomId, patch.title ?? null, patch.description !== undefined, patch.description ?? null, patch.onlyAdminsPost ?? null],
  );
}

export async function addMembers(roomId: string, schoolId: string, userIds: string[]): Promise<string[]> {
  const eligible = await eligibleMembers(schoolId, userIds);
  if (eligible.length === 0) return [];
  const { rows } = await pool.query<{ user_id: string }>(
    `insert into chat_member (room_id, user_id) select $1, unnest($2::uuid[])
     on conflict do nothing returning user_id`,
    [roomId, eligible],
  );
  return rows.map((r) => r.user_id);
}

export async function removeMember(roomId: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(`delete from chat_member where room_id = $1 and user_id = $2`, [
    roomId,
    userId,
  ]);
  return (rowCount ?? 0) > 0;
}

export async function setMemberRole(roomId: string, userId: string, role: "admin" | "member"): Promise<boolean> {
  const { rowCount } = await pool.query(`update chat_member set role = $3 where room_id = $1 and user_id = $2`, [
    roomId,
    userId,
    role,
  ]);
  return (rowCount ?? 0) > 0;
}

export async function setMuted(roomId: string, userId: string, muted: boolean): Promise<void> {
  await pool.query(`update chat_member set muted = $3 where room_id = $1 and user_id = $2`, [roomId, userId, muted]);
}

export async function markRead(roomId: string, userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ last_read_at: string }>(
    `update chat_member set last_read_at = now() where room_id = $1 and user_id = $2 returning last_read_at`,
    [roomId, userId],
  );
  return rows[0]?.last_read_at ?? null;
}

export async function countUnread(userId: string): Promise<number> {
  const { rows } = await pool.query<{ total: string }>(
    `select count(*)::text as total
       from chat_member m
       join chat_message x on x.room_id = m.room_id
      where m.user_id = $1 and not m.muted
        and x.deleted_at is null and x.sender_user_id is distinct from $1
        and (m.last_read_at is null or x.created_at > m.last_read_at)`,
    [userId],
  );
  return Number(rows[0].total);
}

/** The other people this user has a direct chat with (for online dots). */
export async function directPartners(userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ user_id: string }>(
    `select distinct o.user_id
       from chat_member m
       join chat_room r on r.id = m.room_id and r.kind = 'direct'
       join chat_member o on o.room_id = r.id and o.user_id <> m.user_id
      where m.user_id = $1`,
    [userId],
  );
  return rows.map((r) => r.user_id);
}

/** A school admin's oversight list: every room in the school, members or not. */
export async function listSchoolRooms(
  schoolId: string,
  viewerUserId: string,
  opts: { q?: string | null; kind?: string | null },
): Promise<RoomSummary[]> {
  const { rows } = await pool.query<SummaryRow>(
    `select ${SUMMARY_COLUMNS}
       from chat_room r
       left join chat_member m on m.room_id = r.id and m.user_id = $1
       ${LAST_MESSAGE_JOIN}
      where r.school_id = $2 and r.last_message_at is not null
        and ($3::text is null or r.kind = $3)
        and ($4::text is null or r.title ilike '%' || $4 || '%' or exists (
              select 1 from chat_member pm
                join users pu on pu.id = pm.user_id
                left join staff ps on ps.user_id = pu.id
                left join students pst on pst.user_id = pu.id
                left join guardian pg on pg.user_id = pu.id
               where pm.room_id = r.id and concat_ws(' ', ps.first_name, ps.last_name, pst.first_name,
                     pst.last_name, pg.first_name, pg.last_name, pu.email) ilike '%' || $4 || '%'))
      order by r.last_message_at desc
      limit 200`,
    [viewerUserId, schoolId, opts.kind || null, opts.q?.trim() || null],
  );
  const summaries = await toSummaries(rows);
  // A direct chat the admin isn't in has no "other": name it after both people.
  const directIds = summaries.filter((s) => s.kind === "direct" && s.myRole === null).map((s) => s.id);
  if (directIds.length > 0) {
    const { rows: pairs } = await pool.query<{ room_id: string; user_id: string }>(
      `select room_id, user_id from chat_member where room_id = any($1::uuid[])`,
      [directIds],
    );
    const people = await findPeople(pairs.map((p) => p.user_id));
    for (const s of summaries) {
      if (s.kind !== "direct" || s.myRole !== null) continue;
      const names = pairs.filter((p) => p.room_id === s.id).map((p) => people.get(p.user_id)?.name ?? "Former member");
      s.title = names.join(" & ");
      s.other = null;
      s.photoUrl = null;
    }
  }
  return summaries;
}

export function mayCreateGroups(role: string): boolean {
  return isStaff(role);
}
