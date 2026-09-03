# SchoolPay Integration — API Reference & Schema Notes

Reference for integrating SchoolPay (schoolpay.co.ug, by Fincom Technologies/ServiceCops) as the fees-payment provider. Companion to `uganda-secondary-school-foundations.md`, `school-onboarding-enrollment.md`, and `student-enrollment.md` (§3 defines the `student_payment_code` mapping this doc relies on).

Source: SchoolPay's public API documentation (schoolpay.co.ug/apidocumentation). SchoolPay is a well-established player here — reported to serve 15,000+ schools and process over half of private-sector tuition payments in Uganda, with bank partnerships (Stanbic/UNCDF) extending into underserved regions — so it's a reasonable default to integrate against rather than build a payments system from scratch.

---

## 1. What SchoolPay actually is

- A **fees collection + reconciliation platform**, not just a payment gateway: schools already run their own SchoolPay portal (their own "school code," student payment codes, fee structures), and parents pay via mobile money (MTN, Airtel), bank, or agent channels directly into SchoolPay.
- Your system's job is to **sync/receive transaction records from SchoolPay**, not to process the payment yourself in most cases — except for the Adhoc API, which lets you *initiate* a one-off payment request programmatically (§4).
- Important architectural implication: **a school must already be registered/onboarded on SchoolPay** (with its own `schoolCode` and API password) before your platform can integrate them. This means your school onboarding flow (see `school-onboarding-enrollment.md`) needs an extra step: capturing/configuring the school's SchoolPay `schoolCode` and API password as tenant-level payment-integration credentials, not assuming every school has them.

---

## 2. Authentication model

All API calls are authenticated with an **MD5 hash**, not OAuth/API keys in headers — worth knowing since it shapes how you store secrets and build requests.

- **Sync API hash:** `MD5(schoolCode + date + password)` — uppercase hex.
- **Adhoc API hash:** `MD5(schoolCode + identifyingReference + password)` — reference is `externalReference` for Register/Request, `paymentReference` for Status Check.
- The `password` is the **school's own SchoolPay API password**, assigned per school — meaning it's a **per-tenant secret**, not a single platform-wide credential. Your credential storage needs a `school_id → password` mapping, encrypted at rest, never exposed client-side (the docs explicitly warn against this).
- No apparent expiring token/session — the hash is computed fresh per request, so there's no token refresh flow to build, just consistent hash construction.

```
payment_provider_credential (id, school_id, provider ['schoolpay'], 
                              external_school_code, api_password_encrypted,
                              webhook_secret, is_active, created_at)
```

---

## 3. Transaction Sync API (pull model)

Two GET endpoints, both returning the same shape (`returnCode`, `transactions[]`, `supplementaryFeePayments[]`):

| Endpoint | Purpose | Constraint |
|---|---|---|
| `GET /AndroidRS/SyncSchoolTransactions/{schoolCode}/{transactionDate}/{requestHash}` | All transactions for one day | Single date |
| `GET /AndroidRS/SchoolRangeTransactions/{schoolCode}/{fromDate}/{toDate}/{requestHash}` | Transactions over a range | **Max 31 days** — you'll need to chunk larger backfills |

**Two distinct payment types come back, and they map to different things in your system:**

- **`transactions`** — regular school fees payments. Key fields: `amount`, `studentPaymentCode`, `studentName`, `studentRegistrationNumber`, `schoolpayReceiptNumber`, `sourcePaymentChannel`, `transactionCompletionStatus`, `paymentDateAndTime`.
- **`supplementaryFeePayments`** — non-tuition fees (uniforms, trips, etc.). Adds `supplementaryFeeId`, `supplementaryFeeDescription`, `studentClass`.

