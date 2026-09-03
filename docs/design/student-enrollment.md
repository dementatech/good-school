# Student Enrollment — How Trusted Systems Model It

Research grounding for the enrollment module: what established Student Information Systems (Ed-Fi/PowerSchool-class systems) treat as non-negotiable, cross-checked against how Uganda's own government system (EMIS) already handles learner identity and transfer. Companion to `uganda-secondary-school-foundations.md` (academic structure), `school-onboarding-enrollment.md` (school/tenant onboarding), `subject-selection-module.md` (subject/combination selection), `parent-guardian-module.md` (guardian data capture and reconciliation), and `accounts-module.md` (unified login for guardians, staff, and students).

---

## 1. The single most important decision: identity vs. enrollment are two different things

Every mature SIS — and Ed-Fi, the widely-adopted US K-12 data standard maintained by the Michael and Susan Dell Foundation, states this as an explicit best practice — separates:

- **The student's identity** (a `Student` record: who they are, permanent, exists once) from
- **An enrollment** (a school-year-scoped association between that student and a specific school).

A student is **one row**, ever, in your system (barring genuine duplicate-merge cases). Their enrollment history is **many rows**, one per school per year (per Ed-Fi's core rule: *"minimally one enrollment SSA per SchoolYear and minimally one SSA per GradeLevel"*). Conflating these — e.g. storing "current class" and "current school" directly on the student record and overwriting it each year — is Ed-Fi's explicitly named **anti-pattern** ("Multi-Year Enrollments"): if a student enrolled in S1 in 2024 and you're now updating their record for S3 in 2026, overwriting the original entry data loses the true history of *when* each enrollment period actually happened.

```
student (id, lin, first_name, last_name, date_of_birth, gender, ...permanent identity fields)
student_enrollment (id, student_id, school_id, academic_year_id, class_level_id, stream_id,
                     entry_date, entry_type, exit_date, exit_type, status, created_at)
```
`student_enrollment` is your platform's equivalent of Ed-Fi's `StudentSchoolAssociation` (SSA) — the core enrollment entity everything else hangs off.

---

## 2. Verified: Uganda already has a national answer to "persistent student ID" — use it

This is the most consequential finding for your schema, and it resolves a question I'd left open in the foundations doc (§6.3, cross-curriculum transfers).

- Uganda's Ministry of Education runs **EMIS** (Education Management Information System), which issues every learner a **LIN — Learner Identification Number** — a unique identifier that **follows the learner from pre-primary through university**, not just within one school.
- The LIN is **linked to the learner's (or their parent/guardian's) National Identification Number (NIN)** issued by NIRA, tying school records to the national ID system.
- **LIN is now a mandatory requirement for UNEB registration** — a Ministry directive requires all S1 entrants to provide their LIN before being admitted; students who don't know it are told to retrieve it from their primary school.
- **Transfers are LIN-mediated, not ad hoc**: when a learner changes schools, the *current* school must authorize the transfer in EMIS before the new school can enroll them and pull their data across — described explicitly as reducing "ghost learners" (schools inflating enrollment numbers for funding) by making transfers traceable and learners "easily verifiable."

**Design implication — treat LIN as the canonical cross-school identity, not an optional field:**
```
student (id, lin UNIQUE NULLABLE, nin_guardian_reference, first_name, last_name,
         date_of_birth, gender, created_at)
```
- Make `lin` unique where present, but **nullable** — a brand-new S1 entrant, a pre-EMIS-era existing student, or a school still catching up on EMIS registration may not have one yet (real, ongoing rollout friction per the sources — several districts/schools were still behind on EMIS registration years after launch). Don't hard-block enrollment on having a LIN; instead track a `lin_status` (`verified` / `pending` / `not_yet_issued`) so your admin UI can flag gaps without freezing the workflow.
- **This is your duplicate-detection anchor.** Uganda's own stated purpose for LIN is fighting duplicate/ghost learner records — lean on the same logic: when a LIN is present, enforce uniqueness at the database level; when it's absent, fall back to a fuzzy match (name + date of birth + guardian contact) and surface likely duplicates for manual review rather than silently creating a second record.
- **Model transfer as an authorization workflow, not a unilateral action** — this directly validates and sharpens the `transfer_record` concept from the foundations doc: a transfer should have a `status` that includes something like `pending_release_from_current_school`, mirroring the real EMIS process where the losing school must release the learner before the gaining school can claim them.
```
transfer_record (id, student_id, from_school_id, to_school_id, lin,
                  status [pending_release|released|claimed|completed],
                  released_by, released_at, claimed_by, claimed_at)
```

