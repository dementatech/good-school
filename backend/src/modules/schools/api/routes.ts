import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { ok, fail } from "../../../shared/envelope.js";
import { findThemeConfigBySchoolId } from "../domain/theme.repository.js";
import {
  createSchool,
  deleteSchool,
  getSchool,
  listSchools,
  setOnboardingStatus,
  UniqueViolationError,
  updateSchool,
  type OnboardingStatus,
  type SchoolInput,
} from "../domain/schools.repository.js";
import {
  attach as attachCurriculum,
  detach as detachCurriculum,
  listForSchool,
  setPrimary as setPrimaryCurriculum,
} from "../domain/school-curricula.repository.js";
import {
  createSchoolAdmin,
  deleteSchoolAdmin,
  listSchoolAdmins,
  type SchoolAdminInput,
} from "../domain/admins.repository.js";
import {
  attachCurriculumBodySchema,
  createSchoolAdminBodySchema,
  createSchoolBodySchema,
  statusBodySchema,
  themeResponseSchema,
  updateSchoolBodySchema,
} from "./schemas.js";

const SUPER = requireAuth(["super_admin"]);

export async function schoolsRoutes(fastify: FastifyInstance) {
  // ═══ School tenants — super_admin only ═══════════════════════════════════

  fastify.get("/", { preHandler: SUPER }, async () => ok(await listSchools()));

  fastify.get<{ Params: { id: string } }>("/:id", { preHandler: SUPER }, async (request, reply) => {
    const school = await getSchool(request.params.id);
    return school ? ok(school) : reply.status(404).send(fail("not_found"));
  });

  fastify.post<{ Body: SchoolInput }>(
    "/",
    { preHandler: SUPER, schema: { body: createSchoolBodySchema } },
    async (request, reply) => {
      try {
        return reply.status(201).send(ok(await createSchool(request.body)));
      } catch (err) {
        if (err instanceof UniqueViolationError) return reply.status(409).send(fail(err.message));
        throw err;
      }
    },
  );

  fastify.patch<{ Params: { id: string }; Body: Partial<SchoolInput> }>(
    "/:id",
    { preHandler: SUPER, schema: { body: updateSchoolBodySchema } },
    async (request, reply) => {
      try {
        const updated = await updateSchool(request.params.id, request.body);
        return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
      } catch (err) {
        if (err instanceof UniqueViolationError) return reply.status(409).send(fail(err.message));
        throw err;
      }
    },
  );

  fastify.post<{ Params: { id: string }; Body: { status: OnboardingStatus } }>(
    "/:id/status",
    { preHandler: SUPER, schema: { body: statusBodySchema } },
    async (request, reply) => {
      const updated = await setOnboardingStatus(request.params.id, request.body.status);
      return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
    },
  );

  fastify.delete<{ Params: { id: string } }>("/:id", { preHandler: SUPER }, async (request, reply) => {
    const result = await deleteSchool(request.params.id);
    if (result === "deleted") return reply.status(204).send();
    if (result === "has_users") {
      return reply.status(409).send(fail("This school still has user accounts — remove them first."));
    }
    return reply.status(404).send(fail("not_found"));
  });

  // ── Per-school curricula ─────────────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>(
    "/:id/curricula",
    { preHandler: SUPER },
    async (request) => ok(await listForSchool(request.params.id)),
  );

  fastify.post<{ Params: { id: string }; Body: { curriculumId: string; isPrimary?: boolean } }>(
    "/:id/curricula",
    { preHandler: SUPER, schema: { body: attachCurriculumBodySchema } },
    async (request, reply) => {
      const r = await attachCurriculum(
        request.params.id,
        request.body.curriculumId,
        request.body.isPrimary ?? false,
      );
      if (r !== "ok") return reply.status(404).send(fail(r));
      return reply.status(201).send(ok(await listForSchool(request.params.id)));
    },
  );

  fastify.post<{ Params: { id: string; curriculumId: string } }>(
    "/:id/curricula/:curriculumId/primary",
    { preHandler: SUPER },
    async (request, reply) => {
      const done = await setPrimaryCurriculum(request.params.id, request.params.curriculumId);
      return done
        ? ok(await listForSchool(request.params.id))
        : reply.status(404).send(fail("not_found"));
    },
  );

  fastify.delete<{ Params: { id: string; curriculumId: string } }>(
    "/:id/curricula/:curriculumId",
    { preHandler: SUPER },
    async (request, reply) => {
      const done = await detachCurriculum(request.params.id, request.params.curriculumId);
      return done ? ok(null) : reply.status(404).send(fail("not_found"));
    },
  );

  // ── School-admin login accounts (step 7 of the onboarding sequence) ───────

  fastify.get<{ Params: { id: string } }>(
    "/:id/admins",
    { preHandler: SUPER },
    async (request) => ok(await listSchoolAdmins(request.params.id)),
  );

  fastify.post<{ Params: { id: string }; Body: SchoolAdminInput }>(
    "/:id/admins",
    { preHandler: SUPER, schema: { body: createSchoolAdminBodySchema } },
    async (request, reply) => {
      const created = await createSchoolAdmin(request.params.id, request.body);
      if (!created) return reply.status(404).send(fail("school_not_found"));
      return reply.status(201).send(ok(created));
    },
  );

  fastify.delete<{ Params: { id: string; userId: string } }>(
    "/:id/admins/:userId",
    { preHandler: SUPER },
    async (request, reply) => {
      const deleted = await deleteSchoolAdmin(request.params.id, request.params.userId);
      return deleted ? ok(null) : reply.status(404).send(fail("not_found"));
    },
  );

  // ── The signed-in user's own school theme (any role) ─────────────────────

  fastify.get(
    "/me/theme",
    { preHandler: requireAuth(), schema: { response: themeResponseSchema } },
    async (request, reply) => {
      const theme = await findThemeConfigBySchoolId(request.authUser!.school_id);
      if (!theme) return reply.status(404).send({ error: "school_not_found" });
      return reply.status(200).send(theme);
    },
  );
}
