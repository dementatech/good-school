import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { ok, fail } from "../../../shared/envelope.js";
import { pool } from "../../../shared/db/index.js";
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
  approveSubject,
  createSubject,
  deleteSubject,
  InvalidSubjectError,
  listSubjects,
  rejectSubject,
  SubjectNotPendingError,
  updateSubject,
  type SubjectApprovalStatus,
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
  AlwaysOnSubjectError,
  LastReligiousSubjectError,
  listSubjectOfferings,
  removeSubjectOffering,
  setSubjectOffering,
  SubjectNotApprovedError,
  UnknownSubjectError,
  type SubjectOfferingInput,
} from "../domain/subject-offering.repository.js";
import {
  createSchoolCombination,
  deleteSchoolCombination,
  InvalidSchoolCombinationError,
  listSchoolCombinations,
  updateSchoolCombination,
  type SchoolCombinationInput,
} from "../domain/school-combinations.repository.js";
import {
  academicYearBodySchema,
  classBodySchema,
  combinationBodySchema,
  curriculumBodySchema,
  schoolCombinationBodySchema,
  schoolCurriculumBodySchema,
  stageBodySchema,
  streamBodySchema,
  subjectBodySchema,
  subjectOfferingBodySchema,
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
  fastify.get<{
    Querystring: { curriculumId?: string; phase?: "O_LEVEL" | "A_LEVEL"; status?: SubjectApprovalStatus };
  }>("/subjects", { preHandler: SCHOOL }, async (request) => {
    const isSuperAdmin = request.authUser!.role === "super_admin";
    return ok(
      await listSubjects({
        curriculumId: request.query.curriculumId,
        phase: request.query.phase,
        status: request.query.status,
        visibleToSchoolId: isSuperAdmin ? undefined : request.authUser!.school_id ?? undefined,
      }),
    );
  });

  // Schools can add their own subjects too (docs/design/subject-selection-module.md
  // — a school running a genuinely non-standard subject), not just super_admin's
  // platform catalog — but never as 'core' (the 7 nationally-mandated subjects
  // are a platform truth, not a school's to declare) or 'general' (General
  // Paper's category means "always-on for every A-Level student" — a school
  // minting a second one would silently double up that rule), and only into a
  // curriculum their own school actually runs. A school's own subject starts
  // `pending` and isn't usable until a super_admin approves it.
  fastify.post<{ Querystring: { curriculumId?: string }; Body: SubjectInput }>(
    "/subjects",
    { preHandler: SCHOOL, schema: { body: subjectBodySchema } },
    async (request, reply) => {
      if (!request.query.curriculumId) {
        return reply.status(400).send(fail("curriculumId query param required"));
      }
      const isSuperAdmin = request.authUser!.role === "super_admin";
      let proposedBySchoolId: string | null = null;
      if (!isSuperAdmin) {
        if (request.body.category === "core") {
          return reply.status(400).send(fail("Only a platform admin can add a core subject."));
        }
        const schoolId = schoolOf(request, reply);
        if (!schoolId) return;
        const runsCurriculum = await pool.query(
          `select 1 from school_curriculum where school_id = $1 and curriculum_id = $2`,
          [schoolId, request.query.curriculumId],
        );
        if (runsCurriculum.rowCount === 0) {
          return reply.status(400).send(fail("Your school doesn't run that curriculum."));
        }
        proposedBySchoolId = schoolId;
      }
      try {
        const subject = await createSubject(request.query.curriculumId, request.body, {
          proposedBySchoolId,
        });
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

  fastify.post<{ Params: { id: string } }>(
    "/subjects/:id/approve",
    { preHandler: REFERENCE },
    async (request, reply) => {
      try {
        const updated = await approveSubject(request.params.id, request.authUser!.user_id);
        return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
      } catch (err) {
        if (err instanceof SubjectNotPendingError) {
          return reply.status(400).send(fail(err.message));
        }
        throw err;
      }
    },
  );

  fastify.post<{ Params: { id: string }; Body: { reason: string } }>(
    "/subjects/:id/reject",
    {
      preHandler: REFERENCE,
      schema: { body: { type: "object", required: ["reason"], properties: { reason: { type: "string", minLength: 1 } }, additionalProperties: false } },
    },
    async (request, reply) => {
      try {
        const updated = await rejectSubject(
          request.params.id,
          request.authUser!.user_id,
          request.body.reason.trim(),
        );
        return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
      } catch (err) {
        if (err instanceof SubjectNotPendingError) {
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
      try {
        const deleted = await deleteSubject(request.params.id);
        return deleted ? ok(null) : reply.status(404).send(fail("not_found"));
      } catch (err) {
        if (err instanceof InvalidSubjectError) {
          return reply.status(400).send(fail(err.message));
        }
        throw err;
      }
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

  // -- Subject offering (O-Level: which catalog subjects this school runs,
  // and which are compulsory here) — school_admin/admin, per academic year.
  fastify.get<{ Querystring: { academicYearId?: string; phase?: "O_LEVEL" | "A_LEVEL" } }>(
    "/subject-offerings",
    { preHandler: SCHOOL },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      if (!request.query.academicYearId) {
        return reply.status(400).send(fail("academicYearId query param required"));
      }
      return ok(
        await listSubjectOfferings(schoolId, request.query.academicYearId, request.query.phase),
      );
    },
  );

  fastify.post<{ Querystring: { academicYearId?: string }; Body: SubjectOfferingInput }>(
    "/subject-offerings",
    { preHandler: SCHOOL, schema: { body: subjectOfferingBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      if (!request.query.academicYearId) {
        return reply.status(400).send(fail("academicYearId query param required"));
      }
      try {
        const offering = await setSubjectOffering(schoolId, request.query.academicYearId, request.body);
        return reply.status(201).send(ok(offering));
      } catch (err) {
        if (
          err instanceof UnknownSubjectError ||
          err instanceof AlwaysOnSubjectError ||
          err instanceof LastReligiousSubjectError ||
          err instanceof SubjectNotApprovedError
        ) {
          return reply.status(400).send(fail(err.message));
        }
        throw err;
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/subject-offerings/:id",
    { preHandler: SCHOOL },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const deleted = await removeSubjectOffering(schoolId, request.params.id);
      return deleted ? ok(null) : reply.status(404).send(fail("not_found"));
    },
  );

  // -- School combinations (A-Level: adopted-from-catalog or custom) --------
  fastify.get<{ Querystring: { academicYearId?: string } }>(
    "/school-combinations",
    { preHandler: SCHOOL },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      if (!request.query.academicYearId) {
        return reply.status(400).send(fail("academicYearId query param required"));
      }
      return ok(await listSchoolCombinations(schoolId, request.query.academicYearId));
    },
  );

  fastify.post<{ Querystring: { academicYearId?: string }; Body: SchoolCombinationInput }>(
    "/school-combinations",
    { preHandler: SCHOOL, schema: { body: schoolCombinationBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      if (!request.query.academicYearId) {
        return reply.status(400).send(fail("academicYearId query param required"));
      }
      try {
        const combo = await createSchoolCombination(schoolId, request.query.academicYearId, request.body);
        return reply.status(201).send(ok(combo));
      } catch (err) {
        if (err instanceof InvalidSchoolCombinationError) {
          return reply.status(400).send(fail(err.message));
        }
        throw err;
      }
    },
  );

  fastify.patch<{ Params: { id: string }; Body: SchoolCombinationInput }>(
    "/school-combinations/:id",
    { preHandler: SCHOOL, schema: { body: schoolCombinationBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const updated = await updateSchoolCombination(schoolId, request.params.id, request.body);
        return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
      } catch (err) {
        if (err instanceof InvalidSchoolCombinationError) {
          return reply.status(400).send(fail(err.message));
        }
        throw err;
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/school-combinations/:id",
    { preHandler: SCHOOL },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const deleted = await deleteSchoolCombination(schoolId, request.params.id);
      return deleted ? ok(null) : reply.status(404).send(fail("not_found"));
    },
  );
}
