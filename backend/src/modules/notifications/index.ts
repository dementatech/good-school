import type { FastifyInstance } from "fastify";
import { notificationsRoutes } from "./api/routes.js";
import { createNotification, type CreateNotificationInput } from "./domain/notifications.repository.js";
import { sendPushToUser } from "./domain/push-sender.js";

export async function registerNotificationsModule(fastify: FastifyInstance) {
  await fastify.register(notificationsRoutes, { prefix: "/api/v1/notifications" });
}

/**
 * The one entry point every other module should call to tell a user
 * something happened — this is the seam the whole system grows through as
 * more event types get wired up (exam results published is the first).
 *
 * Writes the in-app notification row (the source of truth — always visible
 * in the bell/notifications page regardless of push) and best-effort nudges
 * any of the user's subscribed devices via Web Push. Never throws: a
 * notification failing must never break the action that triggered it, so
 * callers can fire this without awaiting or wrapping in their own try/catch.
 */
export async function notifyUser(input: CreateNotificationInput): Promise<void> {
  try {
    const notification = await createNotification(input);
    await sendPushToUser(input.userId, {
      title: notification.title,
      body: notification.body,
      link: notification.link,
    });
  } catch {
    // Best-effort by design — see docstring above.
  }
}

/** Same notification fanned out to several users (e.g. every student on a
 *  published exam) — independent per recipient, one bad row never blocks
 *  the rest. */
export async function notifyUsers(
  userIds: string[],
  input: Omit<CreateNotificationInput, "userId">,
): Promise<void> {
  await Promise.all(userIds.map((userId) => notifyUser({ ...input, userId })));
}
