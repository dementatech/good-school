import type { FastifyInstance } from "fastify";
import { schoolsRoutes } from "./api/routes.js";

export type { ThemeConfig } from "./domain/theme.repository.js";
export type { SchoolRecord } from "./domain/schools.repository.js";
export { findSchoolOnboardingStatus } from "./domain/schools.repository.js";
export { getSchoolSetting, setSchoolSetting } from "./domain/settings.repository.js";

export async function registerSchoolsModule(fastify: FastifyInstance) {
  await fastify.register(schoolsRoutes, { prefix: "/api/v1/schools" });
}
