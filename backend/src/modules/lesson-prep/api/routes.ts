import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { ok, fail } from "../../../shared/envelope.js";
import { SECTION_COOKIE, visibleLevelsFor } from "../../../shared/levels.js";
import {
  LessonPrepError,
  checkWeek,
  compliance,
  createPlan,
  createScheme,
  deletePlan,
  getPlan,
  getScheme,
  listPlans,
  listSchemes,
  listTeachingAssignments,
  recordWork,
  reviewPlan,
  reviewScheme,
  saveSchemeWeeks,
  submitPlan,
  submitScheme,
  updatePlan,
  type Coverage,
  type LessonPlanInput,
  type PrepActor,
  type ReviewStatus,
  type SchemeWeekInput,
} from "../domain/lesson-prep.repository.js";
import {
  lessonPlanBodySchema,
  recordWorkBodySchema,
  reviewBodySchema,
  schemeBodySchema,
  schemeWeeksBodySchema,
} from "./schemas.js";

// Reviewing (approve / return, checking records of work) is the DOS / head
// teacher's job — a school admin. Writing is the teacher's.
const ADMIN = requireAuth(["school_admin", "admin"]);
const TEACHER = requireAuth(["teacher"]);
const ANY_STAFF = requireAuth(["school_admin", "admin", "teacher"]);

function schoolOf(request: FastifyRequest, reply: FastifyReply): string | null {
  const schoolId = request.authUser?.school_id ?? null;
  if (!schoolId) {
    reply.status(400).send(fail("no_school_context"));
    return null;
  }
  return schoolId;
}

const actorOf = (request: FastifyRequest): PrepActor => ({
  userId: request.authUser!.user_id,
  role: request.authUser!.role,
});

const isTeacher = (request: FastifyRequest) => request.authUser!.role === "teacher";

function replyError(err: unknown, reply: FastifyReply): FastifyReply {
  if (err instanceof LessonPrepError) return reply.status(err.status).send(fail(err.message));
  throw err;
}

type Handler<T> = (schoolId: string, request: FastifyRequest & T) => Promise<unknown>;
// Wraps the school check and error mapping every route here needs.
const handle =
  <T>(fn: Handler<T>) =>
  async (request: FastifyRequest & T, reply: FastifyReply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    try {
      return ok(await fn(schoolId, request));
    } catch (err) {
      return replyError(err, reply);
    }
  };

