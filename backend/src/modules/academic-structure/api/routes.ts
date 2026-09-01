import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { ok, fail } from "../../../shared/envelope.js";
import {
  createCurriculum,
  createStage,
  deleteCurriculum,
  deleteStage,
  getCurriculumByCode,
  listCurricula,
  listStages,
  updateCurriculum,
  updateStage,
  type CurriculumInput,
  type StageInput,
} from "../domain/curricula.repository.js";
import {
  createSubject,
  deleteSubject,
  InvalidSubjectError,
  listSubjects,
  updateSubject,
  type SubjectInput,
} from "../domain/subjects.repository.js";
import {
  createCombination,
  deleteCombination,
  InvalidCombinationError,
  listCombinations,
  updateCombination,
  type CombinationInput,
} from "../domain/combinations.repository.js";
import {
  addSchoolCurriculum,
  listSchoolCurricula,
  removeSchoolCurriculum,
} from "../domain/school-curricula.repository.js";
import {
  createAcademicYear,
  deleteAcademicYear,
  listAcademicYears,
  updateAcademicYear,
  type AcademicYearInput,
} from "../domain/academic-years.repository.js";
import {
  createTerm,
  deleteTerm,
  listTerms,
  TermLimitExceededError,
  updateTerm,
  type TermInput,
} from "../domain/terms.repository.js";
import {
  createClass,
  deleteClass,
  listClasses,
  updateClass,
  type ClassInput,
} from "../domain/classes.repository.js";
import {
  createStream,
  deleteStream,
  listStreams,
  updateStream,
  type StreamInput,
} from "../domain/streams.repository.js";
import {
  academicYearBodySchema,
  classBodySchema,
  combinationBodySchema,
  curriculumBodySchema,
  schoolCurriculumBodySchema,
  stageBodySchema,
  streamBodySchema,
  subjectBodySchema,
  termBodySchema,
} from "./schemas.js";

const REFERENCE = requireAuth(["super_admin"]);
const SCHOOL = requireAuth(["admin", "school_admin", "super_admin"]);

/** Pulls the caller's school from the JWT, or replies 400 and returns null. */
function schoolOf(request: FastifyRequest, reply: FastifyReply): string | null {
  const schoolId = request.authUser?.school_id ?? null;
  if (!schoolId) {
    reply.status(400).send(fail("no_school_context"));
    return null;
  }
  return schoolId;
}

