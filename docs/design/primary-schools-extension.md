# Primary Schools — Extending the Existing Model

How P1–P7 fits into the schema already built for secondary. The short version: `curriculum` / `curriculum_stage` (`uganda-secondary-school-foundations.md` §6) and `grading_scheme` (§4.3) were deliberately built generic enough that primary is mostly a *new row*, not a new mechanism — this document is about confirming that and flagging the few things that genuinely are new.

---

## 1. Structure (verified)

Uganda runs a **"7-4-2" system**: 7 years of primary (P1–P7), then the 4+2 secondary structure already covered. (What precedes it — kindergarten/pre-primary — is covered separately in `kindergarten-extension.md`, since it departs from this model enough to need its own treatment.) Primary splits into three teaching cycles, not two levels like O/A-Level — worth capturing as metadata on the stage, not a separate qualification tier:

| Cycle | Classes | Medium of instruction | Approach |
|---|---|---|---|
| **Lower Primary** | P1–P3 | Local/familiar language, with English as one learning strand | Thematic — content organized around themes/sub-themes, not discrete subjects |
| **Transition** | P4 | Shifts to English | Bridges thematic → subject-based teaching |
| **Upper Primary** | P5–P7 | English | Fully subject-based |

- Entry age is typically **6**, so a 7-year cycle runs roughly ages 6–13.
- This maps directly onto the existing `curriculum_stage` model (`curriculum_stage.phase` already anticipated a `[LOWER|UPPER|CHECKPOINT]`-style tag in the foundations doc — extend the enum to cover `thematic`/`transition`/`upper_primary` rather than inventing a parallel table) — `sequence_number` 1–7, `age_equivalent_years` 6–13.
- Unlike secondary, there's **no A-Level-style combination complexity and no O-Level-style compulsory/religion/vocational tiering** — primary is a single, mostly uniform subject set per class level. `subject-selection-module.md`'s drop/add and combination machinery largely doesn't apply here; see §3.

---

## 2. The exit exam: PLE, same examining body, different shape

- **PLE (Primary Leaving Examination)**, sat at the end of P7, administered by **UNEB** — the same body already handling UCE/UACE, so exam-registration infrastructure you build for secondary is directly reusable, not a separate integration.
- **Only 4 subjects are actually examined**: English, Mathematics, Science, Social Studies — even though more subjects are taught (Local Language, Religious Education, Physical Education are part of the curriculum but not PLE-examinable).
- **Grading is aggregate-based, same shape as the old UCE system**: each of the 4 subjects graded 1–9 (best to worst), summed into an aggregate of **4–36** (lower is better — same "golf scoring" logic as legacy UCE). Divisions: **Division 1 (4–12), Division 2 (13–23), Division 3 (24–29), Division 4 (30–34)**; a score of 35–36 doesn't qualify for a division/certificate.
- This slots straight into the existing `grading_scheme`/`grade_band` abstraction (§4.3 of the foundations doc) as a new scheme row (`curriculum = 'UNEB Primary'`, `applies_to = 'primary'`) — no new grading mechanism needed, just new data.

**Design implication for `subject`**: add an `is_examinable` flag (on `subject` or `subject_offering`) to distinguish the 4 PLE-tested subjects from the rest of the taught curriculum — this distinction barely mattered at O-Level (nearly everything offered is examinable) but is a real, structural fact at primary level that reporting and exam-registration logic need to know about.

---

## 3. What's genuinely simpler here — no per-student subject selection

Primary students don't choose or drop subjects the way O-Level students do (§2 of `subject-selection-module.md`) — the subject set is uniform per class level, set by the school/curriculum, not by individual student choice. So:
- `subject_offering` still applies (a school still configures which subjects it runs, and — for Local Language specifically — **which** local language, since that varies by region, e.g. Luganda vs. Ateso vs. Runyankole; model it as `subject_offering` picking a specific language-subject variant, not a separate field).
- `student_subject` records can be auto-created uniformly for every offered subject at enrollment (no drop workflow, no choice-group logic, no combination catalog) — a much thinner slice of `subject-selection-module.md`'s machinery than O-Level needs, and A-Level's combination system doesn't apply at all.

