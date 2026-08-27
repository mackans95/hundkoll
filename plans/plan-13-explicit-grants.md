# Plan 13 — Grants that a migration actually asked for

> Source: asked 2026-08-27, right after plan 12 — "then you might aswell do that migration
> direcly, so i dont forget and the app suddenly stops working."

> **Status: ✅ Built** — committed straight to master at Marcus's request, no PR. One
> migration, one config line, no application code.

## Why this had a deadline on it

This project was created before Supabase stopped auto-granting `anon` and `authenticated`
on new tables in the `public` schema. So production ran on privileges no migration ever
asked for, and the local stack needed `auto_expose_new_tables = true` to imitate them. That
config field is documented as **removed on 2026-10-30**, after which a database rebuilt
from these files would come up unreadable — looking like an RLS problem while being a
`GRANT` problem.

What was inherited was also far more than the app uses. Before this migration:

```
anon          = arwdDxtm   on households, household_members, dogs, and every view
authenticated = arwdDxtm   the same
```

`a` is INSERT, `w` UPDATE, `d` DELETE, `D` TRUNCATE. So the anonymous role could truncate
the events table, with RLS as the only thing in front of it. Two earlier migrations had
already noticed the shape of this and fixed it for UPDATE only —
`20260812150000_intervals_and_status.sql` and `20260821090000_event_update_policy.sql` both
`revoke update … from authenticated, anon` and grant back a column list. This finishes it.

## What the app actually needs

Established by reading every `.from(…)` call and every RLS policy, then proved by running
the operations rather than by reasoning about them.

| Role            | May                                               |
| --------------- | ------------------------------------------------- |
| `anon`          | `select` on `event_types`, and nothing else       |
| `authenticated` | `select` on the five tables and five views        |
|                 | `insert`, `delete` on `events`                    |
|                 | `update (occurred_at, details, note)` on `events` |
|                 | `update (interval_days)` on `event_types`         |
| `service_role`  | everything, as before                             |

Three things that took checking:

- **`authenticated` needs `select` on `dogs` and `household_members`** even though no query
  names them, because the `events` policy's `using` clause reads both. A policy expression
  is checked against the caller's privileges like any other subquery.
- **`anon` gets nothing but the catalogue.** Granting it `select` elsewhere would be a
  promise the database does not keep: the initial migration revokes `execute` on
  `is_household_member` from `anon`, so reading `events` or any stats view as `anon` raises
  `permission denied for function` rather than returning zero rows. The stats views were
  granted `to anon` when they were added; they are `authenticated`-only from here.
- **`service_role` had to be stated too.** The retiring auto-exposure covered that role as
  well, so without a grant a rebuilt local database comes up with Studio's table editor
  unable to read. Nothing in the app or the scripts uses the secret key.

The migration revokes before it grants, because revoking UPDATE on a table drops its column
grants with it — which is also what makes the file safe to re-run.

## Verified

- **The operations, not the theory.** As `authenticated`, with `request.jwt.claims` set,
  inside a transaction that was rolled back: every read the app makes, plus insert, the
  three-column update, the interval update, and delete. All succeeded on the stated grants
  alone.
- **The tightening holds.** `authenticated` inserting a dog, moving an event to another dog,
  rewriting `created_by`, or truncating `events` — all `permission denied`. `anon` inserting
  an event — denied. `anon` reading `event_types` — 10 rows, as intended.
- **Through the real app**, over CDP: `/login` as `anon`, then the log grid, Status, History,
  Settings and Statistik, then a log → edit → delete round trip through the form actions,
  which is what exercises PostgREST's embedded `type:event_types(…)` read and the
  `count: 'exact'` writes. Console clean; the local database came back to its 216 events
  with nothing left behind.
- **A build from the migrations alone.** A throwaway database in the same container, given a
  stub `auth` schema and then every migration in order, produced grants **byte-identical**
  to the live one for all three roles, at table and column level. That is the check the
  config change needed, and it cost no `db reset` — so the five Biltur test rides survived.

## The config line

`auto_expose_new_tables` is now absent from `config.toml` rather than `true`. Keeping it
would mean local still lies: a new table would read fine here and land unreadable in
production after October. The cost is that **a new table or view now needs its grant in the
same migration** — which is what the stats views already do, and what the README now says
next to the flag.

## Files

| File                    | Change                                                          |
| ----------------------- | --------------------------------------------------------------- |
| `…_explicit_grants.sql` | new: revoke the inherited, grant what the app uses              |
| `supabase/config.toml`  | the auto-exposure crutch removed                                |
| `README.md`             | the flag paragraph, and "RLS decides rows, grants decide verbs" |

## Not built

- **Grants on the `auth` schema.** GoTrue manages its own, and nothing here touches them.
- **A test that fails when a new table has no grant.** The local stack failing loudly is the
  mechanism, and it only fires on `db-local:reset`. A check that walks `pg_class` for
  ungranted relations would catch it at `npm run check` time instead — worth it the next
  time a table is added, not before.
