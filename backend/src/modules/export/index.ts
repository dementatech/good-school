import type { FastifyInstance } from "fastify";
import { exportRoutes } from "./api/routes.js";

export async function registerExportModule(fastify: FastifyInstance) {
  await fastify.register(exportRoutes, { prefix: "/api/v1/export" });
}
