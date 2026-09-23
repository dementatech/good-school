import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { getCurrentAcademicYear, getCurrentTerm } from "../../academic-structure/index.js";
import { ok, fail } from "../../../shared/envelope.js";
import { pool } from "../../../shared/db/index.js";
import {
  SECTION_COOKIE,
  SECTION_LEVELS,
  levelsForSchool,
  sectionsOf,
  visibleLevelsFor,
  type SchoolLevel,
  type SchoolSection,
} from "../../../shared/levels.js";
import {
  TimetableError,
  copyTimetable,
  deleteSlot,
  getClassTimetable,
  getTeacherTimetable,
  listPeriods,
  getTimetableDays,
  loadClass,
  savePeriods,
  setSlot,
  standardDay,
  suggestedTeacher,
  teacherLoads,
  type PeriodInput,
  type SlotInput,
} from "../domain/timetable.repository.js";
import { copyBodySchema, periodsBodySchema, slotBodySchema } from "./schemas.js";

const ADMIN = requireAuth(["school_admin", "admin"]);
const ANY_STAFF = requireAuth(["school_admin", "admin", "teacher"]);

function schoolOf(request: FastifyRequest, reply: FastifyReply): string | null {
  const schoolId = request.authUser?.school_id ?? null;
  if (!schoolId) {
    reply.status(400).send(fail("no_school_context"));
    return null;
  }
  return schoolId;
}

const visibleLevels = (request: FastifyRequest): Promise<SchoolLevel[] | null> =>
  visibleLevelsFor(request.authUser!, request.cookies[SECTION_COOKIE]);

/** A section this caller may work with: one of the school's, and for an
 * admin, the one they've switched to. */
async function assertSection(request: FastifyRequest, schoolId: string, section: SchoolSection): Promise<void> {
  if (!sectionsOf(await levelsForSchool(schoolId)).includes(section)) {
    throw new TimetableError("Unknown section.", 404);
  }
  const levels = await visibleLevels(request);
  if (levels && !SECTION_LEVELS[section].some((l) => levels.includes(l))) {
    throw new TimetableError("Unknown section.", 404);
  }
}

/** The class must be in a level the caller may see (an admin's active section). */
async function assertClassVisible(request: FastifyRequest, schoolId: string, classId: string): Promise<void> {
  const klass = await loadClass(schoolId, classId);
  const levels = await visibleLevels(request);
  if (levels && !levels.includes(klass.phase)) throw new TimetableError("That class doesn't exist for this school.", 404);
}

function replyError(err: unknown, reply: FastifyReply): FastifyReply {
  if (err instanceof TimetableError) return reply.status(err.status).send(fail(err.message));
  throw err;
}

