import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { ok, fail } from "../../../shared/envelope.js";
import {
  SystemManagedEventError,
  createEvent,
  deleteEvent,
  disableEventSharing,
  enableEventSharing,
  getPublicEvent,
  listGlobalEvents,
  listSchoolEvents,
  setEventThumbnail,
  updateEvent,
  type EventInput,
} from "../domain/events.repository.js";
import { createEventBodySchema, listEventsQuerySchema, updateEventBodySchema } from "./schemas.js";
import { listUserIdsForSchool } from "../../schools/index.js";
import { pushToUser } from "../../realtime/index.js";
import { IMAGE_MIME_TO_EXT, UnsupportedFileTypeError } from "../../../shared/media.js";
import { optimiseDisplayImage } from "../../../shared/image.js";

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
  // No login: this is what a shared link opens. Only events someone chose to
  // share have a token, and only the PublicEvent fields come back.
  fastify.get<{ Params: { token: string } }>("/public/:token", async (request, reply) => {
    const event = await getPublicEvent(request.params.token);
    return event ? ok(event) : reply.status(404).send(fail("not_found"));
  });

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
      // school_admin only — a super_admin's global event would mean fanning
      // out to every school, which isn't worth the blast radius for a
      // "don't make me reload the calendar" nicety. Best-effort like every
      // other push: an offline user just sees it on their next visit.
      if (scope.schoolId) {
        for (const userId of await listUserIdsForSchool(scope.schoolId)) {
          pushToUser(userId, {
            type: "calendar_event",
            event: { id: created.id, title: created.title, eventDate: created.eventDate },
          });
        }
      }
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

  // Multipart, @fastify/multipart is registered globally in server.ts (5 MB / 1 file
  // cap). Same pattern as a school's logo.
  fastify.post<{ Params: { id: string } }>("/:id/thumbnail", { preHandler: MANAGE }, async (request, reply) => {
    const scope = ownerScope(request, reply);
    if (!scope) return;
    const uploaded = await request.file();
    if (!uploaded) return reply.status(400).send(fail("No file uploaded"));
    // Checked before decoding, so only the three picture types ever reach the decoder.
    if (!IMAGE_MIME_TO_EXT[uploaded.mimetype]) {
      return reply.status(400).send(fail("Only JPEG, PNG, or WebP images are accepted"));
    }
    let picture: { mimeType: string; data: Buffer };
    try {
      // Shrunk once here so the calendar, public page and link preview all load quickly.
      picture = await optimiseDisplayImage(await uploaded.toBuffer());
    } catch {
      return reply.status(400).send(fail("That file couldn't be read as a picture"));
    }
    try {
      const updated = await setEventThumbnail(scope.schoolId, request.params.id, picture);
      return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
    } catch (err) {
      if (err instanceof UnsupportedFileTypeError) return reply.status(400).send(fail(err.message));
      throw err;
    }
  });

  fastify.delete<{ Params: { id: string } }>("/:id/thumbnail", { preHandler: MANAGE }, async (request, reply) => {
    const scope = ownerScope(request, reply);
    if (!scope) return;
    const updated = await setEventThumbnail(scope.schoolId, request.params.id, null);
    return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
  });

  fastify.post<{ Params: { id: string } }>("/:id/share", { preHandler: MANAGE }, async (request, reply) => {
    const scope = ownerScope(request, reply);
    if (!scope) return;
    const updated = await enableEventSharing(scope.schoolId, request.params.id);
    return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
  });

  fastify.delete<{ Params: { id: string } }>("/:id/share", { preHandler: MANAGE }, async (request, reply) => {
    const scope = ownerScope(request, reply);
    if (!scope) return;
    const updated = await disableEventSharing(scope.schoolId, request.params.id);
    return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
  });

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
