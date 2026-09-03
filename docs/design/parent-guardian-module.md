# Parent/Guardian Module — Data Capture & Reconciliation

Design for guardian *data*: capturing who a student's guardians are, matching/reusing existing guardian records at intake, and reconciling duplicates that predate the system. **Login/portal access for guardians is not covered here** — that's unified across guardians, staff, and students in `accounts-module.md`, which this document links out to wherever an account is relevant. Extends §5 of `student-enrollment.md`.

---

## 1. Two layers, not one

| Layer | What it is | Created by | When |
|---|---|---|---|
| **`guardian`** | A data record: this person, with this relationship, to this student | School staff, at student intake (match-or-create, §2) or bulk import | At enrollment, going forward; backfilled for historical records |
| **`account` / `account_link`** | Login identity and the profiles it can access — shared machinery across guardians, staff, and students | Primarily one-click, admin-driven (see `accounts-module.md` §2) | Whenever an admin creates one, or a parent self-registers (§5 below, secondary path) |

The correction worth stating plainly: **the separation is between data and portal access, not between "creating a student" and "creating a guardian."** For a new admission, staff capture both in one intake flow; only the account layer is separate, and it now lives in its own module since the same machinery serves teachers and students too.

```
guardian (id, first_name, last_name, phone, email, nin, relationship_to_student,
          source ['bulk_import'|'intake'|'self_registered'], created_at,
          merged_into_guardian_id NULLABLE, merged_at, merged_by)
```

`student_guardian` (from `student-enrollment.md` §5) stays exactly as designed — it joins `guardian` to `student`. A student's guardian list is meaningful and complete the moment school staff enter it, regardless of whether any of those guardians ever get a login — login is a separate `account_link` pointing at this same `guardian.id`, defined in `accounts-module.md`.

---

## 2. Intake flow: match-or-create, done in the background

For a new enrollment, staff enter the parent's details on the same intake screen as the student — the system decides whether that's a new `guardian` row or an existing one, without asking staff to search first:

1. Staff enter guardian name + phone (+ optionally email/NIN) while creating the student.
2. **The system searches `guardian` by normalized phone number** (the most reliably-captured field) for an existing match.
3. **Exact match found** → reuse that `guardian_id`, create a new `student_guardian` row linking it to the new student. No duplicate created.
4. **No match, or an ambiguous/partial match** (e.g. same name, different phone) → create a new `guardian` row, and — only when the match is ambiguous rather than absent — surface a light prompt to staff ("A guardian named [X] already exists with a different phone — same person?") so an obvious case gets caught immediately rather than falling entirely to the cleanup workflow in §4.
5. Either way, this happens as **one transaction** alongside student creation — staff experience it as a single form, not two separate steps, even though `guardian` and `student` remain two separate tables underneath.

