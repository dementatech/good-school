import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { ok, fail } from "../../../shared/envelope.js";
import { notifyUsers } from "../../notifications/index.js";
import {
  NotFoundError,
  UnknownReferenceError,
  countUnreadForAdmin,
  countUnreadForTeacher,
  getOrCreateConversation,
  getParticipants,
  listConversationsForAdmin,
  listConversationsForTeacher,
  listMessages,
  markRead,
  postMessage,
} from "../domain/conversations.repository.js";
import {
  NotAssignedError,
  listOwnedClasses,
  listSentBroadcasts,
  prepareClassBroadcast,
  prepareTeacherBroadcast,
} from "../domain/broadcasts.repository.js";
import { pushToUser } from "../../realtime/index.js";
import {
  broadcastClassBodySchema,
  broadcastTeachersBodySchema,
  postMessageBodySchema,
  startConversationBodySchema,
} from "./schemas.js";

const SCHOOL_ADMIN = requireAuth(["school_admin"]);
const TEACHER = requireAuth(["teacher"]);
const EITHER = requireAuth(["school_admin", "teacher"]);

function schoolOf(request: FastifyRequest, reply: FastifyReply): string | null {
  const schoolId = request.authUser?.school_id ?? null;
  if (!schoolId) {
    reply.status(400).send(fail("no_school_context"));
    return null;
  }
  return schoolId;
}

export async function communicationsRoutes(fastify: FastifyInstance) {
  // ── Broadcasts (one-way) ─────────────────────────────────────────────────

  fastify.post<{ Body: { title: string; body: string } }>(
    "/broadcasts/teachers",
    { preHandler: SCHOOL_ADMIN, schema: { body: broadcastTeachersBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const { recipientUserIds, broadcast } = await prepareTeacherBroadcast(
        schoolId,
        request.authUser!.user_id,
        request.body.title,
        request.body.body,
      );
      void notifyUsers(recipientUserIds, {
        type: "admin_broadcast",
        title: request.body.title,
        body: request.body.body,
      });
      return reply.status(201).send(ok(broadcast));
    },
  );

  // Classes/streams this teacher may broadcast to — feeds the frontend picker.
  fastify.get("/broadcasts/classes", { preHandler: TEACHER }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    return ok(await listOwnedClasses(schoolId, request.authUser!.user_id));
  });

  fastify.post<{ Body: { classId: string; streamId?: string | null; title: string; body: string } }>(
    "/broadcasts/class",
    { preHandler: TEACHER, schema: { body: broadcastClassBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const { recipientUserIds, broadcast } = await prepareClassBroadcast(
          schoolId,
          request.authUser!.user_id,
          request.body.classId,
          request.body.streamId ?? null,
          request.body.title,
          request.body.body,
        );
        void notifyUsers(recipientUserIds, {
          type: "class_broadcast",
          title: request.body.title,
          body: request.body.body,
        });
        return reply.status(201).send(ok(broadcast));
      } catch (err) {
        if (err instanceof NotAssignedError) return reply.status(403).send(fail(err.message));
        throw err;
      }
    },
  );

  fastify.get("/broadcasts/sent", { preHandler: EITHER }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    return ok(await listSentBroadcasts(schoolId, request.authUser!.user_id));
  });

  // ── Direct messaging (admin <-> a specific teacher) ─────────────────────

  fastify.get("/conversations", { preHandler: EITHER }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    const { user_id: userId, role } = request.authUser!;
    return ok(
      role === "school_admin"
        ? await listConversationsForAdmin(schoolId, userId)
        : await listConversationsForTeacher(userId),
    );
  });

  // Cheap aggregate for the sidebar badge — avoids shipping the full
  // conversation list just to know whether to show a number.
  fastify.get("/unread-count", { preHandler: EITHER }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    const { user_id: userId, role } = request.authUser!;
    const count =
      role === "school_admin" ? await countUnreadForAdmin(schoolId, userId) : await countUnreadForTeacher(userId);
    return ok({ count });
  });

  // Admin-initiated only — a teacher replies within a thread the admin started.
  fastify.post<{ Body: { teacherUserId: string } }>(
    "/conversations",
    { preHandler: SCHOOL_ADMIN, schema: { body: startConversationBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const id = await getOrCreateConversation(schoolId, request.authUser!.user_id, request.body.teacherUserId);
        return reply.status(201).send(ok({ id }));
      } catch (err) {
        if (err instanceof UnknownReferenceError) return reply.status(400).send(fail(err.message));
        throw err;
      }
    },
  );

  /** Loads the conversation and confirms the caller is one of its two
   *  participants and it belongs to their school — 404/403 otherwise. */
  async function requireParticipant(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<{ side: "admin" | "teacher" } | null> {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return null;
    let participants;
    try {
      participants = await getParticipants(request.params.id);
    } catch (err) {
      if (err instanceof NotFoundError) {
        reply.status(404).send(fail("not_found"));
        return null;
      }
      throw err;
    }
    if (participants.school_id !== schoolId) {
      reply.status(404).send(fail("not_found"));
      return null;
    }
    const userId = request.authUser!.user_id;
    if (participants.admin_user_id === userId) return { side: "admin" };
    if (participants.teacher_user_id === userId) return { side: "teacher" };
    reply.status(403).send(fail("forbidden"));
    return null;
  }

  fastify.get<{ Params: { id: string } }>(
    "/conversations/:id/messages",
    { preHandler: EITHER },
    async (request, reply) => {
      const participant = await requireParticipant(request, reply);
      if (!participant) return;
      return ok(await listMessages(request.params.id));
    },
  );

  fastify.post<{ Params: { id: string }; Body: { body: string } }>(
    "/conversations/:id/messages",
    { preHandler: EITHER, schema: { body: postMessageBodySchema } },
    async (request, reply) => {
      const participant = await requireParticipant(request, reply);
      if (!participant) return;
      const message = await postMessage(request.params.id, request.authUser!.user_id, request.body.body);

      const participants = await getParticipants(request.params.id);
      const recipientUserId = participant.side === "admin" ? participants.teacher_user_id : participants.admin_user_id;
      const portal = participant.side === "admin" ? "/staff/communications" : "/school-admin/communications";

      // Instant delivery if they're online right now; notifyUsers below
      // covers the bell/push for when they're not.
      pushToUser(recipientUserId, { type: "message", conversationId: request.params.id, message });

      void notifyUsers([recipientUserId], {
        type: "direct_message",
        title: "New message",
        body: request.body.body,
        link: `${portal}?conversation=${request.params.id}`,
      });

      return reply.status(201).send(ok(message));
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/conversations/:id/read",
    { preHandler: EITHER },
    async (request, reply) => {
      const participant = await requireParticipant(request, reply);
      if (!participant) return;
      await markRead(request.params.id, request.authUser!.user_id, participant.side);
      return ok(null);
    },
  );
}
