# Plan 11 — Breaking a generated tooltip down by what happened

> Source: reported 2026-08-27, after Biltur went in with its metrics — "when
> hovering the bar in the chart, it only shows the amount of car rides, I would
> like that tooltip to also be able to show the amount of accidents in car rides
> for that certain day aswell."

> **Status: ✅ Built** — PR #43. Small, and additive: no migration, no new
> prompt, no new locale strings.

## The decision worth recording: not SQL

Every other aggregate on the stats screen is a SQL view, and the README says so.
This one is not, and the reason is the same one that shaped plan 10 — a per-day
count of an _arbitrary_ detail field cannot be a column without being a column
per field, which is the wide-view problem again. The alternatives were:

1. **A second long view**, `stats_detail_days`, grouped by day as well as field.
   Correct, and a migration whose only reader is a tooltip.
2. **Count the type's own events in TypeScript.** Which is what `fieldHistory`
   already does for trend cards, for exactly this reason: detail keys are per
   type, and SQL cannot name them without being told.

(2), because it makes this genuinely additive — nothing to push to production,
and a month of one activity is a trivial count. `$lib/stats/detailDays.ts` says
so at the top, since "why is this not SQL" is the first question anyone will
have.

The Stockholm-day rule is why it is worth a test rather than an inline `reduce`:
a 22:30 ride in summer is already tomorrow in UTC, and the chart's columns are
Stockholm days.

## What it shows, and what it does not ask

The breakdown is **every field the type collects that can be counted** — a
checkbox, a count or a reveal — and nothing else. Numbers are left out: "45"
under a bar reads as a count and is not one.

There is no prompt for this, and no new locale strings, because both already
exist: the fields are in `DETAIL_FIELDS` and their captions are the labels the
dialog renders. The tooltip asks the catalogue.

Only what happened appears. Biltur on a day with five rides, three of them bad:

```
27/8
Biltur 5
Olycka? 3 · Bajsade 2 · Spydde 2
```

and on a day with none:

```
29/7
Biltur 0
```

Order is declaration order, which is dialog order — so a tooltip reads the way
the form was filled in.

## Files

| File                                       | Change                                                     |
| ------------------------------------------ | ---------------------------------------------------------- |
| `src/lib/stats/detailDays.ts`              | new, pure: count per day, and one day's breakdown          |
| `src/lib/types/domain.ts`                  | `DetailDayCount`                                           |
| `src/lib/server/events.ts`                 | `detailDayCounts` — reads the type's events for the window |
| `src/lib/stats/buckets.ts`                 | `simpleCountBuckets` takes an optional breakdown           |
| `src/lib/server/stats.ts`                  | the import a generated query needs                         |
| `scripts/templates/counts-card.svelte.tpl` | the `detailDays` prop and the breakdown argument           |
| `scripts/new-event-core.ts`                | generate the query and the prop, for types that count      |
| `README.md`                                | the tooltip in "Adding a stats card"                       |

## Verified

Against the five rides already logged in the local database — 10, 20, 30, 40 and
50 minutes, three with an accident, two of those having thrown up and two
pooped:

- today's bar read `Biltur 5 · Olycka? 3 · Bajsade 2 · Spydde 2`;
- a day with no rides read `Biltur 0`, with no second row at all;
- 160 tests, `npm run check` clean over 488 files, console clean.

## Not built

- **A choice of which fields appear.** All of them, in declaration order, is
  right until a type has enough fields that it is not. A `--tooltip` list can be
  added the day one does.
- **Numbers in the tooltip.** An average duration per day is a real thing to
  want, but it is a different cell shape (`~34 min`, not a count) and no card
  wants it yet.
- **A breakdown on trend cards.** They plot one number; there is no bar to break
  down.
