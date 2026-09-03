# Subject Selection Module — O-Level Optionals & A-Level Combinations

Design breakdown for the module governing how a student's subject list gets built: O-Level compulsory/optional selection, and A-Level combination + subsidiary + General Paper selection. Builds on `subject`/`subject_combination` from `uganda-secondary-school-foundations.md` §3 — this document goes deeper into the *selection logic*, not just the data shapes.

---

## 1. The core distinction driving the whole module

O-Level and A-Level are **two different selection problems**, not one problem with different subject counts:

| | O-Level (S1–S4) | A-Level (S5–S6) |
|---|---|---|
| **Shape of choice** | Pick a *set* of subjects (compulsory ones fixed, optionals chosen/dropped individually) | Pick a *bundle* (predefined combination) — you don't assemble it subject-by-subject |
| **When it happens** | Gradual — broad exposure in S1–S2, narrowed at S3 | One decision, at entry to S5 |
| **What constrains it** | Compulsory-subject rules, min/max subject count | Which combinations the *school* actually offers (staffing/timetable-limited) |
| **Real-world unit** | Individual subject registration per student | Often maps to an actual class group (e.g. "S5 PCM") — students in one combination largely timetable together |

Treat these as two separate sub-modules sharing the same underlying `subject` catalog, not one generic "pick your subjects" screen.

---

## 2. O-Level: three-tier subject model (verified against NCDC/NLSC structure)

### 2.1 The verified structure at S3–S4

An interview claim ("7 cores, 1 religion, 1 vocation") was checked against NCDC/NLSC reporting. It holds up, with one important nuance: **only the 7 cores are a national mandate — the religion slot is a founding-body policy, not a government rule.** Model all three tiers, but keep tier 2 school-configurable rather than hardcoded.

