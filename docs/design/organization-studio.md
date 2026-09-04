# Organization Studio — Org Chart & HR Structure

Generalizes the flat department-membership model in `departments-module.md` into a full organizational hierarchy: one tree spanning school leadership (Head Teacher, DOS, Dean...) down through department heads to individual staff — giving both the HR structure *and* a literal renderable org chart from the same data. Supersedes `departments-module.md` §4 (`staff_department`); `department`/`department_subject`/the catalog-seeding approach are unchanged and still the base building block underneath this.

---

## 1. One tree, from Head Teacher down to the cleaning staff

The request that shapes this: not just "which department is someone in" but "draw me the actual reporting chart" — Head Teacher → DOS/Deputy → Dean → departments → the staff within each. That's a single hierarchy, best modeled as one generalized structure rather than separate leadership/department/staff layers bolted together:

```
position (id, school_id, title, category ['executive'|'department_head'|'teacher'|'non_teaching'],
           parent_position_id NULLABLE, department_id NULLABLE, is_unique BOOL, created_at)
staff_position (id, staff_id, position_id, academic_year_id, start_date, end_date, status, created_at)
```

- Every node in the chart — "Head Teacher," "Director of Studies," "Dean of Students," "Head of Physics Department," "Physics Teacher," "Head of Cleaning Department," "Cleaner" — is one row in `position`, connected to its parent via `parent_position_id`.
- `is_unique = true` for roles that should only ever have one active holder at a time (Head Teacher, DOS, Dean, every Head of Department) — `false` for roles many people hold simultaneously (Physics Teacher, Cleaner).
- `staff_position` is who currently (or historically) occupies a position — time-bound like everything else staff-related (`teacher-staff-module.md` §2), so a leadership change or a HOD rotation doesn't erase who held the role and when.
- **The org chart itself is just this tree, rendered.** Walk from the root position(s) (no parent) down through `parent_position_id`, showing each node's title and its current occupant(s) via `staff_position`. There's no separate "chart" data structure to maintain — it's a direct read of `position` + `staff_position`.

---

## 2. Departments auto-generate their own position nodes — the "same point" principle, one step further

You confirmed the default pattern is **one department per subject**, not broad clusters (Sciences containing three subjects) — so automate it directly:

- When a school enables a subject via `subject_offering` (`subject-selection-module.md` §2.1), the system automatically creates: a matching `department` (e.g. "Physics Department") + a `position` for "Head of Physics Department" (`is_unique = true`, `department_id` set) + a generic `position` for "Physics Teacher" (`is_unique = false`, same `department_id`) — both parented under whichever leadership position the school has designated to oversee academics (typically Deputy Head Teacher–Academics/DOS).
- This extends the principle already established in `teacher-staff-module.md` §4 ("allocate at the same point you configure the offering") one step further: enabling a subject now creates its department *and* its place in the org chart automatically, rather than three separate manual admin actions.
- `subject_teacher_assignment` (the actual teaching duty, `teacher-staff-module.md` §3) and `staff_position` (holding the "Physics Teacher" node) end up describing largely the same fact from two angles — one is about teaching duty/timetabling, the other about org structure. Keep them as separate tables, but wire the same one-screen action to write both, exactly like the "enable subject + assign teacher" pattern already established.
- `department_subject` stays a join table rather than a strict 1:1 column, so a school that wants to merge two subjects under one department (e.g. folding a low-enrollment subject into a related one) can still do that — auto-generated 1:1 is the default, not the only option.

---

## 3. Non-teaching departments — same catalog-seeding, admin-placed in the tree

Cleaning, catering/cooking, security, and "any other department the school decides to create" have no subject to auto-derive from, so they follow `departments-module.md` §3 exactly: seed a catalog of common non-academic departments, let the admin toggle on the ones they run, add a custom one when needed.

The difference from academic departments: **the admin chooses where each one sits in the tree** — typically under Bursar or Deputy Head Teacher–Administration rather than the academic branch — since this varies by school and isn't something the platform should assume. Creating a non-teaching department should prompt "who does this report to?" as part of the same setup action, the same one-screen principle used throughout this design.

---

## 4. The leadership tier is admin-configured, from a starter template

The top of the tree — Head Teacher, DOS, Deputy Head Teacher(s), Dean of Students, Bursar — genuinely varies school to school (some combine Deputy and DOS into one role; some split Deputy into Academics/Administration; not every school has a Dean). Don't hardcode a single structure:

- Offer a **starter template** matching a common secondary school structure (Head Teacher → Deputy Head Teacher–Academics/DOS and Deputy Head Teacher–Administration → Dean of Students, Bursar, Heads of Department) that a school can accept as-is or edit — same "seed, don't force construction" principle used for combinations and departments.
- Let the admin add, rename, remove, or re-parent leadership positions freely at this tier — this is genuinely bespoke per school in a way subject departments aren't.
- Once the leadership tier exists, everything below it attaches by picking a parent from this tier — that's the one decision the admin makes per department; everything else auto-generates per §2/§3.

---

## 5. Validation

- **`is_unique = true` positions**: at most one active `staff_position` per position per academic year — the rule already proposed for Head of Department in `departments-module.md` §4, now generalized to cover every singleton role in the tree (Head Teacher, DOS, Dean, every HOD), via the same shared validation service pattern from `subject-selection-module.md` §4.
- **The tree must stay acyclic** — a position can't (directly or transitively) be its own parent. A straightforward check on save: walk up `parent_position_id` from the proposed new parent and reject if it reaches the node being edited.

---

## 6. Relationship to `departments-module.md`

- `department`, `department_subject`, and the catalog-seeding approach (§2–3 of that doc) are unchanged.
- `staff_department` (§4 of that doc) is **superseded** by `position` + `staff_position` here — department membership and headship are now expressed as holding a position in the tree, which gives you the org chart for free instead of a flat membership list.

---

## 7. Summary

```
position (id, school_id, title, category, parent_position_id NULLABLE, department_id NULLABLE,
           is_unique, created_at)
staff_position (id, staff_id, position_id, academic_year_id, start_date, end_date, status, created_at)
```
(`department`, `department_catalog`, `department_subject` unchanged from `departments-module.md`.)

This gives you:
- A literal, renderable org chart from Head Teacher down to individual cleaning staff, generated from one tree rather than assembled from disconnected department/employment tables.
- Subject departments that auto-create alongside `subject_offering` — one admin action produces the subject, its department, its Head of Department slot, and its place in the chart.
- Non-teaching departments still catalog-seeded, with the admin only deciding where each one sits in the tree.
- Leadership structure as an admin-editable starter template, since it's the one part of this that genuinely varies school to school.