export async function lessonPrepRoutes(fastify: FastifyInstance) {
  // ── A teacher's own work ────────────────────────────────────────────────
  fastify.get<{ Querystring: { termId: string } }>(
    "/my-subjects",
    { preHandler: TEACHER },
    handle<{ query: { termId: string } }>((schoolId, request) =>
      listTeachingAssignments(schoolId, request.query.termId, request.authUser!.user_id),
    ),
  );

  // ── Schemes of work ──────────────────────────────────────────────────────
  // A teacher lists their own; an admin lists the section's (optionally one
  // teacher's, or only those awaiting review).
  fastify.get<{ Querystring: { termId?: string; teacherId?: string; status?: ReviewStatus } }>(
    "/schemes",
    { preHandler: ANY_STAFF },
    handle<{ query: { termId?: string; teacherId?: string; status?: ReviewStatus } }>(async (schoolId, request) =>
      listSchemes(schoolId, {
        termId: request.query.termId,
        status: request.query.status,
        teacherId: isTeacher(request) ? request.authUser!.user_id : request.query.teacherId,
        levels: isTeacher(request) ? null : await visibleLevelsFor(request.authUser!, request.cookies[SECTION_COOKIE]),
      }),
    ),
  );

  fastify.post<{ Body: { termId: string; classId: string; subjectId: string } }>(
    "/schemes",
    { preHandler: TEACHER, schema: { body: schemeBodySchema } },
    handle<{ body: { termId: string; classId: string; subjectId: string } }>((schoolId, request) =>
      createScheme(schoolId, actorOf(request), request.body),
    ),
  );

  fastify.get<{ Params: { id: string } }>(
    "/schemes/:id",
    { preHandler: ANY_STAFF },
    handle<{ params: { id: string } }>((schoolId, request) => getScheme(schoolId, request.params.id, actorOf(request))),
  );

  fastify.put<{ Params: { id: string }; Body: { weeks: SchemeWeekInput[] } }>(
    "/schemes/:id/weeks",
    { preHandler: TEACHER, schema: { body: schemeWeeksBodySchema } },
    handle<{ params: { id: string }; body: { weeks: SchemeWeekInput[] } }>((schoolId, request) =>
      saveSchemeWeeks(schoolId, request.params.id, actorOf(request), request.body.weeks),
    ),
  );

  fastify.post<{ Params: { id: string } }>(
    "/schemes/:id/submit",
    { preHandler: TEACHER },
    handle<{ params: { id: string } }>((schoolId, request) =>
      submitScheme(schoolId, request.params.id, actorOf(request)),
    ),
  );

  fastify.post<{ Params: { id: string }; Body: { decision: "approve" | "return"; comment?: string | null } }>(
    "/schemes/:id/review",
    { preHandler: ADMIN, schema: { body: reviewBodySchema } },
    handle<{ params: { id: string }; body: { decision: "approve" | "return"; comment?: string | null } }>(
      (schoolId, request) =>
        reviewScheme(schoolId, request.params.id, actorOf(request), request.body.decision, request.body.comment ?? null),
    ),
  );

  // ── Record of work ───────────────────────────────────────────────────────
  fastify.put<{
    Params: { weekId: string };
    Body: { workCovered: string | null; coverage: Coverage | null; coverageRemarks: string | null };
  }>(
    "/weeks/:weekId/record",
    { preHandler: TEACHER, schema: { body: recordWorkBodySchema } },
    handle<{
      params: { weekId: string };
      body: { workCovered: string | null; coverage: Coverage | null; coverageRemarks: string | null };
    }>((schoolId, request) => recordWork(schoolId, request.params.weekId, actorOf(request), request.body)),
  );

  fastify.post<{ Params: { weekId: string }; Body: { checked: boolean } }>(
    "/weeks/:weekId/check",
    { preHandler: ADMIN },
    handle<{ params: { weekId: string }; body: { checked: boolean } }>((schoolId, request) =>
      checkWeek(schoolId, request.params.weekId, actorOf(request), request.body?.checked !== false),
    ),
  );

  // ── Lesson plans ────────────────────────────────────────────────────────
  fastify.get<{ Querystring: { from?: string; to?: string; teacherId?: string; status?: ReviewStatus } }>(
    "/plans",
    { preHandler: ANY_STAFF },
    handle<{ query: { from?: string; to?: string; teacherId?: string; status?: ReviewStatus } }>(
      async (schoolId, request) =>
        listPlans(schoolId, actorOf(request), {
          from: request.query.from,
          to: request.query.to,
          status: request.query.status,
          teacherId: isTeacher(request) ? request.authUser!.user_id : request.query.teacherId,
          levels: isTeacher(request)
            ? null
            : await visibleLevelsFor(request.authUser!, request.cookies[SECTION_COOKIE]),
        }),
    ),
  );

  fastify.post<{ Body: LessonPlanInput }>(
    "/plans",
    { preHandler: TEACHER, schema: { body: lessonPlanBodySchema } },
    handle<{ body: LessonPlanInput }>((schoolId, request) => createPlan(schoolId, actorOf(request), request.body)),
  );

  fastify.get<{ Params: { id: string } }>(
    "/plans/:id",
    { preHandler: ANY_STAFF },
    handle<{ params: { id: string } }>((schoolId, request) => getPlan(schoolId, request.params.id, actorOf(request))),
  );

  fastify.put<{ Params: { id: string }; Body: LessonPlanInput }>(
    "/plans/:id",
    { preHandler: TEACHER, schema: { body: lessonPlanBodySchema } },
    handle<{ params: { id: string }; body: LessonPlanInput }>((schoolId, request) =>
      updatePlan(schoolId, request.params.id, actorOf(request), request.body),
    ),
  );

  fastify.delete<{ Params: { id: string } }>(
    "/plans/:id",
    { preHandler: TEACHER },
    handle<{ params: { id: string } }>(async (schoolId, request) => {
      await deletePlan(schoolId, request.params.id, actorOf(request));
      return null;
    }),
  );

  fastify.post<{ Params: { id: string } }>(
    "/plans/:id/submit",
    { preHandler: TEACHER },
    handle<{ params: { id: string } }>((schoolId, request) => submitPlan(schoolId, request.params.id, actorOf(request))),
  );

  fastify.post<{ Params: { id: string }; Body: { decision: "approve" | "return"; comment?: string | null } }>(
    "/plans/:id/review",
    { preHandler: ADMIN, schema: { body: reviewBodySchema } },
    handle<{ params: { id: string }; body: { decision: "approve" | "return"; comment?: string | null } }>(
      (schoolId, request) =>
        reviewPlan(schoolId, request.params.id, actorOf(request), request.body.decision, request.body.comment ?? null),
    ),
  );

  // ── DOS overview ─────────────────────────────────────────────────────────
  fastify.get<{ Querystring: { termId: string } }>(
    "/compliance",
    { preHandler: ADMIN },
    handle<{ query: { termId: string } }>(async (schoolId, request) =>
      compliance(
        schoolId,
        request.query.termId,
        await visibleLevelsFor(request.authUser!, request.cookies[SECTION_COOKIE]),
      ),
    ),
  );
}
