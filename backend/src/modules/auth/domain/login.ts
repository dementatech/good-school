import { resolveIdentifierKind } from "./identifier.js";
import { findUserByIdentifier } from "./users.repository.js";
import { verifyPassword } from "./password.js";
import { issueToken } from "./tokens.js";

export interface LoginInput {
  identifier: string;
  password: string;
  schoolId?: string;
}

export type LoginResult =
  | { ok: true; token: string; role: string; schoolId: string | null }
  | { ok: false; reason: "invalid_identifier_format" | "invalid_credentials" };

export async function login({ identifier, password, schoolId }: LoginInput): Promise<LoginResult> {
  const kind = resolveIdentifierKind(identifier);
  if (!kind) {
    return { ok: false, reason: "invalid_identifier_format" };
  }

  const user = await findUserByIdentifier(kind, identifier, schoolId);
  if (!user) {
    return { ok: false, reason: "invalid_credentials" };
  }

  const passwordValid = await verifyPassword(user.password_hash, password);
  if (!passwordValid) {
    return { ok: false, reason: "invalid_credentials" };
  }

  const token = issueToken({
    user_id: user.id,
    role: user.role,
    school_id: user.school_id,
  });

  return { ok: true, token, role: user.role, schoolId: user.school_id };
}
