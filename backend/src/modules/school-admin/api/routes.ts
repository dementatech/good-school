import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { ok, fail } from "../../../shared/envelope.js";
import { SECTION_COOKIE, visibleLevelsFor } from "../../../shared/levels.js";
import { getSchoolAnalytics, getPerformanceTrend } from "../domain/dashboard.repository.js";

const ADMIN = requireAuth(["school_admin", "admin"]);

const performanceQuerySchema = {
  type: "object",
  required: ["trend"],
  properties: { trend: { type: "string", enum: ["1"] } },
} as const;

function schoolOf(request: FastifyRequest, reply: FastifyReply): string | null {
  const schoolId = request.authUser?.school_id ?? null;
  if (!schoolId) {
    reply.status(400).send(fail("no_school_context"));
    return null;
  }
  return schoolId;
}

export async function schoolAdminRoutes(fastify: FastifyInstance) {
  // Counts, class populations and recent activity for the dashboard, computed
  // in SQL. Listing every student just to count them costs one query per
  // student and about 1 MB per 1,000 learners.
  fastify.get("/analytics", { preHandler: ADMIN }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    const levels = await visibleLevelsFor(request.authUser!, request.cookies[SECTION_COOKIE]);
    return ok(await getSchoolAnalytics(schoolId, levels));
  });

  // Average mark of each published exam, oldest first.
  fastify.get(
    "/performance",
    { preHandler: ADMIN, schema: { querystring: performanceQuerySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const levels = await visibleLevelsFor(request.authUser!, request.cookies[SECTION_COOKIE]);
      return ok(await getPerformanceTrend(schoolId, levels));
    },
  );
}
