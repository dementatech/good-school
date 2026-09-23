import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { ok, fail } from "../../../shared/envelope.js";
import { SECTION_COOKIE, visibleLevelsFor } from "../../../shared/levels.js";
import {
  AttendanceError,
  attendanceSummary,
  getRegister,
  listRegisterClasses,
  saveRegister,
  studentAttendance,
  type AttendanceActor,
  type RegisterEntry,
} from "../domain/attendance.repository.js";
import { registerBodySchema } from "./schemas.js";

const ADMIN = requireAuth(["school_admin", "admin"]);
const TAKERS = requireAuth(["school_admin", "admin", "teacher"]);

function schoolOf(request: FastifyRequest, reply: FastifyReply): string | null {
  const schoolId = request.authUser?.school_id ?? null;
  if (!schoolId) {
    reply.status(400).send(fail("no_school_context"));
    return null;
  }
  return schoolId;
}

const actorOf = (request: FastifyRequest): AttendanceActor => ({
  userId: request.authUser!.user_id,
  role: request.authUser!.role,
});

// "Today" in East Africa Time (UTC+3).
const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

function replyError(err: unknown, reply: FastifyReply): FastifyReply {
  if (err instanceof AttendanceError) return reply.status(err.status).send(fail(err.message));
  throw err;
}

export async function attendanceRoutes(fastify: FastifyInstance) {
  // Classes whose register the caller keeps — today's progress for each.
  fastify.get<{ Querystring: { date?: string } }>("/classes", { preHandler: TAKERS }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    const levels = await visibleLevelsFor(request.authUser!, request.cookies[SECTION_COOKIE]);
    const date = request.query.date || today();
    return ok({ date, classes: await listRegisterClasses(schoolId, date, actorOf(request), levels) });
  });

  fastify.get<{ Querystring: { classId: string; date?: string; streamId?: string } }>(
    "/register",
    { preHandler: TAKERS },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        return ok(
          await getRegister(
            schoolId,
            request.query.classId,
            request.query.date || today(),
            request.query.streamId || null,
            actorOf(request),
          ),
        );
      } catch (err) {
        return replyError(err, reply);
      }
    },
  );

  fastify.put<{ Body: { classId: string; date: string; entries: RegisterEntry[] } }>(
    "/register",
    { preHandler: TAKERS, schema: { body: registerBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const saved = await saveRegister(
          schoolId,
          request.body.classId,
          request.body.date,
          request.body.entries,
          actorOf(request),
        );
        return ok({ saved });
      } catch (err) {
        return replyError(err, reply);
      }
    },
  );

  fastify.get<{ Querystring: { from?: string; to?: string } }>("/summary", { preHandler: ADMIN }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    const to = request.query.to || today();
    const from = request.query.from || to;
    const levels = await visibleLevelsFor(request.authUser!, request.cookies[SECTION_COOKIE]);
    return ok({ from, to, ...(await attendanceSummary(schoolId, from, to, levels)) });
  });

  fastify.get<{ Params: { studentId: string }; Querystring: { termId?: string } }>(
    "/students/:studentId",
    { preHandler: ADMIN },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      return ok(await studentAttendance(schoolId, request.params.studentId, request.query.termId || null));
    },
  );
}
