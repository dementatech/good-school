import type { FastifyInstance } from "fastify";
import { login } from "../domain/login.js";
import { findUserById } from "../domain/users.repository.js";
import { requireAuth } from "./verify.js";
import { loginBodySchema, loginResponseSchema, meResponseSchema } from "./schemas.js";

const COOKIE_NAME = "school_os_token";

export async function authRoutes(fastify: FastifyInstance) {
  // Any authenticated role — this is how the UI (e.g. the topbar user menu)
  // finds out who's actually logged in beyond the bare user_id/role/school_id
  // already in the JWT.
  fastify.get(
    "/me",
    { preHandler: requireAuth(), schema: { response: meResponseSchema } },
    async (request, reply) => {
      const user = await findUserById(request.authUser!.user_id);
      if (!user) return reply.status(404).send({ error: "not_found" });

      return {
        id: user.id,
        // `users` holds identity/auth only — no name columns (see the auth
        // brief). Name comes from the role-profile tables in a later phase.
        name: null,
        email: user.email,
        phoneNumber: user.phone_number,
        systemId: user.system_id,
        role: user.role,
        schoolId: user.school_id,
        mustChangePassword: false,
      };
    },
  );

  // Clears the auth cookie. The JWT itself is stateless, so "logout" is just
  // dropping the cookie client-side; the frontend calls this on sign-out.
  fastify.post("/logout", async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: "/" });
    return reply.status(204).send();
  });

  fastify.post<{ Body: { identifier: string; password: string } }>(
    "/login",
    { schema: { body: loginBodySchema, response: loginResponseSchema } },
    async (request, reply) => {
      const { identifier, password } = request.body;

      const result = await login({ identifier, password });

      if (!result.ok) {
        // TEMP DEBUG — never log actual credentials, just shape/length, to
        // catch stray whitespace/encoding without exposing the password.
        fastify.log.warn(
          {
            reason: result.reason,
            identifierLength: identifier.length,
            identifierJson: JSON.stringify(identifier),
            passwordLength: password.length,
          },
          "login failed",
        );
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