This handles the common case (a parent's phone number is captured consistently) automatically. It deliberately doesn't try to be clever about fuzzy name-matching at intake time — a wrong auto-link is worse than a missed one, and §4 exists precisely to catch what this step doesn't.

---

## 3. What this means for bulk import specifically

- Bulk import runs the **same match-or-create logic** where it can (matching by phone within the import batch, and against any guardians already in the system), but tolerates missing data — a student row with no guardian phone at all still imports cleanly, just without a `guardian` link yet.
- No `guardian_account` rows are ever created in bulk — there's no password to set, no phone to verify, nothing to invite yet.
- **The scenario you're planning for** — a parent had two children enrolled before the system existed, then enrolls a third child after go-live — plays out like this: the third child's intake creates (or matches) a `guardian` row through §2's normal flow. The two older children's historical records may have no `guardian` row at all (never captured), or a `guardian` row that didn't get matched (different phone captured at the time, or no phone at all). Either way, the new `guardian` row from the third child's intake **isn't automatically linked to the older two** — that's the job of §4.

---

## 4. Admin reconciliation: linking a guardian to pre-existing children

This is the explicit cleanup workflow for exactly the case you described — catching what intake-time matching missed, on the school's own schedule rather than blocking anything.

**Workflow:**
1. During a data-cleaning session (or triggered by a specific case — e.g. a parent mentions "my other two children are already here"), an admin searches the `guardian` table by name or phone.
2. The admin identifies that a `guardian` row just created (say, for the third child) represents the same real person as either (a) an existing separate `guardian` row already linked to the older two children, or (b) no guardian row at all for them yet.
3. **Case (a) — two guardian rows, same person:** the admin merges them. Pick a surviving `guardian_id`, reassign every `student_guardian` row pointing at the other one to the survivor, and mark the losing row `merged_into_guardian_id = <survivor's id>` rather than deleting it — this preserves an audit trail (who was linked to what, and when the merge happened) instead of silently erasing history.
4. **Case (b) — no guardian row existed for the older children:** simpler — the admin just adds new `student_guardian` rows linking the existing (already-correct) `guardian_id` to the older two students. No merge needed.
5. Either way, this is a **manual, admin-confirmed action** — not an automated background merge. Matching two guardian rows as "the same person" from name/phone alone is exactly the kind of fuzzy judgment call that's safe for a human familiar with the family to make and risky for the system to guess at silently. Note this is purely a `guardian`/`student_guardian` data operation — it has nothing to do with accounts, so it works identically whether or not that guardian has ever logged in.

```
-- admin reconciliation screen, conceptually:
search guardian by name/phone →
  found existing unlinked guardian(s) for this family? →
    merge (update guardian.merged_into_guardian_id, reassign student_guardian rows)
    OR simply add missing student_guardian rows if no duplicate row exists
```

This is a genuinely different action from §5's account-linking — it operates purely on `guardian`/`student_guardian` data and needs no parent involvement at all, which is exactly why it can happen "in the administrator's free time," independent of whether that parent ever adopts the portal.

---

## 5. Portal access — now primarily one-click, admin-driven (see `accounts-module.md`)

Separate again from §4's admin-side data merge: this is how a guardian gets an actual login. The **primary path**, matching how the rest of the system is meant to feel for a casual admin user, is the one-click "Create Account" action on a guardian's profile screen — no form, no verification step, described fully in `accounts-module.md` §2. That flow reuses the phone number already on the `guardian` row and creates an `account` + `account_link` in one action.

A **secondary path** remains for a parent who shows up wanting access before any admin has pressed that button for them — self-service registration plus a claim request (LIN/admission number + a fact the school already has on record), approved by staff before it's active. Use this as a fallback, not the default design center.

Either way, one `account` can link to **multiple `guardian` rows** — including rows at different schools, for different children — so a parent still sees all their children through the account layer even if §4's reconciliation hasn't fully caught up yet, and revocation (custody changes, a wrong link) happens on the link, not by deleting the historical `guardian` row.

---

## 6. The "cold start" case: no guardian data at all

For genuinely old records where no guardian information was ever captured, there's nothing yet to attach an account to. Handle this as a light admin action, not a schema gap: staff create the `guardian` row (and `student_guardian` link) on demand when the parent actually shows up wanting access, then use the one-click account creation flow. No need to pre-populate placeholder guardian rows for every historical student "just in case" — create them when there's a real reason to.

---

## 7. Summary

```
guardian (id, first_name, last_name, phone, email, nin, relationship_to_student,
          source, created_at, merged_into_guardian_id NULLABLE, merged_at, merged_by)
student_guardian (student_id, guardian_id, role, is_primary_contact,
                   is_fee_responsible, is_emergency_contact)
```
(Login — `account` / `account_link` — is defined once, shared across guardians/staff/students, in `accounts-module.md`.)

This gives you:
- **Guardian data captured at intake for new enrollments**, matched-or-created automatically against phone number so the common case (same parent, another child) links correctly without staff having to search manually.
- **Bulk-imported historical students fully decoupled from portal adoption**, with thin or absent guardian data treated as an acceptable, backfillable gap rather than a blocker.
- **An explicit admin reconciliation tool** for exactly the "parent had children before the system, now enrolling a new one" case — a deliberate, human-confirmed merge or link action, auditable via `merged_into_guardian_id`, run on the school's own schedule.
- **Portal access handled once, for everyone** — guardians, staff, and students share the same one-click creation flow and the same underlying `account`/`account_link` tables, rather than three parallel login systems.

