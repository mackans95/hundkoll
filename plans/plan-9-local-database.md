# Plan 9 — A local database to test against

> Source: reported 2026-08-27, after the first `npm run new-event` run produced
> a stats card but no log tile — "I would like to be able to test and view all
> parts that will be added locally before pushing everything to production …
> is there any way to apply the migration 'locally' first to test, and then push
> it to the real database?"
>
> Refined in review: the snapshot should be **production's own data** — "can we
> not get the current values in the production database, make a seed from it,
> then run it on a local db with supabase?" — and `npm run new-event` should
> **not** apply migrations itself; that stays a separate command.

> **Status: 📋 Planned** — not built. The stack itself is already verified
> working, see "What is already proven" below.

## Summary

Yes, and the pieces are all present already: the Supabase CLI is a
devDependency, `supabase/config.toml` is committed, and Docker is running. What
is missing is four npm scripts, a seed, and the two configuration corrections
that a first run turned up.

The point is not convenience. A new event type is **invisible until a migration
is applied**, because the log grid renders `event_types` rows — so today the
only way to see a new tile is to merge and push to the single shared production
database, which is exactly the wrong order. A local database makes the whole
change reviewable before anything reaches production.

```
npm run db-local     start Postgres, apply every migration
npm run db-pull      snapshot production's data into it (read-only, optional)
npm run dev:local    the app, pointed at local
npm run db-push      production — unchanged, still manual, still after a merge
```

## What is already proven

Brought up while writing this plan, against the real migrations:

- The stack starts and **all 13 migrations apply**, including the unmerged
  `20260827065303_add_car_ride_event_type.sql`.
- `select … from event_types` returns ten rows, `car_ride | Biltur | other | 🚗`
  among them — so the missing tile really is only a missing row.
- A missing seed file is a warning (`WARN: no files matched pattern`), not an
  error, so the seed can be optional.
- Trimming the stack to what the app actually uses cut it to three images
  (Postgres, PostgREST, Studio) — see the config change below.

And one thing that did **not** work, which is the interesting part.

## Correction 1: the local stack was not faithful to production

A REST read as `anon` failed:

```
{"code":"42501","message":"permission denied for table event_types",
 "hint":"Grant the required privileges … GRANT SELECT ON public.event_types TO anon;"}
```

The migrations grant almost nothing — `grant update (interval_days) on
event_types`, `grant update (occurred_at, details, note) on events`, and one
function grant. There is no `grant select` anywhere, and the app plainly works
in production. The reason is in `config.toml`:

> `auto_expose_new_tables` — Controls whether new tables … created in the
> `public` schema by `postgres` are reachable through the Data API roles
> (`anon`, `authenticated`, `service_role`) without explicit GRANTs. **When
> unset, new entities are NOT auto-exposed, matching the new cloud default.**

Production was created on 2026-08-12, under the old default, so its tables
carry implicit grants that a database created today does not. Setting
`auto_expose_new_tables = true` and running `db reset` gives `anon` and
`authenticated` the same privileges production has, and the REST read then
returns all ten types. **Already applied** to `config.toml`, with a comment
saying why, because a local stack that does not match production is worse than
none.

### The follow-up this exposes, which is not this plan's job

That config field is documented as **removed on 2026-10-30**, when
always-revoked becomes permanent. Existing tables keep their grants, so nothing
breaks on that date — but any table a future migration adds to production will
land unreadable, and the failure will look like an RLS problem while being a
`GRANT` problem. The durable fix is explicit `grant select` statements in a
migration, so the schema says what it relies on instead of inheriting it from
the year the project was created. That is a production schema change and
deserves its own plan; noting it here so the deadline is written down somewhere.

## Correction 2: only the services the app uses

`realtime`, `storage`, `edge_runtime` and `analytics` were all enabled and none
are used — no `@supabase/realtime` import, no bucket, no edge function, and
`dogs.photo_path` is a column nothing reads. Disabled, leaving Postgres,
PostgREST, GoTrue, Kong and Studio. **Already applied.**

Also set: `enable_signup = false`, matching production, where the two users were
made by hand and public signup is off. A local stack that would happily accept a
signup hides a difference that matters.

## The seed, in two halves

`config.toml` gets `sql_paths = ["./seed.sql", "./seeds/*.sql"]`, and
`supabase/seeds/` is gitignored.

### `supabase/seed.sql` — committed, no production access needed

One login, one household, one dog. This is what makes `npm run db-local` useful
on its own: a working app with an empty history, which is all you need to see a
new tile and open its dialog.

```sql
-- The local login. Password auth is the only kind, and the app sends no email,
-- so a confirmed user inserted here is a complete account.
--   dev@local / localdev
insert into auth.users (id, email, encrypted_password, email_confirmed_at, …)
values ('00000000-0000-4000-8000-000000000001', 'dev@local',
        crypt('localdev', gen_salt('bf')), now(), …);
```

`crypt(…, gen_salt('bf'))` is exactly what the README already documents for
resetting a production password by hand, so this is the same mechanism rather
than a new one. The full column list for `auth.users` is the one fiddly part of
this plan — GoTrue wants `instance_id`, `aud`, `role` and both metadata columns
populated — and the acceptance test for getting it right is simply logging in.

`locale.errors.noDog` already reads _"Ingen hund hittades. Har seed-SQL:en
körts?"_, which suggests this file was always meant to exist.

### `supabase/seeds/prod-snapshot.sql` — generated, gitignored, optional

`npm run db-pull` writes production's data here. It is real data about a real
dog, so it stays out of git — `supabase/seeds/` is ignored, and the file is
written nowhere else.

