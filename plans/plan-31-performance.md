# Plan 31 — Faster Statistik, and fewer round trips everywhere

> Source: asked 2026-10-12 — "switching between the day/week/month views … sometimes takes a
> second or 2 … we should be able to cache most things, so that a switch could be instant",
> and later: "something that marks the cache as stale every time we log something new …
> if nothing has been logged and the cache is up to date, we just [read] from there."

> **Status: 📝 Drafting** — branch `feature/performance`. Measurements below are from
> production data (read-only EXPLAIN ANALYZE as the logged-in user, RLS included) and a
> production build against the local stack. Item 5 has open questions to settle first.

## What a period switch costs today

A switch is a link, so it's a navigation: the hook verifies the user, then `loadStats`
reads `type_settings`, then everything else in parallel, then rebuilds every card.

| Step                                         | Cost                   |
| -------------------------------------------- | ---------------------- |
| `getUser()` in `hooks.server.ts`             | 1 round trip to Auth   |
| `type_settings`, awaited before the rest     | ~1 ms DB, 1 round trip |
| `stats_type_buckets`, day / week / month     | **~50 / 100 / 100 ms** |
| The other reads (windows, details, events …) | 1–22 ms each, parallel |
| Payload                                      | ~31 KB                 |
| Render at 4× CPU throttle                    | ~25 ms                 |

Vercel runs in `arn1` and Supabase in `eu-north-1`, both Stockholm; Fluid compute is on.
Locally the whole switch is ~100 ms. The browser side isn't the problem.

**Why the bucket view is slow.** Not the size of `events` (852 rows): filtering it to the
window first changed nothing. Postgres inlines the `absences` CTE into the gap check, so for
each of 642 gaps it re-reads the absence events and runs the `events` RLS policy on each
one: 3,174 policy checks, ~95 of the 101 ms. With `as materialized` the spans are read
once, and the query takes **~6 ms in every period with identical rows** (checked both ways
with `except` on production data).

## The fixes

### 1. Statistik switches period in the browser

`loadStats` builds the cards with a picker for **all three periods** in the one load, and
the tabs switch between them without a request. `?period=` still updates, through shallow
routing (`$app/navigation`), so a reload lands on the
same period, and with JavaScript off the tabs stay plain links into today's server render.

- Only cards with `chart.picker` vary by period; the rest are built once. Today that's
  Olyckor, so the payload grows by two Olyckor charts.
- The data is one snapshot, so there's nothing to invalidate: the page goes stale exactly
  as it does today, and is refreshed by the same things (a log, `catchUp`).

### 2. `as materialized` on the absence CTE

In `stats_type_buckets` and `stats_type_windows`, the two views that check gaps against
absences. A migration of `create or replace view` with the same columns, so the grants
stay. Statistik and Trender both read `stats_type_buckets`.

### 3. `getClaims()` instead of `getUser()`

The project signs tokens with ES256 (the HS256 key is "previously used"), so `getClaims()`
verifies the signature locally. auth-js caches the public keys across clients for 10
minutes, so a warm Fluid instance asks Supabase for nothing. `getSession()` still refreshes
an expired token from the cookie, as it does today.

- **Trade-off:** a session revoked in the dashboard keeps working until its access token
  expires (at most 1 h). Fine for two hand-created users with signup disabled.
- **Side finding, fixed in the same step:** the layout returns the whole `session` (access
  and refresh token included) as page data, so it's in every HTML render and
  `__data.json`, and the service worker caches those. The client only reads
  `data.session` for truthiness. The layout returns `signedIn: boolean` instead.

### 4. One wave of reads per page

- **Statistik:** `type_settings` is read before the rest because the config decides which
  reads to make. After 1 every period is read anyway, so the bucket reads no longer depend
  on it, and the events read can cover every charted type (409 rows over 30 days, ~1 ms).
  Only an every-event timeline's history needs the config; it's the one read that may
  stay in a second wave.
