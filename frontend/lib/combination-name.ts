/**
 * The house rule for an A-Level combination's display name, e.g. "BCM/SCS/GP":
 * cores contribute only the FIRST LETTER of their subject name (Biology,
 * Chemistry, Mathematics -> "BCM"), the subsidiary contributes its short name
 * in full, then "/GP" — always, since General Paper is automatic for every
 * A-Level student. Pick order is kept.
 *
 * Mirrors the backend `combinationDisplayName` — keep the two in step.
 */
export function combinationDisplayName(
  coreNames: string[],
  subsidiaryShortNames: string[],
): string {
  const core = coreNames.map((n) => n.trim().charAt(0).toUpperCase()).join('');
  const sub = subsidiaryShortNames.map((s) => s.trim()).filter(Boolean).join('+');
  return `${core || 'Combination'}${sub ? `/${sub}` : ''}/GP`;
}
