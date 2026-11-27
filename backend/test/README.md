# Backend integration tests

```
npm test            # run once
npm run test:watch  # rerun on save
```

No Docker or installed Postgres needed. Each run:

1. starts a private Postgres 16 (same major version as production) via
   `embedded-postgres`, in a temp folder (`test/global-setup.ts`);
2. applies every migration in `migrations/`, exactly as a deploy does;
3. runs each `test/**/*.test.ts` against the real Fastify app in memory
   (`src/app.ts`), logged in through the same JWT cookie as the real login;
4. deletes the database when finished.

## Writing a test

- `useApp()` at the top of the file, then `api(session, method, url, body)`,
  which returns `{ status, body }`. `apiOk(...)` fails the test unless the call
  succeeded and returns `body.data`.
- Sessions: `superAdmin()`, and `createSchool()` (returns the school, its
  current year and a school admin login). Each call makes a **new** school,
  so tests don't share data, and two schools can be used to test that one
  can't reach the other's data.
- Set up what the test isn't checking straight in the database (see
  `helpers/fixtures.ts`). Do the thing being tested **through the API**, the
  way a user would.

## Rules

- **Every bug fix gets a test that reproduces the bug.** Write the test
  first, watch it fail on the old code, then fix it. Name it `REGRESSION: …`.
- **Test where features meet**, not just each feature alone. Most real bugs are
  in sequences like "the school already has X, then does Y", in duplicates,
  or in one school's data meeting another's.
- An expected user mistake must come back as a 400 with a clear message.
  A 500 in a test is always a bug.
