import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { ok, fail } from "../../../shared/envelope.js";
import {
  DuplicateExamCodeError,
  ExamSessionInUseError,
  createExamSession,
  deleteExamSession,
  listExamSessions,
  updateExamSession,
  type ExamSessionInput,
} from "../domain/exam-sessions.repository.js";
import {
  DuplicateExamNameError,
  InvalidExamDatesError,
  NoCurrentAcademicYearError,
  NoCurrentTermError,
  UnknownExamSessionError,
  createSchoolExam,
  deleteSchoolExam,
  listSchoolExams,
  setSchoolExamStatus,
  updateSchoolExam,
  type CreateSchoolExamInput,
  type UpdateSchoolExamInput,
} from "../domain/school-exams.repository.js";
import {
  IncompleteMarkSheetError,
  InvalidScoreError,
  MarkSheetLockedError,
  MarksEntryClosedError,
  NotAssignedError,
  UnknownExamError,
  UnknownSlotError,
  examCompletion,
  getMarkSheet,
  listAssignedExams,
  reopenMarkSheet,
  saveMarks,
  submitMarkSheet,
  type MarkEntryInput,
  type MarkSheetActor,
} from "../domain/exam-results.repository.js";
import {
  examSessionBodySchema,
  markSheetSlotBodySchema,
  markSheetSlotQuerySchema,
  saveMarksBodySchema,
  schoolExamBodySchema,
  schoolExamUpdateBodySchema,
} from "./schemas.js";

const REFERENCE = requireAuth(["super_admin"]);
const SCHOOL = requireAuth(["admin", "school_admin", "super_admin"]);
const TEACHER = requireAuth(["teacher"]);
// Marks entry: the assigned teacher, or a school admin acting as an override.
const MARKS = requireAuth(["teacher", "admin", "school_admin"]);

function actorOf(request: FastifyRequest): MarkSheetActor {
  const auth = request.authUser!;
  return { userId: auth.user_id, role: auth.role as MarkSheetActor["role"] };
}

// Pulls the (subject, class, stream) slot from a request body or query.
function slotOf(src: { subjectId: string; classId: string; streamId?: string | null }) {
  return { subjectId: src.subjectId, classId: src.classId, streamId: src.streamId || null };
}

// Maps a marks-entry domain error to its HTTP status, or rethrows.
function replyMarksError(err: unknown, reply: FastifyReply): FastifyReply {
  if (err instanceof UnknownExamError) return reply.status(404).send(fail(err.message));
  if (err instanceof UnknownSlotError) return reply.status(404).send(fail(err.message));
  if (err instanceof NotAssignedError) return reply.status(403).send(fail(err.message));
  if (err instanceof InvalidScoreError) return reply.status(400).send(fail(err.message));
  if (
    err instanceof MarksEntryClosedError ||
    err instanceof MarkSheetLockedError ||
    err instanceof IncompleteMarkSheetError
  ) {
    return reply.status(409).send(fail(err.message));
  }
  throw err;
}

/** Pulls the caller's school from the JWT, or replies 400 and returns null. */
function schoolOf(request: FastifyRequest, reply: FastifyReply): string | null {
  const schoolId = request.authUser?.school_id ?? null;
  if (!schoolId) {
    reply.status(400).send(fail("no_school_context"));
    return null;
  }
  return schoolId;
}

