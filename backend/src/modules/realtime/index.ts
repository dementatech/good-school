import type { FastifyInstance } from "fastify";
import { realtimeRoutes } from "./api/routes.js";

export async function registerRealtimeModule(fastify: FastifyInstance) {
  await fastify.register(realtimeRoutes, { prefix: "/api/v1/realtime" });
}

/** The seam every other module pushes live events through — see
 *  domain/registry.ts. */
export { pushToUser } from "./domain/registry.js";
