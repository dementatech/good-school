import type { FastifyInstance } from "fastify";
import { schoolAdminRoutes } from "./api/routes.js";

export async function registerSchoolAdminModule(fastify: FastifyInstance) {
  await fastify.register(schoolAdminRoutes, { prefix: "/api/v1/school-admin" });
}