export async function timetableRoutes(fastify: FastifyInstance) {
  // The current year, its terms and the current term — for the term pickers.
  fastify.get("/context", { preHandler: ANY_STAFF }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    const year = await getCurrentAcademicYear(schoolId);
    if (!year) return ok({ academicYear: null, terms: [], currentTermId: null });
    const [terms, current] = await Promise.all([
      pool.query<{ id: string; name: string; start_date: string; end_date: string }>(
        `select id, name, to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date
           from terms where school_id = $1 and academic_year_id = $2 order by start_date`,
        [schoolId, year.id],
      ),
      getCurrentTerm(schoolId, year.id),
    ]);
    return ok({
      academicYear: { id: year.id, name: year.yearName },
      terms: terms.rows.map((t) => ({ id: t.id, name: t.name, startDate: t.start_date, endDate: t.end_date })),
      currentTermId: current?.id ?? null,
    });
  });

  // ── Day structure ─────────────────────────────────────────────────────────
  fastify.get<{ Querystring: { section: SchoolSection } }>(
    "/periods",
    { preHandler: ANY_STAFF },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        await assertSection(request, schoolId, request.query.section);
        const [periods, days] = await Promise.all([
          listPeriods(schoolId, request.query.section),
          getTimetableDays(schoolId, request.query.section),
        ]);
        return ok({ periods, days, template: standardDay(request.query.section) });
      } catch (err) {
        return replyError(err, reply);
      }
    },
  );

  fastify.put<{ Body: { section: SchoolSection; periods: PeriodInput[]; days: number[] } }>(
    "/periods",
    { preHandler: ADMIN, schema: { body: periodsBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        await assertSection(request, schoolId, request.body.section);
        return ok(await savePeriods(schoolId, request.body.section, request.body.periods, request.body.days));
      } catch (err) {
        return replyError(err, reply);
      }
    },
  );

  // ── Class grid ────────────────────────────────────────────────────────────
  fastify.get<{ Querystring: { termId: string; classId: string; streamId?: string } }>(
    "/class",
    { preHandler: ANY_STAFF },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const { termId, classId, streamId } = request.query;
      try {
        await assertClassVisible(request, schoolId, classId);
        return ok(await getClassTimetable(schoolId, termId, classId, streamId || null));
      } catch (err) {
        return replyError(err, reply);
      }
    },
  );

  fastify.get<{ Querystring: { classId: string; streamId?: string; subjectId: string } }>(
    "/suggest-teacher",
    { preHandler: ADMIN },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const klass = await loadClass(schoolId, request.query.classId);
        return ok({
          staffId: await suggestedTeacher(
            schoolId,
            klass.academicYearId,
            request.query.subjectId,
            klass.id,
            request.query.streamId || null,
          ),
        });
      } catch (err) {
        return replyError(err, reply);
      }
    },
  );

  fastify.put<{ Body: SlotInput }>(
    "/slot",
    { preHandler: ADMIN, schema: { body: slotBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        await assertClassVisible(request, schoolId, request.body.classId);
        return ok(await setSlot(schoolId, request.body, request.authUser!.user_id));
      } catch (err) {
        return replyError(err, reply);
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>("/slot/:id", { preHandler: ADMIN }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    const deleted = await deleteSlot(schoolId, request.params.id);
    return deleted ? ok(null) : reply.status(404).send(fail("not_found"));
  });

  fastify.post<{ Body: { fromTermId: string; toTermId: string } }>(
    "/copy",
    { preHandler: ADMIN, schema: { body: copyBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      // Only the classes of the section being worked in.
      const levels = await visibleLevels(request);
      const { rows } = await pool.query<{ id: string }>(
        `select c.id from classes c join curriculum_stage cs on cs.id = c.curriculum_stage_id
          where c.school_id = $1 and ($2::text[] is null or cs.phase = any($2::text[]))`,
        [schoolId, levels],
      );
      const copied = await copyTimetable(
        schoolId,
        request.body.fromTermId,
        request.body.toTermId,
        rows.map((r) => r.id),
      );
      return ok({ copied });
    },
  );

  // ── Teachers ──────────────────────────────────────────────────────────────
  fastify.get<{ Querystring: { termId?: string } }>("/me", { preHandler: ANY_STAFF }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    let termId = request.query.termId;
    if (!termId) {
      const year = await getCurrentAcademicYear(schoolId);
      termId = year ? (await getCurrentTerm(schoolId, year.id))?.id : undefined;
    }
    if (!termId) return ok({ periodsBySection: {}, days: [], slots: [] });
    return ok(await getTeacherTimetable(schoolId, termId, request.authUser!.user_id));
  });

  fastify.get<{ Params: { staffId: string }; Querystring: { termId: string } }>(
    "/teacher/:staffId",
    { preHandler: ADMIN },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      return ok(await getTeacherTimetable(schoolId, request.query.termId, request.params.staffId));
    },
  );

  fastify.get<{ Querystring: { termId: string } }>("/loads", { preHandler: ADMIN }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    return ok(await teacherLoads(schoolId, request.query.termId, await visibleLevels(request)));
  });
}
