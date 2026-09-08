import type { FastifyInstance } from "fastify";
import { adminRoutes } from "./api/routes.js";

// Super-admin cross-tenant account management — the unified Accounts page
// (docs/design/accounts-module.md). Credential management only: list, reset
// password, activate/deactivate, edit contact, and issue a parent login for
// a guardian. Account *creation* stays with the rosters / onboarding.
export async function registerAdminModule(fastify: FastifyInstance) {
  await fastify.register(adminRoutes, { prefix: "/api/v1/admin" });
}
