@AGENTS.md

# HealthTracker — project context for AI coding tools

This file gives any AI coding assistant (Claude Code, Cursor, etc.) enough context to work in this repo without re-deriving it from scratch. Read this before making changes.

## What this app is

A personal dashboard that combines:
- **Weekly running data from Strava** (the user runs ~once/week; Strava is the source of truth for runs).
- **Daily health data from Apple Health**, pushed by the iOS app **Health Auto Export** (resting heart rate, HRV, VO2 max, sleep, steps, active energy, weight). Apple does not offer a cloud API for HealthKit, so this on-device export app is the bridge.

The goal (not yet built) is to eventually correlate daily health/recovery signals with weekly run quality, and add AI-generated coaching advice. Current state: data ingestion + a dashboard for runs is done; the health-metrics side of the dashboard exists but is minimal; no AI advice layer yet.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4), deployed on **Vercel**.
- **Neon Postgres** (serverless), provisioned via Vercel Storage (Neon integration), accessed with **Drizzle ORM** using the `@neondatabase/serverless` HTTP driver (not a persistent TCP connection — see gotchas below).
- **Recharts** for the trend charts.
- Single-user app: no auth, no multi-tenant concerns. All data belongs to one person.

## Repo layout

```
src/db/schema.ts          Drizzle schema: activities, health_metrics, strava_tokens
src/db/index.ts           Neon client (drizzle-orm/neon-http)
src/lib/strava.ts         Strava OAuth token exchange/refresh + storage
src/lib/format.ts         Shared date/pace/duration/km formatters (nl-NL locale)
src/app/api/strava/auth/route.ts       GET → redirects to Strava OAuth consent
src/app/api/strava/callback/route.ts   GET → exchanges code, saves tokens
src/app/api/strava/sync/route.ts       GET/POST, requires `Authorization: Bearer $CRON_SECRET` → pulls activities from Strava API, upserts into `activities`
src/app/api/health/ingest/route.ts     POST, requires `x-ingest-secret: $HEALTH_INGEST_SECRET` → accepts Health Auto Export JSON payloads, upserts into `health_metrics`
src/app/page.tsx           Homepage: preview of 5 latest runs + last 14 days of health metrics
src/app/runs/page.tsx      Full runs view: stat cards, pace/HR trend charts, full sortable-by-nothing table (all runs, last 90 days)
src/app/runs/[id]/page.tsx Single-run detail page
src/components/RunTrendsChart.tsx   Client component (Recharts needs "use client")
vercel.json                 Daily cron hitting /api/strava/sync
drizzle.config.ts           Points at src/db/schema.ts, reads DATABASE_URL
```

## Data model

- `activities` — one row per Strava activity, keyed by unique `strava_id`. Distances in meters, pace pre-computed as `avg_pace_min_per_km` (derived from Strava's `average_speed` at ingest time). `raw` column stores the full Strava JSON for anything not modeled explicitly.
- `health_metrics` — one row per calendar date, keyed by unique `date`. Populated by upserting per-metric points from Health Auto Export's payload (see `METRIC_MAP` in the ingest route for which HealthKit metric names map to which columns). `raw` column is currently unused (reserved).
- `strava_tokens` — single-row-in-practice table (one per athlete, but there's only ever one athlete) holding the OAuth access/refresh token pair. `getValidAccessToken()` in `src/lib/strava.ts` auto-refreshes if within 60s of expiry.

## Environment variables

| Var | Where it comes from | Notes |
|---|---|---|
| `DATABASE_URL` | Auto-set by Vercel's Neon integration (Storage tab) | Also pulled locally via `vercel env pull .env.local` |
| `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | Manually created at strava.com/settings/api | Must be set in both `.env.local` and Vercel project settings |
| `CRON_SECRET` | Manually generated random string | Protects `/api/strava/sync`; Vercel Cron sends it automatically as `Authorization: Bearer $CRON_SECRET` when this env var is set |
| `HEALTH_INGEST_SECRET` | Manually generated random string | Protects `/api/health/ingest`; must match the header configured in the Health Auto Export automation |

`.env.local` is gitignored (`.env*` in `.gitignore`) except `.env.local.example`, which documents the shape without real values.

## Commands

```bash
npm run dev          # local dev server
npm run build         # production build
npm run db:push       # push schema changes to Neon (uses node --env-file=.env.local, see gotcha below)
npm run db:generate   # generate SQL migration files (not currently used — we push directly)
npm run db:studio     # Drizzle Studio GUI against the live DB
```

## Gotchas / non-obvious things

1. **`db:push` needs `.env.local` loaded explicitly.** `drizzle-kit` doesn't auto-load `.env.local` the way Next.js does, so the scripts use `node --env-file=.env.local ./node_modules/.bin/drizzle-kit ...`. `NODE_OPTIONS='--env-file=...'` does NOT work (Node disallows `--env-file` inside `NODE_OPTIONS`) — don't try that shortcut again.
2. **Neon connection is HTTP, not a pool.** We use `@neondatabase/serverless`'s `neon()` + `drizzle-orm/neon-http`, which does one-shot HTTP queries — fine for this app's read volume, but don't assume you have a long-lived connection/transaction like a normal `pg` pool.
3. **Strava's "Authorization Callback Domain" only supports one domain at a time.** It currently points at the Vercel deployment domain. If you need to test the OAuth flow against `localhost` again, you have to switch it back at strava.com/settings/api first (or split into two Strava apps — one for dev, one for prod — if this becomes annoying).
4. **All tables need explicit unique indexes for `onConflictDoUpdate` to work.** We hit `NeonDbError: there is no unique or exclusion constraint matching the ON CONFLICT specification` once because `strava_tokens.athlete_id` lacked a `uniqueIndex`. If you add a new upsert-by-column pattern, add the matching `uniqueIndex` in the schema and `db:push` before testing.
5. **Vercel CLI is a local devDependency**, not global (global install failed with `EACCES` on this machine — no sudo). Always invoke via `npx vercel ...`.
6. **`vercel link` / `vercel env pull`** are the way local dev picks up the Neon-provided `DATABASE_URL` — there is no separate manual Neon dashboard step, since the DB was provisioned through Vercel's Storage tab, not neon.com directly.
7. **Health Auto Export payload shape** (`src/app/api/health/ingest/route.ts`) is a best-effort mapping (`METRIC_MAP`) based on typical HealthKit export field names (`resting_heart_rate`, `heart_rate_variability`, `vo2_max`, `sleep_analysis`, `step_count`, `active_energy`, `weight_body_mass`). This hasn't been validated against a real payload yet — if ingest silently produces zero rows, log the raw payload first before assuming the DB/auth is broken.

## Not built yet (known gaps)

- No AI-generated coaching/advice layer (the eventual goal: correlate daily HRV/sleep/steps with weekly run quality).
- No filtering/sorting UI on the runs table.
- No auth — anyone with the URL can view the dashboard (acceptable for a single-user personal project, but don't add write endpoints without reconsidering this).
- `health_metrics.sleep_score` and `.raw` columns are defined but not populated by anything yet.