With it loaded, the local app shows the actual history: the events list has
content, every stats card draws real bars, and a **new** stats card can be
judged on data instead of on an empty state. That is the difference between
reviewing a chart and guessing at one.

## How `db-pull` works, and what it touches

One production operation, and it is a read:

```
supabase db dump --linked --data-only -s public
```

The CLI is already linked (`supabase/.temp/linked-project.json` → `hundkoll`)
and authenticated, but **no database password is stored**, so the first run
prompts for it — or takes `SUPABASE_DB_PASSWORD` from `.env`, which is
gitignored. Nothing is written to production, at any point, by anything in this
plan.

Three things then have to be true for the dump to load locally, and each has a
cheap answer:

1. **`event_types` must not be in it.** The migrations already insert those
   rows, so a dumped copy collides on the primary key. Excluded from the dump.

2. **User ids must resolve.** `household_members.user_id` and
   `events.created_by` reference `auth.users`, and production's user ids do not
   exist locally. Rather than copy password hashes to disk, the script reads the
   distinct user ids (`select distinct user_id from household_members`, and the
   same for `created_by`) and rewrites every one of them to the seeded local
   user. Locally there is one login, and everything is attributed to it —
   invisible in the UI, which never displays who logged an event.

3. **The committed seed's own household must give way.** The snapshot begins by
   truncating `households`, `household_members`, `dogs` and `events`, then
   inserts production's, so the local login ends up a member of the real
   household rather than sitting next to it with a second dog.

Load order is `seed.sql` (the login) then the snapshot (the data), which is what
`sql_paths` above spells out.

## Pointing the app at it

`supabase status -o env` prints the local `API_URL` and publishable key —
fixed, well-known local development values, not secrets. `npm run db-local`
writes them to `.env.localdb`:

```
PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
```

and `npm run dev:local` is `vite dev --mode localdb`. Vite loads `.env` before
`.env.[mode]`, and the later file wins, so **the production `.env` is never
edited or moved** — `npm run dev` keeps pointing at production exactly as it
does today, and the two are one flag apart. `.env.*` is already gitignored.

Verified, since the whole workflow rests on it — the same `loadEnv` call
SvelteKit resolves `$env/static/public` through, against the real `.env`:

```
mode=development  url=production  key=production
mode=localdb      url=LOCAL       key=LOCAL
```

## Scripts

| Script                  | Does                                                                 |
| ----------------------- | -------------------------------------------------------------------- |
| `npm run db-local`      | `supabase start` (idempotent), apply pending migrations, write `.env.localdb` |
| `npm run db-local:reset`| `supabase db reset` — drop, re-run every migration, re-run the seeds  |
| `npm run db-local:stop` | `supabase stop`                                                      |
| `npm run db-pull`       | snapshot production's data into `supabase/seeds/prod-snapshot.sql`    |
| `npm run dev:local`     | `vite dev --mode localdb`                                            |
| `npm run db-push`       | **unchanged** — production, manual, after the merge                  |

`npm run new-event` still writes files and touches no database, as decided; its
closing checklist points at `npm run db-local` (plan 8, change 3), so the gap
that made the Biltur tile look missing is named at the moment it appears.

Worth a line in the README too: `npm run gen-types` regenerates
`src/lib/types/database.ts` with `--linked`, i.e. from production. Against an
unmerged migration that is wrong; `--local` is the flag that matches this
workflow.

## Safety

The whole point is that production is untouched, so stating it plainly:

- **Nothing here writes to production.** `db push` is not called by any new
  script. The one production operation is `db dump`, a read.
- `db reset` is destructive **to the local container only** — it is
  `supabase db reset`, which acts on the project's local Docker volume and has
  no remote form in these scripts.
- `config.toml` changes affect the local stack. They only reach production via
  `supabase config push`, which nothing here runs.
- The snapshot holds real personal data and lives in a gitignored directory. The
  repo already refuses commits from the wrong author via `.githooks/pre-commit`;
  this file is kept out by `.gitignore` and by never being written elsewhere.

## Files

| File                        | Change                                                            |
| --------------------------- | ----------------------------------------------------------------- |
| `supabase/config.toml`      | ✅ done: `auto_expose_new_tables`, four services off, `enable_signup` |
| `supabase/config.toml`      | `sql_paths` gains `./seeds/*.sql`                                 |
| `supabase/seed.sql`         | new, committed: the local login, household and dog                |
| `scripts/db-pull.ts`        | new: dump production data, rewrite user ids, write the snapshot    |
| `scripts/db-local.ts`       | new: start, migrate, write `.env.localdb`                          |
| `package.json`              | the five scripts                                                  |
| `.gitignore`                | `supabase/seeds/`                                                  |
| `README.md`                 | a "Working against a local database" section; the `gen-types` note |

## What I recommend not building

- **Automatic migration application from `new-event`.** Asked for and declined;
  the script writes files, `db-local` applies them.
- **A second local login.** Two users exist in production because two people
  use the app; locally, one is enough, and the multi-user behaviour that matters
  (RLS on household membership) is exercised by a single member just as well.
- **Generated fake history.** Superseded by the production snapshot, which is
  strictly better for judging a chart.
- **Running the local stack in CI or in the test suite.** vitest covers pure
  logic here on purpose, and nothing in the suite needs a database. A local
  stack is a review tool, not a test dependency.
- **Automatic `db push` on merge.** The manual, deliberate push is the thing
  standing between an unmerged migration and a shared production database.