export async function examsRoutes(fastify: FastifyInstance) {
  // ═══ Exam sessions — the platform catalog (super_admin writes) ════════════

  // Readable by any school administrator so they can pick one; non-super
  // callers only ever see active sessions.
  fastify.get("/sessions", { preHandler: SCHOOL }, async (request) => {
    const isSuperAdmin = request.authUser!.role === "super_admin";
    return ok(await listExamSessions({ activeOnly: !isSuperAdmin }));
  });

  fastify.post<{ Body: ExamSessionInput }>(
    "/sessions",
    { preHandler: REFERENCE, schema: { body: examSessionBodySchema } },
    async (request, reply) => {
      try {
        return reply.status(201).send(ok(await createExamSession(request.body)));
      } catch (err) {
        if (err instanceof DuplicateExamCodeError) return reply.status(409).send(fail(err.message));
        throw err;
      }
    },
  );

  fastify.patch<{ Params: { id: string }; Body: ExamSessionInput }>(
    "/sessions/:id",
    { preHandler: REFERENCE, schema: { body: examSessionBodySchema } },
    async (request, reply) => {
      try {
        const updated = await updateExamSession(request.params.id, request.body);
        return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
      } catch (err) {
        if (err instanceof DuplicateExamCodeError) return reply.status(409).send(fail(err.message));
        throw err;
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/sessions/:id",
    { preHandler: REFERENCE },
    async (request, reply) => {
      try {
        const deleted = await deleteExamSession(request.params.id);
        return deleted ? ok(null) : reply.status(404).send(fail("not_found"));
      } catch (err) {
        if (err instanceof ExamSessionInUseError) return reply.status(409).send(fail(err.message));
        throw err;
      }
    },
  );

  // ═══ School exams — a school's activated instances ════════════════════════

  fastify.get<{ Querystring: { academicYearId?: string; termId?: string } }>(
    "/",
    { preHandler: SCHOOL },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      return ok(
        await listSchoolExams(schoolId, {
          academicYearId: request.query.academicYearId,
          termId: request.query.termId,
        }),
      );
    },
  );

  fastify.post<{ Body: CreateSchoolExamInput }>(
    "/",
    { preHandler: SCHOOL, schema: { body: schoolExamBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const created = await createSchoolExam(schoolId, request.authUser!.user_id, request.body);
        return reply.status(201).send(ok(created));
      } catch (err) {
        if (
          err instanceof NoCurrentAcademicYearError ||
          err instanceof NoCurrentTermError ||
          err instanceof UnknownExamSessionError ||
          err instanceof InvalidExamDatesError
        ) {
          return reply.status(400).send(fail(err.message));
        }
        if (err instanceof DuplicateExamNameError) return reply.status(409).send(fail(err.message));
        throw err;
      }
    },
  );

  fastify.patch<{ Params: { id: string }; Body: UpdateSchoolExamInput }>(
    "/:id",
    { preHandler: SCHOOL, schema: { body: schoolExamUpdateBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const updated = await updateSchoolExam(schoolId, request.params.id, request.body);
        return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
      } catch (err) {
        if (err instanceof InvalidExamDatesError) return reply.status(400).send(fail(err.message));
        if (err instanceof DuplicateExamNameError) return reply.status(409).send(fail(err.message));
        throw err;
      }
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/:id/close",
    { preHandler: SCHOOL },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const updated = await setSchoolExamStatus(schoolId, request.params.id, "closed");
      return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/:id/reopen",
    { preHandler: SCHOOL },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const updated = await setSchoolExamStatus(schoolId, request.params.id, "active");
      return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
    },
  );

  fastify.delete<{ Params: { id: string } }>("/:id", { preHandler: SCHOOL }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    const deleted = await deleteSchoolExam(schoolId, request.params.id);
    return deleted ? ok(null) : reply.status(404).send(fail("not_found"));
  });

  // ═══ Marks entry — roadmap Step 1 ════════════════════════════════════════

  // Teacher portal: the active exams this teacher has marks to enter for, each
  // with its subject/class/stream slots and per-slot progress.
  fastify.get("/assigned", { preHandler: TEACHER }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    return ok(await listAssignedExams(schoolId, request.authUser!.user_id));
  });

  // Admin: every teaching slot for one exam, with progress + who owns it.
  fastify.get<{ Params: { id: string } }>(
    "/:id/completion",
    { preHandler: SCHOOL },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        return ok(await examCompletion(schoolId, request.params.id));
      } catch (err) {
        return replyMarksError(err, reply);
      }
    },
  );

  // One mark sheet — roster + current marks for a (subject, class, stream) slot.
  fastify.get<{ Params: { id: string }; Querystring: { subjectId: string; classId: string; streamId?: string } }>(
    "/:id/marksheet",
    { preHandler: MARKS, schema: { querystring: markSheetSlotQuerySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        return ok(await getMarkSheet(schoolId, request.params.id, slotOf(request.query), actorOf(request)));
      } catch (err) {
        return replyMarksError(err, reply);
      }
    },
  );

  fastify.put<{
    Params: { id: string };
    Body: { subjectId: string; classId: string; streamId?: string | null; entries: MarkEntryInput[] };
  }>(
    "/:id/marksheet",
    { preHandler: MARKS, schema: { body: saveMarksBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        return ok(
          await saveMarks(schoolId, request.params.id, slotOf(request.body), request.body.entries, actorOf(request)),
        );
      } catch (err) {
        return replyMarksError(err, reply);
      }
    },
  );

  fastify.post<{ Params: { id: string }; Body: { subjectId: string; classId: string; streamId?: string | null } }>(
    "/:id/marksheet/submit",
    { preHandler: MARKS, schema: { body: markSheetSlotBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        return ok(await submitMarkSheet(schoolId, request.params.id, slotOf(request.body), actorOf(request)));
      } catch (err) {
        return replyMarksError(err, reply);
      }
    },
  );

  // Only a school admin can unfreeze a submitted sheet.
  fastify.post<{ Params: { id: string }; Body: { subjectId: string; classId: string; streamId?: string | null } }>(
    "/:id/marksheet/reopen",
    { preHandler: SCHOOL, schema: { body: markSheetSlotBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        return ok(await reopenMarkSheet(schoolId, request.params.id, slotOf(request.body), actorOf(request)));
      } catch (err) {
        return replyMarksError(err, reply);
      }
    },
  );
}
