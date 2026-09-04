import "dotenv/config";
import { randomInt } from "node:crypto";
import { hashPassword } from "../src/modules/auth/index.js";
import { pool } from "../src/shared/db/index.js";

// Break-glass password reset by email — for when the self-service "forgot
// password" flow (POST /api/v1/auth/forgot-password, which emails a link via
// Resend) can't be used: no RESEND_API_KEY configured, the account has no
// email on file, or you're locked out before email delivery is trusted.
function parseArgs(): { email?: string; password?: string } {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      out[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return out;
}

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#%^&*-_=+";
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

function generateStrongPassword(length = 20): string {
  const required = [UPPER, LOWER, DIGITS, SYMBOLS].map((set) => set[randomInt(set.length)]);
  const rest = Array.from({ length: length - required.length }, () => ALL[randomInt(ALL.length)]);
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

async function main() {
  const { email, password } = parseArgs();

  if (!email) {
    console.error(
      "Usage: npm run reset-password -- --email you@example.com [--password 'new password']\n" +
        "(omit --password to auto-generate a strong one)",
    );
    process.exit(1);
  }

  const newPassword = password ?? generateStrongPassword();
  const passwordHash = await hashPassword(newPassword);

  const result = await pool.query<{ id: string; role: string }>(
    `update users set password_hash = $1, updated_at = now()
     where email = $2
     returning id, role`,
    [passwordHash, email.trim().toLowerCase()],
  );

  if (result.rowCount === 0) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }

  console.log(`Password reset for ${email} (role: ${result.rows[0].role})`);
  if (!password) {
    console.log(`New password: ${newPassword}`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
