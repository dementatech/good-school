import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { ok, fail } from "../../../shared/envelope.js";
import { listForUser, markRead } from "../domain/notifications.repository.js";
import { getPublicKey } from "../domain/push-sender.js";
import { saveSubscription, removeSubscription } from "../domain/push-subscriptions.repository.js";

const AUTHENTICATED = requireAuth();

export async function notificationsRoutes(fastify: FastifyInstance) {
  // Shape kept exactly as frontend/components/ui/NotificationBell.tsx already
  // expects it (`{ success, data, unread }`, not the usual `ok()` envelope,
  // since `unread` needs a home alongside `data`) — that component and the
  // parent /notifications page were built first, against this contract.
  fastify.get("/", { preHandler: AUTHENTICATED }, async (request) => {
    const { items, unread } = await listForUser(request.authUser!.user_id);
    return { success: true, data: items, unread };
  });

  fastify.post<{ Body: { all?: boolean; ids?: number[] } }>(
    "/",
    { preHandler: AUTHENTICATED },
    async (request, reply) => {
      const userId = request.authUser!.user_id;
      if (request.body.all) {
        await markRead(userId, "all");
      } else if (Array.isArray(request.body.ids)) {
        await markRead(userId, request.body.ids);
      } else {
        return reply.status(400).send(fail("all or ids required"));
      }
      return ok(null);
    },
  );

  // The one piece of the VAPID key pair a browser is allowed to see, needed
  // for pushManager.subscribe({ applicationServerKey }). 404 when push isn't
  // configured at all (no keys generated yet) — the frontend treats that as
  // "skip push, in-app notifications still work."
  fastify.get("/push/public-key", { preHandler: AUTHENTICATED }, async (_request, reply) => {
    const publicKey = getPublicKey();
    if (!publicKey) return reply.status(404).send(fail("push_not_configured"));
    return ok({ publicKey });
  });

  fastify.post<{ Body: { endpoint: string; keys: { p256dh: string; auth: string } } }>(
    "/push/subscribe",
    { preHandler: AUTHENTICATED },
    async (request, reply) => {
      const { endpoint, keys } = request.body ?? {};
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return reply.status(400).send(fail("invalid_subscription"));
      }
      await saveSubscription(request.authUser!.user_id, { endpoint, p256dh: keys.p256dh, auth: keys.auth });
      return ok(null);
    },
  );

  // No auth check against the caller's own subscriptions before deleting:
  // the endpoint URL itself is the unguessable secret (minted by the push
  // service), so knowing it is equivalent to owning the registration — the
  // same trust model browsers themselves use for PushManager.unsubscribe().
  fastify.post<{ Body: { endpoint: string } }>(
    "/push/unsubscribe",
    { preHandler: AUTHENTICATED },
    async (request, reply) => {
      if (!request.body?.endpoint) return reply.status(400).send(fail("endpoint required"));
      await removeSubscription(request.body.endpoint);
      return ok(null);
    },
  );
}
