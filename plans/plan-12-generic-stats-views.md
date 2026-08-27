# Plan 12 — Generic stats views

> Source: asked 2026-08-27, after the tooltip breakdown went in — "id like to look more
> into what you said about the aggregates being sql now, and see what is the best
> solution."

> **Status: ✅ Built** — PR #44. Two migrations, and no card, chart or page component
> changed.

## What the question turned out to be

The README said "Aggregation lives in SQL. Pages format, they do not compute." That was
false in three places, and the reason was structural rather than sloppy.

The four stats views named specific types and specific detail keys in their own bodies:
`type_id = 'walk'` ×12, `'accident'` ×12, `'meal'` ×8, and `details ->> 'finished'` ×8,
`'duration_min'` ×8, `'pee'`/`'poop'` ×9. `stats_summary` and `stats_daily_counts` had
each been `create or replace`d twice, and that statement may only _append_ columns — a
one-way ratchet. So no new type could read them, and every generic feature had to route
around them: plan 10 added a long view, plan 11 counted in TypeScript, and `fieldHistory`
had already done the same for trend cards.

Three answers to one shape is the smell. The shape is that a metric was a column.

## The bug the split had already produced

`stats_detail_metrics.share_true` asked whether the stored value was literally `true`.
Right for a checkbox or a reveal, silently wrong for a `count`. Against the snapshot:

```
walk / pee   127 events, 127 answered, avg_number 1.638, share_true 0.000
walk / poop  127 events, 127 answered, avg_number 0.339, share_true 0.000
```

The generator offers count fields for `share` (`answerable` in `scripts/new-event.ts` is
every non-number field), the validator accepts it, and the README table advertised it — so
a card generated that way would have read **0 %** for `share` and **100 %** for
`share-without`. Latent: only Biltur exists and it shares off a reveal.

Corrected, the same rows read 0.969 and 0.323. Note poop's 0.323 against its average of
0.339: a walk with two poops counts once as happened and twice in the average, which is
right.

## The shape

|                             | per bucket (chart columns) | per window (headline numbers) |
| --------------------------- | -------------------------- | ----------------------------- |
| **per type**                | `stats_type_buckets`       | `stats_type_windows`          |
| **per type × detail field** | `stats_detail_buckets`     | `stats_detail_windows`        |

`dog_care_status` was already generic and is untouched. `detail_happened(jsonb)` states
"it happened" once — `true`, or a number above zero — and is the same rule
`contribution()` counts a tooltip by, so a tile and a tooltip cannot disagree.

Two columns are worth knowing apart. `share_true` divides by **every** event of the type,
which is what a reveal needs (a good day stores nothing at all). `share_answered` divides
by the events that answered, which is what the meal finish rate has always meant — a meal
logged from the tile without opening the dialog is not a meal she left. They happen to be
equal in today's data, which is exactly why the difference was worth writing down rather
than discovering later.

## Verified

The two migrations are separate **so that this was possible at all**: the create landed
first, both view sets lived in one database, and every column was diffed against its
reconstruction before the drop was written.

- `stats_daily_counts`, `stats_accident_bins`, `stats_period_summary` and `stats_summary`:
  **zero differing rows**, every column, against the production snapshot.
- `stats_detail_metrics`: differs only in `share_true`/`share_not_true`, only on count
  fields and on number fields (where a share is meaningless and the generator refuses it).
  `events`, `answered` and `avg_number` identical throughout; `meal/finished` and the
  Biltur reveal fields do not appear at all.
- On screen, over CDP at all three period and trend settings: every tile matched the value
  computed from SQL — walks 7.056/day, gaps 135.2 and 315.0 min, walk length 15.46, finish
  rate 0.9778, accidents 2.056/day and 14.389/week, Biltur 30 min and 40 % clean.
- Trender, whose source view was dropped: walks 51 → 55, gaps 125.2 → 139.0, length
  15.39 → 14.75 (↓4 %), meal gaps 320.4 → 292.7 (↓9 %), finish 1.0 → 0.9474 (↓5 %),
  accidents 11 → 21 (↑91 %) — each read back from the new views.
- All four tooltips render, console clean, 171 tests, `npm run check` clean over 490 files.

## Why the cards did not move

`WalkDay`, `MealDay`, `AccidentBin`, `TrendBucket` and `StatSummary` were
`Pick<ViewRow<…>>`. Making them explicit object types with the same field names turned the
domain types into the contract, so `buckets.ts`, `summary.ts`, all six cards and
`+page.svelte` needed no edit and their tests needed no edit either. The whole change lands
behind `loadStats`.

## Files

| File                            | Change                                                     |
| ------------------------------- | ---------------------------------------------------------- |
| `…_generic_stats_views.sql`     | the function and the four views, each with its own `grant` |
| `…_retire_wide_stats_views.sql` | drops the four wide ones                                   |
| `src/lib/stats/rows.ts`         | new, pure: pair the generic rows back into card shapes     |
| `src/lib/types/domain.ts`       | the five card types stated rather than derived             |
| `src/lib/server/stats.ts`       | eleven reads of four views, narrowed as before             |
| `scripts/new-event-core.ts`     | the emitted queries name the new views                     |
| `tests/rows.test.ts`            | new: the assembly, and what each kind of miss means        |
| `README.md`                     | the rule, restated so that it is true                      |

## The rule, restated

> Aggregation over the event log lives in SQL. Anything that needs to know what a detail
> key _means_ is computed in TypeScript, because only `DETAIL_FIELDS` knows.

Three members, each for that reason: `fieldHistory` (which key holds a number),
`detailDayCounts` (which keys are countable — `duration_min` and `pee` are both JSON
numbers), and `shareTile`'s missing-row rule (a never-logged accident is 100 % fine).
Anything else outside SQL is drift, not a fourth member.

## Not built

- **Moving the tooltip breakdown into SQL.** `stats_detail_buckets` could sum it now, but
  it could not choose the fields, so the card would consult `DETAIL_FIELDS` regardless —
  and `countDetailDays`'s Stockholm-day guarantee is pinned by a test today and would
  become a SQL expression verified only by query. Reconsider if reading raw events for a
  tooltip ever becomes the odd one out for another reason.
- **Explicit grants on the tables.** `events`, `event_types`, `dogs` and `dog_care_status`
  still rely on the implicit `anon`/`authenticated` grants Supabase stopped giving new
  projects; the config escape hatch is documented as removed **2026-10-30**. This plan
  closed the stats-view half.
- **A share of a `count` in the generator's wording.** The kinds are now honest about
  counting a count, but nothing offers "how many" as a tile — only "how often". A `total`
  kind reading `stats_detail_buckets` is the obvious next one, the day a card wants it.
