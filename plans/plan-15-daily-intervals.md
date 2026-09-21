# Plan 15 — Daily intervals on the Status page

> Source: asked 2026-09-05 — "set smaller intervals for the more daily things,
> specifically walks and feedings … either a time in hours I set myself, OR that the
> interval would take from the average we are already showing in the stats page."

> **Status: ✅ Built** — PR #46, written by Marcus with Claude as coach. Two migrations,
> no new dependencies. This plan was written as guidelines rather than instructions, on
> purpose: the goal, the constraints already in the codebase, and the questions worth
> answering before the first line of code. The answers under each question are his, as
> he reached them; the "Verified" section is what he saw on screen.

## The goal

Walks and meals happen several times a day, and a status expressed in days cannot say
anything useful about them. They should get an interval of their own, measured in hours,
set in one of two ways:

- **Fixed** — a number of hours the user chooses in Settings.
- **From the data** — the average time between walks (or meals) that the Statistik screen
  already shows. Choosing this means the expectation follows the dog's actual rhythm
  rather than a guess.

On the Status page these two sit at the top under their own heading, and everything else
sits under a second heading. Both headings are in Swedish and read naturally next to the
existing Status wording.

## What is already there, and constrains the design

None of these are instructions. They are facts about the codebase that any solution has to
live with, and each one is worth reading before deciding anything.

- **An interval is one integer column, in days**, on the catalogue table. The Status
  screen's "due at" is computed from it **in SQL**, in a view that has been
  `create or replace`d before — and that statement may only append columns, never
  reorder or remove them. `plans/plan-12` recorded the pain of that rule.
- **The average already exists, in SQL**, on a per-type window view, as a mean of gaps
  _within a day_ over the last 30 days. It is what the walk card's "mellan promenader"
  tile reads. It is also the value the README calls out as deliberately excluding the
  overnight gap.
- **Which columns a signed-in user may edit is a grant, not a policy.** Plan 13 states
  every one of them, and the update on the catalogue table is column-limited on purpose so
  the catalogue itself stays migration-managed. A new editable column is a new grant, in a
  migration, or Settings saves silently fail.
- **The README's rule about where computation lives:** aggregation over the event log is
  SQL; anything that needs to know what a detail key _means_ is TypeScript. Where does
  "last done plus an average gap" fall? Decide, and be able to say why.
- **The Status card's "soon" colour** is a fixed window, and it was chosen for intervals
  measured in weeks. Look at what it does for an interval of four hours.
- **The Settings form** posts one field per type and the save function diffs against the
  stored value, so an untouched field costs no write. Whatever the new choice looks like,
  that property is worth keeping.
- **Migrations are stamped in UTC** and tested against the local database before merge.
  `gen-types --local` drops one block from the generated types; the README says which and
  what to do about it.

## Questions to answer before writing code

Answering these first is most of the design. Write the answers down — a sentence each is
enough — and the code will mostly follow.

