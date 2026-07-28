import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { findThemeConfigBySchoolId } from "../domain/theme.repository.js";

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
