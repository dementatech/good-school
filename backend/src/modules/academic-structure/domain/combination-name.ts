/**
 * The house rule for an A-Level combination's display name, e.g. "BCM/SCS/GP":
 *
 *  - each core (principal) subject contributes ONLY the first letter of its
 *    subject name, uppercased — Biology, Chemistry, Mathematics -> "BCM"
 *    (matches how these are spoken: PCM, HEG, BCM, ...)
 *  - the subsidiary contributes its short name in full ("SCS", "ICT", ...)
 *  - then "/GP" — always, since General Paper is automatic for every A-Level
 *    student the moment they're placed into ANY combination (never a member,
 *    so it never appears in the inputs here)
 *
 * Pick order is preserved — there's no single "correct" order for these, so
 * we don't impose one. Display text only.
 */
export function combinationDisplayName(
  cores: { name: string }[],
  subsidiaries: { shortName: string }[],
): string {
  const core = cores
    .map((s) => s.name.trim().charAt(0).toUpperCase())
    .join("");
  const sub = subsidiaries
    .map((s) => s.shortName.trim())
    .filter(Boolean)
    .join("+");
  return `${core || "Combination"}${sub ? `/${sub}` : ""}/GP`;
}
