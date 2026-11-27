import { expect, test } from "vitest";
import { pool } from "../src/shared/db/index.js";

test("migrations applied", async () => {
  const { rows } = await pool.query(`select count(*)::int as n from pgmigrations`);
  expect(rows[0].n).toBeGreaterThan(80);
});
