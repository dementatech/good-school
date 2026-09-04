import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { ok, fail } from "../../../shared/envelope.js";
import { listDepartmentCatalog } from "../domain/department-catalog.repository.js";
import {
  DepartmentAlreadyExistsError,
  UnknownCatalogEntryError,
  addCustomDepartment,
  addNonAcademicDepartment,
  listDepartments,
  removeDepartment,
} from "../domain/department.repository.js";
import {
  CyclicPositionError,
  PositionAlreadyHeldError,
  PositionInUseError,
  StaffNotAssignedError,
  UnknownReferenceError,
  assignStaffPosition,
  createPosition,
  deletePosition,
  endStaffPosition,
  listPositions,
  listStaffPositions,
  seedLeadershipTemplate,
  setAcademicRoot,
  updatePosition,
  type PositionInput,
} from "../domain/position.repository.js";
import {
  addCustomDepartmentBodySchema,
  addNonAcademicDepartmentBodySchema,
  assignStaffPositionBodySchema,
  createPositionBodySchema,
  endStaffPositionBodySchema,
  updatePositionBodySchema,
} from "./schemas.js";

const ADMIN = requireAuth(["admin", "school_admin", "super_admin"]);

function schoolOf(request: FastifyRequest, reply: FastifyReply): string | null {
  const schoolId = request.authUser?.school_id ?? null;
  if (!schoolId) {
    reply.status(400).send(fail("no_school_context"));
    return null;
  }
  return schoolId;
}

export async function organizationRoutes(fastify: FastifyInstance) {
  // ── Departments ──────────────────────────────────────────────────────────

  fastify.get("/department-catalog", { preHandler: ADMIN }, async () => ok(await listDepartmentCatalog()));

  fastify.get("/departments", { preHandler: ADMIN }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    return ok(await listDepartments(schoolId));
  });

  fastify.post<{ Body: { catalogId: string; reportsToPositionId?: string | null } }>(
    "/departments/non-academic",
    { preHandler: ADMIN, schema: { body: addNonAcademicDepartmentBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const department = await addNonAcademicDepartment(
          schoolId,
          request.body.catalogId,
          request.body.reportsToPositionId ?? null,
        );
        return reply.status(201).send(ok(department));
      } catch (err) {
        if (err instanceof UnknownCatalogEntryError) return reply.status(400).send(fail(err.message));
        if (err instanceof DepartmentAlreadyExistsError) return reply.status(409).send(fail(err.message));
        throw err;
      }
    },
  );

  fastify.post<{
    Body: { name: string; departmentType: "academic" | "non_academic"; reportsToPositionId?: string | null };
  }>(
    "/departments/custom",
    { preHandler: ADMIN, schema: { body: addCustomDepartmentBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const department = await addCustomDepartment(
        schoolId,
        request.body.name,
        request.body.departmentType,
        request.body.reportsToPositionId ?? null,
      );
      return reply.status(201).send(ok(department));
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/departments/:id",
    { preHandler: ADMIN },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const removed = await removeDepartment(schoolId, request.params.id);
        return removed ? ok(null) : reply.status(404).send(fail("not_found"));
      } catch (err) {
        if (err instanceof Error) return reply.status(409).send(fail(err.message));
        throw err;
      }
    },
  );

  // ── Position tree (the org chart) ──────────────────────────────────────

  fastify.get("/positions", { preHandler: ADMIN }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    return ok(await listPositions(schoolId));
  });

  fastify.post<{ Body: PositionInput }>(
    "/positions",
    { preHandler: ADMIN, schema: { body: createPositionBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        return reply.status(201).send(ok(await createPosition(schoolId, request.body)));
      } catch (err) {
        if (err instanceof UnknownReferenceError) return reply.status(400).send(fail(err.message));
        throw err;
      }
    },
  );

  fastify.patch<{ Params: { id: string }; Body: Partial<PositionInput> }>(
    "/positions/:id",
    { preHandler: ADMIN, schema: { body: updatePositionBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        const updated = await updatePosition(schoolId, request.params.id, request.body);
        return updated ? ok(updated) : reply.status(404).send(fail("not_found"));
      } catch (err) {
        if (err instanceof UnknownReferenceError || err instanceof CyclicPositionError) {
          return reply.status(400).send(fail(err.message));
        }
        throw err;
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>("/positions/:id", { preHandler: ADMIN }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    try {
      const deleted = await deletePosition(schoolId, request.params.id);
      return deleted ? ok(null) : reply.status(404).send(fail("not_found"));
    } catch (err) {
      if (err instanceof PositionInUseError) return reply.status(409).send(fail(err.message));
      throw err;
    }
  });

  // A one-time accept-or-edit starter tree (organization-studio.md §4) — the
  // admin can also just build positions one at a time via the routes above.
  fastify.post("/positions/seed-template", { preHandler: ADMIN }, async (request, reply) => {
    const schoolId = schoolOf(request, reply);
    if (!schoolId) return;
    try {
      return reply.status(201).send(ok(await seedLeadershipTemplate(schoolId)));
    } catch (err) {
      if (err instanceof PositionInUseError) return reply.status(409).send(fail(err.message));
      throw err;
    }
  });

  fastify.post<{ Params: { id: string } }>(
    "/positions/:id/academic-root",
    { preHandler: ADMIN },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        await setAcademicRoot(schoolId, request.params.id);
        return ok(null);
      } catch (err) {
        if (err instanceof UnknownReferenceError) return reply.status(400).send(fail(err.message));
        throw err;
      }
    },
  );

  fastify.post<{
    Params: { id: string };
    Body: { staffId: string; academicYearId: string; startDate: string };
  }>(
    "/positions/:id/holders",
    { preHandler: ADMIN, schema: { body: assignStaffPositionBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      try {
        await assignStaffPosition(schoolId, { positionId: request.params.id, ...request.body });
        return reply.status(201).send(ok(null));
      } catch (err) {
        if (err instanceof UnknownReferenceError || err instanceof StaffNotAssignedError) {
          return reply.status(400).send(fail(err.message));
        }
        if (err instanceof PositionAlreadyHeldError) return reply.status(409).send(fail(err.message));
        throw err;
      }
    },
  );

  fastify.post<{ Params: { id: string }; Body: { endDate: string } }>(
    "/staff-positions/:id/end",
    { preHandler: ADMIN, schema: { body: endStaffPositionBodySchema } },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      const ended = await endStaffPosition(schoolId, request.params.id, request.body.endDate);
      return ended ? ok(null) : reply.status(404).send(fail("not_found"));
    },
  );

  fastify.get<{ Params: { staffId: string } }>(
    "/staff/:staffId/positions",
    { preHandler: ADMIN },
    async (request, reply) => {
      const schoolId = schoolOf(request, reply);
      if (!schoolId) return;
      return ok(await listStaffPositions(schoolId, request.params.staffId));
    },
  );
}
