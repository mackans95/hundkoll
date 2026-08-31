# Plan 14 — Stale launches, and the log grid going missing

> Source: reported 2026-08-31 — "it still sometimes shows just older events than
> the most recent ones on a new start … and also sometimes the actual logging buttons
> section just disappears, forcing me to do a reload to get it back."

> **Status: ✅ Built** — PR #45. Two separate faults with one thing in common: a read
> that failed or never happened looks exactly like a read that succeeded. Both were
> reproduced before being fixed, and measured again after.

## Fault 1 — the log grid disappears

Fully explained, and every step is in the code.

`listEventTypes` returns `[]` when the read fails, and says so in a comment: "A failed
read empties the log grid, which is loud enough on screen." It is not loud on screen.
`LogGrid` is `{#each types as type}` with no empty branch, so a failed read renders an
**empty card** — the buttons simply are not there.

Then it sticks, which is the part that makes it a bug rather than a blip:

```ts
// +page.server.ts
if (events === null) {
	setHeaders({ 'cache-control': 'no-store' });
}
```

The `no-store` guard exists precisely to stop a holed page becoming the cached copy —
but it only asks about `events`. A **types** failure sets no header, so the service
worker caches the tile-less page and serves it on the next launch, and the next. A
manual reload is the only thing that replaces it, which is exactly the workaround being
used.

`recentEvents` was given a null-means-failed return and an `eventsFailed` flag, and
`EventList` has a failure message. `listEventTypes` never got the same treatment, and
neither did `dogCareStatus`, `listIntervals` or `loadStats` — `/status`, `/settings` and
`/stats` have **no cache guard at all**, so a failed read there is cached as an empty
screen too.

### Fix

- `listEventTypes` returns `EventType[] | null`, the way `recentEvents` does.
- `/` (and `/history`, `/status`, `/settings`, `/stats`) set `no-store` when **any** read
  on the page failed, not just the events read. Worth a tiny shared helper so the next
  page cannot forget.
- `LogGrid` gets a failure state. An empty catalogue and an unreachable one are different
  things, and the second must say so — the tiles are the whole point of the screen.
- A test on the guard itself, including the case that caused this — that it asks about
  every read it is given, not just the first.

## Fault 2 — older events after a launch or a resume

PR #39 added the machinery for this and it still happens, so the interesting question is
what that machinery misses. Two things, both provable, and **either one alone produces
the symptom**.

### 2a. Freshness is measured across two clocks

`renderedAt` is `Date.now()` on the **server**. `isStale` compares it to `Date.now()` on
the **phone**:

```ts
const age = now - renderedAt;
return age < 0 || age >= after;
```

A phone running behind the server shrinks the measured age. Rendered 45 s ago on a phone
20 s slow reads as 25 s old — under the 30 s threshold, so **no re-read**. A phone five
minutes slow never re-reads on any resume shorter than five and a half minutes.

`tests/freshness.test.ts` claims to cover this: "A device clock behind the server's would
otherwise report every page as fresh forever, which is the one failure worth not having."
But it only tests the case where the skew makes the age **negative** — the phone being
slow by _less_ than the page's real age is the gap, and it is the common one. Phones drift;
this needs no misconfiguration.

### 2b. A cache-served re-read is indistinguishable from a successful one

The service worker caches `__data.json` like any other GET, and serves it from cache when
the network throws. `catchUp` knows and treats it as a feature:

> Safe to call offline: the service worker answers the data request from its cache, so the
> re-read resolves with what is already on screen instead of failing.

The consequence is that `await invalidateAll()` **resolves successfully with the same old
data**, re-installing the old `renderedAt`. No exception, so nothing is logged and nothing
retries. One flaky moment at launch — a phone whose radio has not reassociated yet, which
is every launch after sleep — leaves old data on screen until the user happens to
background the app and come back. There is also no timeout on that `fetch`, so the request
can hang for tens of seconds instead of failing fast into the cache.

### Fix

Measure age on **one clock**, and check that a re-read actually happened.

- **A new JS context is always stale.** A launch cannot know whether its HTML came from
  the server or the worker's cache, so it should not try to: re-read once, always. Costs
  one data request per launch, which the current code already pays for any page older than
  30 s.
- **Within a context, stamp the read on the client.** Record `Date.now()` (phone clock)
  whenever `renderedAt` changes, and compare that to the phone's clock on the next resume.
  Same clock at both ends, so drift cannot hide staleness. `renderedAt` stops being the
  measurement and becomes only the "did the data actually change" signal below.
- **Verify the re-read landed.** After `invalidateAll()`, compare `renderedAt` to what it
  was before. Unchanged means the request never reached the server, so retry with backoff
  while the page stays visible, instead of assuming success.
- `isStale` keeps its shape; what changes is where its arguments come from, plus a new case
  for "this context has read nothing yet". Its tests are rewritten around that, since the
  old ones documented a guarantee the function did not give.

### And a third thing, found on the way

