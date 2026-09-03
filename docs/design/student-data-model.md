# Student Data Model — Consolidated

Everything decided across `uganda-secondary-school-foundations.md`, `subject-selection-module.md`, `student-enrollment.md`, `schoolpay-integration.md`, `parent-guardian-module.md`, and `accounts-module.md`, pulled into one picture of "the student" as an implementable set of tables. Nothing new here — this is the assembled model, organized by concern, ready to build from.

---

## 1. The five concerns that make up "a student"

A student in this system isn't one table — it's **one identity row plus five satellite concerns**, each with its own lifecycle and its own reason to change independently of the others:

| Concern | Answers | Changes when |
|---|---|---|
| **Identity** | Who is this person? | Almost never (name correction, etc.) |
| **Enrollment** | Where/when are they attending? | Every school year, every transfer |
| **Subjects & combinations** | What are they studying? | S3 subject drop, S5 combination choice |
| **Guardianship** | Who's responsible for them? | Guardian changes, sponsor added |
| **Payment reconciliation** | How do their fees get matched? | School/provider changes |

Keeping these as separate tables (rather than flattening onto one wide `student` row) is the single decision that makes everything else in the prior docs — history-preserving enrollment, per-school payment codes, subject drop/re-add — actually work without special-casing.

---

## 2. Core identity

```
student (
  id                    -- internal PK, never exposed as "the" student ID
  lin                   -- Learner Identification Number, UNIQUE, NULLABLE
  lin_status            -- ['verified'|'pending'|'not_yet_issued']
  nin_guardian_reference-- links to a guardian's National ID, per EMIS convention
  first_name, last_name
  date_of_birth
  gender
  created_at
)
```
- `id` is what every other table foreign-keys to — internal, stable, never re-used.
- `lin` is the real-world cross-school anchor (§2 of `student-enrollment.md`) — unique when present, nullable because plenty of students won't have one yet.
- This table has **no school, no class, no "current" anything** — that's the point. A student's present situation is always read through `student_enrollment`, never stored here.

---

## 3. Enrollment & transfer

```
student_enrollment (
  id, student_id, school_id, academic_year_id, class_level_id, stream_id,
  entry_date, entry_type,      -- ['new_admission'|'transfer'|'repeat'|'re_admission_s5']
  exit_date, exit_type,        -- ['transfer'|'withdrawal'|'completion'|'no_show'] NULLABLE
  status,                      -- ['applied'|'admitted'|'active'|'transferred_out'|'withdrawn'|'graduated'|'no_show']
  created_at
)

transfer_record (
  id, student_id, from_school_id, to_school_id, lin,
  status,                       -- ['pending_release'|'released'|'claimed'|'completed']
  released_by, released_at, claimed_by, claimed_at
)
```
- One `student_enrollment` row **per student, per school, per academic year** — never overwritten, never spans years (§3/§4 of `student-enrollment.md`).
- At most one row with `status = 'active'` per student per school at any time.
- `transfer_record` is the two-sided workflow (release → claim) that produces a **new** `student_enrollment` row at the destination school, linked back by `lin` — not a mutation of the old one.
- This table is also the **gate**: nothing in §4 or later should accept records for a student at a school without a corresponding active `student_enrollment`.

---

## 4. Subjects & A-Level combinations

Everything from `subject-selection-module.md`, unchanged — repeated here for the full picture:

```
student_subject (
  id, student_id, subject_id, academic_year_id,
  status,                       -- ['active'|'dropped'|'added']
  status_changed_at, status_changed_by, reason
)

student_combination (
  id, student_id, combination_id, subsidiary_subject_id, academic_year_id,
  status,                       -- ['pending'|'confirmed'|'reassigned']
  selected_at, confirmed_by
)
```
- `student_subject` covers O-Level tier 1/2/3 subjects (core, religion, vocational) with the drop/add workflow and window enforcement.
- `student_combination` covers the single atomic A-Level choice (3 principal + 1 subsidiary, GP auto-enrolled).
- Both are **school-year-scoped**, matching the enrollment table's own scoping — a student's subject set is a property of a specific enrollment period, not the student globally.

---

## 5. Guardianship (data only — portal access is a separate layer)

```
guardian (
  id, first_name, last_name, nin, phone, email, relationship_to_student
)

student_guardian (
  student_id, guardian_id,
  role,                         -- ['parent'|'sponsor'|'guardian']
  is_primary_contact, is_fee_responsible, is_emergency_contact
)
```
- Many-to-many, with role flags — supports single parents, multiple sponsors, NGO/refugee sponsorship arrangements without schema changes.
- **Deliberately carries no login/portal identity.** For new enrollments, guardian data is captured at intake alongside the student (matched-or-created against existing guardian records by phone, so a returning parent gets linked rather than duplicated); bulk import populates the same tables with looser data-completeness expectations. The admin reconciliation tool for linking a guardian to children who pre-date the system lives in `parent-guardian-module.md`; login/portal access — shared across guardians, staff, and students via a one-click admin-driven flow — lives in `accounts-module.md`.
- Not scoped to a school or enrollment period — a guardian relationship generally persists across a student's transfers, unlike enrollment itself.

---

## 6. Payment reconciliation

```
student_payment_code (
  id, student_id, school_id, provider,   -- ['schoolpay']
  external_payment_code, is_active, linked_at
)
```
- Scoped per school, per provider — resolves SchoolPay's `studentPaymentCode` back to `student_id` via the pair `(school_id, external_payment_code)`.
- Deliberately separate from `lin` — one is a government cross-school identity, the other is a fees-provider-specific, per-school code that can legitimately change on transfer.

---

## 7. How the six tables relate

```
student ──┬── student_enrollment ──┬── school
          │        │                ├── academic_year
          │        │                ├── class_level
          │        │                └── stream
          │        │
          │        └── (gates) ──┬── student_subject ── subject
          │                      └── student_combination ── subject_combination
          │
          ├── student_guardian ── guardian
          │
          ├── student_payment_code ── school
          │
          └── transfer_record ── from_school / to_school
```

Read top to bottom for build order: `student` first (nothing works without identity), `student_enrollment` second (the gate everything else checks), then subjects/guardians/payment-codes in any order since they don't depend on each other — only on enrollment existing.

---

## 8. What's deliberately *not* on `student`

Worth stating explicitly, since it's the easiest thing to get pulled back into a wide table under deadline pressure:

- **No `current_school_id` / `current_class_id` / `current_stream_id`** — always derive "current" by querying `student_enrollment` for the active row. Storing it redundantly on `student` is exactly the anti-pattern flagged in `student-enrollment.md` §1.
- **No `combination_id` or `subject_ids[]`** — those belong to `student_combination`/`student_subject`, scoped to a year, not the student globally.
- **No `guardian_name` / `guardian_phone` flat columns** — those belong to `guardian`/`student_guardian`, supporting more than one guardian from day one.
- **No portal login fields on `guardian`, `staff`, or `student`** (password, phone-verified flag, session tokens) — those belong to the unified `account`/`account_link` tables in `accounts-module.md`, kept separate so profile data entry never implies or requires portal access.
- **No `schoolpay_code`** — belongs to `student_payment_code`, scoped per school.
- **No health, disciplinary, or other sensitive fields** bundled into this same table without their own access-control consideration — worth a separate, more tightly-permissioned table if/when you build those out, rather than adding columns here.
