import type { FastifyInstance } from "fastify";
import { attendanceRoutes } from "./api/routes.js";

// The daily class register — Present / Absent / Late / Excused per pupil.
export async function registerAttendanceModule(fastify: FastifyInstance) {
  await fastify.register(attendanceRoutes, { prefix: "/api/v1/attendance" });
}
