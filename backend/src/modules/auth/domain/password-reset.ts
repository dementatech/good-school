import { createHash, randomBytes } from "node:crypto";
import { pool } from "../../../shared/db/index.js";
import { sendEmail } from "../../../shared/email/index.js";
import { hashPassword } from "./password.js";

// A reset link is good for one hour. Long enough to walk from "I asked for
// this" to "I'm at my computer", short enough that a leaked inbox later isn't
// a standing account takeover.
const TOKEN_TTL_MS = 60 * 60 * 1000;

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Drop any outstanding tokens for a user — called before minting a new one
// and after a successful reset, so a link is only ever live one at a time.
export async function invalidateUserResetTokens(userId: string): Promise<void> {
  await pool.query(
    `update password_reset_tokens set used_at = now()
     where user_id = $1 and used_at is null`,
    [userId],
  );
}

// Mints a single-use token, stores only its hash, returns the raw value for
// the email link.
export async function createResetToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await pool.query(
    `insert into password_reset_tokens (user_id, token_hash, expires_at)
     values ($1, $2, $3)`,
    [userId, hashToken(raw), new Date(Date.now() + TOKEN_TTL_MS)],
  );
  return raw;
}

export type ConsumeResult = { ok: true } | { ok: false; reason: "invalid_or_expired" };

// Verifies the token and, atomically, sets the new password + burns every
// outstanding token for that user. `select ... for update` keeps two
// simultaneous submissions of the same link from both succeeding.
export async function consumeResetToken(
  rawToken: string,
  newPassword: string,
): Promise<ConsumeResult> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const { rows } = await client.query<{ user_id: string }>(
      `select user_id from password_reset_tokens
       where token_hash = $1 and used_at is null and expires_at > now()
       for update`,
      [hashToken(rawToken)],
    );
    const row = rows[0];
    if (!row) {
      await client.query("rollback");
      return { ok: false, reason: "invalid_or_expired" };
    }

    const passwordHash = await hashPassword(newPassword);
    await client.query(`update users set password_hash = $1, updated_at = now() where id = $2`, [
      passwordHash,
      row.user_id,
    ]);
    await client.query(
      `update password_reset_tokens set used_at = now()
       where user_id = $1 and used_at is null`,
      [row.user_id],
    );

    await client.query("commit");
    return { ok: true };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function sendPasswordResetEmail(to: string, rawToken: string): Promise<void> {
  const link = `${APP_URL}/auth/reset-password?token=${encodeURIComponent(rawToken)}`;
  await sendEmail({
    to,
    subject: "Reset your Good School password",
    text:
      `Someone asked to reset the password for your Good School account.\n\n` +
      `Open this link within the next hour to choose a new password:\n${link}\n\n` +
      `If you didn't ask for this, ignore this email — your password stays as it is.`,
    html:
      `<p>Someone asked to reset the password for your Good School account.</p>` +
      `<p><a href="${link}">Choose a new password</a> — this link works for one hour.</p>` +
      `<p>If you didn't ask for this, ignore this email — your password stays as it is.</p>`,
  });
}
