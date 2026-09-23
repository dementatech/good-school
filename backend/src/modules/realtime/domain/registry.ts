import { randomBytes } from "node:crypto";
import type { WebSocket } from "ws";
import type { JwtPayload } from "../../../shared/types/index.js";

// The frontend (Vercel) and backend (droplet) are on different origins, so
// the browser opens the WebSocket straight to the backend — Next.js's
// rewrite proxy only handles plain HTTP, not the Upgrade handshake (see
// next.config.ts). That means the connection can't ride the HttpOnly
// session cookie the way every other request does (it's scoped to the
// frontend's origin). Instead: mint a one-time ticket over an ordinary,
// cookie-authenticated REST call (same-origin, proxied as normal), then open
// the socket with that ticket in the query string. Never the JWT itself —
// URLs end up in access logs.
//
// Shared by every module that needs to push something to a signed-in user in
// real time (direct messages, notifications, ...) — one socket per tab
// carries every event type, distinguished by the `type` field each pushed
// payload includes.

const TICKET_TTL_MS = 30_000;

interface Ticket {
  authUser: JwtPayload;
  expiresAt: number;
}

const tickets = new Map<string, Ticket>();

export function issueTicket(authUser: JwtPayload): string {
  const ticket = randomBytes(24).toString("base64url");
  tickets.set(ticket, { authUser, expiresAt: Date.now() + TICKET_TTL_MS });
  return ticket;
}

/** Single-use: valid tickets are removed on first read whether or not
 *  they're expired, so a leaked/replayed ticket only ever works once. */
export function consumeTicket(ticket: string): JwtPayload | null {
  const entry = tickets.get(ticket);
  tickets.delete(ticket);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.authUser;
}

// Expired-but-never-consumed tickets (the visitor never opened the socket)
// would otherwise sit in the map forever.
setInterval(() => {
  const now = Date.now();
  for (const [ticket, entry] of tickets) {
    if (entry.expiresAt < now) tickets.delete(ticket);
  }
}, TICKET_TTL_MS).unref();

// One process, in-memory — same "nothing split out until a real bottleneck"
// call as the rest of this modular monolith (see claude.md). A multi-instance
// deployment would need this as Redis pub/sub instead.
const connections = new Map<string, Set<WebSocket>>();

export function subscribe(userId: string, socket: WebSocket): void {
  let set = connections.get(userId);
  if (!set) {
    set = new Set();
    connections.set(userId, set);
  }
  set.add(socket);
}

export function unsubscribe(userId: string, socket: WebSocket): void {
  const set = connections.get(userId);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) connections.delete(userId);
}

/** Best-effort: an offline user (or a dead socket that hasn't been cleaned
 *  up yet) is silently skipped — notifyUsers() already covers delivery to
 *  anyone not currently connected. */
export function pushToUser(userId: string, event: unknown): void {
  const set = connections.get(userId);
  if (!set) return;
  const payload = JSON.stringify(event);
  for (const socket of set) {
    try {
      socket.send(payload);
    } catch {
      // Dead socket — its own close handler will unsubscribe it.
    }
  }
}
