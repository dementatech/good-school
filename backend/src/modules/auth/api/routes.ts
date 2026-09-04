import type { FastifyInstance } from "fastify";
import { login } from "../domain/login.js";
import { resolveIdentifierKind } from "../domain/identifier.js";
import { findUserById, findUsersByIdentifierForReset } from "../domain/users.repository.js";
import {
  consumeResetToken,
  createResetToken,
  invalidateUserResetTokens,
  sendPasswordResetEmail,
} from "../domain/password-reset.js";
import { requireAuth } from "./verify.js";
import {
  forgotPasswordBodySchema,
  loginBodySchema,
  loginResponseSchema,
  meResponseSchema,
  messageResponseSchema,
  resetPasswordBodySchema,
} from "./schemas.js";

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

  // Start a reset. Always answers 200 with the same message — it must not
  // reveal whether the identifier matched an account. Delivery is by email
  // only; a System ID / phone is accepted as the *lookup*, the link still
  // goes to the address on file.
  fastify.post<{ Body: { identifier: string } }>(
    "/forgot-password",
    { schema: { body: forgotPasswordBodySchema, response: messageResponseSchema } },
    async (request, reply) => {
      const { identifier } = request.body;
      const message =
        "If an account matches that ID or email, a reset link has been sent to the email on file.";

      const kind = resolveIdentifierKind(identifier);
      if (kind) {
        const users = await findUsersByIdentifierForReset(kind, identifier);
        for (const user of users) {
          if (!user.email) {
            fastify.log.warn(
              { userId: user.id },
              "password reset requested for an account with no email on file",
            );
            continue;
          }
          try {
            await invalidateUserResetTokens(user.id);
            const token = await createResetToken(user.id);
            await sendPasswordResetEmail(user.email, token);
          } catch (err) {
            fastify.log.error({ err, userId: user.id }, "failed to send password reset email");
          }
        }
      }

      return reply.status(200).send({ message });
    },
  );

  // Finish a reset. The token is single-use and expires in an hour; on
  // success every outstanding token for that user is burned.
  fastify.post<{ Body: { token: string; newPassword: string } }>(
    "/reset-password",
    { schema: { body: resetPasswordBodySchema, response: messageResponseSchema } },
    async (request, reply) => {
      const { token, newPassword } = request.body;

      const result = await consumeResetToken(token, newPassword);
      if (!result.ok) {
        return reply.status(400).send({ error: "invalid_or_expired" });
      }

      return reply
        .status(200)
        .send({ message: "Your password has been reset. You can now sign in." });
    },
  );
}
