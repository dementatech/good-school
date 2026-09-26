import "dotenv/config";
import { pool } from "../src/shared/db/index.js";

// Grants (or with --revoke, removes) support-agent access on an existing
// super_admin: they work the support inbox alongside the platform owner —
// reply, mark in progress, resolve — but can't grant this to anyone else.
// A script, like set-platform-owner, so only someone with server access can
// hand it out.
async function main() {
  const args = process.argv.slice(2);
  const emailIndex = args.indexOf("--email");
  const email = emailIndex >= 0 ? args[emailIndex + 1] : undefined;
  const revoke = args.includes("--revoke");

  if (!email) {
    console.error("Usage: npm run set-support-agent -- --email agent@example.com [--revoke]");
    process.exit(1);
  }

  const result = await pool.query<{ id: string }>(
    `update users set is_support_agent = $2, updated_at = now()
      where role = 'super_admin' and email = $1
      returning id`,
    [email.trim().toLowerCase(), !revoke],
  );

  if (result.rowCount === 0) {
    console.error(
      `No super_admin with email ${email}. Support agents are super admins — create one first:\n` +
        `  npm run create-super-admin -- --email ${email} --password '…'`,
    );
    process.exitCode = 1;
  } else {
    console.log(`${email} is ${revoke ? "no longer" : "now"} a support agent.`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
