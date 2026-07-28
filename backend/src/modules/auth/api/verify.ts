import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyToken } from "../domain/tokens.js";
import type { Role } from "../../../shared/types/index.js";

const COOKIE_NAME = "school_os_token";

// preHandler other modules attach to routes that require a logged-in user.
// Optionally restrict to specific roles, e.g. requireAuth(["admin"]).
export function requireAuth(allowedRoles?: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[COOKIE_NAME];
    if (!token) {
      return reply.status(401).send({ error: "not_authenticated" });
    }

    try {
      const payload = verifyToken(token);
      if (allowedRoles && !allowedRoles.includes(payload.role)) {
        return reply.status(403).send({ error: "forbidden" });
      }
      request.authUser = payload;
    } catch {
      return reply.status(401).send({ error: "invalid_token" });
    }
  };
}
