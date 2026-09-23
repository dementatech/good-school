import type { FastifyInstance } from "fastify";
import { timetableRoutes } from "./api/routes.js";

// School timetables: the day's periods per section, and the class × day ×
// period grid per term, with clash checks.
export async function registerTimetableModule(fastify: FastifyInstance) {
  await fastify.register(timetableRoutes, { prefix: "/api/v1/timetable" });
}

export type { SlotRecord } from "./domain/timetable.repository.js";
