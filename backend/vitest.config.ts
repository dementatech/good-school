import { defineConfig } from "vitest/config";

// Integration tests: a throwaway Postgres is started once per run
// (test/global-setup.ts), every migration is applied, and each test file
// drives the real Fastify app in memory. See test/README.md.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/setup-env.ts"],
    // One shared database — files run one at a time so their data can't race.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
