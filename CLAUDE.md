# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Checkberry (repo name `todolist-familiale`, formerly « To-Do List Familiale ») —
a family shared to-do list PWA. Next.js 14 (App Router, TypeScript, strict),
React 18, Tailwind CSS, Neon (serverless Postgres) queried with raw
parameterized SQL (no ORM), Vercel hosting + Cron. Homemade auth (scrypt
password hash + JWT session cookie via `jose`), no external auth/RLS layer.

Detailed docs (read before non-trivial work — they're kept current and are
more authoritative than guessing from code):
- [README.md](README.md) — stack, env vars, DB schema pointer, feature log
- [docs/documentation-technique.md](docs/documentation-technique.md) — full
  technical reference: architecture, data model, auth, access control,
  per-feature sections (§6), known pitfalls (§8), file inventory (§11)
- [docs/deploiement.md](docs/deploiement.md) — end-user deployment guide for
  a fresh independent instance (keep this one maximally hand-holding —
  [[didactic-guide-style]]; dev docs like documentation-technique.md stay
  concise)
- [docs/migration-neon.md](docs/migration-neon.md) — history of the
  Supabase→Neon migration (closed, kept for reference)

## Commands

```bash
npm install
cp .env.example .env.local   # fill in values, see README "Variables d'environnement"
npm run dev                  # runs against the real Neon DB — no separate dev DB
```

Before pushing to `main`:

```bash
npx tsc --noEmit
npm run build
```

Kill `next dev` before running `npm run build` — both write to `.next`,
which can get corrupted if they run concurrently. There is no test suite
and no lint script configured; `tsc --noEmit` + `next build` is the full
verification gate.

## Deployment workflow — read before pushing

**This repo is worked on by Claude Code directly against a local clone,
committing and pushing straight to `main`.** There is no PR/review step —
every push to `main` triggers an immediate Vercel production deploy.
Verification (`tsc --noEmit` + `npm run build`, and a manual check via
`npm run dev` for UI changes) must happen *before* pushing, not after.
Commit in coherent logical batches, messages in French, never rewrite
`main` history.

## Architecture

```
Browser ── HTTPS ──> Vercel (Next.js App Router)
                        ├─ Edge Middleware: verifies the JWT session cookie
                        ├─ Server Components: read Neon (sql`` from src/lib/db.ts)
                        │    filtered through src/lib/access.ts
                        └─ Server Actions ("use server"): write to Neon,
                                        │    after an access.ts check
                                        ▼
                                 Neon Postgres (DATABASE_URL, table owner)
```

- **No REST/GraphQL data API.** Reads happen in Server Components at page
  load; writes happen through Server Actions (`"use server"`) triggered by
  forms/buttons. The few Route Handlers under `src/app/api/*` cover things
  that don't fit that model: `/api/version` (deploy-freshness probe),
  `/api/push/subscribe` (web push, also called from the service worker),
  `/api/cron/reminders` (Vercel Cron, gated by `CRON_SECRET`),
  `/api/tasks/[id]/calendar` (`.ics` export), `/api/widget` (read-only
  endpoint for the iPhone Scriptable widget, gated by `WIDGET_TOKEN`).
- **No RLS / DB-level policies.** The app connects to Neon as the DB owner
  via `DATABASE_URL`; all visibility/access rules are enforced in
  application code, centralized in `src/lib/access.ts`.
- **`src/lib/db.ts`** exports `sql`, the Neon client
  (`fetchOptions: { cache: "no-store" }` is forced — see cache pitfalls
  below). Used everywhere else via tagged template
  (`` await sql`select ... where id = ${id}` ``) or `sql.query(text, params)`
  for dynamically built SQL.
