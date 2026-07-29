import type { FastifyInstance } from "fastify";
import { studentsRoutes } from "./api/routes.js";

export async function registerStudentsModule(fastify: FastifyInstance) {
  await fastify.register(studentsRoutes, { prefix: "/api/v1/students" });
}
