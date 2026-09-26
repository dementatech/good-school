import { pool } from "../../../shared/db/index.js";

// The support desk (see migrations/1700000072000_support-desk.cjs). Anyone
// signed in files tickets and sees only their own; support staff — the
// platform owner and any support agents — see every ticket and move it
// through open → in_progress → resolved/closed.

export const TICKET_KINDS = ["problem", "feature", "question"] as const;
export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export type TicketKind = (typeof TICKET_KINDS)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export interface TicketReply {
  id: number;
  body: string;
  fromSupport: boolean;
  createdAt: string;
}

export interface TicketRecord {
  id: number;
  kind: TicketKind;
  subject: string;
  description: string;
  pageUrl: string | null;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  replyCount: number;
  /** Only filled on the owner's inbox — a reporter already knows who they are. */
  reporter?: {
    id: string;
    name: string | null;
    role: string;
    email: string | null;
    phoneNumber: string | null;
    systemId: string | null;
    schoolName: string | null;
  };
}

interface TicketRow {
  id: number;
  kind: TicketKind;
  subject: string;
  description: string;
  page_url: string | null;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  reply_count: number;
  reporter_id: string;
  reporter_role: string;
  reporter_name?: string | null;
  reporter_email?: string | null;
  reporter_phone?: string | null;
  reporter_system_id?: string | null;
  school_name?: string | null;
}

function mapRow(row: TicketRow, withReporter: boolean): TicketRecord {
  return {
    id: row.id,
    kind: row.kind,
    subject: row.subject,
    description: row.description,
    pageUrl: row.page_url,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    replyCount: row.reply_count,
    ...(withReporter
      ? {
          reporter: {
            id: row.reporter_id,
            name: row.reporter_name ?? null,
            role: row.reporter_role,
            email: row.reporter_email ?? null,
            phoneNumber: row.reporter_phone ?? null,
            systemId: row.reporter_system_id ?? null,
            schoolName: row.school_name ?? null,
          },
        }
      : {}),
  };
}

const TICKET_COLUMNS = `
  t.id, t.kind, t.subject, t.description, t.page_url, t.status,
  t.created_at, t.updated_at, t.resolved_at, t.reporter_id, t.reporter_role,
  (select count(*)::int from support_ticket_reply r where r.ticket_id = t.id) as reply_count
`;

// `users` holds no names — they live on the role profile (staff, students,
// guardian), same as the Accounts page resolves them.
const REPORTER_COLUMNS = `
  coalesce(
    nullif(trim(concat_ws(' ', sf.first_name, sf.last_name)), ''),
    nullif(trim(concat_ws(' ', st.first_name, st.last_name)), ''),
    nullif(trim(concat_ws(' ', g.first_name, g.last_name)), '')
  ) as reporter_name,
  u.email as reporter_email, u.phone_number as reporter_phone,
  u.system_id as reporter_system_id, sc.name as school_name
`;

const REPORTER_JOINS = `
  join users u on u.id = t.reporter_id
  left join schools sc on sc.id = t.school_id
  left join staff sf on sf.user_id = u.id
  left join students st on st.user_id = u.id
  left join guardian g on g.user_id = u.id and g.merged_into_guardian_id is null
`;

export interface CreateTicketInput {
  kind: TicketKind;
  subject: string;
  description: string;
  pageUrl?: string | null;
}

