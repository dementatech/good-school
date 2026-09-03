# Accounts Module — Unified Login, Separate from Profile Data

One system for authentication across every person-type — parents, teachers, students — kept entirely separate from the profile/data tables (`guardian`, `staff`, `student`) they're attached to. Designed around a one-click, admin-driven creation flow so a non-technical school admin never has to think about "registering an account" as a distinct manual task. Generalizes and supersedes the `guardian_account`/`guardian_account_link` tables sketched in `parent-guardian-module.md` — that document now covers guardian *data* only; this one covers login for everyone.

---

## 1. Why one unified system, not three

Parents, teachers, and students all eventually need to log in. Building three separate account systems (a guardian login table, a staff login table, a student login table) means three password-reset flows, three OTP integrations, three login screens to maintain, and three places a security fix has to be applied. Build it once:

```
account (id, username UNIQUE, email NULLABLE, phone NULLABLE,
         password_hash, password_status ['temporary'|'active'], must_change_password BOOL DEFAULT true,
         status ['active'|'suspended'], created_via ['admin_one_click'|'self_registration'],
         created_by, created_at)

account_link (id, account_id, profile_type ['guardian'|'staff'|'student'], profile_id,
              status ['active'|'revoked'], linked_at, linked_by)
```

- `account` is the login identity — nothing about *who* the person is in the school; that stays entirely in `guardian`/`staff`/`student`.
- `username` is **always system-generated**, never the person's email or phone directly — this decouples "how you log in" from "how we reach you," so an email or phone changing later never breaks the login identifier itself. Email/phone stay as optional contact fields.
- `account_link` is the join, tagged with which kind of profile it points at. One account can link to **more than one profile** — this is what already let a parent see multiple children in the earlier design, and it now also covers the edge case of one person holding two roles at the same school (a teacher who's also a parent there gets one account, linked to both their `staff` row and their `guardian` row, once the account-creation flow recognizes a duplicate — see §4).

---

## 2. The one-click creation flow (the primary path)

This is the actual UX you're asking for, and it should be genuinely this simple:

1. On any profile screen — a guardian's page, a teacher's page, a student's page — show a single status: **"Account: Not created"** with a **[Create Account]** button, or **"Account: Active"** if one already exists.
2. Pressing the button does everything in one action:
   - The system **generates a username** (e.g. `PAR-048213` / `STU-014532` / `TCH-000231` — role prefix + a unique sequential or random number) and a **random temporary password**.
   - Creates the `account` row: `username`, `password_hash` of the temp password, `password_status = 'temporary'`, `must_change_password = true`.
   - Creates the `account_link` row, pointing at this profile.
   - Sets `status = 'active'` immediately — no separate verification step, because an admin acting from inside the system on a record they can already see and edit *is* the verification.
3. **The credentials get to the person via email** (§3) — copied from the profile's email if present, sent automatically the moment the account is created. The admin still sees the username + temporary password displayed once on screen at the same moment, so there's always a fallback if email delivery fails or the profile has no email on file (§3).
4. If the profile has neither an email nor a phone at all, the button still works — it just means the admin has to hand over the on-screen credentials manually (write them down, print a slip) rather than relying on email. It's a smaller ask than requiring an email up front.

The "has account" status is **shown** as a simple Yes/No + button — matching exactly what you asked for — but it's best implemented as a *derived* state (does an active `account_link` exist for this profile?) rather than a separately-stored flag that could drift out of sync with reality if an account gets revoked later. The UI experience is identical either way; the underlying data just stays trustworthy.

---

## 3. Credential delivery: system-generated password, sent by email, forced change on first login

OTP was the first instinct because it removes the "how do we hand over a password" problem — but it costs real money per message at any real scale, which is the right thing to avoid for a bootstrapped platform. The alternative that keeps the flow just as simple without a recurring SMS bill:

- **The system generates both the username and a temporary password** — the admin never invents anything, never types a credential in by hand.
- **Delivery is by email**, sent automatically the moment the account is created, if the profile has an email on file. Email sending is close to free at any volume that matters early on, unlike SMS.
- **The credentials are also displayed once on screen to the admin at creation time** — this is the fallback for the real gap in relying on email alone: not every guardian (and not every student) will have an email address on file, especially for older/bulk-imported records or younger students. Whoever doesn't have email still gets a working account; the admin just has to relay the username/password another way (verbally, a printed slip at the school office) instead of it arriving automatically.
- **`must_change_password = true` forces a password change on first successful login**, before the person can do anything else in the system. This is the actual security backstop — a temporary password that traveled by email or was read aloud at a front desk should never remain the permanent password.
- After the first change, `password_status` flips to `'active'` and `must_change_password` to `false`.
- **Resetting**, later: if the person forgets their password, either (a) they have an email on file and a normal "forgot password" link sends a reset token there, or (b) an admin uses a **"Reset Password"** action on their profile — functionally the same one-click flow as account creation, generating a fresh temporary password, flipping `must_change_password` back to `true`, and re-sending/re-displaying it the same way.
- Store only the password hash — the plaintext temporary password should never be retrievable again after the one-time display/email; a lost temp password means regenerating a new one, not looking the old one up.

This applies identically to parents, teachers, and students — one generation-and-delivery mechanism, not three.

---

## 4. Match-or-create for accounts too (avoiding duplicate/split logins)

Same principle already established for guardian data (§2 of `parent-guardian-module.md`) applies here: before creating a new `account`, check whether one already exists for the same person — matched by email if present, or phone as a secondary signal, since `username` itself is generated fresh each time and won't naturally collide across roles.

- **Match found** → don't create a second account; just add a new `account_link` to the new profile, under the person's existing username. This is exactly how a teacher-who's-also-a-parent ends up with one login that sees both their staff dashboard and their child's records, instead of two separate logins they'd have to remember separately.
- **No match** → create a new account as in §2.

This check is invisible to the admin pressing the button — it's background logic, not an extra decision they have to make. Where the match is ambiguous rather than exact (same name, no matching email/phone), default to creating a new account rather than guessing — an admin can still manually consolidate later using the same reasoning as the guardian-merge workflow in `parent-guardian-module.md` §4, since a wrongly-shared login is a worse outcome than a small amount of duplication.

---

## 5. Revoking access

`account_link.status = 'revoked'` (not deletion) covers: a staff member leaving the school, a guardian relationship ending, a wrongly-created link. The `account` itself might still be valid for other links (a parent who also happens to be revoked as staff shouldn't lose access to their children's records) — which is exactly why revocation lives on the link, not the account.

---

## 6. Relationship to the rest of the system

```
guardian ──┐
staff ─────┼── account_link ── account
student ───┘
```
- `guardian`, `staff`, `student` never gain login fields of their own (no password column bolted onto `student`, no account logic duplicated into `staff`) — one shared implementation instead of three.
- `parent-guardian-module.md` §5 (the self-service claim workflow) still applies, but now as the **secondary path** — for a parent who shows up wanting access before any admin has pressed the one-click button on their record. The primary path, and the one that matches what you're building toward, is admin-driven one-click creation with a system-generated username and password.
