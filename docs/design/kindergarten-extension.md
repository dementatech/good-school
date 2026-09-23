# Kindergarten / Pre-Primary — Extending the Existing Model

How Baby Class–Middle Class–Top Class fits alongside `primary-schools-extension.md`. Most of it reuses what already exists; the two genuine departures are covered in §3–4: **no national exam or grading scheme applies here**, and **"subjects" isn't really the right frame**.

---

## 1. Structure (verified)

- Uganda's kindergarten/nursery/"pre-primary" runs **3 years**, ages roughly **3–5/6**, in three classes universally referred to (with some naming variation) as **Baby Class → Middle Class → Top Class** — also seen as "Kindergarten I/II/III" or "Class I/II/III" depending on the school, so keep the stage *label* school-configurable rather than hardcoding one naming convention, the same treatment already given to international curriculum stage names.
- Some schools also run an optional **Day Care** stage before Baby Class (roughly 1.5–2 years old) — this is closer to childcare than curriculum, and some schools don't treat it as a formal class at all. Model it as an optional, toggle-able stage rather than assuming every kindergarten has one.
- **Both standalone and combined patterns are real** — plenty of nursery schools operate as entirely separate institutions, and plenty of others (matching what you're describing) are a kindergarten section attached to a primary school, sometimes alongside secondary too (a single campus running kindergarten through A-Level under one brand is a real, documented pattern). `school.offers_kindergarten` as a flag alongside `offers_primary`/`offers_o_level`/`offers_a_level` (`uganda-secondary-school-foundations.md` §1) handles both — a kindergarten-only tenant just has the other flags false.
- Kindergarten feeds directly into P1 as part of the same national pathway (unlike, say, Cambridge, which is a genuinely separate curriculum) — so model it as **earlier stages of the same `curriculum`**, not a separate curriculum row: extend `curriculum_stage` with Baby/Middle/Top Class (and optionally Day Care) sequenced *before* P1, rather than inventing a parallel structure.

---

## 2. What reuses cleanly — class/stream, identity, staff

- `class_level` / `stream` — Baby/Middle/Top Class are just three more `class_level` rows tied to the pre-primary stage of the curriculum; a large Top Class still splits into streams (e.g. "Top Class A/B") exactly like every other level.
- `student` / LIN — already confirmed the Learner Identification Number "follows the learner from pre-primary through university" (`student-enrollment.md` §2), so kindergarten students use the exact same identity model with no changes.
- `guardian`, `accounts-module.md`, `staff`/`staff_assignment` — unchanged, same as the primary extension already noted.
- **Department**: kindergarten doesn't fit the "one department per subject" default from `organization-studio.md` §2, since there are no discrete subjects at this stage (§4 below) — treat it as a single combined department (e.g. "Early Childhood Development" or "Kindergarten Department") covering all Baby/Middle/Top Class teachers, seeded via the non-academic-style catalog toggle-list (`departments-module.md` §3) rather than auto-generated per subject.

---

## 3. No national exam, no grading scheme — don't force one

This is the first genuine departure from primary/secondary. PLE, UCE, and UACE all exist because UNEB examines at those points; **there is no equivalent national exam or qualification at the end of kindergarten** — it's a developmental stage, not an examined one. Any "first exam at age 3" some nursery schools mention is an internal school assessment, not a national credential.

**Implication: don't try to fit kindergarten into `grading_scheme`/`grade_band`/`result` (`uganda-secondary-school-foundations.md` §4.3).** That machinery exists to model UNEB's (or Cambridge's, or IB's) *examined* grading — applying it here would be modeling something that doesn't exist nationally, and would misrepresent an internal, informal school practice as if it were a standardized qualification. Something lighter-weight fits better:

```
developmental_assessment (id, student_id, term_id, learning_area,
                           rating ['emerging'|'developing'|'proficient'],
                           teacher_comment, created_at)
```
A simple, narrative/checklist-style progress record per term rather than a graded result — this is a sketch, not a full subsystem; build it out properly if and when it becomes a real priority rather than treating it as equally load-bearing as PLE/UCE/UACE grading.

---

## 4. "Subjects" isn't the right frame either

Kindergarten teaching is organized around **thematic, play-based "learning areas"**, not discrete examinable subjects — the government's own 2025 curriculum revision describes additions like cursive writing/tracing for Baby Class, number writing for Middle Class, and short sentence construction for Top Class, framed as developmental milestones preparing for P1, not subject content. This is the same thematic logic already noted for P1–P3 (`primary-schools-extension.md` §1), just more pronounced.

**Implication: don't force `subject`/`subject_offering` (built for examinable, chosen-or-dropped secondary subjects) onto this stage.** There's no per-student subject selection, no compulsory/optional tiering, nothing to allocate a "subject teacher" to in the `subject_teacher_assignment` sense — a Top Class teacher teaches the whole class across all learning areas, not one subject to a stream the way a Physics teacher does. Use `developmental_assessment.learning_area` as a light, school-configurable label (or a small shared catalog) rather than routing kindergarten through the full subject/department-per-subject machinery built for secondary.

---

## 5. Reform in progress — again

**Yet another live reform, on top of the ones already flagged for O-Level (done), A-Level (in progress), and primary (under review).** As of March 2025, NCDC (with UNEB on its governing council) approved a revised nursery curriculum, piloted in 20 schools before a full rollout decision. Confirmed changes: adjusted study areas per class (as in §4), later start/end times, and no homework — still play-based overall. Treat whatever learning-area catalog or stage structure you build as provisional and easy to revise, the same discipline already applied everywhere else in this system rather than a new lesson.

---

## 6. Fees — kindergarten is almost never free, even at a UPE school

Unlike government primary schools under UPE (`primary-schools-extension.md` §5), **pre-primary education in Uganda is almost entirely privately funded** — the only genuinely government-funded pre-primary school identified is a single university-affiliated center, not a general policy. **Don't let a school's UPE/government status imply free kindergarten fees** — a combined campus with a free-tuition UPE primary section can still charge full fees for its attached kindergarten. Tie fee expectations to the specific `class_level`/stage, not inherited from the school's overall funding status.

---

## 7. Summary

```
curriculum_stage: extend with optional Day Care + Baby/Middle/Top Class stages, sequenced before P1
school: add offers_kindergarten alongside offers_primary / offers_o_level / offers_a_level
developmental_assessment (id, student_id, term_id, learning_area, rating, teacher_comment, created_at)
```

This gives you:
- Kindergarten absorbed into the same curriculum pathway and class/stream/identity/staff models already built, with no duplicated structure for the parts that genuinely transfer.
- A deliberately lighter-weight progress-tracking model instead of forcing an examined-grading structure onto a stage that has no national exam.
- Fee expectations correctly decoupled from a school's UPE status, since kindergarten is fee-charging even where the attached primary school is free.
