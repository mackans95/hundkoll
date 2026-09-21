# Plan 16 — Away mode: someone else has the dog

> Source: asked 2026-09-21 — "Sometimes I need to leave the dog for someone else to
> watch, and then I can't keep track of all the different things happening during the
> day … a new type of thing I can add or log, that basically says: the dog is being
> watched by someone else, pause all normal app handling until I am home with the dog
> again … I would like the average calculations to take these into account, so if the
> dog is away for 8 hours, we only count that day as 2/3 of a day."

> **Status: ✅ Built** — PR #47. One migration, no new dependencies. The nine questions at
> the end were answered before the first line of code; every recommendation was taken, and
> the ninth answer sharpened one rule (an event logged _during_ the absence counts from
> itself). Verified below.

## The goal

One thing to log when the dog is handed over, and one tap when she is back. In between:

- **Status pauses.** The daily cards (Promenad, Matning) stop saying overdue; they say she is
  with the sitter. The recurring cards (nail trim, bath) are untouched — a due date in
  twelve days does not care who is holding the lead.
- **The averages know.** Time she was away is subtracted from the days the rates divide by,
  so 8 hours away makes that day count as two thirds of a day. A gap between a walk before
  handing over and a walk after coming home is not a "time between walks" and is left out
  of that average — the sitter walked her in between, unlogged.
- **Logging still works.** Nothing is blocked. Meals fed by the sitter can be logged
  afterwards, as today.

## What is already there, and constrains the design

- **Everything logged is an event with a timestamp**, and the whole app — recent list,
  history calendar, edit sheet, offline queue, cache catch-up — works on `events` rows.
  Anything stored elsewhere has to rebuild all of that or live without it.
- **The stats views name no type and no detail key** (plan 12), and the README states the
  rule: aggregation over the log is SQL; knowing what a detail key _means_ is TypeScript.
  The views do already read one piece of catalogue meaning: `t.category = 'routine'` decides
  when tracking started.
- **`create or replace view` may only append columns.** Both views this touches
  (`stats_type_windows`, `dog_care_status`) can take their new column at the end, so no
  drop-and-recreate and no grant dance this time.
- **The live walk is device-local** (localStorage). An away period must not be: the other
  phone in the household has to see it, and the server renders Status from it. So it is a
  stored row from the moment it starts, not a local timer.
- **Status's `due_at` is computed in the view** (plan 15), and Rule B ("väntar på ny dag") is
  computed in TypeScript from `last_at`. Both need to know about a return from an absence.
- **Column grants are explicit** (plan 13): a new writable column on `events` is a new grant
  in the same migration, or "Hemma igen" fails silently.

## Design

### The data model: an event that has an end

An absence is an ordinary event whose `occurred_at` is the hand-over, plus one new column on
`events`:

```sql
alter table events add column ended_at timestamptz
	check (ended_at is null or ended_at > occurred_at);
```

`null` means ongoing. For every other type the column stays null. The type row is
`('away', 'Hundvakt', 'absence', null, 'days', '🧳', 110)` — label, icon and place in the
grid are questions below.

`absence` is a **new category**, and the category is the fact everything hangs on, the way
"not `days`" was the fact for plan 15:

| Who reads `category = 'absence'` | To decide                                                |
| -------------------------------- | -------------------------------------------------------- |
| the three views                  | which spans to subtract, skip gaps across, and anchor to |
| the dialog and the edit sheet    | to render the second time field ("Hemma igen")           |
| `careStatus`                     | to keep the type out of the three Status lists           |
| `LogGrid`                        | the tile's colour                                        |

**Why a column and not a detail key.** `{"ended_at": …}` in `details` would work in
TypeScript but the views would have to read `details ->> 'ended_at'`, which is exactly the
thing plan 12 removed from them. A column is schema: the database says what it means, the
views read it by name, and the README rule stands without an exception. It also makes the
constraint (`ended_at > occurred_at`) the database's job.