**Mapping notes for your schema:**
- `studentPaymentCode` is SchoolPay's own student identifier — resolve it via the `student_payment_code` mapping table (`student_id, school_id, provider, external_payment_code`, defined in `student-enrollment.md` §3) rather than assuming it equals your internal student ID. Look it up by the **pair** `(school_id, external_payment_code)`, not the code alone — the same numeric code could exist under two different schools' SchoolPay accounts. It's not guaranteed to equal `studentRegistrationNumber` either (the sample data shows `studentRegistrationNumber` frequently blank).
- `studentClass` in the supplementary-fee payload is a free-text label (e.g. "JUNIORTWO", "J3") from SchoolPay's own class configuration — **don't** assume it matches your `stream`/`class_level` naming (§3 of the foundations doc); treat it as a display string to reconcile manually or fuzzy-match, not a foreign key.
- `schoolpayReceiptNumber` is the natural idempotency key for a synced transaction — use it (not `sourceChannelTransactionId`, which is the mobile-money network's own reference) as your unique constraint when upserting.

```
fee_payment (id, student_id NULLABLE, school_id, source ['schoolpay_sync'|'schoolpay_webhook'|'schoolpay_adhoc'],
             raw_student_payment_code, match_status ['matched'|'unmatched'],
             schoolpay_receipt_number UNIQUE, amount, payment_channel, 
             payment_type ['tuition'|'supplementary'], supplementary_fee_description,
             raw_student_class_label, paid_at, completion_status, raw_payload jsonb)
```
`student_id` is resolved via `student_payment_code` (§3 of `student-enrollment.md`) at ingestion time, not stored as the only reference — keep `raw_student_payment_code` alongside it so an initially-unmatched payment (no `student_payment_code` row yet) can still be recorded and linked later from the reconciliation admin screen, rather than being dropped for lack of a resolvable `student_id`.
Keeping `raw_payload jsonb` is worth it here — SchoolPay's payload shape has already grown once (the webhook payload wraps `payment` with a `type` and `signature` the sync API doesn't have), so don't over-normalize into rigid columns that break on the next field addition.

**Sync as a reconciliation job, not your primary data path:** given the 31-day range cap and pull nature, Sync API is best used as a nightly/periodic reconciliation job (catch anything the webhook missed) rather than your main ingestion path — that's what the Webhook is for (§5).

---

## 4. Adhoc One-Time Payments API (push model)

Lets your platform **initiate** a payment request rather than just observing ones parents made directly on SchoolPay's own portal — useful for e.g. "pay this specific invoice from within our app."

Three-step flow:

1. **Register** — `POST /AndroidRS/AdhocPayments/Register/{SchoolCode}/{Hash}`
   Body: `amount`, `externalReference` (your own reference — this becomes the hash input), `firstName`, `lastName`, `reason`, optional `callBackUrl`.
   Returns a SchoolPay `paymentReference` with status `PENDING`.

2. **Request** — `POST /AndroidRS/AdhocPayments/Request/{SchoolCode}/{Hash}`
   Adds `phoneNumber` (local `077...` or international `25677...` format) — triggers an **instant mobile money debit prompt** to the payer's phone (STK-push style).

3. **Check** — `GET /AndroidRS/AdhocPayments/Check/{SchoolCode}/{Hash}/{Reference}`
   Status inquiry using the SchoolPay `paymentReference`. Poll this if you don't want to rely solely on the callback.

**Design implications:**
- `externalReference` is **your** correlation ID — generate it as something you can join back to an invoice/fee-item in your system (e.g. `invoice_id` or a composite), since it's what you'll use to reconcile the eventual callback/status check against your own records.
- This is a **request-to-pay**, not a guaranteed payment — always treat `PENDING` as exactly that, and don't mark an invoice paid until you get `PAID` via callback (§4, item 3) or an explicit status check.
- Because Register/Request/Check use the *same* hash formula with different `identifyingReference` inputs, a small shared "hash builder" utility in your codebase (parameterized by which reference to use) avoids subtle bugs from mixing up `externalReference` vs `paymentReference`.

