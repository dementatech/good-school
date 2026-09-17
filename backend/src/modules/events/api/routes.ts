import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { ok, fail } from "../../../shared/envelope.js";
import {
  SystemManagedEventError,
  createEvent,
  deleteEvent,
  listGlobalEvents,
  listSchoolEvents,
  updateEvent,
  type EventInput,
} from "../domain/events.repository.js";
import { createEventBodySchema, listEventsQuerySchema, updateEventBodySchema } from "./schemas.js";

// Any signed-in member of a school (plus super_admin, for the global
// calendar) can read; only a school_admin (their own school) or super_admin
// (global-only) can write. school_admin's PortalGate never lets a plain
// `admin` role near this route, so it's deliberately left out of MANAGE.
const MEMBER = requireAuth();
const MANAGE = requireAuth(["school_admin", "super_admin"]);

/** null = super_admin acting on global events; a string = a school_admin's
 *  own school. Never lets a school_admin without a school through. */
function ownerScope(request: FastifyRequest, reply: FastifyReply): { schoolId: string | null } | null {
  if (request.authUser!.role === "super_admin") return { schoolId: null };
  const schoolId = request.authUser!.school_id;
  if (!schoolId) {
    reply.status(404).send(fail("no_school"));
    return null;
  }
  return { schoolId };
}

export async function eventsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { from: string; to: string } }>(
    "/",
    { preHandler: MEMBER, schema: { querystring: listEventsQuerySchema } },
    async (request, reply) => {
      const { from, to } = request.query;
      if (request.authUser!.role === "super_admin") return ok(await listGlobalEvents({ from, to }));

      const schoolId = request.authUser!.school_id;
      if (!schoolId) return reply.status(404).send(fail("no_school"));
      return ok(await listSchoolEvents(schoolId, request.authUser!.role, { from, to }));
    },
  );

  fastify.post<{ Body: EventInput }>(
    "/",
    { preHandler: MANAGE, schema: { body: createEventBodySchema } },
    async (request, reply) => {
      const scope = ownerScope(request, reply);
      if (!scope) return;
      const created = await createEvent(scope.schoolId, request.authUser!.user_id, request.body);
      return reply.status(201).send(ok(created));
    },
  );

  fastify.patch<{ Params: { id: string }; Body: EventInput }>(
    "/:id",
    { preHandler: MANAGE, schema: { body: updateEventBodySchema } },
    async (request, reply) => {
      const scope = ownerScope(request, reply);
      if (!scope) return;
      try {
        const updated = await updateEvent(scope.schoolId, request.params.id, request.body);
        return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
      } catch (err) {
        if (err instanceof SystemManagedEventError) return reply.status(409).send(fail(err.message));
        throw err;
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>("/:id", { preHandler: MANAGE }, async (request, reply) => {
    const scope = ownerScope(request, reply);
    if (!scope) return;
    try {
      const deleted = await deleteEvent(scope.schoolId, request.params.id);
      return deleted ? reply.status(204).send() : reply.status(404).send(fail("not_found"));
    } catch (err) {
      if (err instanceof SystemManagedEventError) return reply.status(409).send(fail(err.message));
      throw err;
    }
  });
}
