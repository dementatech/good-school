# Departments Module

Design for grouping staff — both teaching and non-teaching — into departments, distinct from (but related to) the concepts already established in `teacher-staff-module.md`. Extends that document and `subject-selection-module.md` (subject catalog). Department *membership and headship* — including the full reporting hierarchy and org chart — are handled in `organization-studio.md`, which builds directly on top of the `department`/`department_subject` entities defined here.

---

## 1. Three staff-related concerns, not one — department is the third

`teacher-staff-module.md` already separated two: `staff_assignment` (is this person employed at this school, this year) and `subject_teacher_assignment` (which specific subject/stream are they teaching). **Department is a third, different concern**, easy to conflate with either but answering a different question:

| Concern | Answers | Where it's defined |
|---|---|---|
| **`staff_assignment`** | Is this person employed at this school this year? | `teacher-staff-module.md` §2 |
| **`subject_teacher_assignment`** | Which specific subject/stream are they teaching? | `teacher-staff-module.md` §3 |
| **`department`** *(this doc)* | Which organizational group do they belong to — for coordination, reporting, and non-teaching roles that don't map to a subject at all? | Here |

The reason department needs its own model rather than being inferred from `subject_teacher_assignment`: **non-teaching staff have no subject to derive a department from at all.** A bursar, librarian, matron, or security guard belongs to a department (Finance, Library, Boarding/Welfare, Administration) with no `subject_teacher_assignment` row anywhere — so department membership has to be its own explicit relationship, not a side-effect of subject allocation.

---

## 2. Two department types, same table

Ugandan secondary schools generally organize departments into two kinds, both worth modeling the same way rather than as separate structures:

- **Academic departments** — the default and most common pattern is **one department per subject** (a "Physics Department," a "Chemistry Department," a "Mathematics Department" — each covering everyone who teaches that subject), rather than broad multi-subject clusters. A school that prefers to cluster related subjects (e.g. one "Sciences Department" spanning Physics/Chemistry/Biology) can still do that — `department_subject` supports either — but per-subject is the default `organization-studio.md` auto-generates from, so design the common path around it rather than clustering.
- **Non-academic departments** — administrative/support functions with no subject at all (Bursar's/Finance, Administration, Library, Boarding/Welfare (matron/patron), Discipline & Guidance/Counselling, Sports & Games, Health/Sickbay, Security, Catering, Cleaning).

```
department_catalog (id, name, department_type ['academic'|'non_academic'], default_subject_ids[])
department (id, school_id, catalog_id NULLABLE, name, department_type, created_at)
department_subject (department_id, subject_id)  -- typically one row per academic department (1:1 with its subject)
```

`department_subject` links an academic department to the subject(s) it covers, drawing on the same `subject` catalog from `uganda-secondary-school-foundations.md` §3 — this is what lets you later aggregate things like exam performance by department, not just by individual subject.

---

## 3. Seed from a catalog — same UX principle as combinations

The same reasoning already applied to A-Level combinations (`subject-selection-module.md` §3.2b: "selection, not construction") applies here, with one refinement for the academic side: since the default is one department per subject, **academic departments should auto-generate the moment a subject is enabled** (see `organization-studio.md` §2) rather than needing a separate toggle-list at all — a school doesn't "select" a Physics Department from a catalog, it gets one automatically because it offers Physics.

Non-academic departments still work as a toggle-list, since they have no subject to derive from:
- Seed a platform-wide `department_catalog` of common non-academic departments (Administration, Finance/Bursar, Library, Boarding/Welfare, Guidance & Counselling, Sports & Games, Health, Security, Catering, Cleaning).
- The school-facing setup screen is a **toggle-list**: tick which non-academic departments the school actually runs.
- Keep "Add a custom department" as a secondary action for anything non-standard — a school-specific department the catalog doesn't cover.

---

## 4. Membership and headship — see `organization-studio.md`

Department membership and Head of Department status are modeled as positions in a full organizational hierarchy, not a standalone membership table — see `organization-studio.md` §1–2 for the `position`/`staff_position` model, why headship is a tree node rather than a role flag, and how it connects to the school's broader reporting structure (Head Teacher, DOS, Dean, and so on).

---

## 5. Department vs. subject specialization — don't conflate

Worth stating plainly since the two look similar: `staff_subject_specialization` (`teacher-staff-module.md` §3) is about **what a teacher is qualified to teach**; department membership (now a `position` in `organization-studio.md`) is about **which organizational group they report into and coordinate with**. They usually correlate (a Physics specialist is probably in the Physics department) but they're not the same relationship — a department also needs to hold non-teaching staff who have no subject specialization at all.

---

## 6. Summary

```
department_catalog (id, name, department_type, default_subject_ids[])
department (id, school_id, catalog_id NULLABLE, name, department_type, created_at)
department_subject (department_id, subject_id)
```
(Membership, headship, and the reporting hierarchy — `position` / `staff_position` — are defined in `organization-studio.md`.)

This gives you:
- Departments that cover **both teaching and non-teaching staff** through one model, rather than a subject-derived grouping that leaves non-teaching staff with nowhere to belong.
- **Academic departments auto-generated per subject** (the confirmed default), with clustering still possible for schools that prefer it.
- **Non-academic departments catalog-seeded**, so setting up the administrative side of a school's structure is a toggle-list, not a blank form.
- A clean base for `organization-studio.md` to build the actual reporting hierarchy and org chart on top of, without this document needing to know about positions, leadership, or headship itself.
