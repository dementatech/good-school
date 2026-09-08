import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { ok, fail } from "../../../shared/envelope.js";
import {
  accountSummary,
  getAccount,
  listAccounts,
  resetAccountPassword,
  resetAccountPasswords,
  setAccountActive,
  updateAccountContact,
  type AccountType,
} from "../domain/accounts.repository.js";
import {
  createParentAccount,
  listGuardianAccounts,
} from "../domain/parent-accounts.repository.js";
import {
  accountTypeParamsSchema,
  resetPasswordsBodySchema,
  updateAccountBodySchema,
} from "./schemas.js";

const SUPER = requireAuth(["super_admin"]);

// Maps a domain `{ ok: false, error }` to an HTTP status. Everything here is
// a 400 except the two that aren't.
function statusFor(error: string): number {
  if (error === "not_found") return 404;
  if (error === "identifier_in_use" || error === "account_exists") return 409;
  return 400;
}

export async function adminRoutes(fastify: FastifyInstance) {
  // ── Account lists ────────────────────────────────────────────────────────

  fastify.get(
    "/accounts/summary",
    { preHandler: SUPER },
    async () => ok(await accountSummary()),
  );

  // Guardians (the Parents tab) — a separate shape from the user-backed tabs.
  fastify.get(
    "/accounts/parents",
    { preHandler: SUPER },
    async () => ok(await listGuardianAccounts()),
  );

  fastify.get<{ Params: { type: AccountType } }>(
    "/accounts/:type",
    { preHandler: SUPER, schema: { params: accountTypeParamsSchema } },
    async (request) => ok(await listAccounts(request.params.type)),
  );

  // ── Credential actions ───────────────────────────────────────────────────

  fastify.post<{ Params: { userId: string } }>(
    "/accounts/:userId/reset-password",
    { preHandler: SUPER },
    async (request, reply) => {
      const result = await resetAccountPassword(request.params.userId);
      if (!result.ok) return reply.status(statusFor(result.error)).send(fail(result.error));
      return ok(result.data);
    },
  );

  fastify.post<{ Body: { userIds: string[] } }>(
    "/accounts/reset-passwords",
    { preHandler: SUPER, schema: { body: resetPasswordsBodySchema } },
    async (request) => ok(await resetAccountPasswords(request.body.userIds)),
  );

  fastify.patch<{
    Params: { userId: string };
    Body: { isActive?: boolean; email?: string | null; phoneNumber?: string | null };
  }>(
    "/accounts/:userId",
    { preHandler: SUPER, schema: { body: updateAccountBodySchema } },
    async (request, reply) => {
      const { isActive, email, phoneNumber } = request.body;

      if (email !== undefined || phoneNumber !== undefined) {
        const result = await updateAccountContact(request.params.userId, { email, phoneNumber });
        if (!result.ok) return reply.status(statusFor(result.error)).send(fail(result.error));
      }
      if (isActive !== undefined) {
        const result = await setAccountActive(
          request.params.userId,
          isActive,
          request.authUser!.user_id,
        );
        if (!result.ok) return reply.status(statusFor(result.error)).send(fail(result.error));
      }

      const account = await getAccount(request.params.userId);
      return account ? ok(account) : reply.status(404).send(fail("not_found"));
    },
  );

  // ── Parent login provisioning ────────────────────────────────────────────

  fastify.post<{ Params: { guardianId: string } }>(
    "/accounts/parents/:guardianId/login",
    { preHandler: SUPER },
    async (request, reply) => {
      const result = await createParentAccount(request.params.guardianId);
      if (!result.ok) return reply.status(statusFor(result.error)).send(fail(result.error));
      return reply.status(201).send(ok(result.data));
    },
  );
}
