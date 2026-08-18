# Hundkoll

A private daily-care log for our dog **Våfflan** — walks, meals, accidents, grooming,
health. Built for one specific moment: standing in the hallway with a leash in one hand,
logging a walk with the thumb of the other.

The question the app exists to answer is _"when was X last done, and is it overdue?"_

## The app

Four screens, as a bottom tab bar:

| Screen            | What it does                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| **Logga** (`/`)   | A 3×3 grid of tap targets, one per activity. Tapping opens a dialog for time, type-specific details and a note. |
| **Status**        | Cards for activities with an expected interval — last done, next due, colour-coded green/amber/red.             |
| **Statistik**     | Trends between the last two complete periods, plus per-topic cards for walks, food, accidents and weight.       |
| **Inställningar** | The interval for each activity, editable. Blank means "no schedule". Also logout.                               |

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

| Command             | Purpose                                                |
| ------------------- | ------------------------------------------------------ |
| `npm run check`     | `svelte-check` — run this before committing            |
| `npm run format`    | Prettier                                               |
| `npm run build`     | production build                                       |
| `npm run db-push`   | apply pending migrations to Supabase                   |
| `npm run gen-types` | regenerate `src/lib/types/database.ts` from the schema |

## Code layout

```
src/lib/
  types/       types only; database.ts is generated, domain.ts is what the app uses
  server/      every query, and nothing else — the bundler keeps it off the client
  events/      the detail-field catalogue, shared by the form and the action
  stats/       pure row → chart-column and row → tile logic
  offline/     the IndexedDB queue and the submit handler that feeds it
  components/  ui primitives at the top, then charts/ log/ stats/ status/
  time.ts      computation: timezone conversion and calendar arithmetic
  format.ts    presentation: the same values as Swedish text
  locale.ts    every word the app shows
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

The generated `src/lib/types/database.ts` is committed, and the Supabase client is
typed against it — so a query that names a column the schema does not have fails to
compile instead of returning empty rows. Regenerate it with `npm run gen-types` after
any migration.

### Aggregation lives in SQL

Pages format, they do not compute. Five views:

| View                   | Answers                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| `dog_care_status`      | last done and next due per activity — powers the Status screen             |
| `stats_summary`        | every headline average, one row per dog                                    |
| `stats_daily_counts`   | per type per day: counts, pee/poop, finished meals, gap and duration means |
| `stats_accident_bins`  | accidents binned per day, ISO week and month, split kiss/bajs              |
| `stats_period_summary` | one row per period bucket — powers the Trender comparisons                 |

Two rules these views follow, both learned the hard way:

- **Days are Stockholm days.** A 00:30 walk belongs to the day it felt like, not to UTC.
- **Averages divide by what was actually measured.** Rates divide by days tracked (capped
  at the window), not by the window length, and "time between" pools only gaps _within_ a
  day — otherwise the overnight 22:00 → 07:30 stretch dominates every number.

### Migrations

Schema lives in `supabase/migrations/` and is applied with `npm run db-push`.

> **Never change the schema in the Supabase web UI.** The migration files are the source of
> truth. And do not push a migration from an unmerged branch — the database is shared with
> production, so schema changes land when the branch merges.

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

## Offline and installable

Hundkoll is a PWA: manifest, icons, and standalone display, so it installs to the home
screen on both phones.

- **`src/service-worker.ts`** precaches the built assets and serves pages network-first
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
- **Saving** writes to the queue, closes the dialog, and sends afterwards. The row shows
  up in the list immediately, described by parsing the form the same way the action will
  (`$lib/events/details.ts` is shared for exactly that reason), so it reads the same
  before and after it is stored.

A queued row only shows ⏳ once a send has actually been tried and failed, so the ordinary
case shows no waiting state at all. A row the server _rejects_ stays on screen with the
reason and a way to dismiss it — it is deliberately not dropped, since the log came from
somebody typing.

### Switching screens is the one wait left

Each screen reads its own rows, so a tab change has to reach the server. The feedback for
it is layered by how long the wait turns out to be, so a fast switch stays silent:

- **On touch**, the tapped tab darkens via `active:`. Tailwind puts `hover:` behind
  `@media (hover: hover)`, so `active:` is the only variant that answers a finger.
- **On navigation**, the destination tab takes the selected look immediately —
  `(pending ?? page.url.pathname) === tab.href` in `+layout.svelte`, where `pending` is
  `navigating.to`. `aria-current` deliberately stays on the screen still showing, and the
  destination gets `aria-busy` instead.
- **Past 150 ms**, the progress bar in `layout.css` grows in. A switch that resolves
  quickly never paints it at all.

Two things make the bar easy to miss, and neither is a fault:

- `data-sveltekit-preload-data="tap"` starts the load on `mousedown`/`touchstart`, so with
  a slow click the fetch can finish before the click even fires. To see the bar on
  purpose, throttle the network and activate a tab with the keyboard — that fires no
  pointer event, so nothing is preloaded.
- The bar sits at `top: env(safe-area-inset-top)`, not `top: 0`. The installed app is
  `standalone` with `viewport-fit=cover`, so it draws under the status bar; at `top: 0`
  those pixels render behind the clock and are never seen on a phone.

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
