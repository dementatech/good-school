import type { FastifyInstance } from "fastify";
import { organizationRoutes } from "./api/routes.js";

// Exported for academic-structure's subject-offering write path to call the
// moment a subject is enabled (departments-module.md §3) — same pattern as
// auth/index.ts exporting hashPassword/generateTempPassword alongside its
// route registrar.
export { ensureAcademicDepartment } from "./domain/department.repository.js";

export async function registerOrganizationModule(fastify: FastifyInstance) {
  await fastify.register(organizationRoutes, { prefix: "/api/v1/organization" });
}
