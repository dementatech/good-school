# Uganda Secondary School System — Domain Foundations

A reference for modeling academic years, classes, subjects, grading, and student enrollment in a Ugandan secondary school SaaS. For how *schools themselves* get onboarded as tenants, see the companion document `school-onboarding-enrollment.md`.

---

## 1. The 6-Year Secondary Cycle

Uganda's secondary cycle runs **6 years**, split into two distinct phases that your schema should treat as related but structurally different "programmes":

| Phase | Classes | Duration | Exit exam | Body |
|---|---|---|---|---|
| **Lower Secondary (O-Level)** | Senior 1 – Senior 4 (S1–S4) | 4 years | UCE (Uganda Certificate of Education) | UNEB |
| **Upper Secondary (A-Level)** | Senior 5 – Senior 6 (S5–S6) | 2 years | UACE (Uganda Advanced Certificate of Education) | UNEB |

Implications for your schema:
- A school may run O-Level only, A-Level only, or both — model `school.offers_o_level` / `school.offers_a_level` as flags rather than assuming both.
- S1–S4 and S5–S6 have genuinely different subject models (see §3). Don't force one `subjects` table structure onto both without a `level` discriminator.
- The transition from S4 → S5 is a **re-admission event**, not a simple promotion — students often change schools, and A-Level requires a subject *combination* choice (see §3.2). Your enrollment flow should treat it as closer to "new admission" than "promote to next class."

---

## 2. Academic Year & Terms

- The academic year is **not** Jan–Dec. It runs roughly **February to early December**, and is set nationally each year by the Ministry of Education and Sports (MoES) — dates shift slightly year to year, so don't hardcode them; model an `academic_year` (or `term`) entity that a school admin (or a super-admin syncing MoES calendars) configures per year.
- Each academic year has exactly **3 terms** (Term 1, Term 2, Term 3), each roughly 11–13 weeks (~82–89 school days), separated by ~3-week holidays.
- First Term for primary and post-primary institutions typically runs early February to early May, Second Term late May to late August, and Third Term mid-September to early December, with the pattern repeating yearly with minor date shifts.
- School day hours are officially 8am to 4:30pm for primary/post-primary.
- Final national exams (UCE, UACE) are sat in **Term 3**, typically October/November.

**Suggested schema shape:**
```
academic_year (id, name e.g. "2026", start_date, end_date, is_current)
term (id, academic_year_id, term_number [1|2|3], name, start_date, end_date)
```
Nearly everything else (enrollment, class assignment, grading, fees, attendance) should hang off `term_id`, not just `academic_year_id` — Ugandan schools report and bill **per term**, not per year. Report cards, promotions, and fee balances are all term-scoped artifacts.

---

## 3. Classes, Streams, and Subjects

### 3.1 Class structure
- Classes are called **"Senior One" through "Senior Six"** (S1–S6), not "Grade" or "Form" (Form is used informally/colloquially but Senior is official).
- Within a class level, schools split students into **streams** (e.g. S2 East, S2 West, or S2 Blue/Red) purely for administrative/classroom grouping — streams don't change the curriculum, just class size and sometimes streaming by ability.

```
class_level (id, name "Senior 1"..."Senior 6", numeric_level 1-6, phase [O_LEVEL|A_LEVEL])
stream (id, school_id, class_level_id, name, academic_year_id, class_teacher_id, capacity)
enrollment (id, student_id, stream_id, term_id, status)
```

### 3.2 O-Level subjects (S1–S4)
- Students take a **minimum of 8, maximum of 9 subjects under the current NLSC curriculum** (verified against NCDC reporting — see `subject-selection-module.md` §2 for the full compulsory/religion/vocational breakdown), grouped roughly into English Language, Humanities (History, Geography), Sciences (Physics, Chemistry, Biology), Religious Education, and vocational/practical electives (Agriculture, ICT, Art & Design, Performing Arts, Nutrition & Food Technology, Literature in English, foreign languages). *(The older pre-2020 system allowed up to 10 subjects, with only the best 8 counted toward the UCE aggregate — relevant if you need to support legacy-cohort or transferring-student records.)*
- Since 2020, O-Level runs under the **New Lower Secondary Curriculum (NLSC)** — competence-based, with continuous assessment built in throughout, not just a terminal exam.
- Model subjects as a catalog independent of class/term, then join per-student per-term:
```
subject (id, name, code, category [language|science|humanity|vocational|core], curriculum [NLSC|legacy])
student_subject (id, student_id, subject_id, academic_year_id, is_examinable)
```

