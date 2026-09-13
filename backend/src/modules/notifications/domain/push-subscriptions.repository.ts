import { pool } from "../../../shared/db/index.js";

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// `endpoint` is the conflict target, not (user_id, endpoint): the same
// endpoint re-subscribing under a different signed-in user on a shared
// device (a school computer) should move the registration, not duplicate it.
export async function saveSubscription(userId: string, sub: PushSubscriptionKeys): Promise<void> {
  await pool.query(
    `insert into push_subscription (user_id, endpoint, p256dh, auth)
     values ($1, $2, $3, $4)
     on conflict (endpoint) do update
       set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    [userId, sub.endpoint, sub.p256dh, sub.auth],
  );
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await pool.query(`delete from push_subscription where endpoint = $1`, [endpoint]);
}

export async function listSubscriptionsForUser(userId: string): Promise<PushSubscriptionKeys[]> {
  const result = await pool.query<PushSubscriptionKeys>(
    `select endpoint, p256dh, auth from push_subscription where user_id = $1`,
    [userId],
  );
  return result.rows;
}
