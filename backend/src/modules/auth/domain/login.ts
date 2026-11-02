import { resolveIdentifierKind } from "./identifier.js";
import { findParentAtSchool, findUserByIdentifier } from "./users.repository.js";
import { verifyPassword } from "./password.js";
import { issueToken } from "./tokens.js";
import { findSchoolOnboardingStatus } from "../../schools/index.js";

export interface LoginInput {
  identifier: string;
  password: string;
  /** Set on a school's own domain: only that school's people can sign in there.
   * Anyone else gets the same answer as a wrong password. */
  schoolId?: string;
}

export type LoginResult =
  | {
      ok: true;
      token: string;
      role: string;
      schoolId: string | null;
      mustChangePassword: boolean;
    }
  | {
      ok: false;
      reason:
        | "invalid_identifier_format"
        | "invalid_credentials"
        | "school_suspended"
        | "account_disabled";
    };

export async function login({ identifier, password, schoolId }: LoginInput): Promise<LoginResult> {
  const kind = resolveIdentifierKind(identifier);
  if (!kind) {
    return { ok: false, reason: "invalid_identifier_format" };
  }

  const user =
    (await findUserByIdentifier(kind, identifier, schoolId)) ??
    (schoolId ? await findParentAtSchool(kind, identifier, schoolId) : null);
  if (!user) {
    return { ok: false, reason: "invalid_credentials" };
  }

  const passwordValid = await verifyPassword(user.password_hash, password);
  if (!passwordValid) {
    return { ok: false, reason: "invalid_credentials" };
  }

  // A super_admin can disable any login from the Accounts page.
  if (!user.is_active) {
    return { ok: false, reason: "account_disabled" };
  }

  // Block sign-in for a tenant that's been suspended — but never for a
  // platform-level super_admin (school_id null).
  if (user.school_id) {
    const status = await findSchoolOnboardingStatus(user.school_id);
    if (status === "suspended") {
      return { ok: false, reason: "school_suspended" };
    }
  }

  const token = issueToken({
    user_id: user.id,
    role: user.role,
    school_id: user.school_id,
  });

  return {
    ok: true,
    token,
    role: user.role,
    schoolId: user.school_id,
    mustChangePassword: user.must_change_password,
  };
}
