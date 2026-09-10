import type { FastifyInstance } from "fastify";
import { examsRoutes } from "./api/routes.js";

export async function registerExamsModule(fastify: FastifyInstance) {
  await fastify.register(examsRoutes, { prefix: "/api/v1/exams" });
}
