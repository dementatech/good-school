import { pool } from "../../../shared/db/index.js";

export interface NotificationRecord {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  isRead: boolean;
}

interface NotificationRow {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  created_at: string;
  is_read: boolean;
}

function mapRow(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    createdAt: row.created_at,
    isRead: row.is_read,
  };
}

// The bell only ever shows a recent slice, not a full history — a growing
// unread count still surfaces via the separate count query below.
const FEED_LIMIT = 50;

export async function listForUser(
  userId: string,
): Promise<{ items: NotificationRecord[]; unread: number }> {
  const [feed, unread] = await Promise.all([
    pool.query<NotificationRow>(
      `select id, type, title, body, link, created_at, is_read
         from notification
        where user_id = $1
        order by created_at desc
        limit $2`,
      [userId, FEED_LIMIT],
    ),
    pool.query<{ count: number }>(
      `select count(*)::int as count from notification where user_id = $1 and is_read = false`,
      [userId],
    ),
  ]);
  return { items: feed.rows.map(mapRow), unread: unread.rows[0]?.count ?? 0 };
}

export async function markRead(userId: string, ids: number[] | "all"): Promise<void> {
  if (ids === "all") {
    await pool.query(`update notification set is_read = true where user_id = $1 and is_read = false`, [
      userId,
    ]);
    return;
  }
  if (ids.length === 0) return;
  await pool.query(`update notification set is_read = true where user_id = $1 and id = any($2::int[])`, [
    userId,
    ids,
  ]);
}

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string | null;
}

export async function createNotification(input: CreateNotificationInput): Promise<NotificationRecord> {
  const result = await pool.query<NotificationRow>(
    `insert into notification (user_id, type, title, body, link)
     values ($1, $2, $3, $4, $5)
     returning id, type, title, body, link, created_at, is_read`,
    [input.userId, input.type, input.title, input.body ?? "", input.link ?? null],
  );
  return mapRow(result.rows[0]);
}