```
adhoc_payment_request (id, school_id, external_reference UNIQUE, fee_invoice_id,
                        schoolpay_payment_reference, amount, phone_number,
                        status ['PENDING'|'PAID'|'FAILED'], initiated_at, resolved_at)
```

---

## 5. Webhook (push notifications) — the primary real-time path

- A school registers a webhook URL **in their own SchoolPay portal** (not via your API) and enables it — meaning this is partly outside your platform's control per-tenant; your onboarding flow should walk the school admin through registering *your* callback URL on their SchoolPay portal, or you'll never receive events for that school.
- Payload wraps payment data with a `type` (`SCHOOL_FEES` or `OTHER_FEES`) and a `signature`.
- **Signature verification is essential and cheap:** `signature = SHA256_HEX(school's API password + schoolpayReceiptNumber)`. Recompute and compare on receipt before trusting the payload — this is your main defense against forged callback calls, since the endpoint must be public-facing.
- **Webhooks fire once, no retry.** If your endpoint is down during the single attempt, that event is gone — which is exactly why the Sync API reconciliation job (§3) matters as a safety net, not an optional extra.
- **Silently suppressed if the school's SchoolPay subscription lapses.** Worth surfacing this as a monitorable condition (e.g. alert if a school that normally gets daily webhook volume goes quiet) rather than assuming "no events" means "no payments."
- Respond with **HTTP 200** on success — SchoolPay doesn't parse the response body, only the status code.
- Consider IP whitelisting (SchoolPay says source IPs are available on request) as a second layer alongside signature verification.

**Recommended handler shape:**
```
POST /webhooks/schoolpay/{school_id_or_slug}
  1. Look up school's stored api_password by the path param
  2. Recompute signature, reject (200 OK but no processing, or 4xx per your policy) if mismatched
  3. Resolve student_id via student_payment_code (school_id, studentPaymentCode); if no match,
     store with match_status='unmatched' and raw_student_payment_code set, rather than dropping it
  4. Upsert into fee_payment keyed on schoolpay_receipt_number (idempotent — a retry or
     duplicate delivery shouldn't double-credit a student)
  5. Return 200 immediately; do heavier processing (notifications, ledger updates) async
```

---

## 6. Integration architecture recommendations

1. **Webhook-first, Sync-as-backup.** Real-time UX (fee balance updates, receipts) should be driven by the webhook; run the Sync API on a schedule (e.g. daily, per school) purely to catch gaps — missed webhooks, downtime windows, or schools whose webhook was mis-configured.
2. **Idempotency everywhere.** `schoolpayReceiptNumber` should be a unique constraint in `fee_payment` regardless of which of the three paths (webhook/sync/adhoc-callback) wrote it — you will get the same payment from more than one path in practice (e.g. webhook fires, then your nightly sync also picks it up).
3. **Per-school credential lifecycle.** Since `api_password` is per-school and schools already have a relationship with SchoolPay independent of your platform, build an explicit "connect SchoolPay" step in school onboarding (capture `schoolCode` + password, test with a small Sync call before saving) rather than assuming every tenant has valid credentials from day one — plenty of schools may not use SchoolPay at all, so make it optional/pluggable (`payment_provider_credential.provider` anticipates a second provider later).
4. **Don't conflate SchoolPay's `studentClass`/fee categories with your own domain model.** Keep a thin mapping/reconciliation layer (even a manual "match this SchoolPay student code to our student record" admin screen) rather than assuming their free-text labels align with your `stream`/`subject`/`class_level` structures from the foundations doc — they're maintained independently on SchoolPay's own portal per school.
5. **Reason/description fields are free text on their side too** (`reason` in Adhoc, `supplementaryFeeDescription` in Sync) — if you want structured fee categories (tuition, uniform, exam fee, etc.) in your own reporting, you'll likely need your own `fee_type` catalog and a light classification step rather than trusting SchoolPay's strings to be consistent across schools.
