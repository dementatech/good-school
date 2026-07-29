import "dotenv/config";
import { hashPassword } from "../src/modules/auth/index.js";
import { pool } from "../src/shared/db/index.js";

// One-off bootstrap for the platform owner's account — there's no
// self-registration or UI for this, since a super_admin isn't scoped to any
// school and has to exist before anyone can log in to create one.
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

async function main() {
  const { email, password } = parseArgs();

  if (!email || !password) {
    console.error(
      "Usage: npm run create-super-admin -- --email you@example.com --password 'a strong password'",
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const result = await pool.query<{ id: string }>(
    `insert into users (school_id, email, password_hash, role)
     values (null, $1, $2, 'super_admin')
     returning id`,
    [email.trim().toLowerCase(), passwordHash],
  );

  console.log(`Super admin created: ${email} (id: ${result.rows[0].id})`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