1. **What is the smallest change to the data model that can say all three things:**
   "every N days", "every N hours", and "follow the average"? Consider whether one new
   column can, or whether it takes two, and what a _null_ means in each.
   - One number column: `interval_days` **renamed** to something unit-netral (like just "interval")
   - One new column for the unit/mode, with three values: `days`, `hours`, `average`. Constrained with a `check`, the way `category` is. Not null; defaults to `days`, so existing rows are correct without a data migration.
   - No exclusivity rule needed anymore - the enum design removed it. Only one number exists.
   - `average` stores no pointer. The lookup is by the dog, the type and the 30-day window, at read time; the unit value _is_ the reference. The number column keeps whatever hours were typed before, so switching back remembers.
   - A null number means "not scheduled", exactly as it does today for other values.
   - `average` with no average available (the view's `avg_gap_min` is null) is treated as **not set up** - same as a null number. No fallback.
   - Every column Settings writes gets its own `grant update (...)`. Migration stamped in UTC, applied with `npm run db-local` first.
2. **Where is "due at" computed once intervals can come from an average?** In the view,
   which already knows `last_at` and could learn the average? Or on the server in
   TypeScript, from two reads it already makes? Each is defensible; pick one and be able to
   defend it against the README's rule.
   - The view is **dropped and recreated**, not `create or replace`d, so its column names match the renamed table column. The grant is restated in the same migration (plan 12 is the precedent).
   - The view computes `due_at` itself.
3. **What makes walks and meals "daily"?** Is it a property they already have, or a new
   one, or simply "the interval is in hours"? The answer decides both which types get the
   choice in Settings and which land under the first heading on Status.
   - A type is daily when its unit is **not `days`**. That one fact drives all three: hours as the unit, the top section on Status, and the end-of-day rule below. No new column for it.
4. **What does "soon" mean for a four-hour interval?** And what should the card say when
   the average is the interval but there is no average yet — a dog with three walks logged
   has no meaningful mean.
   - Missing average: covered above - not set up.
   - End of day is **Rule B**: when today's Stockholm day is later than the Stockholm day of `last_at`, the card shows a "waiting for the new day" state instead of due/overdue. Neutral color. Wording must not name a day, since it shows at 01:20 and at 07:00 alike. It ends when the next event of that type is logged. Two states only - no separate morning state.
   - The amber "soon" window is **thirty minutes** for daily types, seven days for the rest.
     On a four-hour interval the old week-long window would have been amber from the
     moment of logging.
   - Rule B lives in TypeScript, not the view: the page already passes `now` down so
     server render and hydration agree, a second clock in the view would be a second
     source of truth, and a pure function gets a vitest with a 23:00 walk and a 01:20
     clock — the summer case where both instants share a UTC date and not a Stockholm one.
5. **What do the two headings say, in Swedish?** Check how the existing Status and
   Settings strings are phrased so the new ones sound like they belong.
   - **Dagligen** on top, **Återkommande** below; the existing "Senast loggat" list stays
     third. Settings reuses the same two words for its two groups, so the screens share one
     vocabulary. The mode selector reads **Fast intervall** / **Följ snittet**; the badge
     states are **väntar på ny dag** and **inget snitt ännu**.
6. **What does the Settings row look like for a daily type?** Two inputs, a choice and an
   input, something else? Sketch it before building it.
   - A native `<select>` for the mode, then the same number input, labelled "timmar". The
     number stays visible and filled in under Följ snittet — it is the remembered fixed
     value, so switching back is one click.
   - Daily rows are grouped first and are **two lines by design** — name above, mode and
     hours below — because a two-line row interleaved with one-line rows read as a layout
     glitch, and the same difference reads as intentional once the kinds are grouped.
     Extracted into `IntervalSection.svelte`, which takes the group as a prop and derives
     heading, unit and widths once rather than asking six times in the markup.
   - Only daily rows post a `mode_` field, and only daily rows _read_ one — a crafted
     request cannot turn a nail trim hourly. Hours with no number is refused in the form
     and again in `planIntervalChanges`, which is pure so the rules are tested without a
     database.

## A suggested order of work

Not a script — a sequence where each step is testable before the next.

1. Data model and migration, applied locally. Prove with a query that the new shape can
   express all three cases, and that the grant lets the app write what Settings will
   write.
2. Types regenerated, domain types adjusted, `npm run check` clean — before any UI.
3. The pure part: given a row's mode, its fixed value and its average, what interval
   applies and how is it written? That is a small function with a unit test, and it is
   where the "no average yet" case gets decided.
4. Status page: the two sections and the new detail line. Drive it in the browser.
5. Settings page: the choice, the save, the untouched-field property. Drive that too.
6. README: the Status section and the "adding an event type" step that mentions
   intervals, so the docs say what the app does.

## Definition of done

- A walk with a fixed 4-hour interval shows the right badge on Status, and turns red at the
  right moment.
- Switching a type to "follow the average" changes its due time to last done + the same
  number the Statistik tile shows.
- A type with no average yet says something sensible rather than nothing.
- The other types are exactly as they were, under their new heading.
- Settings round-trips both modes, and saving with nothing changed writes nothing.
- `npm run check`, `npm test`, `npm run lint`, svelte-autofixer on changed components, and
  a browser pass over Status and Settings. Migration tested locally; `db-push` after merge.

## Verified

- **The view, before it existed.** The whole migration was run inside a transaction that was
  rolled back, against the production snapshot: walk at 4 hours → 08:00 + 4 h = 12:00; meal
  on average → 06:18 + 302 min = 11:20; average with no average (bath), days with no number
  (accident, weight) and never logged (nail trim) all null. `interval` works unquoted as a
  column name. Then applied for real and the same query run against the actual view.
- **The grants.** The recreated view had picked up INSERT, UPDATE, DELETE and TRUNCATE for
  `authenticated` from the database's defaults — a `revoke all` on the view before the
  `grant select` left it with SELECT alone, and `anon` with nothing. Column update grants
  on exactly `interval` and `interval_type`, `authenticated` only.
- **On screen, with the production snapshot.** Dagligen with Promenad and Matning on top,
  badges computed from the 30-day average; detail lines "för 4 timmar sedan · snitt 2,3
  tim". Promenad set to Fast intervall 3 → "var 3:e timme" and the badge moved; back to
  Följ snittet → "snitt 2,3 tim" with the 3 still in the box; saving untouched wrote
  nothing; Fast intervall with the number emptied returned the Swedish error and saved
  nothing.
- **The generator** writes the seventh value and says so in a note when the type is daily;
  `--interval-unit` is validated rather than cast.
- 209 tests, `npm run check` clean, `npm run lint` clean, svelte-autofixer clean on
  `StatusCard`, `IntervalSection`, `status/+page` and `settings/+page`.

## Not built

- **"Sparat!" after a save that changed nothing.** The action redirects to `?saved`
  unconditionally. Honest fix: `saveIntervals` reports whether it wrote, and the action
  drops the flag when it did not. Small; left for a quiet moment.
- **A daily type in `days`-only Settings.** Settings cannot make a type daily or undo it;
  that is a migration, by design. If a third daily type ever appears, it is one `update`.
- **Rounding the average `due_at`.** The average branch yields fractional seconds. Nothing
  shows seconds, so it does not matter; `date_trunc('minute', …)` if it ever does.