export async function academicStructureRoutes(fastify: FastifyInstance) {
  // ═══ Reference data — super_admin ═════════════════════════════════════════

  // -- Curricula -----------------------------------------------------------
  // Readable by any school administrator (they pick which to opt into);
  // writes below stay super_admin-only.
  fastify.get("/curricula", { preHandler: SCHOOL }, async () => ok(await listCurricula()));

  fastify.post<{ Body: CurriculumInput }>(
    "/curricula",
    { preHandler: REFERENCE, schema: { body: curriculumBodySchema } },
    async (request, reply) => reply.status(201).send(ok(await createCurriculum(request.body))),
  );

  fastify.patch<{ Params: { id: string }; Body: CurriculumInput }>(
    "/curricula/:id",
    { preHandler: REFERENCE, schema: { body: curriculumBodySchema } },
    async (request, reply) => {
      const updated = await updateCurriculum(request.params.id, request.body);
      return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/curricula/:id",
    { preHandler: REFERENCE },
    async (request, reply) => {
      const deleted = await deleteCurriculum(request.params.id);
      return deleted ? ok(null) : reply.status(404).send(fail("not_found"));
    },
  );

  // -- Stages (a curriculum's class ladder) -------------------------------
  // `?curriculum=UNEB` (code) or `?curriculumId=<uuid>`; no filter = all.
  fastify.get<{ Querystring: { curriculum?: string; curriculumId?: string } }>(
    "/stages",
    { preHandler: SCHOOL },
    async (request) => {
      let curriculumId = request.query.curriculumId;
      if (!curriculumId && request.query.curriculum) {
        curriculumId = (await getCurriculumByCode(request.query.curriculum))?.id;
      }
      return ok(await listStages(curriculumId));
    },
  );

  fastify.get<{ Params: { id: string } }>(
    "/curricula/:id/stages",
    { preHandler: SCHOOL },
    async (request) => ok(await listStages(request.params.id)),
  );

  fastify.post<{ Params: { id: string }; Body: StageInput }>(
    "/curricula/:id/stages",
    { preHandler: REFERENCE, schema: { body: stageBodySchema } },
    async (request, reply) => {
      const stage = await createStage(request.params.id, request.body);
      return stage
        ? reply.status(201).send(ok(stage))
        : reply.status(404).send(fail("curriculum_not_found"));
    },
  );

  fastify.patch<{ Params: { id: string }; Body: StageInput }>(
    "/stages/:id",
    { preHandler: REFERENCE, schema: { body: stageBodySchema } },
    async (request, reply) => {
      const updated = await updateStage(request.params.id, request.body);
      return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/stages/:id",
    { preHandler: REFERENCE },
    async (request, reply) => {
      const deleted = await deleteStage(request.params.id);
      return deleted ? ok(null) : reply.status(404).send(fail("not_found"));
    },
  );

  // -- Subjects ----------------------------------------------------------
  fastify.get<{ Querystring: { curriculumId?: string; phase?: "O_LEVEL" | "A_LEVEL" } }>(
    "/subjects",
    { preHandler: SCHOOL },
    async (request) =>
      ok(await listSubjects(request.query.curriculumId, request.query.phase)),
  );

  fastify.post<{ Querystring: { curriculumId?: string }; Body: SubjectInput }>(
    "/subjects",
    { preHandler: REFERENCE, schema: { body: subjectBodySchema } },
    async (request, reply) => {
      if (!request.query.curriculumId) {
        return reply.status(400).send(fail("curriculumId query param required"));
      }
      try {
        const subject = await createSubject(request.query.curriculumId, request.body);
        return subject
          ? reply.status(201).send(ok(subject))
          : reply.status(404).send(fail("curriculum_not_found"));
      } catch (err) {
        if (err instanceof InvalidSubjectError) {
          return reply.status(400).send(fail(err.message));
        }
        throw err;
      }
    },
  );

  fastify.patch<{ Params: { id: string }; Body: SubjectInput }>(
    "/subjects/:id",
    { preHandler: REFERENCE, schema: { body: subjectBodySchema } },
    async (request, reply) => {
      try {
        const updated = await updateSubject(request.params.id, request.body);
        return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
      } catch (err) {
        if (err instanceof InvalidSubjectError) {
          return reply.status(400).send(fail(err.message));
        }
        throw err;
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/subjects/:id",
    { preHandler: REFERENCE },
    async (request, reply) => {
      const deleted = await deleteSubject(request.params.id);
      return deleted ? ok(null) : reply.status(404).send(fail("not_found"));
    },
  );

  // -- A-Level combinations --------------------------------------------
  fastify.get<{ Querystring: { curriculumId?: string } }>(
    "/combinations",
    { preHandler: SCHOOL },
    async (request) => ok(await listCombinations(request.query.curriculumId)),
  );

  fastify.post<{ Querystring: { curriculumId?: string }; Body: CombinationInput }>(
    "/combinations",
    { preHandler: REFERENCE, schema: { body: combinationBodySchema } },
    async (request, reply) => {
      if (!request.query.curriculumId) {
        return reply.status(400).send(fail("curriculumId query param required"));
      }
      try {
        const combo = await createCombination(request.query.curriculumId, request.body);
        return combo
          ? reply.status(201).send(ok(combo))
          : reply.status(404).send(fail("curriculum_not_found"));
      } catch (err) {
        if (err instanceof InvalidCombinationError) {
          return reply.status(400).send(fail(err.message));
        }
        throw err;
      }
    },
  );

  fastify.patch<{ Params: { id: string }; Body: CombinationInput }>(
    "/combinations/:id",
    { preHandler: REFERENCE, schema: { body: combinationBodySchema } },
    async (request, reply) => {
      try {
        const updated = await updateCombination(request.params.id, request.body);
        return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
      } catch (err) {
        if (err instanceof InvalidCombinationError) {
          return reply.status(400).send(fail(err.message));
        }
        throw err;
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/combinations/:id",
    { preHandler: REFERENCE },
    async (request, reply) => {
      const deleted = await deleteCombination(request.params.id);
      return deleted ? ok(null) : reply.status(404).send(fail("not_found"));
    },
  );

  // ═══ Per-school — admin / school_admin ════════════════════════════════════

  // -- School curricula --------------------------------------------------
  fastify.get("/school-curricula", { preHandler: SCHOOL }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    return ok(await listSchoolCurricula(schoolId));
  });

  fastify.post<{ Body: { curriculumId: string } }>(
    "/school-curricula",
    { preHandler: SCHOOL, schema: { body: schoolCurriculumBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const added = await addSchoolCurriculum(schoolId, request.body.curriculumId);
      return added
        ? reply.status(201).send(ok(await listSchoolCurricula(schoolId)))
        : reply.status(404).send(fail("curriculum_not_found"));
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/school-curricula/:id",
    { preHandler: SCHOOL },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const removed = await removeSchoolCurriculum(schoolId, request.params.id);
      return removed ? ok(null) : reply.status(404).send(fail("not_found"));
    },
  );

  // -- Academic years -------------------------------------------------
  fastify.get("/years", { preHandler: SCHOOL }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    return ok(await listAcademicYears(schoolId));
  });

  fastify.post<{ Body: AcademicYearInput & { makeCurrent?: boolean } }>(
    "/years",
    { preHandler: SCHOOL, schema: { body: academicYearBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const year = await createAcademicYear(
        schoolId,
        { ...request.body, isCurrent: request.body.isCurrent || request.body.makeCurrent },
        request.authUser!.user_id,
      );
      return reply.status(201).send(ok(year));
    },
  );

  fastify.patch<{ Params: { id: string }; Body: AcademicYearInput & { makeCurrent?: boolean } }>(
    "/years/:id",
    { preHandler: SCHOOL, schema: { body: academicYearBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const updated = await updateAcademicYear(schoolId, request.params.id, {
        ...request.body,
        isCurrent: request.body.isCurrent || request.body.makeCurrent,
      });
      return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/years/:id",
    { preHandler: SCHOOL },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const deleted = await deleteAcademicYear(schoolId, request.params.id);
      return deleted ? ok(null) : reply.status(404).send(fail("not_found"));
    },
  );

  // -- Terms --------------------------------------------------------
  fastify.get<{ Querystring: { academicYearId?: string } }>(
    "/terms",
    { preHandler: SCHOOL },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      return ok(await listTerms(schoolId, request.query.academicYearId));
    },
  );

  fastify.post<{ Body: TermInput }>(
    "/terms",
    { preHandler: SCHOOL, schema: { body: termBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const term = await createTerm(schoolId, request.body, request.authUser!.user_id);
        return term
          ? reply.status(201).send(ok(term))
          : reply.status(404).send(fail("academic_year_not_found"));
      } catch (err) {
        if (err instanceof TermLimitExceededError) {
          return reply.status(400).send(fail(err.message));
        }
        throw err;
      }
    },
  );

  fastify.patch<{ Params: { id: string }; Body: TermInput }>(
    "/terms/:id",
    { preHandler: SCHOOL, schema: { body: termBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const updated = await updateTerm(schoolId, request.params.id, request.body);
      return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/terms/:id",
    { preHandler: SCHOOL },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const deleted = await deleteTerm(schoolId, request.params.id);
      return deleted ? ok(null) : reply.status(404).send(fail("not_found"));
    },
  );

  // -- Classes ----------------------------------------------------
  fastify.get<{ Querystring: { academicYearId?: string } }>(
    "/classes",
    { preHandler: SCHOOL },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      return ok(await listClasses(schoolId, request.query.academicYearId));
    },
  );

  fastify.post<{ Body: ClassInput }>(
    "/classes",
    { preHandler: SCHOOL, schema: { body: classBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const klass = await createClass(schoolId, request.body, request.authUser!.user_id);
      return klass
        ? reply.status(201).send(ok(klass))
        : reply.status(400).send(fail("academic_year_or_stage_invalid"));
    },
  );

  fastify.patch<{ Params: { id: string }; Body: ClassInput }>(
    "/classes/:id",
    { preHandler: SCHOOL, schema: { body: classBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const updated = await updateClass(schoolId, request.params.id, request.body);
      return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/classes/:id",
    { preHandler: SCHOOL },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const deleted = await deleteClass(schoolId, request.params.id);
      return deleted ? ok(null) : reply.status(404).send(fail("not_found"));
    },
  );

  // -- Streams --------------------------------------------------
  fastify.get<{ Querystring: { classId?: string } }>(
    "/streams",
    { preHandler: SCHOOL },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      return ok(await listStreams(schoolId, request.query.classId));
    },
  );

  fastify.post<{ Body: StreamInput }>(
    "/streams",
    { preHandler: SCHOOL, schema: { body: streamBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const stream = await createStream(schoolId, request.body, request.authUser!.user_id);
      return stream
        ? reply.status(201).send(ok(stream))
        : reply.status(404).send(fail("class_not_found"));
    },
  );

  fastify.patch<{ Params: { id: string }; Body: StreamInput }>(
    "/streams/:id",
    { preHandler: SCHOOL, schema: { body: streamBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const updated = await updateStream(schoolId, request.params.id, request.body);
      return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/streams/:id",
    { preHandler: SCHOOL },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const deleted = await deleteStream(schoolId, request.params.id);
      return deleted ? ok(null) : reply.status(404).send(fail("not_found"));
    },
  );
}
