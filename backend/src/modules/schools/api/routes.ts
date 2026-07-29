import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { findThemeConfigBySchoolId } from "../domain/theme.repository.js";
import { createSchool, listSchools } from "../domain/schools.repository.js";

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
