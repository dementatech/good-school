import type { FastifyInstance } from "fastify";

// Re-exports come before `./api/routes.js`: that file's imports lead back here
// (auth → teachers → … → organization → auth), and other modules call
// `requireAuth` while they load. Node's native ESM copes either way; the test
// runner's loader needs them defined first.
export { requireAuth } from "./api/verify.js";
export { hashPassword } from "./domain/password.js";
export { generateTempPassword } from "./domain/temp-password.js";
export type { JwtPayload, Role } from "../../shared/types/index.js";

import { authRoutes } from "./api/routes.js";

export async function registerAuthModule(fastify: FastifyInstance) {
  await fastify.register(authRoutes, { prefix: "/api/v1/auth" });
}