**Why not a separate table.** Cleaner SQL, but the absence would not be in the recent list,
the calendar, the edit sheet or the queue, and each of those would need a second path for
one row type. The event log is the app's one abstraction; this fits it.

The grant grows by one column: `grant update (ended_at) on events to authenticated`.

### The SQL: subtract the span, skip the gap, anchor the return

One CTE, repeated in the two stats views rather than shared as a view, so each stays
readable on its own (the same choice plan 12 made for `day_gaps`):

```sql
absences as (
	select e.dog_id, tstzrange(e.occurred_at, coalesce(e.ended_at, now())) as span
	from events e
	join event_types t on t.id = e.type_id
	where t.category = 'absence'
)
```

- **`stats_type_windows`** gets `away_days` appended: the span intersected with the
  window (`now() - N days` to `now()`), unioned with `range_agg` so two overlapping
  absences count once, summed in days. Every rate divides by
  `greatest(1, least(window_days, days_tracked) - away_days)`. `days_counted` stays the
  whole-day figure the Statistik subtitle shows; `away_days` travels beside it.
- **`avg_gap_min`**, in both `stats_type_buckets` and `stats_type_windows`: a gap is
  dropped when any absence span overlaps `(prev_at, occurred_at)`. The "follow the average"
  interval reads this number, so a weekend away no longer teaches it that walks are nine
  hours apart.
- **`dog_care_status`** gets `due_from` appended: the last event, unless the type is daily
  and that event predates the dog's latest finished absence — then the return. Not
  `greatest(last_at, returned_at)`, which was the first draft: a meal the sitter texted
  about and that was logged at 14:00 should count from 14:00, not from the 16:00 return
  (Q9). `due_at` is counted from `due_from` instead of `last_at`. The card keeps showing
  the true `last_at` in its detail line.

Verified the way plan 15's view was: the whole migration inside a rolled-back transaction
against the production snapshot, with one fake absence inserted, before it was applied.
`range_agg` and `unnest` over a multirange were checked in isolation first (two
overlapping spans of 8 h and 6 h → 10 h, a span outside the window → nothing).

### Status

- **While away:** a banner on top — "🧳 Hos hundvakt sedan 08:15" — and every daily card
  shows a neutral badge instead of due/overdue. Recurring cards and the Senast loggat list
  are unchanged. The absence type itself is filtered out of all three lists; the banner is
  its state.
- **After return:** the daily cards count from the return. Back at 16:00 with a 2.3-hour
  average means "dags om 2 tim", not "9 timmar försenat" and not "väntar på ny dag". This is
  what `due_from` is for; `awaitingNewDay` and the average text in `intervalText` both
  switch to it.
- Which absence is current comes from one small read, `currentAbsence(db)`: the newest
  `absence` row with `ended_at` null. Both the log page and Status make it; a failed read
  sets `no-store` like every other read (plan 14).

### The log page

- **The tile** opens the usual dialog: start time prefilled with now, plus a second,
  optional time field "Hemma igen" — left empty for "still away", filled in when logging a
  past absence. Spara goes through the offline queue like any log; the extra field rides
  along in `fields`, and `parseEventForm` reads it.
- **While away**, a card sits where the live-walk card does: "🧳 Hos hundvakt sedan 08:15 ·
  3 tim" and one button, **Hemma igen**, which sets `ended_at` to now. That is an update, so
  it posts straight to the server like an edit, and a failure stays on the card. The tile
  reads "Pågår…" and points back at the card, as the walk tile does during a walk.
- **The edit sheet** shows both times for an absence and lets either be moved; the end
  before the start is refused in Swedish before the database gets to say so, and emptying
  the end reopens the period — how a mistaken Hemma igen is undone. The recent list reads
  "8 timmar · hemma mån 21 sep. 16:30", or "pågår" — the open case deliberately needs no
  clock, so server render and hydration cannot disagree about it.

### Statistik

Nothing visible changes except the numbers, and the subtitle says how much was taken out:
"Snitt över de senaste 30 dagarna, varav 0,3 dagar borta." Silent below a twentieth of a
day, where it would read "0 dagar".

## Files

