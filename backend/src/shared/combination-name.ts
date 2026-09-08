/**
 * The A-Level combination display name is DERIVED from its current member
 * subjects, on every read — never stored. "BCM/SCS/GP":
 *
 *  - each core (principal) subject contributes only the first letter of its
 *    subject name, uppercased — Biology, Chemistry, Mathematics -> "BCM"
 *  - the subsidiary contributes its short_name in full ("SCS", "ICT", ...)
 *  - then "/GP" — always (General Paper is automatic for every A-Level
 *    student, never a member)
 *
 * Members are ordered by `sort_order` (the pick order), then subject name.
 * So renaming a subject, or changing its short_name, immediately re-names
 * every combination it belongs to.
 *
 * This SQL expression is the single source of truth; the frontend's
 * `lib/combination-name.ts` mirrors it for the live "what will this be
 * called" preview in the combination form.
 *
 * @param s  alias of the `subject` table in the query
 * @param l  alias of the link table (`combination_subject` /
 *           `school_combination_subject`) in the query
 */
export function derivedNameSql(s: string, l: string): string {
  return `
    (coalesce(nullif(
       string_agg(upper(left(btrim(${s}.name), 1)), '' order by ${l}.sort_order, ${s}.name)
         filter (where ${l}.role = 'principal'), ''), 'Combination')
     || coalesce('/' || nullif(
          string_agg(btrim(${s}.short_name), '+' order by ${l}.sort_order, ${s}.name)
            filter (where ${l}.role = 'subsidiary'), ''), '')
     || '/GP')
  `;
}
