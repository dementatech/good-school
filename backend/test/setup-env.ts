import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inject } from "vitest";

// Runs in each test worker before any test file is imported, so modules that
// read config at import time (the db pool, JWT secret) see the test values.
process.env.DATABASE_URL = inject("databaseUrl");
process.env.JWT_SECRET = "test-jwt-secret";
process.env.COOKIE_SECRET = "test-cookie-secret-at-least-32-chars!";
process.env.NODE_ENV = "test";
process.env.UPLOADS_DIR = mkdtempSync(path.join(tmpdir(), "gs-test-uploads-"));
for (const key of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "RESEND_API_KEY", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]) {
  delete process.env[key];
}
