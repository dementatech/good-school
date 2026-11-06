import { pool } from "../../../shared/db/index.js";
import { deleteStoredFile, fileUrl, type StorageProvider, type StoredFile } from "../../../shared/media.js";
import { findPeople, type Person } from "./people.js";
import { ChatError } from "./rooms.repository.js";

// Messages, replies, edits, soft deletes and reactions. Callers check room
// access first (rooms.repository.ts accessFor); these functions only check
// what's specific to one message (is it yours, does it belong to this room).

export const REACTION_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export interface Attachment {
  url: string;
  name: string;
  mimeType: string;
  size: number | null;
  isImage: boolean;
}

export interface ReplyPreview {
  id: string;
  senderUserId: string | null;
  senderName: string | null;
  body: string;
  attachmentName: string | null;
  deleted: boolean;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  sender: Person | null;
  body: string;
  replyTo: ReplyPreview | null;
  attachment: Attachment | null;
  reactions: { emoji: string; userIds: string[] }[];
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

interface MessageRow {
  id: string;
  room_id: string;
  sender_user_id: string | null;
  body: string;
  reply_to_id: string | null;
  attachment_ref: string | null;
  attachment_provider: StorageProvider | null;
  attachment_mime: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

const COLUMNS = `id, room_id, sender_user_id, body, reply_to_id, attachment_ref, attachment_provider,
  attachment_mime, attachment_name, attachment_size, edited_at, deleted_at, created_at`;

async function hydrate(rows: MessageRow[]): Promise<ChatMessage[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const replyIds = rows.map((r) => r.reply_to_id).filter((id): id is string => Boolean(id));

  const [{ rows: reactions }, { rows: replies }] = await Promise.all([
    pool.query<{ message_id: string; emoji: string; user_ids: string[] }>(
      `select message_id, emoji, array_agg(user_id::text order by created_at) as user_ids
         from chat_reaction where message_id = any($1::uuid[])
        group by message_id, emoji
        order by min(created_at)`,
      [ids],
    ),
    replyIds.length > 0
      ? pool.query<MessageRow>(`select ${COLUMNS} from chat_message where id = any($1::uuid[])`, [replyIds])
      : Promise.resolve({ rows: [] as MessageRow[] }),
  ]);

  const people = await findPeople(
    [...rows, ...replies].map((r) => r.sender_user_id).filter((id): id is string => Boolean(id)),
  );
  const replyById = new Map(replies.map((r) => [r.id, r]));

  return rows.map((r) => {
    const deleted = r.deleted_at !== null;
    const reply = r.reply_to_id ? replyById.get(r.reply_to_id) : undefined;
    return {
      id: r.id,
      roomId: r.room_id,
      sender: r.sender_user_id ? (people.get(r.sender_user_id) ?? null) : null,
      body: deleted ? "" : r.body,
      replyTo: reply
        ? {
            id: reply.id,
            senderUserId: reply.sender_user_id,
            senderName: reply.sender_user_id ? (people.get(reply.sender_user_id)?.name ?? null) : null,
            body: reply.deleted_at ? "" : reply.body.slice(0, 200),
            attachmentName: reply.deleted_at ? null : reply.attachment_name,
            deleted: reply.deleted_at !== null,
          }
        : null,
      attachment:
        !deleted && r.attachment_ref
          ? {
              url: fileUrl({
                provider: r.attachment_provider ?? "local",
                ref: r.attachment_ref,
                mimeType: r.attachment_mime ?? "application/octet-stream",
              }),
              name: r.attachment_name ?? "file",
              mimeType: r.attachment_mime ?? "application/octet-stream",
              size: r.attachment_size,
              isImage: (r.attachment_mime ?? "").startsWith("image/"),
            }
          : null,
      reactions: deleted
        ? []
        : reactions.filter((x) => x.message_id === r.id).map((x) => ({ emoji: x.emoji, userIds: x.user_ids })),
      editedAt: r.edited_at,
      deletedAt: r.deleted_at,
      createdAt: r.created_at,
    };
  });
}

/** One page of a room's history, oldest first. `before` pages backwards. */
export async function listMessages(
  roomId: string,
  opts: { before?: string | null; limit?: number },
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const { rows } = await pool.query<MessageRow>(
    `select ${COLUMNS} from chat_message
      where room_id = $1 and ($2::timestamptz is null or created_at < $2)
      order by created_at desc
      limit $3`,
    [roomId, opts.before || null, limit + 1],
  );
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  return { messages: await hydrate(page), hasMore };
}

export async function getMessage(messageId: string): Promise<ChatMessage | null> {
  const { rows } = await pool.query<MessageRow>(`select ${COLUMNS} from chat_message where id = $1`, [messageId]);
  return (await hydrate(rows))[0] ?? null;
}

async function messageRow(messageId: string): Promise<MessageRow> {
  const { rows } = await pool.query<MessageRow>(`select ${COLUMNS} from chat_message where id = $1`, [messageId]);
  if (!rows[0]) throw new ChatError(404, "Message not found");
  return rows[0];
}

/** The room a message is in, for the route's access check. */
export async function roomOfMessage(messageId: string): Promise<string> {
  return (await messageRow(messageId)).room_id;
}

export async function postMessage(input: {
  roomId: string;
  senderUserId: string;
  body: string;
  replyToId?: string | null;
  attachment?: (StoredFile & { name: string; size: number }) | null;
}): Promise<ChatMessage> {
  if (input.replyToId) {
    const target = await messageRow(input.replyToId).catch(() => null);
    if (!target || target.room_id !== input.roomId) throw new ChatError(400, "You can only reply to a message in this chat.");
  }
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<MessageRow>(
      `insert into chat_message (room_id, sender_user_id, body, reply_to_id, attachment_ref, attachment_provider,
                                 attachment_mime, attachment_name, attachment_size)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning ${COLUMNS}`,
      [
        input.roomId,
        input.senderUserId,
        input.body,
        input.replyToId ?? null,
        input.attachment?.ref ?? null,
        input.attachment?.provider ?? null,
        input.attachment?.mimeType ?? null,
        input.attachment?.name ?? null,
        input.attachment?.size ?? null,
      ],
    );
    await client.query(`update chat_room set last_message_at = $2 where id = $1`, [input.roomId, rows[0].created_at]);
    // Sending a message means you've read everything before it.
    await client.query(`update chat_member set last_read_at = $3 where room_id = $1 and user_id = $2`, [
      input.roomId,
      input.senderUserId,
      rows[0].created_at,
    ]);
    await client.query("commit");
    return (await hydrate(rows))[0];
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function editMessage(messageId: string, userId: string, body: string): Promise<ChatMessage> {
  const row = await messageRow(messageId);
  if (row.sender_user_id !== userId) throw new ChatError(403, "You can only edit your own messages.");
  if (row.deleted_at) throw new ChatError(409, "That message was deleted.");
  if (!body.trim() && !row.attachment_ref) throw new ChatError(400, "A message can't be empty.");
  await pool.query(`update chat_message set body = $2, edited_at = now() where id = $1`, [messageId, body]);
  return (await getMessage(messageId))!;
}

/** Soft delete. The sender, or a moderator (`canModerate`), may delete. */
export async function deleteMessage(messageId: string, userId: string, canModerate: boolean): Promise<ChatMessage> {
  const row = await messageRow(messageId);
  if (row.sender_user_id !== userId && !canModerate) throw new ChatError(403, "You can only delete your own messages.");
  if (!row.deleted_at) {
    await pool.query(
      `update chat_message set deleted_at = now(), body = '', attachment_ref = null, attachment_provider = null,
              attachment_name = null, attachment_mime = null, attachment_size = null
        where id = $1`,
      [messageId],
    );
    await pool.query(`delete from chat_reaction where message_id = $1`, [messageId]);
    if (row.attachment_ref) {
      await deleteStoredFile({
        provider: row.attachment_provider ?? "local",
        ref: row.attachment_ref,
        mimeType: row.attachment_mime ?? "application/octet-stream",
      }).catch(() => {});
    }
  }
  return (await getMessage(messageId))!;
}

/** Adds the reaction, or takes it away if this person already gave it. */
export async function toggleReaction(messageId: string, userId: string, emoji: string): Promise<ChatMessage> {
  if (!REACTION_EMOJI.includes(emoji)) throw new ChatError(400, "That reaction isn't available.");
  const row = await messageRow(messageId);
  if (row.deleted_at) throw new ChatError(409, "That message was deleted.");
  const { rowCount } = await pool.query(
    `delete from chat_reaction where message_id = $1 and user_id = $2 and emoji = $3`,
    [messageId, userId, emoji],
  );
  if (!rowCount) {
    await pool.query(`insert into chat_reaction (message_id, user_id, emoji) values ($1, $2, $3) on conflict do nothing`, [
      messageId,
      userId,
      emoji,
    ]);
  }
  return (await getMessage(messageId))!;
}
