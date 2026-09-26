import "dotenv/config";
import { hashPassword } from "../src/modules/auth/index.js";
import { pool } from "../src/shared/db/index.js";
import { nextSystemId } from "../src/shared/system-id.js";

// One-off bootstrap for the platform owner's account — there's no
// self-registration or UI for this, since a super_admin isn't scoped to any
// school and has to exist before anyone can log in to create one.
//
// --owner also marks the account as the platform owner (the support inbox —
// see migrations/1700000072000_support-desk.cjs). An existing super_admin is
// promoted with `npm run set-platform-owner` instead.
function parseArgs(): { email?: string; password?: string; owner?: boolean } {
  const args = process.argv.slice(2);
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--owner") {
      out.owner = true;
    } else if (args[i].startsWith("--")) {
      out[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return out;
}

async function main() {
  const { email, password, owner } = parseArgs();

  if (!email || !password) {
    console.error(
      "Usage: npm run create-super-admin -- --email you@example.com --password 'a strong password' [--owner]",
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const systemId = await nextSystemId(pool, "X");
  const result = await pool.query<{ id: string }>(
    `insert into users (school_id, system_id, email, password_hash, role, is_platform_owner)
     values (null, $1, $2, $3, 'super_admin', $4)
     returning id`,
    [systemId, email.trim().toLowerCase(), passwordHash, owner === true],
  );

  console.log(`${owner ? "Platform owner" : "Super admin"} created: ${email} (id: ${result.rows[0].id})`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
