import type { FastifyInstance } from "fastify";
import { earlyYearsRoutes } from "./api/routes.js";

// Kindergarten (Baby / Middle / Top Class) progress tracking — learning areas
// and developmental assessment. See docs/design/kindergarten-extension.md.
export async function registerEarlyYearsModule(fastify: FastifyInstance) {
  await fastify.register(earlyYearsRoutes, { prefix: "/api/v1/early-years" });
}