- **Trender:** three in a row today (event types → trend config → data). The config's raw
  JSON can be read alongside the types and parsed after. The data reads already cover
  both buckets; the detail read can drop its field filter, since it's 21 rows unfiltered.
- Logga, Status and Historik already read in one wave.

### 5. Version-checked page cache (to discuss)

Pages that are expensive and change only on writes are kept on the phone, and shown
straight away when nothing has been logged since.

- **The stale marker lives in the database.** A per-household `data_version`, bumped by a
  trigger on every write to `events`, `type_settings`, `stats_settings`, `trend_settings`
  and `event_types`. That catches Ida's phone, lock-screen saves and anything else that
  writes, which a flag set by this phone's own logging would miss.
- **The check:** a tiny endpoint returns `{ version, day }`. After 3 it costs one in-region
  query and no auth round trip.
- **Shape:** the page keeps the last load per URL in memory with the version and the
  Stockholm day it was read for, shows it on navigation, checks the version in the
  background, and re-reads only if either changed.

## Question for item 1

**Does the back button step through periods?** Today it does, since every tab is a
navigation. **Recommendation: no** (`replaceState`): back leaves Statistik. Stepping
backwards through Vecka, Dag, Månad is rarely what back is reached for.

## Questions for item 5, with my recommendation

### a. Which pages?

**Statistik, Trender and Historik.** All three change only on writes or with the date,
and past months in Historik are almost static. **Not Logga and Status**: they're cheap (one
wave, every query under 8 ms), and they show live state (due times, a running Hundvakt,
the live cards) where an old copy is worse than a quick read.

### b. Show the cached copy first, or check first?

**Show first.** Checking first still costs a round trip every navigation, which is most of
what's left to save. Showing first means a page might change a moment after it appears,
but only when someone else logged something since you last looked. Your own logs already
re-read the page before you navigate.

### c. The clock

Some numbers move with no write: today's bucket, the 30-day windows, and the away time
while a Hundvakt is open (counted up to `now()`). **Key on the Stockholm day, and accept
the minutes of drift while she's away.** A day change re-reads, as does any write or
`catchUp` after 30 s in the background.

### d. Memory only, or kept across launches?

**Memory only.** A launch already reads fresh (or from the service worker offline), and a
cache that survives launches needs its own invalidation story for the version endpoint
being unreachable.

### e. How this sits with `catchUp`

`catchUp` calls `invalidateAll()` after 30 s away. That should stay a real re-read, not be
answered from this cache. Otherwise "is what's on screen current?" would get a yes from
the cache itself.

## 6. Cold starts (measured)

Probed from outside: one request after an idle gap, then one straight after.

| Idle gap | First request | Warm request |
| -------- | ------------- | ------------ |
| 60 s     | 190 ms        | 93 ms        |

_(The probe is still running; filled in when it finishes.)_

## Order

Two PRs, like 29:

- **31a:** items 1–4. Independent of each other, each small, no new UI. One migration (2).
- **31b:** item 5, once the questions above are settled.

## Steps (31a)

1. Migration: both views with `absences as materialized`. Verify every row is identical
   to the old views for all periods and windows on the local snapshot, and time them.
2. `auth.ts`: `getClaims()`; `locals.user` becomes the claims' subject. Layout returns
   `signedIn`; `+layout.svelte` reads it.
3. `loadStats`: one wave, all periods for picker cards; `Stats.views` holds the static
   cards plus a per-period map for picker cards.
4. Statistik page and `TabBar`: tabs switch period in place with JavaScript (shallow
   routing), and stay links without it.
5. `loadTrends`: one wave.
6. Verify: Statistik, before and after, captured in all three periods and identical
   (the plan 29 capture). In headless Chrome, a switch makes no request and keeps
   folding; reload keeps the period; JS off still switches. Login, logout and an expired
   token still behave. Time a production-like switch before and after.

## After the merge

A migration, so `db push` after Marcus merges.

## Not in scope

- Precomputed stats tables. With 2 in place the views cost single-digit ms.
- Caching anything on Vercel's side. Every response is per user and behind auth.
