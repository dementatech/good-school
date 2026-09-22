import type { FastifyInstance } from "fastify";
import { communicationsRoutes } from "./api/routes.js";

export async function registerCommunicationsModule(fastify: FastifyInstance) {
  await fastify.register(communicationsRoutes, { prefix: "/api/v1/communications" });
}
