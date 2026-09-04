import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { ok, fail } from "../../../shared/envelope.js";
import {
  ActiveAssignmentExistsError,
  UnknownReferenceError,
  UnknownSubjectError,
  addSpecialization,
  archiveStaff,
  createAssignment,
  createStaff,
  deleteStaff,
  endAssignment,
  getStaff,
  listAssignments,
  listSpecializations,
  listStaff,
  removeSpecialization,
  resetStaffPasswords,
  restoreStaff,
  updateStaff,
  type CreateStaffInput,
  type StaffAssignmentInput,
  type StaffIdentityInput,
} from "../domain/staff.repository.js";
import {
  AlreadyAssignedError,
  SubjectNotOfferedError,
  StaffNotAssignedError,
  allocationGaps,
  candidatesForSubject,
  createSubjectTeacherAssignment,
  endSubjectTeacherAssignment,
  listForStaff,
  listForSubjectOffering,
  UnknownReferenceError as UnknownAssignmentReferenceError,
  type SubjectTeacherAssignmentInput,
} from "../domain/subject-teacher-assignment.repository.js";
import { pool } from "../../../shared/db/index.js";
import {
  addSpecializationBodySchema,
  assignmentBodySchema,
  createStaffBodySchema,
  createSubjectTeacherAssignmentBodySchema,
  endAssignmentBodySchema,
  endSubjectTeacherAssignmentBodySchema,
  resetPasswordsBodySchema,
  staffIdentityBodySchema,
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

export async function staffRoutes(fastify: FastifyInstance) {
  // Every route here is scoped to the caller's own school_id, same discipline
  // as students — an admin can never list/edit another school's staff.
  fastify.get("/", { preHandler: ADMIN }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    return ok(await listStaff(schoolId));
  });

  // Candidates for "who teaches this subject" (teachers-module.md §4.2) —
  // registered before /:id so it isn't swallowed by that param route.
  fastify.get<{ Querystring: { subjectId?: string } }>(
    "/candidates",
    { preHandler: ADMIN },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      if (!request.query.subjectId) return reply.status(400).send(fail("subjectId is required"));
      return ok(await candidatesForSubject(schoolId, request.query.subjectId));
    },
  );

  fastify.get<{ Params: { id: string } }>("/:id", { preHandler: ADMIN }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    const staff = await getStaff(schoolId, request.params.id);
    return staff ? ok(staff) : reply.status(404).send(fail("not_found"));
  });

  fastify.post<{ Body: CreateStaffInput }>(
    "/",
    { preHandler: ADMIN, schema: { body: createStaffBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const { staff, tempPassword } = await createStaff(schoolId, request.body);
        return reply.status(201).send(ok({ staff, tempPassword }));
      } catch (err) {
        if (err instanceof UnknownReferenceError) return reply.status(400).send(fail(err.message));
        if (err instanceof ActiveAssignmentExistsError) {
          return reply.status(409).send(fail(err.message));
        }
        throw err;
      }
    },
  );

  fastify.patch<{ Params: { id: string }; Body: StaffIdentityInput }>(
    "/:id",
    { preHandler: ADMIN, schema: { body: staffIdentityBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const staff = await updateStaff(schoolId, request.params.id, request.body);
      return staff ? ok(staff) : reply.status(404).send(fail("not_found"));
    },
  );

  fastify.delete<{ Params: { id: string } }>("/:id", { preHandler: ADMIN }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    const deleted = await deleteStaff(schoolId, request.params.id);
    return deleted ? reply.status(204).send() : reply.status(404).send(fail("not_found"));
  });

  // Soft delete — keeps the staff record and teaching history, just stops
  // them showing as active. Separate from the hard DELETE above.
  fastify.post<{ Params: { id: string } }>(
    "/:id/archive",
    { preHandler: ADMIN },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const staff = await archiveStaff(schoolId, request.params.id);
      return staff ? ok(staff) : reply.status(404).send(fail("not_found"));
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/:id/restore",
    { preHandler: ADMIN },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const staff = await restoreStaff(schoolId, request.params.id);
      return staff ? ok(staff) : reply.status(404).send(fail("not_found"));
    },
  );

  fastify.post<{ Body: { userIds: string[] } }>(
    "/reset-passwords",
    { preHandler: ADMIN, schema: { body: resetPasswordsBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      return ok(await resetStaffPasswords(schoolId, request.body.userIds));
    },
  );

  // ── School assignment history ───────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>(
    "/:id/assignments",
    { preHandler: ADMIN },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      return ok(await listAssignments(schoolId, request.params.id));
    },
  );

  // A new assignment period (re-hire / transfer back) — rejected with 409 if
  // already active at this school, per staff-assignment.repository.ts.
  fastify.post<{ Params: { id: string }; Body: StaffAssignmentInput }>(
    "/:id/assignments",
    { preHandler: ADMIN, schema: { body: assignmentBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const assignment = await createAssignment(client, schoolId, request.params.id, request.body);
        await client.query("COMMIT");
        return reply.status(201).send(ok(assignment));
      } catch (err) {
        await client.query("ROLLBACK");
        if (err instanceof UnknownReferenceError) return reply.status(400).send(fail(err.message));
        if (err instanceof ActiveAssignmentExistsError) {
          return reply.status(409).send(fail(err.message));
        }
        throw err;
      } finally {
        client.release();
      }
    },
  );

  fastify.post<{
    Params: { id: string; assignmentId: string };
    Body: { exitDate: string; exitType: "transfer" | "resignation" | "retirement" | "government_reposting" };
  }>(
    "/:id/assignments/:assignmentId/end",
    { preHandler: ADMIN, schema: { body: endAssignmentBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const assignment = await endAssignment(schoolId, request.params.assignmentId, request.body);
      return assignment ? ok(assignment) : reply.status(404).send(fail("not_found"));
    },
  );

  // ── Teaching load (subject_teacher_assignment, staff-side view) ────────

  fastify.get<{ Params: { id: string } }>(
    "/:id/teaching-load",
    { preHandler: ADMIN },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      return ok(await listForStaff(schoolId, request.params.id));
    },
  );

  // ── Specializations ─────────────────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>(
    "/:id/specializations",
    { preHandler: ADMIN },
    async (request) => ok(await listSpecializations(request.params.id)),
  );

  fastify.post<{ Params: { id: string }; Body: { subjectId: string } }>(
    "/:id/specializations",
    { preHandler: ADMIN, schema: { body: addSpecializationBodySchema } },
    async (request, reply) => {
      try {
        await addSpecialization(request.params.id, request.body.subjectId);
        return reply.status(201).send(ok(await listSpecializations(request.params.id)));
      } catch (err) {
        if (err instanceof UnknownSubjectError) return reply.status(400).send(fail(err.message));
        throw err;
      }
    },
  );

  fastify.delete<{ Params: { id: string; subjectId: string } }>(
    "/:id/specializations/:subjectId",
    { preHandler: ADMIN },
    async (request, reply) => {
      const removed = await removeSpecialization(request.params.id, request.params.subjectId);
      return removed ? ok(null) : reply.status(404).send(fail("not_found"));
    },
  );
}

