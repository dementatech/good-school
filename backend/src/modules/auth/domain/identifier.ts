export type IdentifierKind = "system_id" | "email" | "phone_number";

// STU-0001, TCH-0001 — role-prefixed + sequence, unique per school.
const SYSTEM_ID_PATTERN = /^(STU|TCH)-\d{4,}$/i;
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
