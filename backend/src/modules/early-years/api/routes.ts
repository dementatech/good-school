import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { getCurrentAcademicYear, getCurrentTerm } from "../../academic-structure/index.js";
import { ok, fail } from "../../../shared/envelope.js";
import { levelsForSchool } from "../../../shared/levels.js";
import {
  DuplicateLearningAreaError,
  LearningAreaInUseError,
  createLearningArea,
  deleteLearningArea,
  listLearningAreas,
  updateLearningArea,
  type LearningAreaInput,
} from "../domain/learning-areas.repository.js";
import {
  InvalidAssessmentError,
  NotClassTeacherError,
  UnknownKindergartenClassError,
  UnknownTermError,
  getAssessmentSheet,
  listKindergartenClasses,
  listYearTerms,
  saveAssessmentSheet,
  type AssessmentActor,
  type AssessmentEntryInput,
  type RemarkInput,
} from "../domain/developmental-assessment.repository.js";
import { assessmentSheetBodySchema, learningAreaBodySchema, sheetQuerySchema } from "./schemas.js";

// Every route here exists only for schools that run Kindergarten — any other
// school gets the same 404 as an unknown URL, never a hint it exists.
async function kindergartenOnly(request: FastifyRequest, reply: FastifyReply) {
  const schoolId = request.authUser?.school_id;
  if (!schoolId || !(await levelsForSchool(schoolId)).includes("KINDERGARTEN")) {
    return reply.status(404).send({ message: `Route ${request.method}:${request.url} not found`, error: "Not Found", statusCode: 404 });
  }
}

const SCHOOL_ADMIN = [requireAuth(["school_admin"]), kindergartenOnly];
// Assessment entry: the class teacher, or a school admin acting as an override.
const ASSESSORS = [requireAuth(["teacher", "school_admin"]), kindergartenOnly];

function schoolOf(request: FastifyRequest, reply: FastifyReply): string | null {
  const schoolId = request.authUser?.school_id ?? null;
  if (!schoolId) {
    reply.status(400).send(fail("no_school_context"));
    return null;
  }
  return schoolId;
}

function actorOf(request: FastifyRequest): AssessmentActor {
  return { userId: request.authUser!.user_id, role: request.authUser!.role };
}

function replyError(err: unknown, reply: FastifyReply): FastifyReply {
  if (err instanceof UnknownKindergartenClassError || err instanceof UnknownTermError) {
    return reply.status(404).send(fail(err.message));
  }
  if (err instanceof NotClassTeacherError) return reply.status(403).send(fail(err.message));
  if (err instanceof InvalidAssessmentError) return reply.status(400).send(fail(err.message));
  if (err instanceof DuplicateLearningAreaError || err instanceof LearningAreaInUseError) {
    return reply.status(409).send(fail(err.message));
  }
  throw err;
}

export async function earlyYearsRoutes(fastify: FastifyInstance) {
  // ═══ Learning areas ═══════════════════════════════════════════════════════

  fastify.get("/learning-areas", { preHandler: ASSESSORS }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    return ok(await listLearningAreas(schoolId));
  });

  fastify.post<{ Body: LearningAreaInput }>(
    "/learning-areas",
    { preHandler: SCHOOL_ADMIN, schema: { body: learningAreaBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        return reply.status(201).send(ok(await createLearningArea(schoolId, request.body)));
      } catch (err) {
        return replyError(err, reply);
      }
    },
  );

  fastify.put<{ Params: { id: string }; Body: LearningAreaInput }>(
    "/learning-areas/:id",
    { preHandler: SCHOOL_ADMIN, schema: { body: learningAreaBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const area = await updateLearningArea(schoolId, request.params.id, request.body);
        if (!area) return reply.status(404).send(fail("Learning area not found."));
        return ok(area);
      } catch (err) {
        return replyError(err, reply);
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/learning-areas/:id",
    { preHandler: SCHOOL_ADMIN },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const deleted = await deleteLearningArea(schoolId, request.params.id);
        if (!deleted) return reply.status(404).send(fail("Learning area not found."));
        return ok({ deleted: true });
      } catch (err) {
        return replyError(err, reply);
      }
    },
  );

  // ═══ Overview: current year, its terms, and the classes the caller can assess

  fastify.get("/overview", { preHandler: ASSESSORS }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    const year = await getCurrentAcademicYear(schoolId);
    if (!year) return ok({ academicYear: null, terms: [], currentTermId: null, classes: [] });
    const [terms, currentTerm, classes] = await Promise.all([
      listYearTerms(schoolId, year.id),
      getCurrentTerm(schoolId, year.id),
      listKindergartenClasses(schoolId, year.id, actorOf(request)),
    ]);
    return ok({
      academicYear: { id: year.id, name: year.yearName },
      terms,
      currentTermId: currentTerm?.id ?? null,
      classes,
    });
  });

  // ═══ Assessment sheet — the class × learning-area grid for one term ═════════

  fastify.get<{ Querystring: { classId: string; termId: string; streamId?: string; studentUserId?: string } }>(
    "/sheet",
    { preHandler: ASSESSORS, schema: { querystring: sheetQuerySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const { classId, termId, streamId, studentUserId } = request.query;
      try {
        return ok(
          await getAssessmentSheet(schoolId, classId, termId, streamId || null, actorOf(request), {
            studentUserId: studentUserId || undefined,
          }),
        );
      } catch (err) {
        return replyError(err, reply);
      }
    },
  );

  fastify.put<{
    Body: { classId: string; termId: string; entries?: AssessmentEntryInput[]; remarks?: RemarkInput[] };
  }>(
    "/sheet",
    { preHandler: ASSESSORS, schema: { body: assessmentSheetBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const { classId, termId, entries = [], remarks = [] } = request.body;
      try {
        await saveAssessmentSheet(schoolId, classId, termId, entries, remarks, actorOf(request));
        return ok({ saved: entries.length + remarks.length });
      } catch (err) {
        return replyError(err, reply);
      }
    },
  );
}