---

## 3. Reconciling with SchoolPay: the `studentPaymentCode` problem

LIN solves cross-school identity at the *government* level. It does **not** solve reconciliation with SchoolPay, whose transaction/webhook payloads (see `schoolpay-integration.md` §3) key payments off their own `studentPaymentCode` — an identifier that:
- Is assigned **on SchoolPay's own school portal**, independently of your platform and independently of LIN.
- Is **per-school**, not a global learner ID — the same physical student could plausibly get a different SchoolPay payment code if they transfer to another school that also uses SchoolPay, since each school administers its own SchoolPay account.
- Is **not guaranteed to equal `studentRegistrationNumber`** either (SchoolPay's own sample data shows that field frequently blank) — so don't try to derive one from the other.

**Don't put `schoolpay_payment_code` directly on `student`.** A flat column assumes one code per student for life, which breaks the moment a student transfers between two SchoolPay-using schools, or if a school ever changes payment providers. Model it the same way you modeled `payment_provider_credential` (per school) — as a **scoped mapping row**, joined to the enrollment context it actually belongs to:

```
student_payment_code (id, student_id, school_id, provider ['schoolpay'],
                       external_payment_code, is_active, linked_at)
```

**Reconciliation flow this enables:**
- When a SchoolPay transaction or webhook arrives (`fee_payment` from `schoolpay-integration.md` §3/§5) carrying `studentPaymentCode` + the school's own `schoolCode`, look up `student_payment_code` by `(school_id, external_payment_code)` to resolve the internal `student_id` — a two-part key, not a bare code lookup, since the same numeric code could theoretically exist under two different schools' SchoolPay accounts.
- **Capture the code at enrollment time, not payment time.** Add it as an optional field on the enrollment/admin intake screen ("SchoolPay payment code, if known") — schools already have this code sitting in their own SchoolPay portal per student, so it's a lookup/copy for the admin, not new data entry. If it's not known yet (e.g. a brand-new student not yet added to the school's SchoolPay portal), leave `student_payment_code` unset and let the reconciliation admin screen (below) catch the first unmatched payment instead of blocking enrollment on it.
- **Unmatched-payment safety net.** Inevitably some payments will arrive with a `studentPaymentCode` your `student_payment_code` table doesn't yet have (new student, code entered late, typo on the school's SchoolPay side). Don't drop these — land them in `fee_payment` with a `student_id = NULL` / `match_status = 'unmatched'` and surface an admin screen to manually link them to a student, which then **backfills** `student_payment_code` for next time. This is the same "reconciliation screen, not silent failure" pattern already recommended in `schoolpay-integration.md` §6 for `studentClass` label mismatches — payment code mismatches deserve the identical treatment.
- **One student, multiple codes over time is normal, not a bug** — keep `is_active` rather than deleting a row when a code is superseded (e.g. re-issued by the school), so historical payments made under the old code still resolve correctly.

This keeps LIN (government-level, cross-school, rarely changes) and SchoolPay's payment code (provider-level, per-school, can legitimately change) as two separate identifiers serving two separate reconciliation needs — don't conflate them or assume one implies the other.

---

## 4. The enrollment lifecycle (states, not a single flag)

Following Ed-Fi's `EntryType`/`ExitWithdrawType` pattern — every enrollment period has a **reason for starting** and, once it ends, a **reason for ending**. Don't just track "active/inactive"; track *why*.

| Stage | What it means | Analogous Ed-Fi concept |
|---|---|---|
| `applied` | Inquiry/application submitted, not yet decided (mainly relevant for private/international schools with a selective admissions process) | Application process (outside Ed-Fi's core enrollment model — a pre-enrollment step) |
| `admitted` | Accepted, not yet started attending | — |
| `active` | Currently enrolled and attending | Active SSA (has `entry_date`, no `exit_date`) |
| `transferred_out` | Left for another school | SSA closed with `ExitWithdrawType = transfer` |
| `withdrawn` | Left without a known destination (dropped out) | SSA closed with `ExitWithdrawType = withdrawal` |
| `graduated` | Completed the cycle (UCE/UACE) | SSA closed with `ExitWithdrawType = completion` |
| `no_show` | Admitted/enrolled but never actually attended | Explicitly named in Ed-Fi: close the SSA with an exit date/type reflecting the no-show, **don't delete the record** |
| `repeating` | Re-enrolled in the same class level | New SSA for the new year, referencing the same student |

**Hard rules worth enforcing at the application layer, matching Ed-Fi's stated business rules:**
- A student should have **at most one active enrollment per school** at any time.
- If (rarely) enrolled at two schools simultaneously — e.g. a mid-year transfer overlap — mark one as primary.
- **Never delete an enrollment record** except for genuine data-entry mistakes; a withdrawal-then-return creates a **new** enrollment period, not a reopened old one. This preserves an audit trail that matters for transcripts, UNEB registration history, and dispute resolution (e.g. a parent disputing fee liability for a period the student says they'd already left).
- **Don't combine adjacent enrollment periods** even if the exit date of one matches the entry date of the next — keep them as distinct rows; collapsing them loses the "this was actually two separate enrollment decisions" fact.

---

## 5. Responsibility is separate from enrollment (guardians, sponsors, funders)

Ed-Fi models this explicitly as a **separate entity** (`StudentEducationOrganizationResponsibilityAssociation`) from the enrollment record itself — because "who is enrolled where" and "who is responsible for/accountable for this student" are genuinely different relationships that don't always point at the same place. Uganda's own system reinforces this: LIN is linked to a **guardian's NIN**, not the student's own — guardianship is a first-class relationship in the national data model, not an afterthought.

Practical Ugandan cases where this separation earns its keep:
- **Multiple guardians** — a student may have a mother, father, and/or sponsor (common with NGO-sponsored or orphaned/vulnerable-child learners), each potentially with different rights (who receives report cards, who's contacted in an emergency, who's billed for fees).
- **Boarding students with a distant guardian** — the enrolling school isn't necessarily where the "responsible adult" lives; fees/communication may route to a guardian who isn't local to the school at all.
- **Refugee/displaced learners** — Uganda hosts a large refugee population, and NGO or UNHCR-linked sponsorship arrangements are a real, recurring pattern, not an edge case to bolt on later.

```
guardian (id, first_name, last_name, nin, phone, email, relationship_to_student)
student_guardian (student_id, guardian_id, role [parent|sponsor|guardian],
                   is_primary_contact, is_fee_responsible, is_emergency_contact)
```
Keep `student_guardian` as a many-to-many join with role flags, rather than a fixed "father/mother" pair of columns on `student` — it accommodates single guardians, multiple sponsors, and non-parent guardians without schema changes later.

**This table is data only — it carries no login/portal access.** For new enrollments, guardian data is captured as part of the same intake flow as the student (matched-or-created against existing guardians automatically); admin-driven reconciliation for pre-existing children lives in `parent-guardian-module.md`, and login/portal access (shared with staff and students) lives in `accounts-module.md`. This is what lets bulk-imported historical students with thin or absent guardian data import cleanly, and lets portal adoption lag enrollment indefinitely without any of these models corrupting each other.

---

## 6. Enrollment as the trigger for everything else

Ed-Fi's dependency ordering is instructive: **a `Student` record must exist before any enrollment (`SSA`) can be written**, and the enrollment record is what everything downstream (attendance, subject selection, grading, fees) keys off. Translate that into your build/validation order:

1. `student` (identity) must exist — created once, whether from a fresh application or a bulk import.
2. `student_enrollment` (this school, this year, this class/stream) is created — this is the actual "enrollment" event.
3. **Only after** an active enrollment exists should downstream modules accept records for that student at that school: subject selection (`student_subject`/`student_combination` from `subject-selection-module.md`), fee invoicing, attendance, exam registration.
4. Enforce this as a real constraint (reject "add subject" for a student with no active `student_enrollment` at that school/year) rather than trusting application flow to always call things in the right order — bulk imports and admin tools are exactly where this gets bypassed by accident.

---

## 7. What this means for your enrollment form/workflow

Pulling together §1–6 into an actual intake flow:

1. **Identity check first** — before creating a new `student` row, search for an existing one by LIN (if known) or fuzzy-match (name + DOB + guardian contact). This is the ghost-learner/duplicate-prevention step Uganda's own EMIS was built around — don't skip it for the sake of a faster form.
2. **Capture or flag LIN status** — `verified` (learner provides LIN, ideally checked against EMIS if you ever get API access), `pending` (school will register them with EMIS separately), or `not_yet_issued` (very new learner). Don't block enrollment on this, but make it visible and trackable — schools are already under a Ministry directive to chase this down for S1 entrants specifically.
3. **If transferring in from another school** — route through the `transfer_record` workflow (§2), not a fresh "new student" form; this preserves the LIN linkage and prior academic history rather than starting a disconnected new identity.
4. **Create the `student_enrollment` record** with `entry_type` (new admission / transfer / repeat / re-admission from S4→S5) and assign class level/stream.
5. **Attach guardian(s)** via `student_guardian`, with at least one marked `is_primary_contact` and one `is_fee_responsible` (they may be the same person, but don't assume it).
6. **Only then** open subject selection (§6 above) — the enrollment record is the gate.

---

## 8. Summary of new/updated entities

```
student (id, lin UNIQUE NULLABLE, lin_status, nin_guardian_reference,
         first_name, last_name, date_of_birth, gender, created_at)
student_enrollment (id, student_id, school_id, academic_year_id, class_level_id, stream_id,
                     entry_date, entry_type, exit_date, exit_type, status, created_at)
transfer_record (id, student_id, from_school_id, to_school_id, lin,
                  status [pending_release|released|claimed|completed],
                  released_by, released_at, claimed_by, claimed_at)
guardian (id, first_name, last_name, nin, phone, email, relationship_to_student)
student_guardian (student_id, guardian_id, role [parent|sponsor|guardian],
                   is_primary_contact, is_fee_responsible, is_emergency_contact)
student_payment_code (id, student_id, school_id, provider ['schoolpay'],
                       external_payment_code, is_active, linked_at)
```

This gives you a foundation that:
- Never conflates identity with a point-in-time enrollment, matching the explicit anti-pattern Ed-Fi warns against.
- Uses Uganda's own real national identifier (LIN) as the cross-school anchor, rather than inventing a platform-only ID that fragments the moment a student transfers.
- Models guardianship/responsibility as its own relationship, ready for multi-guardian, sponsor, and refugee/displaced-learner cases that are common in Uganda, not exceptional.
- Treats transfer as a two-sided authorization workflow (release, then claim) matching how EMIS itself already requires it to work — so your platform doesn't invent a process that conflicts with what schools are already required to do nationally.
- Keeps LIN (government identity) and SchoolPay's payment code (fees reconciliation) as two separate, independently-scoped identifiers, so a transfer or a provider change never silently breaks payment matching.
