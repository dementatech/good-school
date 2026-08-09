import type { FastifyInstance } from "fastify";
import { academicStructureRoutes } from "./api/routes.js";

export async function registerAcademicStructureModule(fastify: FastifyInstance) {
  await fastify.register(academicStructureRoutes, { prefix: "/api/v1/academic" });
}
