# Teacher/Staff Module & Subject Allocation

Design for the `staff` profile, its own school-scoped enrollment history (mirroring `student_enrollment`), and subject-teacher allocation — deliberately wired into the **same configuration step** as `subject_offering` (`subject-selection-module.md` §2.1), so a subject never sits configured with no one assigned to teach it. Extends `school-onboarding-enrollment.md` §3 step 7 (staff invitations) and `accounts-module.md` (staff login). Department/organizational grouping — covering both teaching and non-teaching staff, plus the full reporting hierarchy and org chart — is its own pair of modules, `departments-module.md` and `organization-studio.md`, since it's a distinct concern from both employment and subject allocation.

---

## 1. Verified: Uganda has a teacher-side equivalent of LIN

Same shape of finding as the student side (`student-enrollment.md` §2), now for teachers:

- The Ministry of Education runs **TMIS (Teachers Management Information System)**, alongside EMIS — schools are directed to register all teaching and non-teaching staff on it.
- **Registration is a legal requirement, not a formality**: per Section 11 of the Education Act, *"no person shall teach in any public or private school of any description unless he or she is registered as a teacher or licensed to teach."* Schools that don't comply risk staff being barred from teaching, and (per Ministry directives) delayed government payroll processing for government schools.
- As with LIN, expect **rollout friction** — deadlines have been extended before, and plenty of currently-teaching staff may not be registered yet even though they're legally required to be.

**Design implication — same pattern as LIN, not a stricter one:**
```
staff (id, tmis_number UNIQUE NULLABLE, tmis_status ['registered'|'pending'|'not_registered'],
       first_name, last_name, date_of_birth, gender, phone, email,
       qualification, employment_type ['government'|'private'|'pta'|'volunteer'], created_at)
```
- `tmis_number` nullable, `tmis_status` tracked separately — don't hard-block staff creation or subject allocation on having one, but surface it (an admin dashboard flagging "3 teaching staff not yet TMIS-registered" is useful; a hard gate that stops a school from running its timetable is not, given the rollout reality).
- `employment_type` matters practically in Uganda: government-payroll teachers, privately-paid staff, PTA-funded staff, and volunteers are genuinely different categories with different reporting/payroll implications — worth capturing even if you don't build payroll yet.

---

## 2. Staff enrollment history — same pattern as students, not a shortcut

Exactly the reasoning already applied to students (`student-enrollment.md` §1, §3): identity (`staff`) and school assignment (`staff_assignment`) are different things, because a teacher's relationship to a *specific* school is time-bound — they can transfer (common for government-posted teachers), work at more than one school at once (common for specialist subjects at small private schools), or leave.

```
staff_assignment (id, staff_id, school_id, academic_year_id,
                   role ['teacher'|'head_teacher'|'deputy'|'bursar'|'admin'|'support'],
                   entry_date, entry_type ['new_hire'|'transfer'|'government_posting'],
                   exit_date, exit_type ['transfer'|'resignation'|'retirement'|'government_reposting'],
                   status ['active'|'transferred_out'|'left'|'retired'], created_at)
```
- One row per staff member per school per period — never overwritten, same anti-pattern avoidance as `student_enrollment`.
- A staff member can have more than one **active** `staff_assignment` at once (teaching at two schools) — unlike students, this isn't an edge case to flag, it's normal for this context.
- This table is the gate for `subject_teacher_assignment` (§3) the same way `student_enrollment` gates subject selection — don't allow assigning someone to teach a subject at a school where they have no active `staff_assignment`.

---

## 3. Subject-teacher allocation

