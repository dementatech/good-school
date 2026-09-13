import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { ok, fail } from "../../../shared/envelope.js";
import { getStudentExamResult, listPublishedExamsForStudent } from "../../exams/index.js";
import { listChildrenForGuardianUser, type LinkedChild } from "../domain/guardians.repository.js";

const PARENT = requireAuth(["parent"]);

// Confirms `studentId` (from the querystring) is actually one of the calling
// parent's linked children before letting them read anything about that
// student — without this a parent could read another family's results just
// by guessing a studentId.
async function requireLinkedChild(
  request: FastifyRequest<{ Querystring: { studentId?: string } }>,
  reply: FastifyReply,
): Promise<LinkedChild | null> {
  const studentId = request.query.studentId;
  if (!studentId) {
    reply.status(400).send(fail("student_id_required"));
    return null;
  }
  const children = await listChildrenForGuardianUser(request.authUser!.user_id);
  const child = children.find((c) => c.id === studentId);
  if (!child) {
    reply.status(403).send(fail("not_your_child"));
    return null;
  }
  return child;
}

export async function parentsRoutes(fastify: FastifyInstance) {
  fastify.get("/children", { preHandler: PARENT }, async (request) => {
    return ok(await listChildrenForGuardianUser(request.authUser!.user_id));
  });

  fastify.get<{ Querystring: { studentId?: string } }>(
    "/results",
    { preHandler: PARENT },
    async (request, reply) => {
      const child = await requireLinkedChild(request, reply);
      if (!child) return;
      return ok(await listPublishedExamsForStudent(child.schoolId, child.id));
    },
  );

  fastify.get<{ Params: { id: string }; Querystring: { studentId?: string } }>(
    "/results/:id",
    { preHandler: PARENT },
    async (request, reply) => {
      const child = await requireLinkedChild(request, reply);
      if (!child) return;
      const result = await getStudentExamResult(child.schoolId, request.params.id, child.id);
      return result ? ok(result) : reply.status(404).send(fail("not_found"));
    },
  );
}
