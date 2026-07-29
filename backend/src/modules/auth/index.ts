import type { FastifyInstance } from "fastify";
import { authRoutes } from "./api/routes.js";

export { requireAuth } from "./api/verify.js";
export { hashPassword } from "./domain/password.js";
export type { JwtPayload, Role } from "../../shared/types/index.js";

export async function registerAuthModule(fastify: FastifyInstance) {
  await fastify.register(authRoutes, { prefix: "/api/v1/auth" });
}
