import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyToken } from "../domain/tokens.js";
import type { Role } from "../../../shared/types/index.js";
import { PORTAL_HEADER, directorOfStudies, isDosArea } from "../../../shared/dos.js";

const COOKIE_NAME = "school_os_token";

// preHandler other modules attach to routes that require a logged-in user.
// Optionally restrict to specific roles, e.g. requireAuth(["admin"]).
export function requireAuth(allowedRoles?: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[COOKIE_NAME];
    if (!token) {
      return reply.status(401).send({ error: "not_authenticated" });
    }

    let payload: ReturnType<typeof verifyToken>;
    try {
      payload = verifyToken(token);
    } catch {
      return reply.status(401).send({ error: "invalid_token" });
    }
    // The Director of Studies, working from their portal, acts as the school
    // admin in the academic areas only (see shared/dos.ts).
    if (
      payload.role === "teacher" &&
      payload.school_id &&
      request.headers[PORTAL_HEADER] === "dos" &&
      isDosArea(request.method, request.url) &&
      (await directorOfStudies(payload.school_id, payload.user_id))
    ) {
      payload = { ...payload, role: "school_admin" };
    }
    if (allowedRoles && !allowedRoles.includes(payload.role)) {
      return reply.status(403).send({ error: "forbidden" });
    }
    request.authUser = payload;
  };
}