| Tier | Subjects | Source of the rule | Typically how many |
|---|---|---|---|
| **1. Core (nationally compulsory)** | English Language, Mathematics, History (& Political Education), Geography, Physics, Chemistry, Biology | NCDC/NLSC national mandate — fixed for every school running the curriculum | Exactly 7 |
| **2. Religious Education** | CRE or IRE (denomination matches the school's founding body) | **School/founding-body policy**, not a national rule — RE is nationally an elective at S3–S4, but most schools with a religious founding body make their own RE subject compulsory in practice | 0 or 1, per school policy |
| **3. Vocational/Practical elective** | Agriculture, ICT, Art & Design, Performing Arts, Technology & Design, Nutrition & Food Technology, Literature in English, foreign/local languages | Genuinely elective, student's choice from the school's offered menu | 0–2, filling out the total |

**Total load: minimum 8, maximum 9** (7 core + at least 1 more, at most 2 more) — this is the NLSC-era figure and is *tighter* than the legacy pre-2020 system, which allowed up to 10 subjects with only the best 8 counted toward the UCE aggregate. If you need to support both current and legacy-cohort data (a transferring or repeating student, or historical records), don't hardcode a single max — key it off curriculum/cohort year like the grading scheme in the foundations doc §4.3.

A worked example matching the interview: 7 core + 1 RE (compulsory by founding-body policy) + 1 vocational elective = **9**, the maximum. A school without a religious founding body (or a non-denominational/government school that doesn't enforce RE) might instead land on 7 core + 2 vocational electives = 9, or 7 core + 1 elective of either kind = 8 (the minimum) — same total shape, different tier-2/tier-3 mix.

### 2.2 Why tier 2 must be school-configurable, not a platform constant
Uganda's secondary schools are overwhelmingly founded by religious bodies (Catholic, Anglican/Church of Uganda, Muslim, and others), each of which typically insists on *its own* RE subject (CRE vs. IRE) being compulsory at its schools. A government or purely secular school may not enforce this at all. So:
- Put the "is RE compulsory here" decision on `subject_offering.is_compulsory` for the RE subject, per school — exactly the mechanism already designed in §2.1 below, now with a concrete real-world driver for *why* the same subject is compulsory at one tenant and optional at another.
- Don't assume "1 religion subject" as a hardcoded platform rule — some schools may offer both CRE and IRE and let the student pick which (still tier 2, but as a `subject_choice_group` with min/max 1, not a single fixed subject).

### 2.3 Subject roles, restated with the verified tiers
- **Core (Tier 1)** — the 7 nationally-fixed subjects; `is_compulsory = true` for every school, effectively platform-default rather than something admins configure away.
- **Religious Education (Tier 2)** — compulsory *if* the school's founding body requires it; otherwise sits in the elective pool. This is the clearest real-world case for per-school `is_compulsory` overriding a platform default.
- **Vocational/Practical (Tier 3)** — genuinely elective; this is where **drop** logic lives (§2.5 below) since these are the subjects a student picks and can reconsider.

```
subject (id, name, code, category [core|humanity|science|religion|vocational|language],
         curriculum_id, level [o_level|a_level])
subject_offering (id, school_id, subject_id, academic_year_id, is_compulsory,
                   is_offered, min_class_size, staffing_status)
```
`subject_offering` — not just `subject` — is where "compulsory" and "offered" actually live, because compulsory-ness and availability are **per-school, per-year** decisions, not global truths. The `category` field on `subject` now carries a first-class `religion` value (rather than lumping CRE/IRE into a generic "humanity" or "core" bucket), which is what lets your validation layer apply tier-specific rules (e.g. "at most one religion subject counts toward the total" or "religion is compulsory only if `subject_offering.is_compulsory` is true for this school").

### 2.4 The "drop" mechanic
This is the operational core of O-Level selection, and it's a **workflow with a timing window**, not a one-time form:

- Students typically take a broader subject load in **S1–S2** (exposure phase), then formally **drop down to their examinable set by S3** — this is the moment tier-3 vocational electives actually get chosen/dropped.
- Model it as a **state transition on `student_subject`**, not a delete — you want the history (a dropped subject still has S1–S2 grades/attendance that matter for records, transcripts, and re-adds).

```
student_subject (id, student_id, subject_id, academic_year_id,
                  status [active|dropped|added], 
                  status_changed_at, status_changed_by, reason)
```

**Rules the workflow needs to enforce, not just record:**
- A compulsory subject (per `subject_offering.is_compulsory` — this now includes tier 1 always, and tier 2/Religion for schools that enforce it) **cannot** be set to `dropped` — validate this at the point of the drop request, don't rely on the UI alone.
- After dropping, the remaining active count must stay **≥ 8** (the verified NLSC floor) — a drop request that would take a student below it should be rejected or flagged for admin override, not silently allowed. Cap the ceiling at **9** for NLSC cohorts; keep this configurable per curriculum/cohort year so legacy-system students (max 10) aren't wrongly blocked.
- Set a **drop window** per academic year (e.g. only permitted in a defined period of S3 Term 1) — encode this as a config value (`subject_selection_window_start/end` per `academic_year` or `class_level`), so the system can hard-block late drops without hardcoding dates in application logic.
- Adding a subject back after the window (a student who changes their mind, or transfers in mid-cycle) should require an explicit admin/override action, logged — this ties into the `transfer_record` pattern from the foundations doc §6.3 for students arriving with a different prior subject set.

### 2.5 Combination-style constraints even at O-Level
Some schools apply soft groupings even to O-Level tier-2/tier-3 choices (e.g. "pick one from: CRE/IRE," "pick one from: Agriculture/Computer Studies") to manage timetabling — this isn't the same as A-Level's rigid combinations, but your validation layer should support **optional subject groups with a min/max pick count**, not just a flat pool:

```
subject_choice_group (id, school_id, name "Religious Education", min_picks, max_picks)
subject_choice_group_member (group_id, subject_id)
```
This is also the natural place to encode "pick your denomination's RE" (CRE vs. IRE, min 1 max 1) for schools that offer both but require exactly one, rather than trying to force it into a single fixed `subject_offering` row.

This keeps the O-Level model flexible without borrowing A-Level's much stricter combination machinery.

---

## 3. A-Level: combination + subsidiary + General Paper model

### 3.1 The three-part structure
Every A-Level student's subject set has exactly three components, each with different rules:

1. **Combination (3 Principal subjects)** — chosen as a **bundle**, not assembled freely. A student picks e.g. "PCM" (Physics/Chemistry/Maths), not "I'll take Physics, and separately Chemistry, and separately Maths" as three independent decisions.
2. **Subsidiary subject (exactly 1)** — commonly Subsidiary Mathematics or Subsidiary ICT, chosen alongside the combination. There are actual **UNEB-published rules** governing which subsidiary applies, not just school convention — see §3.2a.
3. **General Paper (GP)** — compulsory for every A-Level student, no choice involved. Model it as an implicit auto-enrolled subject the moment a student is placed into any A-Level combination, not something presented as a "choice."

```
subject_combination (id, school_id, code "PCM", name "Physics/Chemistry/Mathematics",
                      stream_category [science|arts|business|mixed],
                      curriculum_id, is_offered, min_class_size)
combination_subject (combination_id, subject_id, role [principal])   -- exactly 3 rows per combination
combination_subsidiary_option (combination_id, subsidiary_subject_id)  -- which subsidiaries are valid for this combination
```

### 3.2 Combinations come from a national catalog — schools select a subset, not invent freely
Verified: Ugandan A-Level combinations aren't ad hoc school inventions. The Ministry/UNEB maintains a **prescribed list of standard combinations** (roughly 14 recognized Arts combinations and 7 Science/technical ones, per Ministry of Education reporting), each already categorized as **Science, Arts, or (less formally) Business/Mixed** — e.g. PCM/PCB/BCM/BCA as Science; HEG/HEL/HED/MEG as Arts; combinations mixing a science principal with Economics (PEM, PEntM) sometimes marketed as a Business/hybrid stream. This has two direct implications for the schema:

- **A platform-wide `combination_catalog` table (national standard combinations, each pre-tagged with `stream_category`) is worth seeding**, separate from the school's own `subject_combination` — schools then select which catalog entries they offer (creating their `subject_combination` row by reference) rather than typing a combination from scratch each time. This cuts data-entry errors and keeps `stream_category` consistent across schools instead of re-deciding it per tenant.
- **A school can still define a genuinely custom combination** (some schools run less-common bundles) — so `subject_combination` should support both "sourced from `combination_catalog`" and "school-defined, ad hoc," with `stream_category` required either way since it's used for reporting/streaming (§3.4) regardless of origin.

```
combination_catalog (id, code "PCM", name, stream_category [science|arts|business|mixed],
                      principal_subject_ids[])   -- platform-wide reference list
subject_combination (id, school_id, catalog_id NULLABLE, code, name, stream_category,
                      curriculum_id, is_offered, min_class_size)
```

### 3.2b UX: selection, not construction
Since the catalog is finite and known, the school-facing setup screen should be a **checklist of catalog combinations to toggle on**, grouped by `stream_category`, with subsidiary rules and principal subjects pre-filled — not a form asking the admin to assemble a combination from a subject picker. The admin's actual input should be limited to school-specific detail (offer it or not, `min_class_size`, assigned teacher/stream). Reserve a separate, clearly secondary "define a custom combination" action for the minority of schools running a non-standard bundle — don't lead with it, since building one manually reintroduces exactly the errors (wrong `stream_category`, wrong subsidiary rule) that seeding from the catalog is meant to avoid.

### 3.2a Subsidiary assignment follows real rules, not free choice
This is worth encoding as logic rather than leaving to the student/admin to pick freely — reported UNEB guidance ties the subsidiary to the principal combination:
- A student with **Principal Mathematics** in their combination → **must** take Subsidiary ICT.
- A student with **Economics as principal but no Principal Mathematics** → **must** take Subsidiary Mathematics.
- A **Science combination without Principal Mathematics** (e.g. PCB, BCA) → **must** take Subsidiary Mathematics.
- Combinations outside those patterns → student may **choose** between Subsidiary ICT and Subsidiary Maths.

This means `combination_subsidiary_option` shouldn't just list "valid options" for a human to pick from — it should carry a **`is_mandatory` flag** so the eligibility service (§4) can auto-assign the subsidiary where the rule is fixed, and only present a real choice where the rule allows one:
```
combination_subsidiary_option (combination_id, subsidiary_subject_id, is_mandatory)
```

### 3.3 Why "combinations are school-offered, not freely assembled" matters
Unlike O-Level optionals (a pool students pick individually from), **A-Level combinations are a fixed catalog the school selects and offers** — driven by staffing and timetabling reality, not student preference alone. Your module should:
- Present students a **list of offered combinations** (`subject_combination.is_offered = true` for that school/year) to choose from, not a "build your own combination" UI.
- Let the school pick from the national `combination_catalog` (with the option to define a custom one) rather than re-deciding combination composition and stream category from scratch each time.
- Respect `min_class_size` — a combination with only 1 interested student may not run; the selection workflow should surface this as a pending/at-risk state rather than silently confirming an unviable combination.

### 3.4 Student combination selection as one atomic decision
```
student_combination (id, student_id, combination_id, subsidiary_subject_id,
                      academic_year_id, status [pending|confirmed|reassigned],
                      selected_at, confirmed_by)
```
Because this is one bundled decision (not incremental subject adds/drops like O-Level), the workflow shape is simpler but more consequential:
- **Selection is typically made once**, at S4→S5 transition (tied to the "re-admission event" already noted in the foundations doc §1), based on UCE results and interest.
- **Validation on submit**: subsidiary choice must be in `combination_subsidiary_option` for the chosen combination (auto-assigned where `is_mandatory` is true per §3.2a, otherwise a real choice); combination must be `is_offered` for that school/year.
- **Reassignment is an exception path, not a normal flow** — a student wanting to switch combinations after the year starts should go through an explicit admin-approved `reassigned` status change (again, logged with reason), because it has real downstream effects: different teachers, different class group, different exam registration.
- Since GP is implicit, **don't** ask the student to "choose" it — auto-create the `student_subject` (or equivalent) record for GP the moment `student_combination` is confirmed.

### 3.5 The class-group reality
In practice, most Ugandan A-Level schools **organize streams around combinations** (e.g. "S5 PCM," "S5 HEG") because principal-subject teaching happens combination-by-combination, while GP and subsidiary lessons often mix students across combinations. This means:
- `stream` (from the foundations doc §3.1) at A-Level is frequently **derived from `student_combination`**, not an independent administrative grouping the way O-Level streams (S2 East/West) are.
- `stream_category` (Science/Arts/Business/Mixed, §3.1) is also a natural reporting dimension here — schools and Ministry statistics commonly report enrollment by stream category, so surfacing it as a first-class filter (not something you'd have to derive by inspecting subjects) pays off in reporting screens later.
- Consider whether your timetabling module needs a **secondary grouping** for GP/subsidiary classes that cuts across combination-streams — that's a real scheduling complexity worth flagging now even if you build it later, since it affects how `stream` and `student_combination` relate.

---

## 4. Shared validation logic worth centralizing

Both sub-modules ultimately answer the same question — "is this student's subject set valid?" — so it's worth building one **eligibility/validation service** rather than duplicating rule logic per level:

- **Count rules**: O-Level (NLSC) min 8/max 9, with the 7 core always included; legacy-cohort O-Level max 10 (keep this configurable per curriculum/cohort year, not a hardcoded constant); A-Level exactly 3 principal + 1 subsidiary + GP.
- **Compulsory-inclusion rules**: O-Level tier-1 core always present; tier-2 Religious Education present *if* `subject_offering.is_compulsory` is true for that school; A-Level GP always present.
- **Offering rules**: subject/combination must be `is_offered` at that school for that year — reject selections against unoffered subjects even if they exist in the platform-wide catalog.
- **Prerequisite rules** *(worth planning for even if not built immediately)*: some schools require a UCE credit-or-better in a subject before allowing it as an A-Level principal (e.g. can't do Principal Physics without having passed O-Level Physics) — this is a natural extension of the eligibility service once you have UCE result records to check against.
- **Window/state rules**: is subject selection currently open for this class level/academic year; is the student in an editable state (not yet confirmed/locked).

```
subject_selection_rule_result (student_id, is_valid, violations: [
  {rule: "min_subject_count", detail: "..."},
  {rule: "compulsory_missing", detail: "..."}
])
```
Running this as an explicit validation pass (not just relying on UI-level dropdown constraints) means you can re-validate at any time — useful for catching invalid states created by transfers, mid-year drops, or bulk imports that bypass the normal selection UI.

---

## 5. Suggested build order

1. `subject_offering` (per-school compulsory/optional flag) — needed before anything else, since it's the source of truth for what's compulsory *at this school*.
2. O-Level `student_subject` with status transitions (active/dropped/added) + the count/compulsory validation rules.
3. `combination_catalog` (national standard combinations, pre-tagged `stream_category`) seeded once platform-wide, then `subject_combination` + `combination_subject` + `combination_subsidiary_option` (with `is_mandatory` subsidiary rules) as the per-school layer that references or extends it.
4. A-Level `student_combination` selection flow (single atomic choice, with GP auto-enrollment).
5. Shared eligibility/validation service consuming both, so downstream modules (enrollment, exam registration, report cards) can call one "is this student's subject set valid" check regardless of level.
6. *(Later)* Prerequisite rules and combination-derived streaming/timetabling integration.