- **Client/server module boundary gotcha**: any `src/lib/*.ts` file that a
  **client** component imports must never import `sql` from `src/lib/db.ts`
  at module scope, even if only a non-client-called function in that file
  uses it — the bundler will embed the Neon client in the browser bundle,
  where `DATABASE_URL` is absent, causing a silent browser-only crash. This
  is why `src/lib/access.ts` only exports sync functions
  (`canView`/`canEdit`/`computeVisibility`); the async DB-querying variant
  (`getTaskAccess`) lives in `src/lib/actions.ts` instead.
- **Access control** (`src/lib/access.ts`): tasks are private by default,
  visible only to their creator, until explicitly shared per-person with a
  role — `editor` (view/edit/status/comment) or `viewer` (view/comment
  only). `tasks.visibility` (`shared`/`private`) is derived automatically
  by `computeVisibility()`, never set manually. Reads (`getTasks`/`getTask`
  in `src/lib/queries.ts`) filter at the query level via `canView`; writes
  (`updateTaskAction`/`deleteTaskAction`/`setStatusAction` in
  `src/lib/actions.ts`) check `canEdit` up front.
- **Auth** (`src/lib/auth.ts` + `src/middleware.ts`): `users` table, scrypt
  password hashing (`salt_hex:derived_key_hex`, constant-time compare), JWT
  session cookie (`jose`, verified in Edge middleware with no DB round
  trip). Only the very first admin account is seeded outside the app (by
  `db/neon_schema.sql`); all other accounts are created from
  Admin → « Membres ».
- **Timezone**: the whole app is explicitly Europe/Paris
  (`src/lib/timezone.ts`, `APP_TIMEZONE`). Instants are stored in UTC;
  wall-clock ⇄ UTC conversion is centralized there — don't format dates
  with the server's local/UTC time directly.
- **Recurring "agenda" domains** (Jardin/Voiture/Santé/Finances, under
  `/agendas`) each follow the same pattern: a `*-queries.ts` /
  `*-actions.ts` pair per domain (e.g. `garden-queries.ts` /
  `garden-actions.ts`), closing an activity auto-generates the next
  occurrence, and each has its own screen component
  (`JardinScreen.tsx`, etc.). Voiture/Santé/Finances share one schema
  shape; Jardin additionally has its own category table
  (`garden_activity_categories`).

## Database schema and migrations

- **`db/neon_schema.sql`** is the full, up-to-date, from-scratch schema —
  used only for a brand-new deployment (it's a destructive reset, never run
  against the live DB).
- **`db/migrations/NNN_*.sql`** are additive, numbered migrations applied
  by hand (Neon SQL Editor or `psql "$DATABASE_URL" -f ...`) to evolve an
  already-deployed database. Always additive (`add column if not exists`,
  `create table if not exists`, never `drop`). When adding one, also
  replay the change into `neon_schema.sql` so it stays the accurate
  from-scratch reference.
- **`supabase/`** is a historical, unmaintained archive from before the
  11/09/2026 Neon migration — do not modify or treat as current.

## Known cache pitfalls (checked first for any "stale data after mutation" bug)

1. Static rendering — pages showing mutable data need
   `export const dynamic = "force-dynamic"`.
2. Next.js `fetch()` Data Cache — forced off globally via
   `cache: "no-store"` in `src/lib/db.ts`'s `neon()` call.
3. Client Router Cache — disabled via `experimental.staleTimes.dynamic = 0`
   in `next.config.mjs`.
4. Service worker (`public/sw.js`) — network-first for all pages/data;
   only falls back to cache when the network fails (offline read-only mode).
   Never make it cache-first for pages/data again — that was the cause of a
   previously-fixed stale-UI bug.

## Environment variables

See `.env.example` / README for the full list and generation commands.
Required: `DATABASE_URL` (Neon **pooled** connection string — a Neon
password rotation invalidates the whole string, not just the password;
always regenerate it from the dashboard after rotating), `SESSION_SECRET`
(changing it logs everyone out), `NEXT_PUBLIC_VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (web push, generate once and never
regenerate), `CRON_SECRET`. Optional: `WIDGET_TOKEN` / `WIDGET_PROFILE_ID`
(iPhone widget).
