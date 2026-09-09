import type { FastifyInstance } from "fastify";
import { studentsRoutes } from "./api/routes.js";
import { studentImportRoutes } from "./api/import.routes.js";

export async function registerStudentsModule(fastify: FastifyInstance) {
  await fastify.register(studentImportRoutes, { prefix: "/api/v1/students" });
  await fastify.register(studentsRoutes, { prefix: "/api/v1/students" });
}