// The allocation side (teachers-module.md §3, §4) — folded into the same
// "configure the subject offering" screen on the frontend, but its own route
// group since it's keyed by subject/class/stream, not by staff id.
export async function subjectTeacherAssignmentRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { academicYearId?: string; subjectId?: string } }>(
    "/",
    { preHandler: ADMIN },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const { academicYearId, subjectId } = request.query;
      if (!academicYearId || !subjectId) {
        return reply.status(400).send(fail("academicYearId and subjectId are required"));
      }
      return ok(await listForSubjectOffering(schoolId, academicYearId, subjectId));
    },
  );

  // "3 subjects still need a teacher" — registered before nothing conflicts
  // here since there's no /:id sibling on this plugin's root.
  fastify.get<{ Querystring: { academicYearId?: string } }>(
    "/gaps",
    { preHandler: ADMIN },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      if (!request.query.academicYearId) {
        return reply.status(400).send(fail("academicYearId is required"));
      }
      return ok(await allocationGaps(schoolId, request.query.academicYearId));
    },
  );

  fastify.post<{ Body: SubjectTeacherAssignmentInput }>(
    "/",
    { preHandler: ADMIN, schema: { body: createSubjectTeacherAssignmentBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const assignment = await createSubjectTeacherAssignment(
          schoolId,
          request.body,
          request.authUser!.user_id,
        );
        return reply.status(201).send(ok(assignment));
      } catch (err) {
        if (
          err instanceof SubjectNotOfferedError ||
          err instanceof StaffNotAssignedError ||
          err instanceof UnknownAssignmentReferenceError
        ) {
          return reply.status(400).send(fail(err.message));
        }
        if (err instanceof AlreadyAssignedError) return reply.status(409).send(fail(err.message));
        throw err;
      }
    },
  );

  fastify.post<{ Params: { id: string }; Body: { endDate: string } }>(
    "/:id/end",
    { preHandler: ADMIN, schema: { body: endSubjectTeacherAssignmentBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const ended = await endSubjectTeacherAssignment(schoolId, request.params.id, request.body.endDate);
      return ended ? ok(ended) : reply.status(404).send(fail("not_found"));
    },
  );
}
