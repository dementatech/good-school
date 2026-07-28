import type { FastifyInstance } from "fastify";
import { schoolsRoutes } from "./api/routes.js";

export type { ThemeConfig } from "./domain/theme.repository.js";

export async function registerSchoolsModule(fastify: FastifyInstance) {
  await fastify.register(schoolsRoutes, { prefix: "/api/v1/schools" });
}