### 3.3 A-Level subjects (S5–S6): Principal + Subsidiary model
This is the part most likely to trip up a schema borrowed from generic K-12 systems: A-Level subjects are **not** a flat list — they have a **role**.

- Students choose a **combination** of typically **3 Principal subjects** (their specialization — e.g. PCM = Physics/Chemistry/Maths, HEG = History/Economics/Geography) plus compulsory/subsidiary subjects:
  - **General Paper (GP)** — compulsory for everyone.
  - **Subsidiary Mathematics** or **ICT** — commonly required alongside the principal combination.
- Grading and university-entry points differ by role: principal subjects can contribute up to 6 points each toward the 20-point UACE total, while General Paper and the subsidiary subject each contribute at most 1 point.

```
subject_combination (id, code "PCM", name, description)
combination_subject (combination_id, subject_id, role [principal|subsidiary|compulsory])
student_combination (student_id, combination_id, academic_year_id)
```
Design implication: your grading engine needs to know a subject's **role for that student** to compute UACE points correctly — the same subject (e.g. Mathematics) can be principal for one student and irrelevant for another, and subsidiary math/ICT is scored differently from a principal pass.

---

## 4. Grading — and a live transition you must design for

This is the trickiest part right now: Uganda is **mid-transition** between two grading regimes, and your system likely needs to support both simultaneously for a while (older cohorts and current O-Level are on different systems; A-Level hasn't fully converted yet).

### 4.1 Legacy system (still governs UACE, and recent UCE history)
- Each subject scored 1–9: Distinctions (D1, D2), Credits (C3–C6), Passes (P7, P8), Fail (F9).
- **UCE (O-Level) overall result** was an aggregate of the **best 8 subjects**, translated into a **Division**:
  - Division 1 requires at least 8 subjects including English (credit or better), a Humanity, Mathematics, and (except visually impaired candidates) a Science, with at least 7 subjects at credit or better and an aggregate ≤32.
  - Division 4 is the lowest passing division; Division 7 means the candidate didn't qualify for a certificate at all due to a subject-entry violation.
- **UACE (A-Level) points**, still current: sum the points from your best three principal subjects (each principal graded A–E/O with points, up to 6 per subject) plus 1 point each for General Paper and Subsidiary Math/ICT if passed (any grade better than F9), for a **maximum of 20 points**.

### 4.2 New competence-based system (O-Level, post-2020 curriculum — "NLSC")
- UNEB has replaced the D1–F9 scale with five achievement levels: A, B, C, D, E — B: 70–79%, C: 60–69%, D: 50–59%, E: 0–49%, each still counted as a pass, roughly mapping A≈D1/D2, B≈C3/C4, C≈C5/C6, D≈P7/P8, E≈F9 for backward comparison.
- There is no longer a numeric aggregate or Division ranking (1–4) — instead UNEB issues a Result status: Result 1 = qualified for the UCE certificate (requires at least one Grade D in some subject), Result 2 = did not qualify (e.g. missing compulsory subjects or Project Work), Result 3 = only Grade E across the board, which doesn't meet certificate minimums.
- Final marks are a blend, not exam-only: national exam scores make up 80% of the final grade, with 20% coming from school-based continuous assessment (practical projects) filed with UNEB annually.
- A-Level grading is expected to eventually move to a similar competence-based A–E model as the NLSC curriculum reaches S5/S6, but as of now UACE still runs on the legacy D1–F9/points system above — worth re-checking UNEB's site periodically since this is actively changing.

### 4.3 Design recommendation
Don't hardcode "grade = D1..F9" or "grade = A..E" as an enum on the transcript. Model grading as **pluggable per curriculum/cohort**:
```
grading_scheme (id, name, curriculum [legacy_1_9 | nlsc_a_e], applies_to [O_LEVEL|A_LEVEL])
grade_band (id, grading_scheme_id, label, min_pct, max_pct, points, legacy_equivalent)
assessment_component (id, subject_id, term_id, type [exam|continuous_assessment|project], weight_pct)
result (id, student_id, subject_id, term_id, raw_score, computed_grade, grading_scheme_id)
```
Then your report card / transcript renderer picks the right scheme based on the student's cohort year and level, and your CA vs. exam weighting (80/20 for NLSC O-Level) lives in `assessment_component`, not hardcoded logic. This also future-proofs you for when UACE eventually converts.

School-internal (termly) grading is a separate concern from the national exam grading above — most schools also run their own beginning/mid/end-of-term tests and report cards using their own weighting, often mirroring but not identical to UNEB's scheme (e.g. schools frequently still use aggregate/division-style internal ranking even for NLSC cohorts, because it's familiar to parents and useful for streaming/promotion decisions). Keep `grading_scheme` schools-configurable rather than assuming UNEB's exact rules apply internally.

