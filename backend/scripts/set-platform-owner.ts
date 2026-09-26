import "dotenv/config";
import { pool } from "../src/shared/db/index.js";

// Grants (or with --revoke, removes) platform-owner rights on an existing
// super_admin account: the support inbox where reported problems and feature
// requests land. Deliberately a script, not a UI — whoever holds this flag
// owns the platform, so granting it needs server access.
async function main() {
  const args = process.argv.slice(2);
  const emailIndex = args.indexOf("--email");
  const email = emailIndex >= 0 ? args[emailIndex + 1] : undefined;
  const revoke = args.includes("--revoke");

  if (!email) {
    console.error("Usage: npm run set-platform-owner -- --email you@example.com [--revoke]");
    process.exit(1);
  }

  const result = await pool.query<{ id: string }>(
    `update users set is_platform_owner = $2, updated_at = now()
      where role = 'super_admin' and email = $1
      returning id`,
    [email.trim().toLowerCase(), !revoke],
  );

  if (result.rowCount === 0) {
    console.error(
      `No super_admin with email ${email}. Create one first:\n` +
        `  npm run create-super-admin -- --email ${email} --password '…' --owner`,
    );
    process.exitCode = 1;
  } else {
    console.log(`${email} is ${revoke ? "no longer" : "now"} the platform owner.`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
