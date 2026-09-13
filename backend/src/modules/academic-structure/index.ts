import type { FastifyInstance } from "fastify";
import { academicStructureRoutes } from "./api/routes.js";

// The only surface other modules may import from (see claude.md — module
// boundary rule).
export type { AcademicYearRecord } from "./domain/academic-years.repository.js";
export { getCurrentAcademicYear } from "./domain/academic-years.repository.js";
export type { TermRecord } from "./domain/terms.repository.js";
export { getCurrentTerm } from "./domain/terms.repository.js";
export type { GradeBandRecord } from "./domain/grading-schemes.repository.js";
export { computeGrade, getActiveSchemeForSubject } from "./domain/grading-schemes.repository.js";

export async function registerAcademicStructureModule(fastify: FastifyInstance) {
  await fastify.register(academicStructureRoutes, { prefix: "/api/v1/academic" });
}