| File                                                             | Change                                                                                                                       |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260921101744_away_mode.sql`               | category, column + named check, type row, grant, the three views                                                             |
| `src/lib/types/database.ts`                                      | regenerated (`npx supabase gen types typescript --local`; keep the block)                                                    |
| `src/lib/types/domain.ts`                                        | `EventCategory` + `absence`; `EventRow` gains `ended_at` and `type.category`; `StatusRow.due_from`; `away_days`              |
| `src/lib/events/absence.ts` (new, shared)                        | `isAbsence(category)`, `parseEnd(form, start)`, `absenceText(event)`                                                         |
| `src/lib/server/events.ts`                                       | `ended_at` in the columns, both parsers and the patch; `currentAbsence`, `applyEventReturn`                                  |
| `src/lib/offline/submit.ts`                                      | the queue refuses an end before the start, as it refuses bad details                                                         |
| `src/lib/server/care.ts`                                         | keep `absence` rows out of the three lists                                                                                   |
| `src/lib/status/schedule.ts`, `src/lib/format.ts`                | `due_from` instead of `last_at` in Rule B and the average text                                                               |
| `src/lib/components/log/LogDialog.svelte`, `EventSheet.svelte`   | the second time field for absence types                                                                                      |
| `src/lib/components/log/AwayCard.svelte` (new)                   | the card with Hemma igen                                                                                                     |
| `src/lib/components/log/LogGrid.svelte`, `EventList.svelte`      | rose tile; `liveTypeId` becomes `busyTypeIds` so the absence tile points back at its card; the span in the row's detail line |
| `src/lib/components/status/StatusCard.svelte`                    | the paused badge                                                                                                             |
| `src/routes/+page.server.ts`, `+page.svelte`                     | load the current absence; `?/return` action; the card                                                                        |
| `src/routes/status/+page.server.ts`, `+page.svelte`              | the banner and the paused flag                                                                                               |
| `src/lib/stats/rows.ts`, `src/lib/server/stats.ts`, `summary.ts` | `away_days` through to `StatSummary`; `daysAwayText` for the subtitle                                                        |
| `src/lib/locale.ts`                                              | the Swedish for all of the above; banner and badge take the type's own label                                                 |
| `README.md`                                                      | catalogue row, categories, the SQL rules, a new "Away mode" section, grants                                                  |
| tests                                                            | `schedule` (due_from), `event-edit` (ended_at), `rows`, fixtures, new `absence` (21 tests)                                   |

Not touched: the generator. A second absence type is one insert; the generator's stats card
would be meaningless for one, so it keeps refusing the category.

## Order of work

1. Migration, applied locally; the rolled-back-transaction proof with a fake 8-hour absence:
   `away_days` = 0.333, rates moved by the expected ratio, a gap across it gone from
   `avg_gap_min`, `due_from` = the return for walk and meal, unchanged for nail trim.
2. Types regenerated, domain types, `npm run check` clean.
3. The pure parts and their tests: `absence.ts`, the parser changes, `due_from` in
   `schedule.ts`.
4. Log page: dialog field, card, action, grid. Browser.
5. Status: banner, badge, filtering. Browser, with the clock moved past a fake return.
6. Stats: `away_days` through, subtitle if wanted.
7. README and this document; full gate; `db-push` after merge.

## Definition of done

- Tap Hundvakt, Spara: the card appears on both the log page and Status, the daily cards
  go neutral, the walk tile still logs a walk.
- Hemma igen: card gone, daily cards count from now, Statistik's per-day numbers divide by
  fewer days by exactly the hours away.
- A past absence logged with both times behaves the same, and is editable and deletable
  like any row.
- The recurring cards, the calendar and every other screen are exactly as they were.
- `npm run check`, `npm test`, `npm run lint`, svelte-autofixer on the changed components,
  a browser pass over Logga, Status and Statistik.

## Questions, and the answers

Asked with a recommendation each, answered 2026-09-21. The answers are Marcus's.

1. **Data model.** A column `events.ended_at` plus category `absence`, or `details.ended_at`,
   which keeps the schema untouched but puts a detail key back into the views? — _Column._
2. **Words.** Label **Hundvakt**, icon 🧳, banner "Hos hundvakt sedan …", button
   **Hemma igen**, badge **hos hundvakt**; alternatives Bortrest, Passad, Borta. — _The
   first suggestions._
3. **Starting.** Tap opens the dialog (start prefilled, end optional), or one tap with no
   dialog, like a walk? — _The dialog_: the no-JavaScript path, how a forgotten hand-over
   gets backdated, and how every non-walk tile works.
4. **After coming home.** Daily cards count from the return, from the last logged event
   (immediately overdue), or "väntar" until the next log? — _From the return._
5. **The gap across an absence** left out of "mellan promenader", and so out of the
   "follow the average" interval? — _Yes._
6. **The tile.** Outlined as a switch, or a fifth solid colour? — _A fifth solid colour,
   to be judged on the phone._ Rose is the first pick: darker and duller than amber to
   red-green eyes, where violet would collapse toward sky.
7. **Statistik subtitle** saying how many days were taken out? — _Yes._
8. **Multi-day absences** painting the calendar icon on the start day only? — _Fine._
9. **Meals during an absence** logged afterwards, no special handling? — _Correct, and
   logging during the absence must work too_: a meal the sitter texts about gets logged at
   once. That answer is why `due_from` is not `greatest(last_at, returned_at)`.

## Verified

- **The migration, before it existed.** The whole file inside a rolled-back transaction
  against the production snapshot (537 events), with a fake absence inserted:

  | check                                                       | result                                                             |
  | ----------------------------------------------------------- | ------------------------------------------------------------------ |
  | no absence: every number unchanged, `away_days` 0           | walk 7.1000/day, meal 2.6000, accident 2.6333 — as before          |
  | 8 h away yesterday: `away_days`, and the rates              | 0.3333; walk 7.1798 = 213 ÷ 29.667                                 |
  | yesterday's walk gaps, absence 08:00–16:00                  | 5 gaps dropped, 4 kept → 198 min (checked by hand)                 |
  | absence ending after the last meal but before the last walk | meal counts from the return; walk from itself; nail trim untouched |
  | meal logged during the absence                              | counts from itself                                                 |
  | end before start                                            | refused by `events_ended_after_start`                              |
  | open absence                                                | span runs to now: 9 h → 0.3750                                     |

  Then applied for real with `npm run db-local`.

- **On screen**, headless Chrome over CDP against the dev server on the local database, one
  absence started from the dialog eight hours back: 11 tiles with 🧳 Hundvakt last; the
  dialog's `ended_at` field with its help line; the card "Hundvakt pågår · 8 timmar / Sedan
  mån 21 sep. 06:33"; the tile reading "Pågår…" and a tap on it opening no dialog; Status
  banner "Hos hundvakt sedan …", Promenad and Matning "hos hundvakt", Kloklippning and Bad
  unchanged, no Hundvakt row under Senast loggat; Statistik "varav 0,3 dagar borta". After
  Hemma igen: card gone, list row "8 timmar · hemma mån 21 sep. 14:33", Promenad "för 8
  timmar sedan · snitt 2,6 tim → dags om 3 timmar" (counted from the return, last walk still
  shown), Matning "dags om 5 timmar"; the sheet showing both times in edit mode; delete
  through the sheet. Console clean; the database back at 537 events and no `away` row.
- 230 tests, `npm run check` clean over 498 files, `npm run lint` clean, svelte-autofixer
  clean on every changed component (the two `href` notes on `EventList` and `LogGrid`
  predate this and are explained in place).

## Not built

- Painting an absence across several calendar days, or hatching the affected chart bars.
- Auto-closing an absence when the next walk is logged; the card is the reminder.
- A tab-bar marker that the dog is away, on screens other than Logga and Status.
- Generator support for the `absence` category; a second absence type is one insert.
- Starting an absence while offline shows the card only once the row has landed — the card
  reads the stored row, not the queue.
