import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { notifyUser, notifyUsers } from "../../notifications/index.js";
import { ok, fail } from "../../../shared/envelope.js";
import { sendEmail } from "../../../shared/email/index.js";
import { pool } from "../../../shared/db/index.js";
import {
  addReply,
  createTicket,
  findTicket,
  isPlatformOwner,
  listAllTickets,
  listPlatformOwnerIds,
  listReplies,
  listTicketsForReporter,
  setTicketStatus,
  ticketCounts,
  type CreateTicketInput,
  type TicketKind,
  type TicketRecord,
  type TicketStatus,
} from "../domain/support.repository.js";
import {
  createTicketBodySchema,
  inboxQuerySchema,
  replyBodySchema,
  ticketParamsSchema,
  updateTicketBodySchema,
} from "./schemas.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

const AUTHENTICATED = requireAuth();
const SUPER = requireAuth(["super_admin"]);

/** super_admin gets you through the door; only the owner flag gets you the
 *  inbox. Checked against the database on every call rather than carried in
 *  the JWT, so revoking the flag takes effect immediately. */
async function requireOwner(request: FastifyRequest, reply: FastifyReply) {
  await SUPER(request, reply);
  if (reply.sent) return;
  if (!(await isPlatformOwner(request.authUser!.user_id))) {
    return reply.status(403).send({ error: "forbidden" });
  }
}

/** Where a reporter reads their tickets — each portal has its own copy of the
 *  support page, so the notification lands them inside the portal they use. */
function supportPathFor(role: string): string {
  switch (role) {
    case "student":
      return "/student/support";
    case "parent":
      return "/parent/support";
    case "teacher":
      return "/staff/support";
    case "school_admin":
      return "/school-admin/support";
    default:
      return "/admin/support";
  }
}

const KIND_LABELS: Record<TicketKind, string> = {
  problem: "Problem",
  feature: "Feature request",
  question: "Question",
};

const STATUS_MESSAGES: Partial<Record<TicketStatus, string>> = {
  open: "Reopened",
  in_progress: "We're working on it",
  resolved: "Resolved",
  closed: "Closed",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function userEmail(userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ email: string | null }>(`select email from users where id = $1`, [userId]);
  return rows[0]?.email ?? null;
}

/** Best-effort, like notifyUser — mail failing must never fail the request. */
function emailQuietly(to: string | null, subject: string, lines: string[], link: string) {
  if (!to) return;
  const url = `${APP_URL}${link}`;
  sendEmail({
    to,
    subject,
    text: [...lines, "", `Open it here: ${url}`].join("\n"),
    html: lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("") + `<p><a href="${url}">Open it in Good School</a></p>`,
  }).catch((err) => console.warn("[support] email failed:", err));
}

async function announceNewTicket(ticket: TicketRecord) {
  const ownerIds = await listPlatformOwnerIds();
  const link = `/admin/system/support?ticket=${ticket.id}`;
  const title = `New ${KIND_LABELS[ticket.kind].toLowerCase()}: ${ticket.subject}`;
  await notifyUsers(ownerIds, { type: "support_ticket_new", title, body: ticket.description.slice(0, 200), link });
  for (const ownerId of ownerIds) {
    emailQuietly(await userEmail(ownerId), `[Support #${ticket.id}] ${title}`, [ticket.description], link);
  }
}

async function notifyReporter(
  ticket: TicketRecord & { reporterId: string; reporterRole: string },
  title: string,
  body: string,
) {
  const link = `${supportPathFor(ticket.reporterRole)}?ticket=${ticket.id}`;
  await notifyUser({ userId: ticket.reporterId, type: "support_ticket_update", title, body, link });
  emailQuietly(
    await userEmail(ticket.reporterId),
    `[Support #${ticket.id}] ${title}`,
    [`About your report "${ticket.subject}":`, body].filter(Boolean),
    link,
  );
}

/** The ticket as the API returns it — the lookup-only fields stay server-side. */
function publicTicket(ticket: TicketRecord & { reporterId: string; reporterRole: string }): TicketRecord {
  const out: Partial<typeof ticket> = { ...ticket };
  delete out.reporterId;
  delete out.reporterRole;
  return out as TicketRecord;
}

