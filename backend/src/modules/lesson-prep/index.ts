import type { FastifyInstance } from "fastify";
import { lessonPrepRoutes } from "./api/routes.js";

// Schemes of work, lesson plans and records of work, with DOS review.
export async function registerLessonPrepModule(fastify: FastifyInstance) {
  await fastify.register(lessonPrepRoutes, { prefix: "/api/v1/lesson-prep" });
}
