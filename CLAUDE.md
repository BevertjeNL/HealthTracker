@AGENTS.md

# HealthTracker — operational contract for coding agents

This file is a contract, not a tour. It tells an AI agent what it may do, what it must check before calling work done, and where the hard lines are. Product framing, setup instructions, and "why this exists" narrative live in [README.md](README.md) — read that if you need background, read this before you touch code.

## Before writing any code

Read the Next.js 16 docs relevant to what you're about to touch, resolved from `node_modules/next/dist/docs/` (see [AGENTS.md](AGENTS.md)). This app pins a specific Next.js version; APIs and conventions in your training data may be stale. Do not assume App Router behavior — verify it.

## Architecture (current, keep this section in sync with the repo)

- **Next.js 16** (App Router, TypeScript, Tailwind v4) on **Vercel**.
- **Neon Postgres**, accessed via `@neondatabase/serverless` HTTP driver + **Drizzle ORM** (`drizzle-orm/neon-http`) — one-shot HTTP queries, not a pooled/long-lived connection. No transactions spanning multiple round trips.
- **Recharts** for trend charts.
- Single-user app: password login with a signed stateless session cookie; no accounts or multi-tenant concerns.

Files:

```
src/db/schema.ts                        Drizzle schema: strava_tokens, activities, health_metrics
src/db/index.ts                         Neon client
src/lib/strava.ts                       Strava OAuth token exchange/refresh + storage
src/lib/sync.ts                         Full-history Strava run sync and reconciliation
src/lib/format.ts                       Shared date/pace/duration/km formatters (nl-NL locale)
src/lib/insights.ts                     Rule-based summaries and observation generation
src/lib/security.ts                     Constant-time secret comparison and Bearer parsing
src/lib/session.ts                      Session signing/verification and password check
src/lib/session-server.ts               Cookie-backed server-side session check
src/proxy.ts                            Optimistic route protection; write actions re-check auth
src/app/login/*                         Single-user login/logout actions and UI
src/app/api/strava/auth/route.ts        GET → redirects to Strava OAuth consent
src/app/api/strava/callback/route.ts    GET → validates OAuth state, exchanges code, saves tokens
src/app/api/strava/sync/route.ts        GET/POST, requires Authorization: Bearer $CRON_SECRET → syncs runs
src/app/api/health/ingest/route.ts      POST, requires x-ingest-secret: $HEALTH_INGEST_SECRET → accepts Health Auto Export payloads, aggregates per calendar day, upserts into health_metrics
src/app/page.tsx                        Insight dashboard over the latest 90 days
src/app/runs/page.tsx                   Range filters, stat cards, trend charts and runs table
src/app/runs/actions.ts                 Authenticated manual Strava sync Server Action
src/app/runs/[id]/page.tsx              Single-run detail page
src/components/*                        Charts, stat/insight cards and sync/logout controls
.github/workflows/quality.yml           Audit, lint, typecheck, tests and build in CI
tests/security.test.mjs                 Shared-secret fail-closed regression tests
vercel.json                             Daily cron hitting /api/strava/sync (05:00 UTC)
drizzle.config.ts                       Points at src/db/schema.ts, reads DATABASE_URL
```

When you add a file that a future agent would need to know about to orient itself (new route, new table, new page), update this list in the same change. An out-of-date file list is worse than none — don't let this section rot again.

## Data definitions and timezone policy

- `activities.start_date` is stored `timestamptz` — always in UTC as returned by Strava. Convert to local time (`Europe/Amsterdam`, via `src/lib/format.ts`) only at render time, never at write time.
- `health_metrics.date` is a plain `date` (no timezone) representing a **calendar day as reported by Health Auto Export**, which exports in the device's local time. Do not reinterpret it through a timezone conversion — treat the string as already being the correct local day and only use `.slice(0, 10)` / string comparison, not `new Date(...)` arithmetic that could shift it across a day boundary.
- Cumulative metrics (steps, active energy, sleep hours) are **summed** per calendar day across all points Health Auto Export sends for that day. Point-in-time metrics (resting HR, HRV) are **averaged**. Single-sample metrics (VO2 max, weight) take the **last** chronological value. This mapping lives in `METRIC_MAP` in `src/app/api/health/ingest/route.ts` — if you add a metric, decide its aggregation deliberately and document it there, don't default to "last" out of laziness.
- All distances in the DB are meters; pace is precomputed at ingest as `avg_pace_min_per_km`. Don't re-derive pace from raw Strava fields in the UI layer — use the stored column so there's one source of truth.

