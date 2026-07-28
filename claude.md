# Implementation Brief — Architecture & Authentication
**Project:** Uganda Secondary School Management System
**Company:** Dementa Technologies
**Scope of this brief:** Backend architecture + frontend architecture + authentication system only. Reference this at the start of the Claude Code session for this phase of work.

---

## 1. Backend Architecture

**Pattern:** Modular monolith. Not microservices — single developer, no dedicated ops/QA team at this stage. Modules are cleanly separated so any one of them could be extracted into its own service later, but nothing is split out until a real, measured bottleneck appears.

**Stack:**
- **Node.js + TypeScript**
- **Fastify** (not Express) — built-in JSON Schema validation matters for this project, especially once the offline-sync module is built
- **PostgreSQL** — multi-tenant via `school_id` on every table
- **Redis** — cache + **BullMQ** for background jobs (used later for SMS dispatch, PDF generation, sync retries; not needed for auth itself, but set up the connection now since other modules will depend on it)

**Folder structure to scaffold:**
```
/src
  /modules
    /auth
      /domain        // core logic: password hashing, token issuing, identifier resolution
      /api           // Fastify routes/controllers
      index.ts       // the ONLY file other modules may import from
    /students
    /teachers
    /parents
    /admin
  /shared
    /db              // Postgres client/connection
    /event-bus        // internal pub/sub, used by other modules later
    /types
  /jobs                // BullMQ workers (not needed yet for auth, scaffold empty)
```

**Module boundary rule:** Other modules must only import from a module's `index.ts`, never reach into `/domain` or `/api` directly. Enforce with an eslint boundaries rule if convenient, but the discipline matters more than the tooling at this stage.

**Versioned API from day one:** all auth routes live under `/api/v1/auth/...` — this avoids breaking older installed PWA/mobile clients later when a v2 change is needed.

---

## 2. Frontend Architecture

**Stack:**
- **Next.js (App Router)** — one codebase serves web, installable desktop PWA, and (via Capacitor, added in a later phase) mobile
- **TypeScript** throughout, sharing types with the backend where practical (e.g., a shared `types` package or copied interface files for request/response shapes)
- PWA support (manifest + service worker) enabled from the start, even before offline data-sync logic exists — this is what makes the app "installable on desktop" per the original requirement, independent of the offline-sync module which comes later

**Folder structure to scaffold:**
```
/app
  /(auth)
    /login
      page.tsx           // login form — identifier + password
  /(dashboard)
    /student
      layout.tsx         // Student-only layout, role-guarded
      page.tsx
    /teacher
      layout.tsx
      page.tsx
    /parent
      layout.tsx
      page.tsx
    /admin
      layout.tsx
      page.tsx
  layout.tsx              // root layout
  middleware.ts           // route protection — NOTE: rename to proxy.ts if on
                          // Next.js 16, per the deprecation issue already
                          // hit in TERECO
/lib
  /api
    client.ts             // fetch wrapper, attaches JWT to requests
    auth.ts                // login(), logout(), getSession() calls to /api/v1/auth
  /auth
    session.ts            // reads/writes the stored token, exposes current
                          // user's role + school_id to the app
/components
  /auth
    LoginForm.tsx          // reuse the two-layer feedback pattern already
                          // established in SchoolOS (inline errors + toast)
```

**Role-based routing:** after login, redirect based on the `role` returned in the JWT — Student → `/student`, Teacher → `/teacher`, Parent → `/parent`, Admin → `/admin`. Each role's route group is guarded in its `layout.tsx` (or centrally in `middleware.ts`/`proxy.ts`) — a Teacher hitting `/admin` directly should be redirected out, not shown a broken page.

**Token storage:** store the JWT in an HttpOnly cookie set by the backend on login, not in localStorage — this avoids exposing the token to client-side JS (XSS protection) and works cleanly with Next.js server components reading the session on the initial request. The backend's `/api/v1/auth/login` response should set this cookie directly rather than returning the token in the JSON body for the frontend to store manually.