---

## 5. Enrollment mechanics worth modeling explicitly

1. **Placement is centralized for public entry points.** S1 entry (from PLE) and S5 entry (from UCE) are often driven by a national placement/selection process before a student ever reaches your school's registrar — your "admission" flow should accept an incoming student with prior academic record (PLE aggregate or UCE result) as first-class input, not just a blank enrollment form.
2. **Enrollment is per-term-effective, not just per-year.** Students can transfer, drop out, or be admitted mid-year; a `status` history (active/transferred/dropped/graduated) scoped by term is more accurate than a single yearly enrollment flag.
3. **Subject registration is a separate step from class enrollment**, especially at A-Level where combination choice drives timetabling, teacher assignment, and exam registration. Don't assume "enrolled in Senior 5" implies which subjects — capture `student_combination` as its own workflow.
4. **Compulsory-subject and combination validation rules matter for certification**, not just pass/fail — e.g. Division 1 requires English + a Humanity + Maths + a Science; UACE requires GP. If you want automated "is this student on track for a UCE Division 1 / UACE certificate" indicators, these eligibility rules need to be first-class logic, not just an average-score calculation.
5. **Streams reset each academic year**, but student identity and historical results must persist across streams/years/even schools (transfers are common). Keep `student` as a durable entity independent of any single school/stream, with `enrollment` records as the join history.

---

## 6. Multi-curriculum schools and cross-curriculum transfers

Uganda has a real population of international/private schools running alongside the national UNEB system — Cambridge (IGCSE, AS/A Level), IB (PYP/MYP/DP), American (AP-based), and others. If your platform is going to serve any of these, or handle a student moving between a national and an international school (common, since expat and returning-diaspora families move around), the schema needs a **curriculum abstraction layer** — not a second copy of everything you built for UNEB.

### 6.1 Why you can't just add a `curriculum` column to `class_level`
The systems differ on three independent axes, and conflating them causes real bugs:

| Axis | UNEB (Uganda) | Cambridge | IB |
|---|---|---|---|
| **Year/class naming** | Senior 1–6 (S1–S6) | Year 7–9 (Lower Secondary), Year 10–11 (IGCSE), Year 12–13 (A Level) | MYP years 1–5, DP years 1–2 |
| **Qualification points** | UCE (end of S4), UACE (end of S6) | IGCSE (end of Year 11), Cambridge A Level (end of Year 13) | MYP certificate, IB Diploma (end of DP2) |
| **Grading scale** | A–E / D1–F9 (see §4) | A*–G (IGCSE), A*–E (A Level) | 1–7 per subject, max 45 points |

A student's *age-equivalent stage* (roughly "14 years old, 9th year of schooling") is a different concept from their *class label* and different again from their *grading scale*. Model all three separately so a transfer can map correctly even when none of them align 1:1.

