# Plan 31 — Faster Statistik, and fewer round trips everywhere

> Source: asked 2026-10-12 — "switching between the day/week/month views … sometimes takes a
> second or 2 … we should be able to cache most things, so that a switch could be instant",
> and later: "something that marks the cache as stale every time we log something new …
> if nothing has been logged and the cache is up to date, we just [read] from there."

> **Status: ✅ 31a merged (#65); 31b built, awaiting merge** — branch `feature/page-cache`.
> Measurements are from production data (read-only EXPLAIN ANALYZE as the logged-in user,
> RLS included) and a production build against the local stack. Item 5's questions were
> settled with Marcus the same day (Decided, below). 31a verified on the local stack, against
> a build of master on the same data:
>
> - **Statistik draws exactly as master** in all three periods, reached by URL or switched
>   in place: every card's text and every chart mark (290, 261 and 251). Trender's data is
>   byte-identical. The migration's views return the same 315 rows as the old ones
>   (buckets, windows, care status), compared in one transaction so `now()` held still.
> - **A switch makes no request and takes ~15 ms** at 4× CPU throttle (~100 ms before,
>   locally). History doesn't grow, a reload lands on the period, folds stay, and without
>   JavaScript the tabs are still links. The payload grows 34 → 40 KB (+1.3 KB gzipped).
> - **Every page's load got faster**, locally: Statistik 35 → 18 ms, Trender 38 → 7,
>   Status 26 → 6, Logga 25 → 9. The bucket view alone: 22 → 1.3 ms locally, ~100 → 6 in
>   production.
> - **Auth:** no `/user` call per request (master makes one), no tokens in page data
>   (master sends them), signed out and a forged cookie redirect to login, an expired
>   session is refreshed, logout and login again work. The local stack signs ES256 too.
> - **Found while building:** the tabs kept preloading on hover and touch
>   (`preload-data="hover"` on `<body>`) after they stopped navigating, so in-place tabs
>   turn preloading off. `/live` and `/push` read `locals.user`, so they take `userId` now.

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

### 5. Every page shown from the phone first, checked against a version

Every page (Logga, Status, Statistik, Trender, Historik) is kept on the phone, across
launches, and shown straight away. A small network check then says whether anything was
written since; only then is the page read again, in the background.

**The stale marker lives in the database.** A per-household `data_version`, bumped by a
trigger on every write to `events`, `type_settings`, `stats_settings`, `trend_settings`
and `event_types` (one household, so the catalogue bumps it too). That catches Ida's
phone, lock-screen saves and anything else that writes, which a flag set by this phone's
own logging would miss.

**The check** is a small endpoint, `{ version, day }`. After 3 it's one in-region query and
no auth round trip. It always goes to the network: the service worker never answers it,
so "nothing changed" is only ever said by the server. When it can't be reached, what's on
screen stays and it's retried, as `catchUp` does today.

**What counts as changed, per page:**

| Page               | Re-read when                  | Why                                                                                                  |
| ------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| Logga, Status      | the version moved             | Times are absolute (`due_at`, `occurred_at`); "x min ago" and overdue come from the phone's clock    |
| Historik           | the version moved, or the day | The calendar marks today from the server's date (found while building)                               |
| Statistik, Trender | the version moved, or the day | SQL computes them for today: 30-day windows, buckets up to today, days tracked, the last two periods |

A day change never makes anyone wait: Tuesday's Statistik shows at once on Wednesday and
is replaced a moment later. Status's "average" intervals lean on a 30-day mean that
drifts a fraction a day, and the away time while a Hundvakt is open is counted to `now()`;
neither is worth a re-read.

**Where the copy lives: the service worker's cache.** It already keeps the last good copy
of every page and its `__data.json`, per build, but only uses it offline. It becomes
cache-first for page and data requests, each copy stamped with the version and day it was
read for (response headers). Design notes for the build:

- **The worker has to know when a copy is stale.** The page tells it the version the
  check returned; a copy stamped older, or a day-keyed copy from another day, goes to the
  network. Before a launch's first check, the copy is served (show first).
- **A write from this phone** makes the next read go to the network, so the page after a
  log never shows the copy from before it.
- **Logout clears the cache.** The login page stays uncached, as today.
- **A deploy starts a new cache** (it's per build), so the first launch after one reads
  from the network.
- **Pages use the phone's clock once hydrated**, not the server's `now`: a copy rendered
  yesterday must not count elapsed time from yesterday's render.

**`catchUp` asks the version instead of re-reading.** On a launch, or a return after
30 s, it runs the check. If nothing moved, what's on screen is current and no page is
read; if something did, it re-reads from the network. Its "did this reach the server?"
guard moves to the check, which is what reaches the server now.

### The hallway: a notification tap on weak wifi

A tap on a cold app makes three requests before Status shows. The app opens on `/`, so
the whole Logga page loads first. The tap is handled only once that page runs
(`listenForTaps` → `goto('/status')`), a second load. And `catchUp` re-reads the page on
launch, a third request on the same weak signal.

With item 5, Logga and Status both come from the phone, and the launch makes one small
request, the version check. No native change. If taps still feel slow after that, the
Android side could open the tapped URL instead of `/`, but that needs a new APK.

## What building 31b found

Verified on the local stack in headless Chrome, with the gateway's access log counting what
reached the database: moving between pages within 30 s reads nothing; after 30 s a
navigation makes one version check and no re-read; a walk inserted behind the app's back
(the other phone) is caught by the next check and shows on Status; our own log shows on
Status straight away; offline, navigation shows copies; a relaunch shows its copy in
~20 ms and catches up; a quiet relaunch makes one check; logout drops every copy. Turning
off the worker's write rule makes the own-log check fail, so it is a real guard. Without
the version table (the minutes between merge and `db push`), pages load and a resume
re-reads, as before.

- **A copy's render stamp no longer proves the server was asked.** `catchUp` took any new
  `renderedAt` as a fresh read, so every navigation to a copy reset its 30 s and the check
  never ran. `sendPending` now says whether it re-read, and only then does the stamp count.
- **Opening the app needed its own rule.** A launch loads the document, and in-app reads
  never renew that copy, so after any log the launch waited for the network: the slow first
  open again. A launch now shows its copy whatever its version (copy first, as decided);
  once `catchUp` has re-read, the worker renews the document copy for the next launch,
  after the re-read rather than alongside it.
- **Chrome's auto preload.** When the worker is asleep (~30 s idle), Chrome sends the
  launch's navigation to the network while waking it, and throws the answer away: one
  wasted render in the background. It doesn't delay what's shown. Off with
  `--disable-features=ServiceWorkerAutoPreload`, the quiet relaunch makes one check only.
  Whether the Android WebView does the same is unmeasured.
- **Sheets stay network-only.** `?detail=`, `?event=` and `?add` carry a server-made event
  id and time in their form, which a copy would reuse.
- **Quiet writes:** `/live` (the walk marker) and `/push` change nothing a page shows, so
  they don't make the copies wait.
- **Status ticks now.** Its times came from the server's `now` and never moved; Logga and
  Status follow the phone's clock from hydration on (`liveNow`).

## Decided

| Question                          | Answer                                                                |
| --------------------------------- | --------------------------------------------------------------------- |
| Back on Statistik                 | **Leaves Statistik** (`replaceState`); no stepping through periods.   |
| Which pages get the cache         | **All of them**, Logga and Status included.                           |
| Cached copy first, or check first | **Copy first.** Little changes between one open and the next.         |
| The clock                         | **The day keys Statistik and Trender**; drift while away is accepted. |
| Memory only, or across launches   | **Across launches.** The first open of the day is the slowest one.    |
| `catchUp` when nothing changed    | **No re-read.** The version check, against the network, is enough.    |

## 6. Cold starts (measured)

Probed from outside on 2026-10-12: one request to `/login` after an idle gap, then one
straight after. `/login` reads no data, so this is the function alone.

| Idle gap | First request | Warm request |
| -------- | ------------- | ------------ |
| 1 min    | 190 ms        | 93 ms        |
| 3 min    | 120 ms        | 92 ms        |
| 5 min    | 160 ms        | 73 ms        |
| 10 min   | **757 ms**    | 91 ms        |
| 15 min   | **802 ms**    | 95 ms        |
| 25 min   | **815 ms**    | 90 ms        |

**After about 10 minutes idle, the function starts cold: ~700 ms extra**, on a good
connection, before any auth or data. With two users, most opens are like that, and the
first one of the day always is. Logs on Vercel's plan keep no durations, so this is
measured from outside.

Item 5 is the fix that matters: a cold start then delays only the background version
check, not what's on screen. Keeping the function warm (a ping every few minutes) would
also remove it, but it spends invocations to hide a cost item 5 already hides, so it's
**not planned**.

## Order

Two PRs, like 29:

- **31a:** items 1–4. Independent of each other, each small, no new UI. One migration (2).
- **31b:** item 5: a migration (the version and its triggers), the endpoint, the worker,
  `catchUp`.

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
