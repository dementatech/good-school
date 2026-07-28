import type { FastifyInstance } from "fastify";
import { login } from "../domain/login.js";
import { loginBodySchema, loginResponseSchema } from "./schemas.js";

const COOKIE_NAME = "school_os_token";

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: { identifier: string; password: string } }>(
    "/login",
    { schema: { body: loginBodySchema, response: loginResponseSchema } },
    async (request, reply) => {
      const { identifier, password } = request.body;

      const result = await login({ identifier, password });

      if (!result.ok) {
        return reply.status(401).send({ error: result.reason });
      }

      reply.setCookie(COOKIE_NAME, result.token, {
        httpOnly: true,
        // Independent of NODE_ENV: containerized deploys behind a plain-http
        // reverse proxy still need this off, so it's an explicit opt-in.
        secure: process.env.COOKIE_SECURE === "true",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });

      return reply.status(200).send({ role: result.role, school_id: result.schoolId });
    },
  );
}