### 6.2 Suggested schema addition
```
curriculum (id, name "UNEB" | "Cambridge" | "IB" | "American", awarding_body)
curriculum_stage (id, curriculum_id, label "Senior 3" | "Year 10" | "MYP 4",
                   sequence_number,        -- position within the curriculum, e.g. 1..6
                   age_equivalent_years,   -- typical age, for cross-mapping
                   phase [LOWER|UPPER|CHECKPOINT])
school_curriculum (school_id, curriculum_id)   -- a school may run more than one
stream (id, school_id, curriculum_stage_id, ...)  -- replaces the earlier `class_level_id` FK
```
Then `subject`, `grading_scheme`, and `subject_combination` (§3–4) all key off `curriculum_id` rather than being globally shared — a Cambridge school's "subject catalog + A*–G grading" is a completely separate configuration from a UNEB school's, even though your UI and workflow code can be identical.

### 6.3 Cross-curriculum transfer as an explicit workflow
Don't try to auto-map a transferring student's class/grade — build it as a **guided placement decision**, because the mapping is genuinely ambiguous and school-specific:

```
stage_equivalency (from_curriculum_stage_id, to_curriculum_stage_id, confidence [exact|approx],
                    notes)   -- admin-maintained reference table, not auto-computed
transfer_record (id, student_id, from_school_id, from_curriculum_id, from_stage_id,
                  to_school_id, to_curriculum_id, to_stage_id,
                  prior_results_snapshot jsonb,   -- imported/attached transcript, not re-derived
                  placement_decision_by, placement_date, notes)
```

Practical rules worth encoding into the workflow (not just the data model):
- **Age is the anchor, not the label.** A Year 10 Cambridge student (~14–15) is closer to Senior 2/3 than Senior 4, despite "Year 10" sounding advanced — schools placing transfers usually use age + prior subject coverage, and often an internal placement test, not a lookup table alone.
- **Prior results should be stored, not converted.** Keep the student's IGCSE/UACE/whatever grades as-is (attach the original scale) rather than force-converting an "A*" into a UNEB "D1" — conversions are approximate and contested; let the record show provenance (`grading_scheme_id` per historical result, per §4.3) and let a human make placement judgment calls.
- **Subject continuity gaps are common and should be surfaced, not hidden.** A student moving from IB MYP (no O-Level-style national exam) into S4 mid-cycle may be missing compulsory UNEB subjects (e.g. hasn't done Uganda-specific History/CRE/IRE) — flag this at transfer time so the school can plan catch-up rather than discovering it at UCE registration.
- **Mid-year transfers still need a term-scoped enrollment record** (per §5) — a transfer in Term 2 shouldn't silently overwrite Term 1 history at the old school; keep `transfer_record` as a link between two full enrollment histories, not a mutation of one.

This keeps your core `student`, `result`, and `enrollment` tables completely curriculum-agnostic — a student is just an identity with a chain of `enrollment` records across schools/curricula/time, each pointing at whatever `curriculum_stage` and `grading_scheme` applied *at that time*. That's what makes transfers (the hard case) fall out naturally instead of needing special-case code.

---

## 7. Quick summary of core entities

*(See the companion document `school-onboarding-enrollment.md` for how a school itself gets provisioned/verified before any of this applies.)*

```
school → school_curriculum (a school may run more than one curriculum)
curriculum → curriculum_stage (replaces a hardcoded S1–S6 list)
academic_year → term (×3, for UNEB-calendar schools; other curricula may differ)
stream (per school, per curriculum_stage, per year)
subject / subject_combination → combination_subject (role: principal/subsidiary/compulsory)
student
enrollment (student, stream, term, status)
transfer_record (student, from/to school+curriculum+stage, prior_results_snapshot)
student_subject / student_combination
grading_scheme → grade_band (scoped per curriculum)
assessment_component (exam/CA weighting)
result (per student, subject, term, grading_scheme)
```

This gives you a foundation that:
- Separates O-Level and A-Level cleanly without duplicating the whole schema,
- Survives Uganda's active UNEB grading-system transition without a rewrite,
- Matches how schools actually operate term-by-term rather than assuming a Jan–Dec year,
- Supports the principal/subsidiary subject nuance that trips up most naive school-management schemas built for other countries,
- Extends to Cambridge/IB/American-curriculum schools and cross-curriculum transfers without special-casing — curriculum, stage, and grading scale are separate, swappable dimensions rather than baked into `class_level`.

*Note: MoES term dates and UNEB grading rules are updated periodically — worth building an admin-configurable calendar/grading-scheme rather than hardcoding any of the above as constants.*
