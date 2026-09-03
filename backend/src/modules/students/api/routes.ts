import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { ok, fail } from "../../../shared/envelope.js";
import {
  ActiveCombinationExistsError,
  ActiveEnrollmentExistsError,
  CompulsorySubjectError,
  InvalidGuardianInputError,
  InvalidSubsidiaryError,
  SubjectNotOfferedError,
  UnknownCombinationReferenceError,
  UnknownReferenceError,
  addStudentSubject,
  archiveStudent,
  createEnrollment,
  createStudent,
  deleteStudent,
  getCurrentCombination,
  getStudent,
  linkGuardianToStudent,
  listCombinationHistory,
  listEnrollments,
  listGuardiansForStudent,
  listStudents,
  listStudentSubjects,
  matchOrCreateGuardian,
  reassignCombination,
  resetStudentPasswords,
  restoreStudent,
  searchGuardians,
  selectCombination,
  setStudentSubjectStatus,
  unlinkGuardianFromStudent,
  updateStudent,
  withdrawEnrollment,
  type CreateStudentInput,
  type StudentIdentityInput,
} from "../domain/students.repository.js";
import { pool } from "../../../shared/db/index.js";
import {
  addStudentSubjectBodySchema,
  createStudentBodySchema,
  dropStudentSubjectBodySchema,
  enrollmentBodySchema,
  guardianLinkBodySchema,
  resetPasswordsBodySchema,
  selectCombinationBodySchema,
  studentIdentityBodySchema,
  withdrawBodySchema,
} from "./schemas.js";

const ADMIN = requireAuth(["admin", "school_admin", "super_admin"]);

/** Pulls the caller's school from the JWT, or replies 400 and returns null. */
function schoolOf(request: FastifyRequest, reply: FastifyReply): string | null {
  const schoolId = request.authUser?.school_id ?? null;
  if (!schoolId) {
    reply.status(400).send(fail("no_school_context"));
    return null;
  }
  return schoolId;
}

interface GuardianLinkBody {
  guardianId?: string;
  newGuardian?: {
    firstName: string;
    lastName: string;
    phone?: string | null;
    email?: string | null;
    nin?: string | null;
    relationshipToStudent?: string | null;
  };
  role: "parent" | "sponsor" | "guardian";
  isPrimaryContact: boolean;
  isFeeResponsible: boolean;
  isEmergencyContact: boolean;
}

