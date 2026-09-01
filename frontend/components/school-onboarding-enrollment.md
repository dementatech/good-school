# School Onboarding & Enrollment (Tenant Setup)

How schools — the tenants of the platform — get provisioned, verified, and configured before any student enrollment can happen. Companion to `uganda-secondary-school-foundations.md` (what happens *inside* a school once set up) and `schoolpay-integration.md` (fees-provider API details referenced in §2 and §3).

---

## 1. Why school enrollment is a distinct problem

Since the platform is multi-tenant (one system, many schools, per-school `theme_config`), "enrolling a school" means **tenant provisioning** — a different problem from enrolling a student. It has real dependencies: a school can't sensibly accept students until it has a curriculum, a class/stream structure, and a grading scheme configured. Get the sequencing wrong and every school-level assumption downstream (calendar, curriculum, grading) inherits the mess.

---

## 2. Core `school` (tenant) attributes

| Group | Attribute | Why it matters |
|---|---|---|
| **Identity** | Legal/registered name, trading/display name | Registration cert vs. what parents/staff actually call it often differ |
| | `slug` / subdomain | Tenant routing (`schoolname.yourapp.com`) |
| | Logo, brand colors → `theme_config` | Feeds your existing per-school runtime theming |
| **Regulatory identifiers** | **EMIS code** (Ministry of Education's Education Management Information System number) | The authoritative government ID for the school — treat as unique, not optional, for any government-recognized school |
| | **UNEB Centre Number** | Only relevant/known once a school registers to sit UCE/UACE candidates; may not exist yet for a brand-new school |
| | Ownership/founding body — Government, Private, Community, Religious (Catholic/Anglican/Muslim/etc.), International | Drives fee structure expectations, curriculum defaults, and sometimes reporting obligations |
| | Registration status with MoES — *registered*, *licensed*, *provisional*, *unregistered* | A school can legitimately operate before full UNEB registration (e.g. a new S1-only school) — model as a status, not a boolean gate |
| **Location** | District, sub-county/division, physical address, GPS coordinates | Uganda school stats and MoES reporting are district-based; also useful for parent-facing search |
| **Contact & leadership** | Head Teacher / Director name and contact | The accountable person for UNEB registration and MoES correspondence — distinct from your "primary admin" login |
| | General school phone/email/website | |
| **Operating profile** | School type — Day, Boarding, Mixed | Affects fee structure, attendance model, dorm/house management if you build it later |
| | Gender composition — Boys, Girls, Mixed | |
| | Levels offered — O-Level, A-Level, or both | |
| | `school_curriculum` — which curricula it runs (UNEB, Cambridge, IB, etc.) | A school can run more than one in parallel |
| **Platform/SaaS-specific** | Subscription plan/tier, billing contact, billing status | Standard SaaS tenant fields — separate table (`subscription`), not mixed into core identity |
| | Onboarding status — `pending_verification`, `active`, `suspended`, `churned` | Drives what the tenant can access before/after verification |
| | Data-import source (fresh start vs. migrated from another system) | Affects whether you need a bulk-import wizard for historical students/results |
| **Payment integration** | Fees provider — e.g. SchoolPay, or none | Optional per school; many schools may not use a digital fees provider at all |
| | Provider `schoolCode` (e.g. SchoolPay's own school identifier) | The school's identifier on the *provider's* system — distinct from your platform's `school.id` |
| | Provider API password (encrypted at rest) | Per-school secret used to build the provider's request-signing hash — never exposed client-side |
| | Webhook callback URL + verification status | The school must register *your* callback URL on their own provider portal — track whether that step has actually been completed, since it's outside your platform's control |

```
school (id, legal_name, display_name, slug, emis_code, uneb_centre_number,
        ownership_type, registration_status, district, address, gps_lat, gps_lng,
        school_type [day|boarding|mixed], gender_composition, head_teacher_name,
        head_teacher_contact, phone, email, website, theme_config jsonb,
        onboarding_status, created_at)
school_curriculum (school_id, curriculum_id, is_primary)
subscription (school_id, plan, billing_contact, status, renewed_at)
payment_provider_credential (id, school_id, provider ['schoolpay'|'none'],
                              external_school_code, api_password_encrypted,
                              webhook_registered, webhook_verified_at, is_active)
```

---

## 3. A sane onboarding sequence

Don't let a school "sign up" straight into a fully-configured tenant — the configuration has real dependencies. A workable order:

1. **Registration request** — legal name, EMIS code (if it has one), ownership type, district, admin contact. Self-service or sales-assisted; either way it creates the tenant in `pending_verification`.
2. **Verification** — check EMIS code / UNEB centre number against what the school claims. MoES doesn't expose a public API for this, so expect a human-in-the-loop step (e.g. requesting a scanned registration certificate). Don't block *all* use on this — a new S1-only school may not have a UNEB centre number yet, so verification criteria should differ by school age/level.
3. **Curriculum & structure setup** — which curriculum(s) it runs, which levels (O-Level/A-Level/Cambridge stages/etc.), day/boarding — this determines which downstream config screens even appear.
4. **Academic calendar** — default to the national MoES term dates for UNEB schools, but make it editable per-school since boarding schools, international schools, and TVET-track schools legitimately run different calendars.
5. **Classes/streams and subjects** — seed from a platform-wide template for the chosen curriculum(s), then let the school customize (add streams, drop/add elective subjects, define combinations for A-Level).
6. **Grading scheme selection** — pick from platform-provided schemes (UNEB legacy, UNEB NLSC, Cambridge, IB) or a custom internal one; can't be skipped since results entry depends on it.
7. **Staff invitations** — invite the Head Teacher/Director and administrative staff with roles; this is when the "admin login" is distinct from the "Head Teacher" identity captured in step 1.
8. **Student data import** — bulk CSV/Excel import for an existing school migrating in, or manual/staged enrollment for a brand-new school; run it as its own guided step, not assumed to happen automatically after setup.
9. **Payment provider connection** *(optional)* — capture the school's fees-provider `schoolCode` and API password, validate with a small test call (e.g. a Sync API request for a recent date) before saving, and prompt the admin to register your webhook callback URL on their provider portal. Make this skippable — plenty of schools may not use a digital fees provider, or may add one later, so it shouldn't block go-live.
10. **Go-live** — flip `onboarding_status` to `active`, which is also a natural point to start billing if you're metering by active students or terms.

Treat steps 3–6 as **one-time-per-school setup that later enrollment/results workflows depend on** — a student can't be enrolled until the school has at least one curriculum, one class/stream structure, and one grading scheme configured. Enforce that dependency at the application layer (block "add student" until setup is complete) rather than leaving it to convention.

---

## 4. Judgment calls to make early

- **Self-serve vs. verified-only signup**: given EMIS/UNEB verification usually needs a human step, decide whether schools get a real (if limited) trial before verification completes, or stay fully locked out — this materially affects your onboarding funnel.
- **Multi-campus schools**: some Ugandan school brands run several physical campuses under one identity ("sister campuses"). Decide now whether `school` is one row per campus (simpler) with a separate `school_group` for shared branding/billing, versus one `school` with multiple `campus` children — retrofitting this later is painful.
- **Who owns the EMIS/UNEB identifiers**: these are unique at the government level — enforce uniqueness in your schema too, and treat a duplicate EMIS code claim as a verification red flag rather than allowing two tenants to silently coexist with the same government ID.
- **Payment provider is optional and per-school, not platform-wide**: don't assume every tenant has (or wants) SchoolPay connected — model `payment_provider_credential` as a nullable/optional relationship, and design the fees module to degrade gracefully (manual fee recording) when no provider is connected. See `schoolpay-integration.md` for the full API details this drives.