`catchUp`'s in-flight guard can swallow the launch's queue flush:

```
onMount(() => { loadTheme(); loadQueue().then(catchUp); });   // +layout.svelte
<svelte:window onpageshow={catchUp} />                        // …and here
```

`pageshow` fires at `window.load`, typically before `loadQueue()` has come back from
IndexedDB. That first `catchUp` runs `sendPending()` against an **empty in-memory queue**,
sends nothing, and then sits in `invalidateAll()`. When `loadQueue()` finally resolves, its
`catchUp` returns the first one's in-flight promise and does nothing. So a log made without
signal yesterday keeps its hourglass at launch and is not sent until the app is
backgrounded and reopened.

Not the reported symptom — the queued row does show, `EventList` merges it — but it is the
same module and the same class of fault. Fix: fold the queue load into the catch-up so
"we are back" means one sequence, rather than two racing entries into it.

> **This one did not reproduce.** A log left in IndexedDB was sent at launch by the old
> code just as it was by the new one. Locally `loadQueue()` comes back before `pageshow`
> fires, so the race never opens — on a phone's timings it might, but that is an argument,
> not a measurement. The restructure is kept because one sequence
> is simpler than two racing entries into it and the race cannot open at all afterwards —
> but it is a tidy-up, not a demonstrated fix, and nothing here should be read as one.

## What this plan does not claim

Both 2a and 2b were reproduced on the desk, but **which of them fires on the phone is still
unknown** — nothing here measures that. The fix for each is correct independently of the
other, so the approach was to remove the class rather than to pick a suspect: freshness is
now measured on one clock, a launch always re-reads, and a re-read that did not reach the
server says so instead of passing for success.

If it recurs after that, the next step is evidence rather than another fix — the remaining
suspects are iOS not firing a signal on resume from the app switcher, and those can only be
told apart by instrumenting the device.

## Files

| File                                    | Change                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `src/lib/server/reads.ts`               | new: the one guard every page load now asks                                     |
| `src/lib/server/care.ts`                | `listEventTypes` and `careStatus` return null on failure                        |
| `src/lib/server/stats.ts`               | reports `failed`, asked of the results array so a query added later is covered  |
| the five `+page.server.ts` loads        | the guard, and a `*Failed` flag where a screen can say so                       |
| `src/lib/components/log/LogGrid.svelte` | a failure state, distinct from an empty catalogue                               |
| `status`, `settings`, `stats` pages     | the same distinction on those screens                                           |
| `src/lib/locale.ts`                     | four Swedish lines for it                                                       |
| `src/lib/offline/freshness.ts`          | client-stamped age, "no stamp" is stale, and `hasLanded`                        |
| `src/lib/offline/catchUp.ts`            | always re-read on a new context; verify it landed and retry; own the queue load |
| `src/routes/+layout.svelte`             | one way back in, not two racing                                                 |
| `tests/freshness.test.ts`               | rewritten: the launch case, the partial skew, and `hasLanded`                   |
| `tests/reads.test.ts`                   | new: the guard, including "every read, not just the first"                      |

## Verified

Each fault was reproduced on the old code first, then measured again on the new, against
the local database loaded from the production snapshot.

**The grid.** Made only the catalogue read fail, and nothing else — table `select` revoked
from `authenticated` and re-granted per column, so `listEventTypes` (which needs `category`
and `sort_order`) fails while the embedded `type:event_types(label, icon)` join in
`recentEvents` still succeeds. That isolation matters: when both reads fail the old guard
did set `no-store`, and the reported bug is the case where only one does.

| on an isolated catalogue failure | log tiles | says why | `cache-control`               |
| -------------------------------- | --------- | -------- | ----------------------------- |
| before                           | 0         | no       | none — **kept by the worker** |
| after                            | 0         | yes      | `no-store`                    |

**The clock.** `Date` shifted 20 s back in the page before any app code runs — a phone
running slow by less than the page's age, which is the case the old threshold got wrong.
Page left for 33 s, then a hidden → visible resume:

| with a 20 s-slow clock and a 33 s-old page | data requests on resume |
| ------------------------------------------ | ----------------------- |
| before                                     | **0**                   |
| after                                      | 1                       |

**The cache-served re-read.** Simulated faithfully rather than approximately: one real
`__data.json` response captured, then every later one fulfilled with that same body over
CDP — which is what a cache hit is, render stamp included. The new code made **3 attempts**
in a 16 s window (immediately, then 2 s, then 8 s) where the old code made one and took it
as success. Worth being precise about what the old code did wrong here: it would have
re-read on the _next_ signal, so this was never permanent — it was stale for as long as you
sat looking at it, which is exactly when it was reported.

**No regressions.** Every route over CDP: 10 tiles on the log page, 5 charts on Statistik,
Status, Historik and Inställningar all rendering, no failure message anywhere, console
clean. 184 tests, `npm run check` clean over 492 files, `npm run lint` clean,
svelte-autofixer clean on the changed components. The local database was left at the 216
events it started with.
