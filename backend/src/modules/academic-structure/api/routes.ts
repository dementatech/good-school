import { SECTION_COOKIE, visibleLevelsFor, type SchoolLevel, type SubjectPhase } from "../../../shared/levels.js";
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
  createSchoolSubject,
  createSubject,
  deleteSchoolSubject,
  deleteSubject,
  InvalidSubjectError,
  SubjectInUseError,
  updateSchoolSubject,
  type SchoolSubjectInput,
  listSubjects,
  rejectSubject,
  SubjectNotPendingError,
  updateSubject,
  VariantsLockedError,
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
  InvalidStageLabelError,
  listClasses,
  setStageLabel,
  updateClass,
  type ClassInput,
} from "../domain/classes.repository.js";
import {
  createStream,
  createStreamsForClasses,
  deleteStream,
  listStreams,
  updateStream,
  type StreamInput,
} from "../domain/streams.repository.js";
import {
  AlwaysOnSubjectError,
  InvalidMaxMarkError,
  LastReligiousSubjectError,
  listSubjectOfferings,
  removeSubjectOffering,
  setSubjectOffering,
  SubjectNotApprovedError,
  UnknownSubjectError,
  type SubjectOfferingInput,
} from "../domain/subject-offering.repository.js";
import {
  assignNurseryClassTeachers,
  getSectionSettings,
  InvalidSectionSettingsError,
  updateSectionSettings,
  type AssessmentStyle,
} from "../domain/section-settings.repository.js";
import type { SchoolSection } from "../../../shared/levels.js";
import {
  createSchoolCombination,
  deleteSchoolCombination,
  InvalidSchoolCombinationError,
  listSchoolCombinations,
  updateSchoolCombination,
  type SchoolCombinationInput,
} from "../domain/school-combinations.repository.js";
import {
  createGradingScheme,
  deleteGradingScheme,
  editSchoolGradingRanges,
  getSchoolGradingSchemes,
  GradingSchemeInUseError,
  GradingSchemeMismatchError,
  InvalidGradingSchemeError,
  listGradingSchemes,
  NoGradingSchemeSelectedError,
  setSchoolGradingScheme,
  UnknownGradingSchemeError,
  updateGradingScheme,
  type GradeBandInput,
  type GradeRoleScope,
  type GradingAppliesTo,
  type GradingSchemeInput,
} from "../domain/grading-schemes.repository.js";
import {
  academicYearBodySchema,
  classBodySchema,
  combinationBodySchema,
  curriculumBodySchema,
  gradingSchemeBodySchema,
  schoolGradingRangesBodySchema,
  schoolGradingSchemeBodySchema,
  schoolCombinationBodySchema,
  schoolCurriculumBodySchema,
  stageBodySchema,
  streamBodySchema,
  subjectBodySchema,
  subjectOfferingBodySchema,
  stageLabelBodySchema,
  bulkStreamsBodySchema,
  sectionSettingsBodySchema,
  schoolSubjectBodySchema,
  schoolSubjectUpdateBodySchema,
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

/** Levels this caller may see (null = all, super_admin). See shared/levels.ts. */
function visibleLevels(request: FastifyRequest): Promise<SchoolLevel[] | null> {
  return visibleLevelsFor(request.authUser!, request.cookies[SECTION_COOKIE]);
}

/** Keep only rows whose level the caller may see; level-less rows stay. */
function onlyVisible<T>(rows: T[], levels: SchoolLevel[] | null, levelOf: (row: T) => string | null): T[] {
  if (!levels) return rows;
  return rows.filter((r) => {
    const level = levelOf(r);
    return level === null || levels.includes(level as SchoolLevel);
  });
}

async function canSeeLevel(request: FastifyRequest, level: string): Promise<boolean> {
  const levels = await visibleLevels(request);
  return !levels || levels.includes(level as SchoolLevel);
}

/** A school sees its own names for class levels ("Level 1"); the platform
 * (super_admin, no school) sees the national ones. */
async function withSchoolLabels<T extends { id: string; name: string }>(
  request: FastifyRequest,
  stages: T[],
): Promise<(T & { defaultName: string })[]> {
  const schoolId = request.authUser?.school_id;
  const labels = schoolId
    ? new Map(
        (
          await pool.query<{ curriculum_stage_id: string; name: string }>(
            `select curriculum_stage_id, name from school_stage_label where school_id = $1`,
            [schoolId],
          )
        ).rows.map((r) => [r.curriculum_stage_id, r.name]),
      )
    : new Map<string, string>();
  return stages.map((s) => ({ ...s, name: labels.get(s.id) ?? s.name, defaultName: s.name }));
}

async function stageVisible(request: FastifyRequest, stageId: string): Promise<boolean> {
  const { rows } = await pool.query<{ phase: string | null }>(`select phase from curriculum_stage where id = $1`, [
    stageId,
  ]);
  if (!rows[0]) return true; // unknown stage: createClass/updateClass reject it themselves
  return rows[0].phase === null || canSeeLevel(request, rows[0].phase);
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
      const stages = onlyVisible(await listStages(curriculumId), await visibleLevels(request), (s) => s.phase);
      return ok(await withSchoolLabels(request, stages));
    },
  );

  fastify.get<{ Params: { id: string } }>(
    "/curricula/:id/stages",
    { preHandler: SCHOOL },
    async (request) =>
      ok(
        await withSchoolLabels(
          request,
          onlyVisible(await listStages(request.params.id), await visibleLevels(request), (s) => s.phase),
        ),
      ),
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
    Querystring: { curriculumId?: string; phase?: SubjectPhase; status?: SubjectApprovalStatus };
  }>("/subjects", { preHandler: SCHOOL }, async (request) => {
    const isSuperAdmin = request.authUser!.role === "super_admin";
    const subjects = await listSubjects({
      curriculumId: request.query.curriculumId,
      phase: request.query.phase,
      status: request.query.status,
      visibleToSchoolId: isSuperAdmin ? undefined : request.authUser!.school_id ?? undefined,
    });
    return ok(onlyVisible(subjects, await visibleLevels(request), (s) => s.phase));
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
        if (!(await canSeeLevel(request, request.body.phase))) {
          return reply.status(400).send(fail("Unknown level."));
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
        if (err instanceof VariantsLockedError) {
          return reply.status(409).send(fail(err.message));
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
    async (request) =>
      (await canSeeLevel(request, "A_LEVEL")) ? ok(await listCombinations(request.query.curriculumId)) : ok([]),
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
      return ok(
        onlyVisible(await listClasses(schoolId, request.query.academicYearId), await visibleLevels(request), (c) => c.stagePhase),
      );
    },
  );

  fastify.post<{ Body: ClassInput }>(
    "/classes",
    { preHandler: SCHOOL, schema: { body: classBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      if (!(await stageVisible(request, request.body.curriculumStageId))) {
        return reply.status(400).send(fail("academic_year_or_stage_invalid"));
      }
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
      if (!(await stageVisible(request, request.body.curriculumStageId))) {
        return reply.status(400).send(fail("academic_year_or_stage_invalid"));
      }
      const before = await pool.query<{ class_teacher_id: string | null; phase: string | null }>(
        `select c.class_teacher_id, cs.phase from classes c join curriculum_stage cs on cs.id = c.curriculum_stage_id
          where c.id = $1 and c.school_id = $2`,
        [request.params.id, schoolId],
      );
      const updated = await updateClass(schoolId, request.params.id, request.body);
      // Nursery is class-teacher-led: a new class teacher takes over the
      // class's Nursery subjects (and so its mark sheets) from the old one.
      const old = before.rows[0];
      const next = request.body.classTeacherId ?? null;
      if (updated && old?.phase === "KINDERGARTEN" && next && next !== old.class_teacher_id) {
        if (old.class_teacher_id) {
          await pool.query(
            `update subject_teacher_assignment sta set staff_id = $3
               from subject s
              where s.id = sta.subject_id and s.school_id = $1 and s.phase = 'KINDERGARTEN'
                and sta.class_id = $2 and sta.staff_id = $4 and sta.status = 'active' and sta.is_lead`,
            [schoolId, request.params.id, next, old.class_teacher_id],
          );
        }
        await assignNurseryClassTeachers(pool, schoolId);
      }
      return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
    },
  );

  // A school's own name for a class level ("Level 1" for Primary 1), used
  // everywhere the class is shown or printed. name null/blank = back to the
  // national name.
  fastify.put<{ Body: { curriculumStageId: string; name: string | null } }>(
    "/stage-labels",
    { preHandler: SCHOOL, schema: { body: stageLabelBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      if (!(await stageVisible(request, request.body.curriculumStageId))) {
        return reply.status(400).send(fail("Unknown class level."));
      }
      try {
        await setStageLabel(schoolId, request.body.curriculumStageId, request.body.name);
        return ok(null);
      } catch (err) {
        if (err instanceof InvalidStageLabelError) return reply.status(400).send(fail(err.message));
        throw err;
      }
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
      const streams = await listStreams(schoolId, request.query.classId);
      const levels = await visibleLevels(request);
      if (!levels) return ok(streams);
      const { rows } = await pool.query<{ id: string; phase: string | null }>(
        `select c.id, cs.phase from classes c join curriculum_stage cs on cs.id = c.curriculum_stage_id
          where c.school_id = $1`,
        [schoolId],
      );
      const phaseOfClass = new Map(rows.map((r) => [r.id, r.phase]));
      return ok(onlyVisible(streams, levels, (st) => phaseOfClass.get(st.classId) ?? null));
    },
  );

  // Same streams in several classes at once ("East, West" for S1–S4).
  fastify.post<{ Body: { classIds: string[]; names: string[]; capacity?: number | null } }>(
    "/streams/bulk",
    { preHandler: SCHOOL, schema: { body: bulkStreamsBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      // Only classes in the section being worked in.
      const levels = await visibleLevels(request);
      const { rows } = await pool.query<{ id: string }>(
        `select c.id from classes c join curriculum_stage cs on cs.id = c.curriculum_stage_id
          where c.school_id = $1 and c.id = any($2::uuid[])
            and ($3::text[] is null or cs.phase = any($3::text[]))`,
        [schoolId, request.body.classIds, levels],
      );
      return ok(
        await createStreamsForClasses(
          schoolId,
          rows.map((r) => r.id),
          request.body.names,
          request.body.capacity ?? null,
          request.authUser!.user_id,
        ),
      );
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
  fastify.get<{ Querystring: { academicYearId?: string; phase?: SubjectPhase } }>(
    "/subject-offerings",
    { preHandler: SCHOOL },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      if (!request.query.academicYearId) {
        return reply.status(400).send(fail("academicYearId query param required"));
      }
      return ok(
        onlyVisible(
          await listSubjectOfferings(schoolId, request.query.academicYearId, request.query.phase),
          await visibleLevels(request),
          (o) => o.subjectPhase,
        ),
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
      const subject = await pool.query<{ phase: string }>(`select phase from subject where id = $1`, [
        request.body.subjectId,
      ]);
      if (!subject.rows[0] || !(await canSeeLevel(request, subject.rows[0].phase))) {
        return reply.status(400).send(fail(new UnknownSubjectError().message));
      }
      try {
        const offering = await setSubjectOffering(schoolId, request.query.academicYearId, request.body);
        return reply.status(201).send(ok(offering));
      } catch (err) {
        if (
          err instanceof UnknownSubjectError ||
          err instanceof InvalidMaxMarkError ||
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

  // -- Grading schemes catalog — curriculum-wide, super_admin manages it, --
  // -- same shape as subjects/combinations. Schools pick from it below. ----
  fastify.get<{ Querystring: { curriculumId?: string; appliesTo?: GradingAppliesTo; roleScope?: GradeRoleScope } }>(
    "/grading-schemes",
    { preHandler: SCHOOL },
    async (request) => {
      return ok(
        onlyVisible(
          await listGradingSchemes(request.query.curriculumId, request.query.appliesTo, request.query.roleScope),
          await visibleLevels(request),
          (g) => g.appliesTo,
        ),
      );
    },
  );

  fastify.post<{ Querystring: { curriculumId?: string }; Body: GradingSchemeInput }>(
    "/grading-schemes",
    { preHandler: REFERENCE, schema: { body: gradingSchemeBodySchema } },
    async (request, reply) => {
      if (!request.query.curriculumId) {
        return reply.status(400).send(fail("curriculumId query param required"));
      }
      try {
        const created = await createGradingScheme(request.query.curriculumId, request.body);
        return reply.status(201).send(ok(created));
      } catch (err) {
        if (err instanceof InvalidGradingSchemeError) {
          return reply.status(400).send(fail(err.message));
        }
        throw err;
      }
    },
  );

  fastify.patch<{ Params: { id: string }; Body: GradingSchemeInput }>(
    "/grading-schemes/:id",
    { preHandler: REFERENCE, schema: { body: gradingSchemeBodySchema } },
    async (request, reply) => {
      try {
        const updated = await updateGradingScheme(request.params.id, request.body);
        return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
      } catch (err) {
        if (err instanceof InvalidGradingSchemeError) {
          return reply.status(400).send(fail(err.message));
        }
        throw err;
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/grading-schemes/:id",
    { preHandler: REFERENCE },
    async (request, reply) => {
      try {
        const deleted = await deleteGradingScheme(request.params.id);
        return deleted ? ok(null) : reply.status(404).send(fail("not_found"));
      } catch (err) {
        if (err instanceof GradingSchemeInUseError) {
          return reply.status(409).send(fail(err.message));
        }
        throw err;
      }
    },
  );

  // -- A school's current pick per phase/role — "Change Grade System" -------
  fastify.get("/school-grading-schemes", { preHandler: SCHOOL }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    return ok(onlyVisible(await getSchoolGradingSchemes(schoolId), await visibleLevels(request), (g) => g.appliesTo));
  });

  fastify.put<{ Body: { appliesTo: GradingAppliesTo; roleScope: GradeRoleScope; gradingSchemeId: string } }>(
    "/school-grading-schemes",
    { preHandler: SCHOOL, schema: { body: schoolGradingSchemeBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      if (!(await canSeeLevel(request, request.body.appliesTo))) {
        return reply.status(400).send(fail("Unknown level."));
      }
      try {
        const selection = await setSchoolGradingScheme(
          schoolId,
          request.body.appliesTo,
          request.body.roleScope,
          request.body.gradingSchemeId,
        );
        return ok(selection);
      } catch (err) {
        if (err instanceof UnknownGradingSchemeError || err instanceof GradingSchemeMismatchError) {
          return reply.status(400).send(fail(err.message));
        }
        throw err;
      }
    },
  );

  // "Edit my ranges" — O-Level / A-Level-Principal only, forks the school's
  // selected catalog scheme into its own copy on first edit.
  fastify.put<{
    Body: { appliesTo: GradingAppliesTo; roleScope: GradeRoleScope; bands: GradeBandInput[] };
  }>(
    "/school-grading-schemes/ranges",
    { preHandler: SCHOOL, schema: { body: schoolGradingRangesBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      if (!(await canSeeLevel(request, request.body.appliesTo))) {
        return reply.status(400).send(fail("Unknown level."));
      }
      try {
        const selection = await editSchoolGradingRanges(
          schoolId,
          request.body.appliesTo,
          request.body.roleScope,
          request.body.bands,
        );
        return ok(selection);
      } catch (err) {
        if (err instanceof InvalidGradingSchemeError || err instanceof NoGradingSchemeSelectedError) {
          return reply.status(400).send(fail(err.message));
        }
        throw err;
      }
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
      if (!(await canSeeLevel(request, "A_LEVEL"))) return ok([]);
      return ok(await listSchoolCombinations(schoolId, request.query.academicYearId));
    },
  );

  fastify.post<{ Querystring: { academicYearId?: string }; Body: SchoolCombinationInput }>(
    "/school-combinations",
    { preHandler: SCHOOL, schema: { body: schoolCombinationBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      if (!(await canSeeLevel(request, "A_LEVEL"))) return reply.status(400).send(fail("Unknown level."));
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

  // -- Section settings (per school section) ------------------------------
  // Nursery assessment style (ratings / marks / both) and whether report
  // cards show positions. Only the caller's own sections are listed.
  fastify.get("/section-settings", { preHandler: SCHOOL }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    return ok(await getSectionSettings(schoolId));
  });

  fastify.put<{ Body: { section: SchoolSection; assessmentStyle?: AssessmentStyle; showPositions?: boolean } }>(
    "/section-settings",
    { preHandler: SCHOOL, schema: { body: sectionSettingsBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const { section, ...input } = request.body;
        return ok(await updateSectionSettings(schoolId, section, input));
      } catch (err) {
        if (err instanceof InvalidSectionSettingsError) return reply.status(400).send(fail(err.message));
        throw err;
      }
    },
  );

  // -- A school's own subjects --------------------------------------------
  // Nursery subjects, and non-examinable extras at other levels: private to
  // the school, no approval. Offered for the given year straight away.
  fastify.post<{ Querystring: { academicYearId?: string }; Body: SchoolSubjectInput & { maxMark?: number } }>(
    "/school-subjects",
    { preHandler: SCHOOL, schema: { body: schoolSubjectBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      if (!(await canSeeLevel(request, request.body.phase))) {
        return reply.status(400).send(fail("Unknown level."));
      }
      try {
        const { maxMark, ...input } = request.body;
        const subject = await createSchoolSubject(schoolId, input);
        if (subject && request.query.academicYearId) {
          await setSubjectOffering(schoolId, request.query.academicYearId, {
            subjectId: subject.id,
            isOffered: true,
            isCompulsory: input.phase === "KINDERGARTEN",
            maxMark,
          });
        }
        if (input.phase === "KINDERGARTEN") await assignNurseryClassTeachers(pool, schoolId);
        return reply.status(201).send(ok(subject));
      } catch (err) {
        if (err instanceof InvalidSubjectError || err instanceof InvalidMaxMarkError) {
          return reply.status(400).send(fail(err.message));
        }
        throw err;
      }
    },
  );

  fastify.patch<{ Params: { id: string }; Body: { name: string; shortName: string; stageIds?: string[] } }>(
    "/school-subjects/:id",
    { preHandler: SCHOOL, schema: { body: schoolSubjectUpdateBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const subject = await updateSchoolSubject(schoolId, request.params.id, request.body);
        return subject ? ok(subject) : reply.status(404).send(fail("not_found"));
      } catch (err) {
        if (err instanceof InvalidSubjectError) return reply.status(400).send(fail(err.message));
        throw err;
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/school-subjects/:id",
    { preHandler: SCHOOL },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const deleted = await deleteSchoolSubject(schoolId, request.params.id);
        return deleted ? ok(null) : reply.status(404).send(fail("not_found"));
      } catch (err) {
        if (err instanceof SubjectInUseError) return reply.status(409).send(fail(err.message));
        throw err;
      }
    },
  );
}