**Login form UX:** the identifier field should be labeled generically (e.g., "System ID, phone number, or email") since the same input accepts three different formats — make this explicit in the placeholder/label so users aren't confused about what to type. Reuse the existing two-layer feedback convention (inline field errors + toast notification) already built in SchoolOS's `LoginForm` for consistency across your products.

**What's deliberately NOT built in this phase:** offline data caching/sync UI, service-worker-driven background sync, Capacitor mobile wrapper. The PWA manifest and installability should exist now; the deeper offline-first data layer (RxDB/local SQLite, sync queue) is a separate later phase, same as it's separate on the backend.

---

## 3. Authentication — Requirements

**Core problem:** many Students and Teachers do not have personal email addresses; some Parents may not have email either, but are more likely to have a phone number. Login cannot require email.

**Identifier strategy:** a `system_id` is generated by the system at account creation and becomes the primary login identifier for Students and Teachers. Parents may log in via phone number. Email is optional and never required.

### `users` table (identity & auth only — no role-specific data here)
```
users
- id                 (uuid, pk)
- school_id          (fk — multi-tenant scoping)
- system_id          (unique per school, nullable — used by Student/Teacher)
- email              (nullable)
- phone_number       (nullable — used by Parent, also used for SMS elsewhere)
- password_hash
- role               (enum: student | teacher | parent | admin)
- created_at
- updated_at
```

Do NOT put student/teacher-specific fields (date_of_birth, registration_number, subject assignments, etc.) in this table — those belong in role-profile tables built in a later phase. This brief only covers getting `users` + login working, backend and frontend.

### Login flow (backend)
```
POST /api/v1/auth/login
{
  identifier: string,   // could be a system_id, phone number, or email
  password: string
}
```

Server-side resolution logic:
1. Detect which format `identifier` matches (system_id pattern, phone number pattern, or email pattern)
2. Look up the user by the matching field, scoped to the correct `school_id` if the login page/context is school-specific
3. Verify password against `password_hash` (bcrypt or argon2 — argon2id preferred if available)
4. Issue a JWT (or session token) containing `user_id`, `role`, `school_id` — set as an HttpOnly cookie in the response

### System ID format
Recommend reusing the existing TERECO convention for consistency across Dementa Technologies products (e.g., role-prefixed + sequence, like `TT0001`). Suggested adaptation for this project:
- `STU-XXXX` for Students
- `TCH-XXXX` for Teachers
- Sequence scoped per school, generated at account-creation time by an Admin (see FR-A1 from the full brief — Admin creates accounts, not self-registration)

**Decision needed before building:** confirm exact format and whether it's globally unique or unique-per-school. Recommend unique-per-school (simpler, shorter IDs) since `school_id` already scopes lookups.

### Role-based access
- JWT payload includes `role` and `school_id` — every subsequent authenticated request checks both: is this the right role for this endpoint, and does the requested resource belong to this user's school?
- This is the enforcement point for the access-control pattern established earlier (e.g., a Parent can only ever query data linked to their own `user_id`, an Admin can only manage users within their own `school_id`).
- On the frontend, this same payload drives which route group (`/student`, `/teacher`, `/parent`, `/admin`) the user is allowed into.

---

## 4. What's explicitly OUT of scope for this phase

- Role-profile tables (`students`, `teachers`, `parents`, `admins` detail tables) — auth only needs the bare `users` table for now
- Enrollment, class, subject logic
- SMS/notifications
- SchoolPay integration
- Offline data sync (backend queue AND frontend local storage/service-worker sync)
- Capacitor mobile wrapper
- Docker/deployment setup (separate brief when ready to containerize)

Keep these out so this phase stays focused and shippable — they'll each get their own brief when it's time.

---

## 5. Suggested first Claude Code prompt

> "Read this brief. Scaffold the modular monolith folder structure under `/src` for the backend (Fastify + TypeScript, Postgres connection, the `auth` module with `users` table migration, password hashing, `/api/v1/auth/login` with identifier-type detection, and JWT issued as an HttpOnly cookie). Then scaffold the Next.js frontend App Router structure under `/app` with the login page, role-based dashboard route groups (student/teacher/parent/admin), a `lib/auth` session helper, and route protection via middleware.ts. Leave other modules and Capacitor/offline concerns out for now."