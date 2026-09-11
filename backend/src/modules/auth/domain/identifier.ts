export type IdentifierKind = "system_id" | "email" | "phone_number";

// <prefix><2-digit year><sequence> — T260001 (staff), S260042 (student),
// A260003 (school admin), P… (parent), X… (super admin). Globally unique.
// See shared/system-id.ts and the 1700000051000 migration.
const SYSTEM_ID_PATTERN = /^[STAPX]\d{6,}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Accepts +2567xxxxxxxx or local formats; spaces/dashes stripped before matching.
const PHONE_PATTERN = /^\+?[0-9]{7,15}$/;

export function resolveIdentifierKind(identifier: string): IdentifierKind | null {
  const trimmed = identifier.trim();

  if (SYSTEM_ID_PATTERN.test(trimmed)) return "system_id";
  if (EMAIL_PATTERN.test(trimmed)) return "email";
  if (PHONE_PATTERN.test(trimmed.replace(/[\s-]/g, ""))) return "phone_number";

  return null;
}