---

## 4. Reform in progress — treat this the same way NLSC was treated for O-Level

**This is live right now, not settled history.** As of the 2025 PLE results release, the Minister of Education confirmed the primary curriculum is **under review**, moving toward the same competency-based approach already rolled out at O-Level (2020) and in progress for A-Level — but as of this writing it has **not yet been implemented**; PLE still runs on the legacy aggregate/division system described in §2. A first attempt at a competence-based ("thematic") primary curriculum in 2006 also stalled, partly over resistance to local-language instruction — so don't assume the next reform attempt lands on a fixed timeline either.

Practical implication: exactly the same discipline already applied to O-Level's NLSC transition (`uganda-secondary-school-foundations.md` §4.3) — **don't hardcode the 4-subject/aggregate-4-36/division-1-4 structure as a constant.** Key it to `grading_scheme` and `curriculum` the same way, so when (not if) primary shifts to a competency-based model, it's a new scheme row and a cohort cutover, not a schema change.

---

## 5. Two things that are new, not just reused

- **`school.offers_primary`** — a third flag alongside `offers_o_level`/`offers_a_level` (`uganda-secondary-school-foundations.md` §1). Combined primary+secondary campuses are common in Uganda, and a fair number of tenants on your platform will likely be primary-only — don't assume every school offers secondary levels.
- **UPE (Universal Primary Education) and fee reconciliation.** Since 1997, government/public primary schools offer **free tuition** (capped at 4 children per family) under UPE. This matters directly for `schoolpay-integration.md`: a UPE-funded student may have **zero tuition fee_payment records by design**, not by data gap — the fees module and any "outstanding balance" reporting should treat ₦0 tuition as a normal, valid state for public primary schools rather than flagging it as missing data. Private primary schools still charge normally, so this is a per-school distinction (tie it to `school.ownership_type` from `school-onboarding-enrollment.md` §2, not a blanket primary-level assumption).

---

## 6. What needs no changes at all

Worth stating explicitly, since it's the actual point of this document: the following already work for primary without modification —
- `student` / `student_enrollment` / `transfer_record` (`student-enrollment.md`) — LIN is confirmed to follow a learner "from pre-primary through university," so primary students use the exact same identity model, no separate ID scheme.
- `guardian` / `student_guardian` / the intake match-or-create flow (`parent-guardian-module.md`) — unchanged; if anything, guardian involvement is typically *higher* at primary level, not a reason for a different model.
- `accounts-module.md` — the one-click account creation flow applies identically to primary parents and staff.
- `staff` / `staff_assignment` / `organization-studio.md` — a primary school's teaching and non-teaching staff structure (head teacher, deputy, class teachers, departments) follows the same models; "one department per subject" (§2 of `organization-studio.md`) still applies to English/Math/Science/Social Studies, just without A-Level's combination complexity to worry about.

---

## 7. Summary

```
curriculum_stage: extend phase enum to include ['thematic'|'transition'|'upper_primary'] for P1–P7
grading_scheme: new row for PLE (aggregate 4-36, divisions 1-4, per-subject 1-9)
subject / subject_offering: add is_examinable flag (PLE tests 4 of the taught subjects, not all)
school: add offers_primary boolean alongside offers_o_level / offers_a_level
```

This gives you:
- Primary absorbed almost entirely into the abstractions already built for secondary — the curriculum/grading-scheme separation designed early on turns out to be exactly what made this cheap.
- A grading structure that won't need a rewrite when the in-progress primary curriculum reform eventually lands, following the same pattern already proven necessary for O-Level's own NLSC transition.
- Fee reconciliation that correctly treats UPE's free tuition as a normal state, not a data-quality flag.
