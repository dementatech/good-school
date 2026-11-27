import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import EmbeddedPostgres from "embedded-postgres";
import { runner } from "node-pg-migrate";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

// Starts a private Postgres for this test run (no Docker or installed
// Postgres needed), applies every migration exactly as production does, and
// hands the URL to the test workers. Torn down — data and all — afterwards.
export default async function setup(project: TestProject) {
  const dataDir = await mkdtemp(path.join(tmpdir(), "gs-test-pg-"));
  const port = await freePort();
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: "postgres",
    password: "postgres",
    persistent: false,
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("gs_test");

  const databaseUrl = `postgres://postgres:postgres@127.0.0.1:${port}/gs_test`;
  await runner({
    databaseUrl,
    dir: path.resolve(import.meta.dirname, "../migrations"),
    direction: "up",
    migrationsTable: "pgmigrations",
    singleTransaction: false,
    log: () => {},
  });
  project.provide("databaseUrl", databaseUrl);

  return async () => {
    await pg.stop();
    await rm(dataDir, { recursive: true, force: true });
  };
}
