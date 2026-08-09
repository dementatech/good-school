import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { findThemeConfigBySchoolId } from "../domain/theme.repository.js";
import { createSchool, listSchools } from "../domain/schools.repository.js";
import {
  createSchoolAdmin,
  deleteSchoolAdmin,
  listSchoolAdmins,
  type SchoolAdminInput,
} from "../domain/admins.repository.js";

const schoolSummarySchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    userCount: { type: "number" },
    createdAt: { type: "string" },
  },
} as const;

const listSchoolsResponseSchema = {
  200: { type: "array", items: schoolSummarySchema },
} as const;

const createSchoolBodySchema = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
} as const;

const createSchoolResponseSchema = {
  201: schoolSummarySchema,
} as const;

const schoolAdminSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    email: { type: ["string", "null"] },
    phoneNumber: { type: ["string", "null"] },
    createdAt: { type: "string" },
  },
} as const;

const listSchoolAdminsResponseSchema = {
  200: { type: "array", items: schoolAdminSchema },
} as const;

const createSchoolAdminBodySchema = {
  type: "object",
  required: ["email"],
  properties: {
    email: { type: "string", minLength: 1 },
    phoneNumber: { type: ["string", "null"] },
  },
  additionalProperties: false,
} as const;

const createSchoolAdminResponseSchema = {
  201: {
    type: "object",
    properties: {
      admin: schoolAdminSchema,
      tempPassword: { type: "string" },
    },
  },
  404: { type: "object", properties: { error: { type: "string" } } },
} as const;

const themeResponseSchema = {
  200: {
    type: "object",
    properties: {
      primaryColor: { type: "string" },
      accentColor: { type: "string" },
      radius: { type: "string" },
      fontFamily: { type: "string" },
      logoUrl: { type: ["string", "null"] },
    },
  },
  404: {
    type: "object",
    properties: {
      error: { type: "string" },
    },
  },
} as const;

export async function schoolsRoutes(fastify: FastifyInstance) {
  // Super-admin-only: cross-tenant school management, not scoped to any single school_id.
  fastify.get(
    "/",
    { preHandler: requireAuth(["super_admin"]), schema: { response: listSchoolsResponseSchema } },
    async () => {
      return listSchools();
    },
  );

  fastify.post<{ Body: { name: string } }>(
    "/",
    {
      preHandler: requireAuth(["super_admin"]),
      schema: { body: createSchoolBodySchema, response: createSchoolResponseSchema },
    },
    async (request, reply) => {
      const school = await createSchool(request.body.name);
      return reply.status(201).send(school);
    },
  );

  // Onboarding a school: super_admin creates the school (above), then the
  // school's first (and any later) admin account here. Without this, a
  // freshly created school has no one who can log in to it.
  fastify.get<{ Params: { id: string } }>(
    "/:id/admins",
    { preHandler: requireAuth(["super_admin"]), schema: { response: listSchoolAdminsResponseSchema } },
    async (request) => listSchoolAdmins(request.params.id),
  );

  fastify.post<{ Params: { id: string }; Body: SchoolAdminInput }>(
    "/:id/admins",
    {
      preHandler: requireAuth(["super_admin"]),
      schema: { body: createSchoolAdminBodySchema, response: createSchoolAdminResponseSchema },
    },
    async (request, reply) => {
      const created = await createSchoolAdmin(request.params.id, request.body);
      if (!created) return reply.status(404).send({ error: "school_not_found" });
      return reply.status(201).send(created);
    },
  );

  fastify.delete<{ Params: { id: string; userId: string } }>(
    "/:id/admins/:userId",
    { preHandler: requireAuth(["super_admin"]) },
    async (request, reply) => {
      const deleted = await deleteSchoolAdmin(request.params.id, request.params.userId);
      if (!deleted) return reply.status(404).send({ error: "not_found" });
      return reply.status(204).send();
    },
  );

  fastify.get(
    "/me/theme",
    { preHandler: requireAuth(), schema: { response: themeResponseSchema } },
    async (request, reply) => {
      // school_id comes from the verified JWT, never from client input.
      const theme = await findThemeConfigBySchoolId(request.authUser!.school_id);

      if (!theme) {
        return reply.status(404).send({ error: "school_not_found" });
      }

      return reply.status(200).send(theme);
    },
  );
}
