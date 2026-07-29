import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/index.js";
import {
  createStudent,
  deleteStudent,
  getStudent,
  listStudents,
  updateStudent,
  type StudentInput,
} from "../domain/students.repository.js";
import {
  createStudentResponseSchema,
  listStudentsResponseSchema,
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
}
