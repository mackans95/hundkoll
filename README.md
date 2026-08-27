# Hundkoll

A private daily-care log for our dog **Våfflan** — walks, meals, accidents, grooming,
health. Built for one specific moment: standing in the hallway with a leash in one hand,
logging a walk with the thumb of the other.

The question the app exists to answer is _"when was X last done, and is it overdue?"_

## The app

Four screens, as a bottom tab bar:

| Screen            | What it does                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Logga** (`/`)   | A grid of tap targets (three per row), one per activity. Tapping opens a dialog for time, type-specific details and a note. |
| **Status**        | Cards for activities with an expected interval — last done, next due, colour-coded green/amber/red.                         |
| **Statistik**     | Trends between the last two complete periods, plus per-topic cards for walks, food, accidents and weight.                   |
| **Inställningar** | The interval for each activity, editable. Blank means "no schedule". Also logout.                                           |

Plus **Historik** (`/history`), a month calendar reached from a link on the log page rather
than a fifth tab — the tab bar is for daily screens, and history is an occasional lookup.
Tapping any stored event, in either list, opens a sheet to correct or remove it.

Swedish in the UI, English in the code.

## Stack

- **SvelteKit** (Svelte 5 runes) + TypeScript + Tailwind 4
- **Supabase** — Postgres, Auth, RLS (region `eu-north-1`)
- **Vercel** via `adapter-vercel`, function pinned to `arn1` (Stockholm) so it runs in the
  same city as the database — see [Performance](#performance)
- No runtime dependencies beyond `@supabase/supabase-js` and `@supabase/ssr`. The charts
  are hand-rolled inline SVG; there is no charting library.

## Running it locally

```sh
npm install          # also wires up the git hooks, see Conventions
npm run dev
```

You need a `.env` with the two variables in [`.env.example`](.env.example):

```
PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

> **`PUBLIC_SUPABASE_URL` must be the bare host** — no `/rest/v1` suffix. `supabase-js`
> appends service paths itself, and a suffixed base URL breaks auth with a confusing 404
> (`Invalid path specified in request URL`). This has bitten us once already.

The publishable key is safe in the browser **only** because RLS is enforced. It identifies
the app, not the user, and is never an authorisation mechanism. The secret key is not used
anywhere in this project.

Other commands:

| Command             | Purpose                                                                             |
| ------------------- | ----------------------------------------------------------------------------------- |
| `npm run check`     | `svelte-check` + the script projects — run before committing                        |
| `npm test`          | vitest over the pure modules in `tests/`                                            |
| `npm run format`    | Prettier                                                                            |
| `npm run build`     | production build                                                                    |
| `npm run new-event` | generate a new tracked activity — see [Adding an event type](#adding-an-event-type) |
| `npm run db-push`   | apply pending migrations to **production** — only after a merge                     |
| `npm run gen-types` | regenerate `src/lib/types/database.ts` from the linked (production) schema          |

And for the local database, see [Working against a local database](#working-against-a-local-database):

| Command                  | Purpose                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `npm run db-local`       | start local Postgres, apply every migration, write `.env.localdb` |
| `npm run dev:local`      | the dev server, pointed at that instead of production             |
| `npm run db-pull`        | copy production's data into it (a read, never a write)            |
| `npm run db-local:reset` | drop it, re-run every migration, re-run the seeds                 |
| `npm run db-local:stop`  | stop the containers                                               |

## Working against a local database

A new event type is **invisible until a migration is applied**, because the log grid
renders `event_types` rows. Without a local database the only way to see a new tile is to
merge and push to the shared production database, which is exactly the wrong order — so
there is a local one. It needs Docker running.

```sh
npm run db-local     # Postgres + PostgREST + GoTrue + Studio, every migration applied
npm run dev:local    # the app, against it — log in as dev@local / localdev
```

`npm run db-local` writes `.env.localdb`, which only `--mode localdb` reads. Vite loads
`.env` first and lets the mode file win, so **the production `.env` is never touched** and
plain `npm run dev` still points at production. The two are one flag apart.

`supabase/seed.sql` creates the login, a household and a dog, which is enough to see a
tile and open its dialog. For a history worth looking at:

```sh
npm run db-pull      # a snapshot of production's data, loaded locally
```

That is the one command that reads production, and reading is all it does. With it loaded
the events list has content and every stats card draws real bars, which is the difference
between reviewing a new chart and guessing at one. The snapshot is real data about a real
dog: it lands in `supabase/seeds/`, which is gitignored, and `db-pull` refuses to write
there if git ever stops ignoring it.

> **Nothing in this workflow writes to production.** `npm run db-push` is untouched, still
> manual, and still only after a merge. `db-local:reset` is destructive to the local
> container alone.

Two things the local stack does deliberately, both so that it does not lie:

- **`auto_expose_new_tables = true`** in `config.toml`. The migrations contain no
  `grant select` anywhere; production works because it was created before Supabase flipped
  that default, and inherited implicit grants for `anon` and `authenticated`. Without the
  flag every read fails locally with `42501 permission denied`. That config field is
  documented as **removed on 2026-10-30** — existing tables keep their grants, but a table
  added by a migration after that will land unreadable, and it will look like an RLS
  problem while being a `GRANT` problem. The durable fix is explicit grants in a migration.
- **Only the services the app uses** are enabled — no realtime, storage, edge functions or
  analytics — and `enable_signup` is off, matching production, where the two users were
  made by hand.

When a migration is what you are testing, `npm run gen-types` is the one command that
still points at production: use `--local` while the migration is unmerged, or the
generated types will not know about it. One catch — `--local` output omits the
`__InternalSupabase` block that pins `PostgrestVersion`, so put it back by hand and keep
the diff purely additive.

Also worth knowing when writing a migration by hand: **stamp its filename in UTC**, the
way `npm run new-event` does. A stamp taken from the clock on the wall is an hour or two
ahead in summer, so the next generated migration sorts before it and `migration up`
refuses the out-of-order pair.

## Code layout

```
src/lib/
  types/       types only; database.ts is generated, domain.ts is what the app uses
  server/      every query, and nothing else — the bundler keeps it off the client
  events/      the detail-field catalogue, shared by the form and the action
  stats/       pure row → chart-column and row → tile logic
  history.ts   pure row → calendar-cell logic, the same shape as stats/
  offline/     the IndexedDB queue, the submit handler that feeds it, and
               catchUp: what a launch or a resume has to do to be current
  components/  ui primitives at the top, then charts/ log/ stats/ status/
  time.ts      computation: timezone conversion and calendar arithmetic
  format.ts    presentation: the same values as Swedish text
  locale.ts    every word the app shows
  clock.ts     the passing of time as a reactive value, for ticking displays
```

**All user-facing text lives in `locale.ts`.** There is one language and no plan for
a second, so it is a plain module rather than a runtime lookup — but nothing else in
`src/` should contain a Swedish string. Anything with a value in it is a function, so
the grammar around the value stays with the words:

```ts
waitingBanner: (count: number) =>
	`⏳ ${count} ${count === 1 ? 'händelse väntar' : 'händelser väntar'} på signal …` as const;
```

Every group is `as const` and **every function ends its template with `as const` too**,
so hovering an entry in the editor shows the words rather than `string` —
`` `Snitt över de senaste ${number} dagarna.` `` instead of `string`. Where a group
also has to be exhaustive, write `as const satisfies Record<Period, string>` in that
order: `satisfies` on its own, or a plain type annotation, widens the literals back to
`string`.

`format.ts` gets its vocabulary from `locale.units`, so "min", "tim" and "%" are
declared once. Two exceptions on purpose: the activity names (Promenad, Matning …) are
rows in `event_types`, and the installed app's name is in `static/manifest.webmanifest`,
which the browser reads without going through the bundler. Emoji that belong to a label
travel with it; standalone icons stay in the component next to the markup.

Three rules hold this together:

- **Routes wire, they do not query.** A `+page.server.ts` calls one or two functions
  from `$lib/server` and returns the result.
- **Components render, they do not derive.** Turning rows into columns, tiles or
  badges happens in a plain `.ts` module that can be called without a DOM.
- **`time.ts` computes, `format.ts` phrases.** If it returns Swedish, it belongs in
  the second one.

Those two are the only grab-bag modules, and a bare `swedishNumber` or `addDays` at a call
site does not say where it came from — so they are imported as namespaces:

```ts
import * as format from '$lib/format';
import * as time from '$lib/time';

label: format.dayLabel(day),
starts: time.lastDays(today, 30)
```

Use `import * as` rather than exporting a hand-written `export const format = {…}`
object. It reads identically and needs no list kept in sync, and Rollup rewrites the
member access back into a direct binding so tree-shaking still works — an exported
object literal is a value, so everything it references stays live. Measured on this
app: `import * as` is byte-for-byte identical to named imports, while the object cost
392 bytes, and 22× as much in an isolated module where only one helper is used.

Everything else keeps named imports; `walkBuckets` and `careStatus` already say where
they came from.

### House style

- **No abbreviations in names, and the name says what comes out.** `swedishNumber`, not
  `svNum`. In `format.ts` the suffix carries the role: `swedish…` for a locale-rendered
  value, `…Text` for a phrase, `…Label` for a chart tick, `…Heading` for the roomier
  tooltip version.
- **A constant sits at module scope only if it has to** — because two functions share
  it, because it is exported, or because it is expensive to rebuild. Everything else
  lives inside the function that owns it. The `Intl` formatters are the "expensive"
  case: constructing one costs 20–60× what formatting with it does. Regex literals are
  _not_ — the engine caches them per site, so they can live inside their function.
- **Every function gets a doc comment**: a sentence saying what it does, and an example
  underneath when one makes it concrete.
- **Comments sit next to what they explain**, not in a header block above a group.
- **A file holds what its name says.** `types/` contains types and no runtime values —
  a parser that returns a `Period` belongs with whoever parses, not next to the type.
  Equally, a type shared across folders belongs in `types/`; a type that is one
  module's own interface stays exported from that module.

## Data model

The insight the schema is built on: **everything logged is the same thing — an event with a
timestamp.** Walks, meals and nail trims differ only in whether they have an expected
recurrence and which detail fields they carry. So there is one `events` table with a `jsonb`
details column, plus an `event_types` catalogue holding the intervals.

Adding a new tracked activity is therefore a row insert, not a migration.

```
households ─┬─ household_members ── auth.users
            └─ dogs ── events ── event_types
```

Current catalogue:

| Type        | Label         | Category | Interval |
| ----------- | ------------- | -------- | -------- |
| `walk`      | Promenad      | routine  | —        |
| `meal`      | Matning       | routine  | —        |
| `accident`  | Olycka        | routine  | —        |
| `nail_trim` | Kloklippning  | care     | 42 days  |
| `grooming`  | Pälsklippning | care     | 70 days  |
| `bath`      | Bad           | care     | 56 days  |
| `deworming` | Avmaskning    | health   | —        |
| `vet`       | Veterinär     | health   | —        |
| `weight`    | Vägning       | health   | —        |

`details` examples: walk `{"duration_min": 35, "pee": 3, "poop": 1}`, meal
`{"finished": true}`, weight `{"kg": 12.4}`. Pee and poop are counts; older rows hold
booleans and are still read correctly.

Categories exist only as tile colors on the log grid: emerald for `routine`, sky for
`care`, amber for `health`, and slate for `other` — the catch-all every new type lands
in unless it obviously belongs to one of the first three.

The generated `src/lib/types/database.ts` is committed, and the Supabase client is
typed against it — so a query that names a column the schema does not have fails to
compile instead of returning empty rows. Regenerate it with `npm run gen-types` after
any migration.

### Aggregation lives in SQL

Pages format, they do not compute. Five views — one for Status, and four for the whole
stats screen on two axes: **per type** and **per type × detail field**, each at bucket
grain (a chart's columns) and window grain (a headline number).

| View                   | Answers                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `dog_care_status`      | last done and next due per activity — powers the Status screen                                              |
| `stats_type_buckets`   | per type per Stockholm day / ISO week / month: how many, and the mean gap                                   |
| `stats_detail_buckets` | the same buckets per detail field: answered, happened, the sum and the mean                                 |
| `stats_type_windows`   | per type per trailing window (30/84/180 days): the count, the days tracked, and the per-day/week/month rate |
| `stats_detail_windows` | the same windows per detail field: the mean of a number, and the share of events something happened in      |

**None of them names a type or a detail key.** The four they replaced did —
`stats_summary` carried a column per metric with the type baked into a subquery — and
since `create or replace view` may only _append_ columns, they were a one-way ratchet no
new type could ever read. Every generic feature had to route around them. Which columns a
walk or a meal consists of is now decided in `src/lib/stats/rows.ts` instead, because
that is the side that knows.

Three rules these views follow, all learned the hard way:

- **Days are Stockholm days.** A 00:30 walk belongs to the day it felt like, not to UTC.
- **Averages divide by what was actually measured.** Rates divide by days tracked (capped
  at the window), not by the window length, and "time between" pools only gaps _within_ a
  day — otherwise the overnight 22:00 → 07:30 stretch dominates every number.
- **"It happened" is one rule in one place.** `detail_happened(jsonb)`: `true` for a
  checkbox or a reveal, above zero for a count. Both detail views call it, and
  `contribution()` in `$lib/stats/detailDays.ts` counts a tooltip by the same rule — so a
  tile and a tooltip cannot disagree about the same field. Before it existed, a share over
  a `count` field asked whether the value was literally `true` and read 0 % forever.

And the boundary itself, which is worth stating precisely rather than as a slogan:

> **Aggregation over the event log lives in SQL. Anything that needs to know what a detail
> key _means_ is computed in TypeScript, because only `DETAIL_FIELDS` knows.**

The second half has exactly three members, and each is there for that reason:
`fieldHistory` (which key holds a number), `detailDayCounts` (which keys are countable —
`duration_min` and `pee` are both JSON numbers, and no view can tell a measurement from a
count), and `shareTile`'s missing-row rule (a never-logged accident is 100 % fine).
Anything else computing outside SQL is drift, not a fourth member.

### Migrations

Schema lives in `supabase/migrations/` and is applied with `npm run db-push`.

> **Never change the schema in the Supabase web UI.** The migration files are the source of
> truth. And do not push a migration from an unmerged branch — the database is shared with
> production, so schema changes land when the branch merges.

Until it merges, `npm run db-local` applies it to the local database instead, which is
where an unmerged migration is meant to be tried: see
[Working against a local database](#working-against-a-local-database).

## Adding an event type

`npm run new-event` executes this whole recipe for you: answer the prompts (or pass
flags, see `--help`) and it writes every artifact below, ready for review on a feature
branch. `--dry-run` prints the planned writes without performing any, and the generator
never touches the database — the migration it writes ships through the normal
merge-then-`db-push` path. Doing it by hand is three steps, of which two are optional:

1. **Migration** — one insert. For a type with no detail fields (a nail trim is just a
   timestamp) this is the _entire_ recipe: the log grid, the dialog, Status, Settings
   and the offline queue all render from the `event_types` row.

   ```sql
   insert into event_types (id, label, category, interval_days, icon, sort_order)
   values ('nail_check', 'Klokoll', 'other', 21, '✂️', 100);
   ```

   `category` decides the tile color (`other` is the default for everything new);
   `interval_days` is null for types without a schedule; the highest `sort_order`
   lands last in the grid.

2. **Detail fields** — only if the type collects data: one entry in
   `src/lib/events/fields.ts`, labels in `locale.ts`. A field declares its input
   (`number` / `checkbox` / `count` / `reveal`) and its `summarize`, and the dialog
   form, the server parsing, the queue's optimistic row and the events-list summary
   line all follow from that one declaration.

   A **`reveal`** is a checkbox that uncovers the fields naming it in `revealedBy`,
   and is not valid until one of them is answered — "olycka" with no cause is not
   something that happened. The list stays flat, in the order the parser reads it:

   ```ts
   { name: 'accident', label: …, input: 'reveal' },
   { name: 'vomit',    label: …, input: 'checkbox', revealedBy: 'accident' },
   { name: 'poop',     label: …, input: 'checkbox', revealedBy: 'accident' }
   ```

   Three things follow from that, and each is deliberate:

   - **Only what was answered is stored.** An untouched reveal stores no keys at
     all, unlike a plain `checkbox`, which stores `false` because "she did not
     finish" is a real answer. So a reveal declares no `summarize` either: its
     causes are always what there is to say.
   - **The dialog reveals with CSS, not state.** `peer-checked:` on the sibling
     after the checkbox, which is why that checkbox sits next to its `<label>`
     rather than inside it. No `$effect`, and it works in the server-rendered
     `?detail=` dialog with JavaScript off.
   - **The "needs a cause" rule lives in `parseDetails`.** Not in the form action:
     logging is offline-first, so a rule only the server knew would accept the
     event, close the dialog, and surface a failed row minutes later. That module
     is already shared with the queue, so both paths enforce it identically.

3. **Stats** — only if the type deserves a chart: see the next section.

The files the generator edits carry `codegen:` marker comments at its insertion points.
Those markers are a contract — the generator refuses to run (before writing anything)
if one is missing, so do not delete them. The generator's pure core is covered by
`tests/new-event.test.ts` against a fixture spec.

### Adding a stats card

There is deliberately no generic config-driven chart component. The building blocks —
`FoldableCard`, `StackedColumns`, `TrendLine`, `StatTile`, `ChartLegend`, `TabBar` —
are the generic layer, and a card is 30–60 lines composing them; a config object
expressive enough to cover the real cards would be a worse programming language than
Svelte. `WalkCard` is the reference implementation. The chain, top to bottom:

1. **SQL** — nothing is needed for either shape: the four views are per type and per
   detail field already, so a new type is rows of views that exist. A genuinely new
   _shape_ — not a new type — is what means a new migration.
2. **Query + narrowing** in `src/lib/server/stats.ts` — select exactly the columns the
   card reads and narrow the nullable view columns once, so pages never handle
   `number | null`.
3. **Buckets** in `src/lib/stats/buckets.ts` — pure rows-in, zero-filled-columns-out;
   `simpleCountBuckets` already covers the plain counts case.
4. **The card** in `src/lib/components/stats/`, wired into
   `src/routes/stats/+page.svelte`, with its light/dark color pair in `layout.css` and
   the `var()` handle in `palette.ts`.

`npm run new-event` scaffolds the two common shapes — counts-per-day
(`StackedColumns`, like walks) and trend-line (`TrendLine`, like weight) — as ordinary
checked-in components you edit freely afterwards. Anything fancier (an accidents-style
period picker, stacked segments from details) starts from a generated card and gets
hand-finished.

A generated card's tooltip breaks each bar down by **every field the type collects that
can be counted** — a checkbox, a count or a reveal — showing only what actually happened
that day:

```
27/8
Biltur 5
Olycka? 3 · Bajsade 2 · Spydde 2
```

Nothing is declared for this: the fields come from `DETAIL_FIELDS` and their captions are
the labels the dialog already renders, in declaration order. Numbers are left out, since
"45" under a bar reads as a count and is not one.

That count is the one aggregate on this screen that is **not** SQL, and it is there by the
rule above rather than for convenience: `stats_detail_buckets` could sum it, but it could
not _choose_ the fields. `duration_min` and `pee` are both JSON numbers, so only
`DETAIL_FIELDS` can say which of them is a count worth putting under a bar. The card has
to ask the catalogue either way, so `$lib/stats/detailDays.ts` reads the type's own events
and counts them there — a month of one activity, the way `fieldHistory` does for trend
cards.

#### Metrics — the tiles under a generated chart

A counts card can carry `StatTile`s like the walk card's, and **adding one needs no SQL**:
every tile is a row of `stats_detail_windows`, one per dog × type × window × detail field.
So is every hand-written tile — `avg_walk_duration_min` and `meal_finish_rate` used to be
columns of a wide summary view, and are now the same rows a generated tile reads.

Three kinds, and the generator asks for them when the card is a counts card:

| Kind            | Reads                         | Wants                       |
| --------------- | ----------------------------- | --------------------------- |
| `avg`           | the average of a number field | a `number` field            |
| `share`         | how often something happened  | `checkbox`/`count`/`reveal` |
| `share-without` | how often it did not          | `checkbox`/`count`/`reveal` |

"Happened" is `detail_happened`, so a `count` counts as happened when it is above zero:
`share` on the walk `pee` field is the share of walks she peed on, not the share where the
value was the boolean `true`.

You are not asked how to format it. The unit comes from the field's own declaration, so
an average of minutes is written in minutes (and switches to hours past 90); a share is
a percentage. And the `~` follows the kind, per the rule above: an average divides by
what was measured and says so, a share is measured and does not.

`share-without` is the one worth knowing about. It divides by **every** event of the
type, not by the events carrying the field — which is what makes it work with a
`reveal`, where a good day stores nothing at all. "Rides with no accident" is
`share-without` on the reveal itself.

Two consequences of a field that has never been logged once, which has no row at all:

- an `avg` shows `–`, because there is genuinely nothing to average;
- a `share-without` shows **100 %** when the type has events, because never having
  happened is an answer. That decision is in `shareTile`, not in SQL, since the card
  holds the event count already.

## Auth

Email and password, with **no signup flow**. The two users are created by hand in the
Supabase dashboard and public signup is disabled; there is no registration UI to build.
Password resets are done by hand in the SQL editor:

```sql
update auth.users
set encrypted_password = crypt('new-password', gen_salt('bf'))
where email = '...';
```

The app sends no email at all, so there is no SMTP to configure. `hooks.server.ts` creates
a per-request Supabase client from cookies, validates the session with `getUser()` rather
than trusting the cookie, and guards every route except `/login`.

RLS is the only wall, since the publishable key is public: a row is visible and writable
only if the user is a member of the owning household. `event_types` is readable by anyone
and writable only in `interval_days`, via a column grant, so the Settings screen can adjust
schedules without being able to rewrite the catalogue.

`events` follows the same policy-plus-column-grant shape, and the reason is worth knowing.
The original `member_access` policy's `with check` requires `created_by = auth.uid()`, and
that clause validates the new row state on UPDATE as well as INSERT — so it silently made
**editing the other person's events impossible** while leaving deletes fine (those are
governed by `using`, which is membership only). A second policy, `member_update`, checks
membership alone; permissive policies OR together, so that is enough, and `member_access`
still guards inserts where the author must be the creator. Then:

```sql
revoke update on events from authenticated, anon;
grant update (occurred_at, details, note) on events to authenticated;
```

An edit can change _what happened_, never which row it is, whose dog it is, which activity
it was, or who logged it — enforced by the database, so no app bug can reassign a row or
launder authorship. Changing an event's type is deliberately unsupported: delete and log
again, which keeps `details` consistent with the type's field list.

## Offline and installable

Hundkoll is a PWA: manifest, icons, and standalone display, so it installs to the home
screen on both phones.

- **`src/service-worker/index.ts`** precaches the built assets and serves pages network-first
  with a cache fallback, so the app opens without signal showing the last known state. It
  stands down entirely under `vite dev`.
- **`src/lib/offline/queue.svelte.ts`** holds logs in IndexedDB and sends them in the
  background — on save, on launch, and on the `online` event. **Every log goes through
  it, not just the ones made without signal**, which is what makes Spara instant: see
  [Performance](#performance).

Both rely on one detail: **the event's row id is generated when the dialog renders and
travels with the form.** Replaying a queued log is therefore idempotent — a send that
reached the server but lost its response collides on the primary key, which the action
treats as success rather than logging the walk twice. The same mechanism makes a double tap
on Spara harmless.

### A cached launch has to catch up by itself

The cache fallback has a cost: the app can be showing data it never fetched, because the
worker answered the launch from its cache or the phone restored the page it had open
yesterday. Both hydrate normally and look completely fresh.

**`$lib/offline/catchUp.ts` is the one place that decides what coming back means**: send
whatever the queue is holding, then re-read the page if its data predates our return.
`renderedAt` from `+layout.server.ts` is the evidence a cached page cannot fake, and
`freshness.ts` beside it holds the pure decision so it can be unit-tested. The layout's job is
only to say "we are back" — from `onMount`, `pageshow`, `visibilitychange` and `online` —
and every one of them calls the same function, so the policy cannot drift between them.
Calling it while offline is safe: the worker answers the data request from cache, so the
re-read resolves with what is already on screen instead of failing.

**A page whose read failed must not become that cached copy.** A dropped connection used to
render as "Inget loggat ännu" — indistinguishable from an empty database — and the worker
then kept serving it. The list helpers now return `null` for a failed read rather than an
empty array, the page says so, and the load sets `cache-control: no-store`, which the worker
takes as "do not keep this one".

## Performance

The Vercel function is pinned to `arn1` in `vite.config.ts`. Without it, requests entered
Vercel's edge in Stockholm but executed in Washington DC while the database sat in
Stockholm — roughly half a second of Atlantic per tap. Do not remove the region pin.

### Nothing on the logging path waits for the server

Logging a walk used to feel dead for a second or two on a phone, because both halves of
it were round trips. A warm Supabase Auth call is ~70 ms and a warm page request ~265 ms,
but they stack up: opening the dialog meant `getUser()` then three queries, and saving
meant `getUser()` → `currentDog()` → `insert` and then a second request to re-read the
page. Five serial hops, and a radio that has just woken up adds a second on top.

Both are now off the critical path, and the fix in each case was to notice the server was
not needed:

- **Opening the dialog** needs the activity, the current time and a fresh row id — all of
  which the page already has. Tapping a tile builds the dialog in place. The
  `?detail=<id>` route stays as the pre-hydration and no-JavaScript fallback, and closing
  it uses `replaceState` rather than a navigation, since there is no new data to fetch.
  For a live type that fallback lands on the backdating dialog, which is not what the tap
  meant, so `+page.svelte` converts a live `?detail=` into a running walk on mount and
  tidies the URL away. That covers both the tap that beat hydration and the installed app
  reopening the URL it was closed at; without JavaScript the dialog stands, as before.
- **Saving** writes to the queue, closes the dialog, and sends afterwards. The row shows
  up in the list immediately, described by parsing the form the same way the action will
  (`$lib/events/details.ts` is shared for exactly that reason), so it reads the same
  before and after it is stored.

A queued row only shows ⏳ once a send has actually been tried and failed, so the ordinary
case shows no waiting state at all. A row the server _rejects_ stays on screen with the
reason and a way to dismiss it — it is deliberately not dropped, since the log came from
somebody typing.

### Opening and closing the dialog

The dialog grows out of the tile that was tapped and shrinks back into it, via `growFrom`
in `$lib/transitions.ts`. `LogGrid` measures the tile in its click handler — the last
moment it is certainly still under the thumb — and the rect travels through `+page.svelte`
to the dialog. A `?detail=` dialog has no tile to grow from, so it rises from slightly
small instead.

`LogDialog` reads `origin` **once**, through `untrack`, and that is not a style choice.
Svelte re-evaluates a transition's parameters when the outro runs, and by then the page has
set `dialog` to null — so a reactive read throws inside the transition function, the outro
never starts, and the sheet is left in the DOM as an invisible `fixed inset-0` layer eating
every click. The dialog looks frozen and nothing can close it. Any value a transition
depends on has to outlive the state that opened it.

Three things about `transitions.ts` are load-bearing:

- Both transitions carry **`|global`**. Transitions are local by default, and a local one
  only plays when its _own_ block is created or destroyed. The `{#if dialog}` lives in
  `+page.svelte` while the directives are inside `LogDialog`, so without `|global` the
  close would not animate at all.
- The sheet fade is written by hand rather than using `svelte/transition`'s `fade`, so its
  duration cannot drift from the panel's. If one outlasted the other, one would be left on
  screen alone.
- It asks `matchMedia` directly instead of importing `prefersReducedMotion` from
  `svelte/motion`. That builds a `MediaQuery` at module scope, and `MediaQuery`'s
  constructor calls `window.matchMedia` — so importing it into a component the server
  renders, which `LogDialog` is, would break SSR. Transition functions only ever run in the
  browser, so asking there is safe.

Tapping the shaded sheet closes the dialog, and so does Escape; Avbryt stays for the
keyboard and stays a real link for the no-JavaScript path. The sheet requires the press
_and_ the release to land on it, because a click's target is the common ancestor of the
two — without that check, dragging a selection out of the note field and letting go over
the sheet would throw away a half-typed log.

### Switching screens is the one wait left

Each screen reads its own rows, so a tab change has to reach the server. The feedback for
it is layered by how long the wait turns out to be, so a fast switch stays silent:

- **On touch**, the tapped tab darkens via `active:`. Tailwind puts `hover:` behind
  `@media (hover: hover)`, so `active:` is the only variant that answers a finger.
- **On navigation**, the destination tab takes the selected look immediately —
  `(pending ?? page.url.pathname) === tab.href` in `+layout.svelte`, where `pending` is
  `navigating.to`. `aria-current` deliberately stays on the screen still showing, and the
  destination gets `aria-busy` instead.
- **Also on navigation**, that tab's icon breathes — shrinks and grows — via
  `.tab-loading`. The colour change on its own read as "selected"; a size change reads as
  "working". It was a spin first, which looked broken rather than busy: an emoji has an
  orientation, so any frame part-way round is just a wrong-way-up icon. It is one keyframe
  set rather than Tailwind's `animate-pulse` plus a spin, since two animations cannot share
  the one `animation` property.
- **Past 150 ms**, the progress bar in `layout.css` grows in. A switch that resolves
  quickly never paints it at all.

Both animations have a `prefers-reduced-motion` branch; the icon stays dimmed rather than
turning, so it still reports being busy.

### Where the progress bar sits, and why it looked broken

The bar is positioned against the **tab row**, not the top of the page — `position:
absolute` at `top: -1px` inside the `relative` row, so it covers the nav's top border and
that line appears to fill with colour. When you tap a tab your eyes are already at the
bottom of the screen. (Absolutely positioned children of a flex container are out of flow,
so the bar never becomes a fifth flex item.)

It first lived at the top of the viewport, where it was almost impossible to see:

- On a phone it was **invisible**, not just easy to miss. The installed app is `standalone`
  with `viewport-fit=cover`, so it draws under the status bar; at `top: 0` those pixels
  render behind the clock. Anything anchored to the top of this app needs
  `env(safe-area-inset-top)`.
- On a desktop it loses a race with its own preload. `data-sveltekit-preload-data="tap"`
  starts the load on `mousedown`/`touchstart`, so with anything but a fast click the fetch
  finishes before the click fires. Throttling makes this _more_ likely, not less. To see
  the bar deliberately, throttle and activate a tab with the keyboard — no pointer event,
  so nothing is preloaded.

## Conventions

- **Branch and PR for every change.** Marcus reviews and merges; nothing is committed to
  `master` directly.
- **Form actions over client-side fetch.** Most of the app is "tap button, insert row,
  re-render list" and works without JavaScript, including the log dialog. Offline support
  is the one place that genuinely needs JS.
- **All timestamps are `timestamptz`**, rendered in `Europe/Stockholm`.
- **Git hooks** in `.githooks/` refuse commits authored by the wrong GitHub account and
  pushes from the wrong `gh` login. `npm install` points `core.hooksPath` at them via the
  `prepare` script, so a fresh clone configures itself.

### One gotcha worth knowing

The global gitignore on Marcus's machine includes GitHub's Python block, which contains
`lib/` — and that silently excludes SvelteKit's `src/lib/`. The project `.gitignore`
carries `!src/lib/` to override it. **Do not remove that line.** If something builds
locally but fails on Vercel with `ENOENT` on a file you know exists, run
`git check-ignore -v <path>` before investigating anything else.

## Deployment

Vercel deploys `master` automatically. Migrations do not deploy with it — run
`npm run db-push` after merging anything that touches `supabase/migrations/`.