## Minimum sample size for insights

Any feature that surfaces a trend, average, correlation, or "insight" must not present a computed value derived from fewer than **3 data points** as if it were meaningful. Below that threshold, show the raw values or an explicit "not enough data yet" state instead of an average/trend line. This matters even more if an AI advice layer is added — a coaching suggestion based on one bad night's sleep is worse than no suggestion.

## Security rules (non-negotiable)

- **Never log health data.** No `console.log`/`console.error` of request bodies, parsed metric values, or DB rows from `health_metrics` or `activities.raw`, in any route, script, or debug output — including while diagnosing the "ingest silently produces zero rows" gotcha below. If you need to inspect a payload, inspect its *shape* (metric names, point counts, date ranges) — never its values — and never paste real values into commit messages, PR descriptions, or chat output.
- **Never bypass or remove auth checks.** Dashboard pages and user-triggered mutations require a valid signed session. `/api/strava/sync` requires `CRON_SECRET`; `/api/health/ingest` requires `HEALTH_INGEST_SECRET`. Every check must fail closed when its environment variable is absent.
- `src/proxy.ts` is only an optimistic first gate. Every Server Action and Route Handler that reads private data or mutates state must perform its own authorization check close to the operation.
- Keep the Strava OAuth `state` validation and short-lived HttpOnly cookie intact. The callback must require both a logged-in session and a matching state value.
- Never commit `.env.local`, real secret values, or real health/activity data into the repo, a commit message, or a memory/scratch file. `.env.local.example` documents shape only, no real values.
- Don't add a dependency that phones home with request/response data (analytics SDKs, error-reporting tools that capture payloads) without explicit user sign-off — this app's request bodies contain health data.

## Allowed error messages and logging

- API routes may log operational metadata: which route ran, HTTP status returned, row counts (`upserted`, `synced`), timing, and non-sensitive error messages (e.g. "Strava token refresh failed: 401" is fine; the token value itself is not).
- Never include token values, health metric values, or activity `raw` JSON in a thrown error, a `NextResponse.json({ error })` body, or a log line. If an error needs the payload for debugging, redact values and keep only structure (field names present, point counts).
- User-facing errors (rendered on pages) should be generic ("Kon gegevens niet laden") — don't leak stack traces or DB error text to the browser.

## Migration policy

