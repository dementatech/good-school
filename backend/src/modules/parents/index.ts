import type { FastifyInstance } from "fastify";
import { parentsRoutes } from "./api/routes.js";

export async function registerParentsModule(fastify: FastifyInstance) {
  await fastify.register(parentsRoutes, { prefix: "/api/v1/parent" });
}