export async function supportRoutes(fastify: FastifyInstance) {
  // ═══ Reporter side — any signed-in user ═══════════════════════════════════

  fastify.post<{ Body: CreateTicketInput }>(
    "/tickets",
    { preHandler: AUTHENTICATED, schema: { body: createTicketBodySchema } },
    async (request, reply) => {
      const { user_id, role, school_id } = request.authUser!;
      const ticket = await createTicket({ userId: user_id, role, schoolId: school_id }, request.body);
      void announceNewTicket(ticket).catch(() => {});
      return reply.status(201).send(ok(publicTicket(ticket)));
    },
  );

  fastify.get("/tickets", { preHandler: AUTHENTICATED }, async (request) => {
    return ok(await listTicketsForReporter(request.authUser!.user_id));
  });

  // The reporter reads their own ticket; the owner reads any.
  fastify.get<{ Params: { id: number } }>(
    "/tickets/:id",
    { preHandler: AUTHENTICATED, schema: { params: ticketParamsSchema } },
    async (request, reply) => {
      const userId = request.authUser!.user_id;
      const owner = await isPlatformOwner(userId);
      const ticket = await findTicket(request.params.id, { withReporter: owner });
      if (!ticket || (!owner && ticket.reporterId !== userId)) return reply.status(404).send(fail("not_found"));
      return ok({ ...publicTicket(ticket), replies: await listReplies(ticket.id) });
    },
  );

  fastify.post<{ Params: { id: number }; Body: { body: string } }>(
    "/tickets/:id/replies",
    { preHandler: AUTHENTICATED, schema: { params: ticketParamsSchema, body: replyBodySchema } },
    async (request, reply) => {
      const userId = request.authUser!.user_id;
      const ticket = await findTicket(request.params.id, { withReporter: false });
      if (!ticket) return reply.status(404).send(fail("not_found"));

      const isReporter = ticket.reporterId === userId;
      const owner = !isReporter && (await isPlatformOwner(userId));
      if (!isReporter && !owner) return reply.status(404).send(fail("not_found"));

      const created = await addReply(ticket.id, userId, request.body.body, owner);
      if (owner) {
        void notifyReporter(ticket, "Support replied to your report", created.body).catch(() => {});
      } else {
        const ownerIds = await listPlatformOwnerIds();
        void notifyUsers(ownerIds, {
          type: "support_ticket_reply",
          title: `Follow-up on #${ticket.id}: ${ticket.subject}`,
          body: created.body.slice(0, 200),
          link: `/admin/system/support?ticket=${ticket.id}`,
        });
      }
      return reply.status(201).send(ok(created));
    },
  );

  // ═══ Owner side — the support inbox ═══════════════════════════════════════

  fastify.get<{ Querystring: { status?: TicketStatus; kind?: TicketKind } }>(
    "/inbox",
    { preHandler: requireOwner, schema: { querystring: inboxQuerySchema } },
    async (request) => {
      const [tickets, counts] = await Promise.all([listAllTickets(request.query), ticketCounts()]);
      return ok({ tickets, counts });
    },
  );

  // Move a ticket along, optionally with a note to the reporter. The reporter
  // is always told — resolving an issue quietly is the thing this is for.
  fastify.patch<{ Params: { id: number }; Body: { status: TicketStatus; message?: string | null } }>(
    "/inbox/:id",
    { preHandler: requireOwner, schema: { params: ticketParamsSchema, body: updateTicketBodySchema } },
    async (request, reply) => {
      const ticket = await findTicket(request.params.id, { withReporter: false });
      if (!ticket) return reply.status(404).send(fail("not_found"));

      const { status } = request.body;
      const message = request.body.message?.trim() || "";
      if (message) await addReply(ticket.id, request.authUser!.user_id, message, true);
      await setTicketStatus(ticket.id, status);

      if (status !== ticket.status || message) {
        const title =
          status !== ticket.status && STATUS_MESSAGES[status]
            ? `${STATUS_MESSAGES[status]}: ${ticket.subject}`
            : "Support replied to your report";
        const body = message || (status === "resolved" ? "The issue you reported has been resolved. Thank you for letting us know." : "");
        void notifyReporter(ticket, title, body).catch(() => {});
      }

      const updated = await findTicket(ticket.id, { withReporter: true });
      return ok({ ...publicTicket(updated!), replies: await listReplies(ticket.id) });
    },
  );
}
