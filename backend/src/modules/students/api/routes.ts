import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/index.js";
import {
  archiveStudent,
  createStudent,
  deleteStudent,
  getStudent,
  listStudents,
  resetStudentPasswords,
  restoreStudent,
  updateStudent,
  type StudentInput,
} from "../domain/students.repository.js";
import {
  createStudentResponseSchema,
  listStudentsResponseSchema,
  resetPasswordsBodySchema,
  resetPasswordsResponseSchema,
  studentBodySchema,
  studentResponseSchema,
} from "./schemas.js";

export async function studentsRoutes(fastify: FastifyInstance) {
  // Every route here is admin-only and scoped to the admin's own school_id
  // (from the verified JWT) — an admin can never list/edit another school's students.
  fastify.get(
    "/",
    { preHandler: requireAuth(["admin"]), schema: { response: listStudentsResponseSchema } },
    async (request) => {
      return listStudents(request.authUser!.school_id!);
    },
  );

  fastify.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireAuth(["admin"]), schema: { response: studentResponseSchema } },
    async (request, reply) => {
      const student = await getStudent(request.authUser!.school_id!, request.params.id);
      if (!student) return reply.status(404).send({ error: "not_found" });
      return student;
    },
  );

  fastify.post<{ Body: StudentInput }>(
    "/",
    {
      preHandler: requireAuth(["admin"]),
      schema: { body: studentBodySchema, response: createStudentResponseSchema },
    },
    async (request, reply) => {
      const { student, tempPassword } = await createStudent(
        request.authUser!.school_id!,
        request.body,
      );
      return reply.status(201).send({ student, tempPassword });
    },
  );

  fastify.patch<{ Params: { id: string }; Body: StudentInput }>(
    "/:id",
    {
      preHandler: requireAuth(["admin"]),
      schema: { body: studentBodySchema, response: studentResponseSchema },
    },
    async (request, reply) => {
      const student = await updateStudent(
        request.authUser!.school_id!,
        request.params.id,
        request.body,
      );
      if (!student) return reply.status(404).send({ error: "not_found" });
      return student;
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireAuth(["admin"]) },
    async (request, reply) => {
      const deleted = await deleteStudent(request.authUser!.school_id!, request.params.id);
      if (!deleted) return reply.status(404).send({ error: "not_found" });
      return reply.status(204).send();
    },
  );

  // Soft delete — keeps the student's record, just stops them showing as
  // active. Separate from the hard DELETE above.
  fastify.post<{ Params: { id: string } }>(
    "/:id/archive",
    { preHandler: requireAuth(["admin"]), schema: { response: studentResponseSchema } },
    async (request, reply) => {
      const student = await archiveStudent(request.authUser!.school_id!, request.params.id);
      if (!student) return reply.status(404).send({ error: "not_found" });
      return student;
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/:id/restore",
    { preHandler: requireAuth(["admin"]), schema: { response: studentResponseSchema } },
    async (request, reply) => {
      const student = await restoreStudent(request.authUser!.school_id!, request.params.id);
      if (!student) return reply.status(404).send({ error: "not_found" });
      return student;
    },
  );

  // Backs the "include passwords" export option — bulk-resets and returns
  // fresh temp passwords for a filtered set of students in one request.
  fastify.post<{ Body: { userIds: string[] } }>(
    "/reset-passwords",
    {
      preHandler: requireAuth(["admin"]),
      schema: { body: resetPasswordsBodySchema, response: resetPasswordsResponseSchema },
    },
    async (request) => {
      return resetStudentPasswords(request.authUser!.school_id!, request.body.userIds);
    },
  );
}