export async function createTicket(
  reporter: { userId: string; role: string; schoolId: string | null },
  input: CreateTicketInput,
): Promise<TicketRecord & { reporterId: string; reporterRole: string }> {
  const { rows } = await pool.query<{ id: number }>(
    `insert into support_ticket (reporter_id, school_id, reporter_role, kind, subject, description, page_url)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [
      reporter.userId,
      reporter.schoolId,
      reporter.role,
      input.kind,
      input.subject.trim(),
      input.description.trim(),
      input.pageUrl?.trim() || null,
    ],
  );
  return (await findTicket(rows[0].id, { withReporter: false }))!;
}

export async function listTicketsForReporter(userId: string): Promise<TicketRecord[]> {
  const { rows } = await pool.query<TicketRow>(
    `select ${TICKET_COLUMNS} from support_ticket t
      where t.reporter_id = $1
      order by t.updated_at desc`,
    [userId],
  );
  return rows.map((r) => mapRow(r, false));
}

export async function listAllTickets(filter: { status?: TicketStatus; kind?: TicketKind }): Promise<TicketRecord[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    params.push(filter.status);
    conditions.push(`t.status = $${params.length}`);
  }
  if (filter.kind) {
    params.push(filter.kind);
    conditions.push(`t.kind = $${params.length}`);
  }
  const { rows } = await pool.query<TicketRow>(
    `select ${TICKET_COLUMNS}, ${REPORTER_COLUMNS}
       from support_ticket t
       ${REPORTER_JOINS}
      ${conditions.length ? `where ${conditions.join(" and ")}` : ""}
      order by (t.status in ('open', 'in_progress')) desc, t.updated_at desc`,
    params,
  );
  return rows.map((r) => mapRow(r, true));
}

export async function ticketCounts(): Promise<Record<TicketStatus, number>> {
  const { rows } = await pool.query<{ status: TicketStatus; count: number }>(
    `select status, count(*)::int as count from support_ticket group by status`,
  );
  const counts = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
  for (const row of rows) counts[row.status] = row.count;
  return counts;
}

export async function findTicket(
  id: number,
  opts: { withReporter: boolean },
): Promise<(TicketRecord & { reporterId: string; reporterRole: string }) | null> {
  const { rows } = await pool.query<TicketRow>(
    opts.withReporter
      ? `select ${TICKET_COLUMNS}, ${REPORTER_COLUMNS} from support_ticket t ${REPORTER_JOINS} where t.id = $1`
      : `select ${TICKET_COLUMNS} from support_ticket t where t.id = $1`,
    [id],
  );
  const row = rows[0];
  return row
    ? { ...mapRow(row, opts.withReporter), reporterId: row.reporter_id, reporterRole: row.reporter_role }
    : null;
}

export async function listReplies(ticketId: number): Promise<TicketReply[]> {
  const { rows } = await pool.query<{ id: number; body: string; from_support: boolean; created_at: string }>(
    `select id, body, from_support, created_at
       from support_ticket_reply
      where ticket_id = $1
      order by created_at`,
    [ticketId],
  );
  return rows.map((r) => ({ id: r.id, body: r.body, fromSupport: r.from_support, createdAt: r.created_at }));
}

export async function addReply(
  ticketId: number,
  authorId: string,
  body: string,
  fromSupport: boolean,
): Promise<TicketReply> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: number; body: string; from_support: boolean; created_at: string }>(
      `insert into support_ticket_reply (ticket_id, author_id, from_support, body)
       values ($1, $2, $3, $4)
       returning id, body, from_support, created_at`,
      [ticketId, authorId, fromSupport, body.trim()],
    );
    // A reporter following up on a resolved ticket means it isn't — reopen it
    // so it lands back at the top of the owner's inbox.
    await client.query(
      `update support_ticket
          set updated_at = now(),
              status = case when $2 = false and status in ('resolved', 'closed') then 'open' else status end,
              resolved_at = case when $2 = false and status in ('resolved', 'closed') then null else resolved_at end
        where id = $1`,
      [ticketId, fromSupport],
    );
    await client.query("COMMIT");
    const r = rows[0];
    return { id: r.id, body: r.body, fromSupport: r.from_support, createdAt: r.created_at };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function setTicketStatus(ticketId: number, status: TicketStatus): Promise<void> {
  await pool.query(
    `update support_ticket
        set status = $2,
            updated_at = now(),
            resolved_at = case when $2 in ('resolved', 'closed') then coalesce(resolved_at, now()) else null end
      where id = $1`,
    [ticketId, status],
  );
}

/** Everyone who works the inbox (owner + agents) — who a new ticket or a
 *  reporter's follow-up is announced to. */
export async function listSupportStaffIds(): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `select id from users where (is_platform_owner or is_support_agent) and is_active`,
  );
  return rows.map((r) => r.id);
}

/** The platform owner or a support agent. */
export async function isSupportStaff(userId: string): Promise<boolean> {
  const { rows } = await pool.query<{ ok: boolean }>(
    `select (is_platform_owner or is_support_agent) as ok from users where id = $1 and is_active`,
    [userId],
  );
  return rows[0]?.ok ?? false;
}
