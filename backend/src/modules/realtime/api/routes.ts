import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { ok } from "../../../shared/envelope.js";
import { consumeTicket, issueTicket, subscribe, unsubscribe } from "../domain/registry.js";

// Any signed-in role — this socket now carries direct messages (school_admin
// <-> teacher) as well as the general notification feed (which also reaches
// parents and students), so it can't be gated to admin/teacher the way the
// original messaging-only endpoint was.
const AUTHENTICATED = requireAuth();

export async function realtimeRoutes(fastify: FastifyInstance) {
  fastify.post("/ticket", { preHandler: AUTHENTICATED }, async (request) => {
    return ok({ ticket: issueTicket(request.authUser!) });
  });

  fastify.get<{ Querystring: { ticket?: string } }>(
    "/",
    { websocket: true },
    (socket, request) => {
      const authUser = request.query.ticket ? consumeTicket(request.query.ticket) : null;
      if (!authUser) {
        socket.close(4401, "invalid_ticket");
        return;
      }
      subscribe(authUser.user_id, socket);
      socket.on("close", () => unsubscribe(authUser.user_id, socket));
    },
  );
}