export async function studentsRoutes(fastify: FastifyInstance) {
  // Every route here is scoped to the caller's own school_id (from the
  // verified JWT) — an admin can never list/edit another school's students.
  fastify.get("/", { preHandler: ADMIN }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    return ok(await listStudents(schoolId));
  });

  fastify.get<{ Params: { id: string } }>("/:id", { preHandler: ADMIN }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    const student = await getStudent(schoolId, request.params.id);
    return student ? ok(student) : reply.status(404).send(fail("not_found"));
  });

  fastify.post<{ Body: CreateStudentInput }>(
    "/",
    { preHandler: ADMIN, schema: { body: createStudentBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const { student, tempPassword, guardians } = await createStudent(schoolId, request.body);
        return reply.status(201).send(ok({ student, tempPassword, guardians }));
      } catch (err) {
        if (err instanceof UnknownReferenceError || err instanceof InvalidGuardianInputError) {
          return reply.status(400).send(fail(err.message));
        }
        if (err instanceof ActiveEnrollmentExistsError) {
          return reply.status(409).send(fail(err.message));
        }
        throw err;
      }
    },
  );

  fastify.patch<{ Params: { id: string }; Body: StudentIdentityInput }>(
    "/:id",
    { preHandler: ADMIN, schema: { body: studentIdentityBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const student = await updateStudent(schoolId, request.params.id, request.body);
      return student ? ok(student) : reply.status(404).send(fail("not_found"));
    },
  );

  fastify.delete<{ Params: { id: string } }>("/:id", { preHandler: ADMIN }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    const deleted = await deleteStudent(schoolId, request.params.id);
    return deleted ? reply.status(204).send() : reply.status(404).send(fail("not_found"));
  });

  // Soft delete — keeps the student's record, just stops them showing as
  // active. Separate from the hard DELETE above.
  fastify.post<{ Params: { id: string } }>(
    "/:id/archive",
    { preHandler: ADMIN },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const student = await archiveStudent(schoolId, request.params.id);
      return student ? ok(student) : reply.status(404).send(fail("not_found"));
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/:id/restore",
    { preHandler: ADMIN },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const student = await restoreStudent(schoolId, request.params.id);
      return student ? ok(student) : reply.status(404).send(fail("not_found"));
    },
  );

  // Backs the "include passwords" export option — bulk-resets and returns
  // fresh temp passwords for a filtered set of students in one request.
  fastify.post<{ Body: { userIds: string[] } }>(
    "/reset-passwords",
    { preHandler: ADMIN, schema: { body: resetPasswordsBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      return ok(await resetStudentPasswords(schoolId, request.body.userIds));
    },
  );

  // ── Enrollment history ──────────────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>(
    "/:id/enrollments",
    { preHandler: ADMIN },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      return ok(await listEnrollments(schoolId, request.params.id));
    },
  );

  // A new enrollment period (repeat / transfer / re-admission) — rejected
  // with 409 if the student already has an active one at this school; the
  // admin must withdraw it first (POST .../withdraw), never silently
  // superseded. See docs/design/student-enrollment.md §4.
  fastify.post<{ Params: { id: string }; Body: CreateStudentInput["enrollment"] }>(
    "/:id/enrollments",
    { preHandler: ADMIN, schema: { body: enrollmentBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const enrollment = await createEnrollment(client, schoolId, request.params.id, request.body);
        await client.query("COMMIT");
        return reply.status(201).send(ok(enrollment));
      } catch (err) {
        await client.query("ROLLBACK");
        if (err instanceof UnknownReferenceError) return reply.status(400).send(fail(err.message));
        if (err instanceof ActiveEnrollmentExistsError) {
          return reply.status(409).send(fail(err.message));
        }
        throw err;
      } finally {
        client.release();
      }
    },
  );

  fastify.post<{
    Params: { id: string; enrollmentId: string };
    Body: { exitDate: string; exitType: "transfer" | "withdrawal" | "completion" | "no_show" };
  }>(
    "/:id/enrollments/:enrollmentId/withdraw",
    { preHandler: ADMIN, schema: { body: withdrawBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const enrollment = await withdrawEnrollment(schoolId, request.params.enrollmentId, request.body);
      return enrollment ? ok(enrollment) : reply.status(404).send(fail("not_found"));
    },
  );

  // ── Guardians ────────────────────────────────────────────────────────────

  // Search-existing picker backing "attach an existing guardian" — never a
  // free-text guardian creation from this endpoint.
  fastify.get<{ Querystring: { search?: string } }>(
    "/guardians/search",
    { preHandler: ADMIN },
    async (request) => ok(await searchGuardians(request.query.search ?? "")),
  );

  fastify.get<{ Params: { id: string } }>(
    "/:id/guardians",
    { preHandler: ADMIN },
    async (request) => ok(await listGuardiansForStudent(request.params.id)),
  );

  fastify.post<{ Params: { id: string }; Body: GuardianLinkBody }>(
    "/:id/guardians",
    { preHandler: ADMIN, schema: { body: guardianLinkBodySchema } },
    async (request, reply) => {
      if (!request.body.guardianId && !request.body.newGuardian) {
        return reply.status(400).send(fail("Provide either guardianId or newGuardian"));
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        let guardianId = request.body.guardianId;
        let matched = true;
        if (!guardianId) {
          const result = await matchOrCreateGuardian(client, request.body.newGuardian!, "intake");
          guardianId = result.guardian.id;
          matched = result.matched;
        }
        await linkGuardianToStudent(client, request.params.id, guardianId, {
          role: request.body.role,
          isPrimaryContact: request.body.isPrimaryContact,
          isFeeResponsible: request.body.isFeeResponsible,
          isEmergencyContact: request.body.isEmergencyContact,
        });
        await client.query("COMMIT");
        return reply.status(201).send(ok({ guardianId, matched }));
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  );

  fastify.delete<{ Params: { id: string; guardianId: string } }>(
    "/:id/guardians/:guardianId",
    { preHandler: ADMIN },
    async (request, reply) => {
      const removed = await unlinkGuardianFromStudent(request.params.id, request.params.guardianId);
      return removed ? ok(null) : reply.status(404).send(fail("not_found"));
    },
  );

  // ── O-Level subjects ────────────────────────────────────────────────────

  fastify.get<{ Params: { id: string }; Querystring: { academicYearId?: string } }>(
    "/:id/subjects",
    { preHandler: ADMIN },
    async (request) => ok(await listStudentSubjects(request.params.id, request.query.academicYearId)),
  );

  fastify.post<{
    Params: { id: string };
    Body: { subjectId: string; academicYearId: string };
  }>(
    "/:id/subjects",
    { preHandler: ADMIN, schema: { body: addStudentSubjectBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const registered = await addStudentSubject(
          schoolId,
          request.params.id,
          request.body.academicYearId,
          request.body.subjectId,
          request.authUser!.user_id,
        );
        return reply.status(201).send(ok(registered));
      } catch (err) {
        if (err instanceof SubjectNotOfferedError) {
          return reply.status(400).send(fail(err.message));
        }
        throw err;
      }
    },
  );

  fastify.post<{
    Params: { id: string; subjectId: string };
    Body: { academicYearId: string; reason?: string | null };
  }>(
    "/:id/subjects/:subjectId/drop",
    { preHandler: ADMIN, schema: { body: dropStudentSubjectBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const updated = await setStudentSubjectStatus(
          schoolId,
          request.params.id,
          request.params.subjectId,
          request.body.academicYearId,
          "dropped",
          request.authUser!.user_id,
          request.body.reason ?? null,
        );
        return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
      } catch (err) {
        if (err instanceof CompulsorySubjectError) {
          return reply.status(400).send(fail(err.message));
        }
        throw err;
      }
    },
  );

  // ── A-Level combination ─────────────────────────────────────────────────

  fastify.get<{ Params: { id: string }; Querystring: { academicYearId?: string } }>(
    "/:id/combination",
    { preHandler: ADMIN },
    async (request) => ok(await getCurrentCombination(request.params.id, request.query.academicYearId)),
  );

  fastify.get<{ Params: { id: string } }>(
    "/:id/combinations",
    { preHandler: ADMIN },
    async (request) => ok(await listCombinationHistory(request.params.id)),
  );

  fastify.post<{
    Params: { id: string };
    Body: { academicYearId: string; schoolCombinationId: string; subsidiarySubjectId?: string | null };
  }>(
    "/:id/combination",
    { preHandler: ADMIN, schema: { body: selectCombinationBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const combination = await selectCombination(
          schoolId,
          request.params.id,
          request.body.academicYearId,
          request.body.schoolCombinationId,
          request.body.subsidiarySubjectId,
          request.authUser!.user_id,
        );
        return reply.status(201).send(ok(combination));
      } catch (err) {
        if (err instanceof UnknownCombinationReferenceError || err instanceof InvalidSubsidiaryError) {
          return reply.status(400).send(fail(err.message));
        }
        if (err instanceof ActiveCombinationExistsError) {
          return reply.status(409).send(fail(err.message));
        }
        throw err;
      }
    },
  );

  fastify.post<{
    Params: { id: string };
    Body: { academicYearId: string; schoolCombinationId: string; subsidiarySubjectId?: string | null };
  }>(
    "/:id/combination/reassign",
    { preHandler: ADMIN, schema: { body: selectCombinationBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const combination = await reassignCombination(
          schoolId,
          request.params.id,
          request.body.academicYearId,
          request.body.schoolCombinationId,
          request.body.subsidiarySubjectId,
          request.authUser!.user_id,
        );
        return reply.status(201).send(ok(combination));
      } catch (err) {
        if (err instanceof UnknownCombinationReferenceError || err instanceof InvalidSubsidiaryError) {
          return reply.status(400).send(fail(err.message));
        }
        throw err;
      }
    },
  );
}
