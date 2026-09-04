import type { FastifyInstance } from "fastify";
import { staffRoutes, subjectTeacherAssignmentRoutes } from "./api/routes.js";

export async function registerTeachersModule(fastify: FastifyInstance) {
  await fastify.register(staffRoutes, { prefix: "/api/v1/staff" });
  await fastify.register(subjectTeacherAssignmentRoutes, {
    prefix: "/api/v1/subject-teacher-assignments",
  });
}
