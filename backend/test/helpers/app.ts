import type { FastifyInstance, InjectOptions } from "fastify";
import { afterAll, beforeAll } from "vitest";
import { buildApp } from "../../src/app.js";
import { issueToken } from "../../src/modules/auth/domain/tokens.js";
import { pool } from "../../src/shared/db/index.js";
import type { Role } from "../../src/shared/types/index.js";

let app: FastifyInstance;

/** Call at the top of a test file: one in-memory app for the file's tests. */
export function useApp(): void {
  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
  });
}

export interface Session {
  userId: string;
  role: Role;
  schoolId: string | null;
  token: string;
}

/** A login as the given user — the same JWT cookie the real login sets. */
export function sessionFor(userId: string, role: Role, schoolId: string | null): Session {
  return { userId, role, schoolId, token: issueToken({ user_id: userId, role, school_id: schoolId }) };
}

export interface ApiResult<T = unknown> {
  status: number;
  body: { success?: boolean; data?: T; error?: string } & Record<string, unknown>;
}

/** Calls the API as `as`. Returns the status and the parsed JSON body. */
export async function api<T = unknown>(
  as: Session | null,
  method: InjectOptions["method"],
  url: string,
  payload?: unknown,
): Promise<ApiResult<T>> {
  const res = await app.inject({
    method,
    url,
    payload: payload as InjectOptions["payload"],
    cookies: as ? { school_os_token: as.token } : undefined,
  });
  let body: ApiResult<T>["body"] = {};
  try {
    body = res.json();
  } catch {
    body = { raw: res.body };
  }
  return { status: res.statusCode, body };
}

/** Like `api`, but fails the test unless the call succeeded; returns `data`. */
export async function apiOk<T = unknown>(
  as: Session | null,
  method: InjectOptions["method"],
  url: string,
  payload?: unknown,
): Promise<T> {
  const res = await api<T>(as, method, url, payload);
  if (res.status >= 300) {
    throw new Error(`${method} ${url} → ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body.data as T;
}

export { pool };
