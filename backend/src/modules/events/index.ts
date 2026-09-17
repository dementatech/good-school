import type { FastifyInstance } from "fastify";
import { eventsRoutes } from "./api/routes.js";

export async function registerEventsModule(fastify: FastifyInstance) {
  await fastify.register(eventsRoutes, { prefix: "/api/v1/events" });
}

export { syncEventForExam } from "./domain/events.repository.js";
