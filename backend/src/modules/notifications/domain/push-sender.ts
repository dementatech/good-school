import webPush from "web-push";
import { listSubscriptionsForUser, removeSubscription } from "./push-subscriptions.repository.js";

// Unset in an environment with no VAPID keys generated yet (e.g. a fresh
// local checkout) — push is then silently skipped everywhere, and the
// in-app feed (the source of truth) still works. Generate a pair with
// `npx web-push generate-vapid-keys` and set VAPID_PUBLIC_KEY /
// VAPID_PRIVATE_KEY / VAPID_SUBJECT once.
const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT ?? "mailto:support@goodschool.app";

if (publicKey && privateKey) {
  webPush.setVapidDetails(subject, publicKey, privateKey);
}

export function isPushConfigured(): boolean {
  return Boolean(publicKey && privateKey);
}

/** The one piece of the key pair a browser is allowed to see. */
export function getPublicKey(): string | null {
  return publicKey ?? null;
}

export interface PushPayload {
  title: string;
  body: string;
  link: string | null;
}

/**
 * Best-effort nudge to every device a user has granted push permission on.
 * Never throws — the in-app notification row (already written by the time
 * this runs) is the source of truth, so a dead push subscription or an
 * unreachable push service must never surface as a failure to the caller.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
  const subscriptions = await listSubscriptionsForUser(userId);
  if (subscriptions.length === 0) return;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
      } catch (err) {
        // 404/410 = the push service has permanently dropped this
        // registration (uninstalled, permission revoked, browser data
        // cleared) — stop retrying it forever. Anything else (network
        // blip, 5xx) is left alone for the next notification to retry.
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await removeSubscription(sub.endpoint);
        }
      }
    }),
  );
}
