import type { PoolClient } from "pg";
import {
  PRINCIPALS_PER_COMBINATION,
  SUB_ICT,
  SUB_MATH,
  subsidiaryRuleFor,
  unebSubjectName,
} from "../../../shared/uneb.js";
import type { CombinationRole } from "./combinations.repository.js";

type Member = { subjectId: string; role: CombinationRole };

/**
 * Applies Uganda's A-Level combination rules to a member list, for both the
 * platform catalog and a school's own combinations:
 * - exactly 3 principal subjects, none of them a subsidiary-only subject;
 * - subsidiary members must be subsidiary subjects;
 * - the subsidiary follows the UNEB rule (shared/uneb.ts): where one is
 *   required it must be that one, and it's added when none was given; where
 *   the student may choose, both Sub-Maths and Sub-ICT are added when none
 *   was given, so the choice is made per student at assignment.
 *
 * Returns the member list to persist (principals first, in pick order). A
 * subsidiary that contradicts the rule is rejected, never silently swapped.
 * `fail` builds the caller's own error type so routes map it to a 400.
 * Expects every subjectId to already be validated as existing.
 */
export async function applyUnebCombinationRules(
  client: PoolClient,
  curriculumId: string,
  members: Member[],
  fail: (message: string) => Error,
): Promise<Member[]> {
  const principals = members.filter((m) => m.role === "principal");
  if (principals.length !== PRINCIPALS_PER_COMBINATION) {
    throw fail(
      `An A-Level combination needs exactly ${PRINCIPALS_PER_COMBINATION} principal subjects (this one has ${principals.length}).`,
    );
  }

  const { rows } = await client.query<{ id: string; name: string; category: string; uneb_code: string | null }>(
    `select id, name, category, uneb_code from subject where id = any($1::uuid[])`,
    [members.map((m) => m.subjectId)],
  );
  const byId = new Map(rows.map((r) => [r.id, r]));

  const misplacedPrincipal = principals.find((p) => byId.get(p.subjectId)?.category === "subsidiary");
  if (misplacedPrincipal) {
    throw fail(`${byId.get(misplacedPrincipal.subjectId)!.name} is a subsidiary subject — it can't be a principal.`);
  }
  const subsidiaries = members.filter((m) => m.role === "subsidiary");
  const misplacedSub = subsidiaries.find((s) => byId.get(s.subjectId)?.category !== "subsidiary");
  if (misplacedSub) {
    throw fail(`${byId.get(misplacedSub.subjectId)?.name ?? "That subject"} isn't a subsidiary subject.`);
  }

  const rule = subsidiaryRuleFor(principals.map((p) => byId.get(p.subjectId)?.uneb_code ?? null));
  const coded = await client.query<{ id: string; uneb_code: string }>(
    `select id, uneb_code from subject
     where curriculum_id = $1 and uneb_code = any($2::text[])
       and school_id is null and status = 'approved' and is_active`,
    [curriculumId, [SUB_MATH, SUB_ICT]],
  );
  const idFor = (code: string) => coded.rows.find((r) => r.uneb_code === code)?.id;
  const nonSubsidiary = members.filter((m) => m.role !== "subsidiary");

  if (rule.required) {
    const requiredId = idFor(rule.required);
    if (!requiredId) {
      throw fail(
        `${rule.reason}, but this curriculum has no active subject with UNEB code ${rule.required} ` +
          `(${unebSubjectName(rule.required)}). Ask the platform admin to set it in the subject catalog.`,
      );
    }
    const wrong = subsidiaries.filter((s) => s.subjectId !== requiredId);
    if (wrong.length > 0) {
      const names = wrong.map((w) => byId.get(w.subjectId)?.name ?? "the other subsidiary").join(", ");
      throw fail(`${rule.reason} — remove ${names}.`);
    }
    return [...nonSubsidiary, { subjectId: requiredId, role: "subsidiary" }];
  }

  if (subsidiaries.length > 0) return members;
  const choices = [SUB_MATH, SUB_ICT].map(idFor).filter((id): id is string => Boolean(id));
  if (choices.length === 0) {
    throw fail("Pick at least one subsidiary subject for this combination.");
  }
  return [...nonSubsidiary, ...choices.map((subjectId) => ({ subjectId, role: "subsidiary" as const }))];
}