```
subject_teacher_assignment (id, school_id, subject_id, academic_year_id,
                             class_level_id, stream_id NULLABLE,
                             staff_id, is_lead,
                             status ['active'|'ended'], start_date, end_date,
                             assigned_by, created_at)

staff_subject_specialization (staff_id, subject_id)
```
- `stream_id` covers both O-Level admin streams (e.g. "S2 East") and A-Level combination-derived streams (e.g. "S5 PCM") — consistent with the decision already made in `subject-selection-module.md` §3.5 that A-Level streams are generally *derived from* combinations, so no separate `combination_id` field is needed here; the stream already carries that meaning.
- `stream_id` is nullable for the (mostly small-school) case where a subject is taught to a whole class level with no stream split.
- Time-bound like enrollment: a mid-year substitute teacher doesn't overwrite the original assignment — it closes the old row (`status = 'ended'`, `end_date` set) and opens a new one. This preserves the real teaching history for a term, which matters if a parent or the school later needs to know who was actually teaching a class at a given point.
- `staff_subject_specialization` is a lightweight, separate concept — which subjects a teacher is generally qualified to teach (used to populate a sensible candidate list when allocating), distinct from which subject they're *actually* assigned to teach right now. Don't conflate the two: specialization changes rarely; allocation changes every year or when staff turn over. It's also distinct from department membership, now modeled as holding a position in the org chart (`organization-studio.md` §1) — specialization is a teaching qualification, a position is an organizational role, and non-teaching staff hold the latter with none of the former.
- **A cross-stream teaching group (e.g. one combined General Paper class spanning several A-Level combination-streams) is a known real-world case flagged already in `subject-selection-module.md` §3.5, and it's still an open extension point here** — if/when you build full timetabling, you'll likely want a more general `teaching_group` concept that a `subject_teacher_assignment` can point at instead of a single `stream_id`. Don't build it prematurely; note it and move on.

---

## 4. The actual point of the request: allocate at the same time you configure the offering

This is the workflow change worth calling out explicitly. When a school (or its onboarding flow, per `school-onboarding-enrollment.md` §3 step 5) toggles a subject on via `subject_offering`, **the same screen should ask "who teaches this?"** rather than leaving it as a later, easy-to-forget task:

1. Admin enables `subject_offering` for, say, Biology at S2, for both streams (East/West).
2. **The same action** presents a teacher-assignment field per stream — pre-filtered to staff whose `staff_subject_specialization` includes Biology, pulled from whoever already has an active `staff_assignment` at this school.
3. Both writes — `subject_offering` and `subject_teacher_assignment` — happen together, the same one-screen pattern already used for student + guardian intake (`parent-guardian-module.md` §2). The admin experiences "turn on this subject and assign it" as one action, not two.
4. If no suitable staff member exists yet (a genuinely new subject the school just added, no teacher hired), let the subject stay "offered, unassigned" rather than blocking — but surface it clearly (§5) so it doesn't get forgotten.

This directly prevents the gap the earlier design left open: a subject could be marked `is_offered = true` with nobody actually assigned to teach it, discovered only when timetabling or a parent asks "who teaches my child's Biology?"

---

## 5. Extend the shared validation service

`subject-selection-module.md` §4 already proposed one validation service for "is this student's subject set valid." Extend the same idea to cover **setup completeness**, not just student choices:

```
subject_offering_validation_result (school_id, academic_year_id, is_complete, gaps: [
  {subject_id, class_level_id, stream_id, issue: "no_teacher_assigned"}
])
```
This is what lets an admin dashboard say "3 subjects still need a teacher" as a to-do list, rather than the gap surfacing silently at timetabling time or, worse, not until a parent complains.

---

## 6. Accounts and identity — no new mechanism needed

Nothing new here: `staff` slots into the unified accounts system exactly as designed in `accounts-module.md` — one-click "Create Account" on a staff profile, system-generated username + temporary password, delivered by email with an on-screen fallback, forced change on first login. The only staff-specific nuance already anticipated there is that staff, unlike most guardians, may reasonably prefer a traditional password over repeated re-authentication for heavy daily desk use — which the existing design already accommodates without a separate mechanism.

---

## 7. Summary

```
staff (id, tmis_number UNIQUE NULLABLE, tmis_status, first_name, last_name,
       date_of_birth, gender, phone, email, qualification, employment_type, created_at)
staff_assignment (id, staff_id, school_id, academic_year_id, role,
                   entry_date, entry_type, exit_date, exit_type, status, created_at)
subject_teacher_assignment (id, school_id, subject_id, academic_year_id,
                             class_level_id, stream_id NULLABLE, staff_id, is_lead,
                             status, start_date, end_date, assigned_by, created_at)
staff_subject_specialization (staff_id, subject_id)
```

This gives you:
- A teacher identity model that mirrors the student model's core discipline (identity vs. time-bound school relationship), including a real government identifier (TMIS number) treated with the same nullable/pending pattern as LIN.
- Subject allocation as a first-class, time-bound record — not a flag or a side note — so substitute teachers and mid-year changes don't overwrite history.
- Allocation folded into the same setup action as enabling a subject, closing the gap where a subject could be "offered" with nobody assigned to teach it, with a validation service to catch what still slips through.
