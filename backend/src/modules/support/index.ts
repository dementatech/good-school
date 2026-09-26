import type { FastifyInstance } from "fastify";
import { supportRoutes } from "./api/routes.js";

export async function registerSupportModule(fastify: FastifyInstance) {
  await fastify.register(supportRoutes, { prefix: "/api/v1/support" });
}

export { isSupportStaff } from "./domain/support.repository.js";