- Schema changes go through `src/db/schema.ts` + `npm run db:push` (direct push, no migration files currently in use — `db:generate` exists but isn't part of the workflow yet). If you introduce migration files, say so explicitly and update this section.
- Every new column used in an `onConflictDoUpdate` upsert needs an explicit `uniqueIndex` in the schema, added and pushed *before* the upsert code is tested — see the `strava_tokens.athlete_id` incident in the gotchas below.
- Never run `db:push` against production data without checking `git status`/thinking about whether the change is destructive (dropping/renaming a column drops data on Neon). For anything beyond an additive column, confirm with the user first — this is a live single-copy database, not a throwaway dev DB.
- `npm run db:push` needs `.env.local` loaded explicitly: scripts use `node --env-file=.env.local ./node_modules/.bin/drizzle-kit ...`. `NODE_OPTIONS='--env-file=...'` does not work (Node disallows `--env-file` inside `NODE_OPTIONS`).

## Required checks before calling anything done

Run all of these, in order, before telling the user a change is finished:

1. `npm audit --omit=dev --audit-level=high`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test`
5. `npm run build` (a change that passes lint can still fail the production build)
6. Preview check: for anything touching a page or API route, actually load it and exercise the changed path. UI changes need the golden path plus the obvious auth/empty/error edge case.
7. Explicit database/privacy impact review: if the change touches `src/db/schema.ts`, any `onConflictDoUpdate`, the ingest route, or anything that logs/serializes a payload, state plainly what the DB/privacy impact is.

## Definition of done

A change is done when: audit, lint, typecheck, tests and build pass; the changed behavior has been verified live; CI is green; any schema change has the required constraints; no health data or secrets appear in logs/errors/commits; and the architecture list is current. If a live integration cannot be exercised, report that limitation explicitly.

## Autonomy boundary — when you may finish without asking

You may complete and consider "ready" a change that passes the required checks and CI, has been checked in a preview/dev server, and has no database schema impact beyond a straightforward additive column with its unique index in place.

You must stop and get explicit sign-off before finishing, even if all checks pass, when the change: modifies `src/db/schema.ts` in a way that could drop or reinterpret existing data (renamed/removed/retyped column); changes what gets logged or how a secret/header check works; adds a new endpoint that writes to the database; or touches anything under Security rules above. A local green build is not equivalent to green CI and a privacy review, so don't treat it as license to merge or deploy a database/privacy-sensitive change.

## Deploy and rollback

- Deploys are automatic on push to `main` via Vercel's GitHub integration — pushing to `main` is a production deploy, not a neutral git operation. Confirm with the user before pushing a change that hasn't been through the checks above.
- Cron (`vercel.json`, daily Strava sync at 05:00 UTC) redeploys with the app; no separate step needed.
- Rollback: use the Vercel dashboard ("Instant Rollback" to a previous deployment) rather than force-pushing or reverting commits under time pressure — it's faster and doesn't touch git history. Only fall back to a `git revert` + push if the bad deploy also needs to be removed from history (e.g. it committed a secret).
- A schema migration is not automatically rolled back by an app rollback — if a deploy that included a `db:push` needs to be undone, the schema change needs its own explicit reversal; check what changed in `src/db/schema.ts` before assuming a Vercel rollback alone fixes it.

## Environment variables

| Var | Source | Notes |
|---|---|---|
| `DATABASE_URL` | Vercel's Neon integration (Storage tab) | Pulled locally via `vercel env pull .env.local` |
| `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | strava.com/settings/api | Set in both `.env.local` and Vercel project settings |
| `CRON_SECRET` | Manually generated random string | Protects `/api/strava/sync` |
| `HEALTH_INGEST_SECRET` | Manually generated random string | Protects `/api/health/ingest`; must match Health Auto Export's automation config |
| `APP_PASSWORD` | Manually generated, minimum 16 characters | Single-user login; use a unique value |
| `SESSION_SECRET` | `openssl rand -base64 32` | Signs seven-day HttpOnly sessions; minimum 32 characters |

`.env.local` is gitignored except `.env.local.example` (shape only, no real values).

## Commands

```bash
npm run dev          # local dev server
npm run build        # production build
npm run lint          # eslint
npm run typecheck     # TypeScript without emitting files
npm test              # regression tests
npm run db:push       # push schema changes to Neon
npm run db:generate   # generate SQL migration files (not currently used)
npm run db:studio     # Drizzle Studio GUI against the live DB
```

## Gotchas / non-obvious things

1. **`db:push` needs `.env.local` loaded explicitly** — see Migration policy above.
2. **Neon connection is HTTP, not a pool.** One-shot HTTP queries via `@neondatabase/serverless` + `drizzle-orm/neon-http`. Don't assume a long-lived connection or multi-statement transaction.
3. **Strava's "Authorization Callback Domain" supports one domain at a time.** It currently points at the Vercel deployment domain. Testing OAuth against `localhost` requires switching it back at strava.com/settings/api first.
4. **Every upsert-by-column needs a matching `uniqueIndex`.** Hit `NeonDbError: there is no unique or exclusion constraint matching the ON CONFLICT specification` before when `strava_tokens.athlete_id` lacked one.
5. **Vercel CLI is a local devDependency, not global** (global install fails with `EACCES`, no sudo on this machine). Always invoke via `npx vercel ...`.
6. **`vercel link` / `vercel env pull`** is the only path to a local `DATABASE_URL` — the DB was provisioned through Vercel's Storage tab, not neon.com directly, so there's no separate manual Neon dashboard step.
7. **If ingest silently produces zero rows**, inspect the payload's *shape* (metric names present, point counts, date range) — never its values, see Security rules — before assuming the DB or auth is broken.

## Not built yet (known gaps)

- No AI-generated coaching/advice layer; current insights are deliberately rule-based observations.
- Health Auto Export mapping and units are not yet covered by anonymized real-payload fixtures.
- Database changes still use direct `db:push`; versioned migrations and a tested restore procedure remain future work.
- `health_metrics.sleep_score` and `.raw` columns are defined but not populated by anything yet.
