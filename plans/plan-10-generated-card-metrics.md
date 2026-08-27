# Plan 10 — Metrics on a generated stats card

> Source: reported 2026-08-27, after generating Biltur through the improved
> script — "what we add now is just a basic chart, showing counts. What I would
> like to have the option for is to choose to add more metrics to it, like we
> have in the walk and food charts … for this one, I would like a metric of
> average car ride length, and an average percentage value of the amount of
> successful car rides without an accident. This might be getting too specific
> to have in a generator script, but I would still like us to try."

> **Status: ✅ Built** — PR #42: the generic view, the three metric kinds, the
> prompt, and the tiles. Three notes.
>
> **The migration had to be re-stamped.** It was first written
> `20260827113000`, from the clock on the wall; the generator stamps UTC, so a
> type generated minutes later sorted _before_ it and `migration up` refused the
> out-of-order pair. Renamed to `20260827090000`. Worth knowing for any
> hand-written migration: stamp it in UTC, or the next generated one lands
> underneath it.
>
> **`gen types --local` is not `--linked` output.** It omits the
> `__InternalSupabase` block that pins `PostgrestVersion`, so regenerating from
> the local database drops it. Restored by hand, leaving the types diff purely
> additive. Plan 9's README note should have said so.
>
> **The tile tests went to `tests/metrics.test.ts`, not `tests/summary.test.ts`
> as this plan said** — that file tests `events/summary.ts`, the events-list
> line, which is a different module with the same name.
>
> **Verified** by generating Biltur through the real prompts with both metrics,
> applying it with `npm run db-local`, and logging five rides — 40, 20, 30, 10
> and 50 minutes, two of them with an accident:
>
> - `Snittlängd` rendered **~30 min**, `Utan olycka` **60 %**.
> - Stripping the accidents left `accident` with no row at all, and the tile
>   read **100 %** — the case the view cannot answer and `shareTile` does.
> - The hand-written cards did not move: walk `snittlängd ~15 min`, meal
>   `åt upp 98 %`, matching the view's own 15.457 and 0.978 for the same data.
> - `npm run check` clean over 485 files, 152 tests, svelte-autofixer clean on
>   the generated card.
>
> The generated Biltur files were then discarded, as asked, so the type can be
> re-created from the merged generator.

## It is generator-able, but only after one thing stops being per-type

The instinct that this is too specific is right about the _current_ shape and
wrong about the feature. Every metric on the existing cards is a **hand-written
column in a wide view**:

```sql
-- stats_summary, one scalar subquery per metric, type baked into each
… where e.type_id = 'walk'  and e.details ? 'duration_min' ) as avg_walk_duration_min,
… where e.type_id = 'meal'  and e.details ? 'finished'     ) as meal_finish_rate,
```

So "add a metric" currently means "add a column to a view", and a generator
cannot do that safely. It would have to reproduce the entire view definition in
a new migration every time, against a view that has already been replaced four
times — and `create or replace view` **may only append columns at the end**, a
constraint two existing migrations call out in their own comments. A generator
emitting SQL like that would be the most fragile thing in the repo.

The fix is to stop generating SQL at all. **One hand-written view, added once,
that computes the same metrics generically for every type** — after which a new
type's metrics need no migration, and the generator only has to say which ones
the card shows. That is a small feature.

## The view: one row per detail field, not one column per metric

```sql
create view stats_detail_metrics
with (security_invoker = true) as
with in_window as (
	select dog_id, type_id, details
	from events
	where occurred_at > now() - interval '30 days'
),
-- Fields come from every event ever, not just the window: a field nobody
-- answered inside the window still has a share worth reporting (see the
-- "never once" case below).
fields as (
	select distinct dog_id, type_id, jsonb_object_keys(details) as field
	from events
)
select
	f.dog_id,
	f.type_id,
	f.field,
	count(*) as events,
	count(*) filter (where w.details ? f.field) as answered,
	avg((w.details ->> f.field)::numeric)
		filter (where jsonb_typeof(w.details -> f.field) = 'number') as avg_number,
	avg(case when w.details -> f.field = 'true'::jsonb then 1.0 else 0.0 end) as share_true,
	avg(case when w.details -> f.field = 'true'::jsonb then 0.0 else 1.0 end) as share_not_true
from fields f
join in_window w on w.dog_id = f.dog_id and w.type_id = f.type_id
group by f.dog_id, f.type_id, f.field;

grant select on stats_detail_metrics to anon, authenticated;
```

Three things worth pointing at:

- **`events` counts every event of the type, `answered` only those carrying the
  field.** That distinction is the whole reason this works for a reveal:
  `accident` is _absent_ when nothing happened, so a share computed over rows
  that have the key would always be 100 %. `share_not_true` divides by every
  ride, which is what "rides without an accident" means.
- **30 days**, matching `stats_summary`, so a generated tile means the same
  thing as a hand-written one.
- **An explicit `grant select`**, which no existing migration has. Production
  works on implicit grants it inherited from the year it was created, and that
  behaviour is [documented as removed on 2026-10-30](plan-9-local-database.md).
  A new view is the right place to stop relying on it, one line at a time.

`stats_daily_counts` already carries a generic `avg_duration_min` per type, and
it is tempting to reuse. It is the wrong number: averaging a column of per-day
averages weights a day with one ride the same as a day with four. The view above
averages events.

### Run against the real data before writing any of this

The claim that one generic view can replace hand-written columns is the claim
this plan rests on, so it was checked first — against the production snapshot in
the local database:

```
 type_id |    field     | events | answered | avg_number | share_true
---------+--------------+--------+----------+------------+-----------
 meal    | finished     |     45 |       45 |            |      0.978
 walk    | duration_min |    127 |      127 |     15.457 |      0.000

 hand_written_avg_walk_duration | hand_written_meal_finish_rate
--------------------------------+------------------------------
                         15.457 |                        0.978
```

Both existing metrics, to three decimals, from a view that knows nothing about
walks or meals.

And the reveal case, which is the part with no precedent — five rides, two with
an accident, three with the key absent entirely:

```
    field     | events | answered | avg_number | share_not_true
--------------+--------+----------+------------+---------------
 duration_min |      5 |        5 |      30.00 |          1.000
 accident     |      5 |        2 |            |          0.600
```

`answered` is 2 and the share still divides by 5. That is the number the tile
wants: **three rides out of five went fine, 60 %.**

## What the two requested metrics become

| Tile        | field          | metric           | reads     |
| ----------- | -------------- | ---------------- | --------- |
| Snittlängd  | `duration_min` | `avg_number`     | `~34 min` |
| Utan olycka | `accident`     | `share_not_true` | `82 %`    |

**The formatter is not asked for — it follows from the field.** A number field
already declares its unit (`min`), so an average of it is written with that
unit; a `checkbox` or `reveal` share is a percentage. One less prompt, and no
way to pick a wrong one.

**The "~" follows from the metric.** The house rule is that averages divide by
what was actually measured and are marked as estimates, while a measured share
is not — which is exactly why `mealTiles` marks the gap and not the finish rate.
`avg_number` carries the `~`; the shares do not.

## The one case the view cannot answer, and where it is answered instead

If a field has **never** been logged, no event anywhere carries the key, so
`fields` yields no row and the tile has nothing. For an average that is correct —
there is no length to average, so it shows `–`. For "rides without an accident"
it is wrong: ten rides and no accident ever is **100 %**, not unknown.

That is decided in a pure helper rather than in SQL, because the card already
holds what is needed — the daily counts it draws the chart from:

```ts
/**
 * A share tile. A field nobody has ever answered has no metric row, which for a
 * "without" share means it never happened rather than that nothing is known —
 * so the type's own event count decides between 100 % and a dash.
 */
export function shareTile(label: string, metric: DetailMetric | null, events: number): Tile;
```

`tests/metrics.test.ts` gets the three cases: a real share, no row with events
(100 %), and no row with no events (`–`).

## Generator

### The prompt

Offered only when the card is a counts card and at least one field is declared,
since there is otherwise nothing to measure:

```
Stats card (none/counts/trend) [none]: counts
  Metric (avg/share/share-without, empty when done): avg
    Field (duration_min): duration_min
    Swedish label: Snittlängd
  Metric (avg/share/share-without, empty when done): share-without
    Field (accident/pooped/threw_up): accident
    Swedish label: Utan olycka
  Metric (avg/share/share-without, empty when done):
```

Flag form:

```
--metric "kind=avg;field=duration_min;label=Snittlängd"
--metric "kind=share-without;field=accident;label=Utan olycka"
```

`share` and `share-without` are both offered because both are wanted somewhere:
"how often she finished" is a `share`, "how often nothing went wrong" is a
`share-without`.

### Validation, in the pure core

- the field is declared on this type,
- `avg` names a `number` field — averaging a checkbox is a share, and saying so
  is more useful than computing something,
- `share` and `share-without` name a `checkbox`, `count` or `reveal`,
- a metric has a Swedish label,
- the same field and kind are not declared twice,
- metrics are only declared on a `counts` card (a trend card's own line is
  already the measurement).

### What it emits

No SQL. Per metric: one locale string, one entry in the card's tile list, and —
once per type — the metrics query in `stats.ts` and the prop on the card. The
counts-card template grows the tile block the walk and meal cards already have:

```svelte
<div class="grid grid-cols-2 gap-2">
	{#each tiles as tile (tile.label)}
		<StatTile {tile} />
	{/each}
</div>
```

## Files

| File                                       | Change                                                   |
| ------------------------------------------ | -------------------------------------------------------- |
| `supabase/migrations/…_detail_metrics.sql` | the generic view, with its own `grant select`            |
| `src/lib/types/domain.ts`                  | `DetailMetric`, narrowed from the view                   |
| `src/lib/server/stats.ts`                  | one query per type with metrics, narrowed by field       |
| `src/lib/stats/summary.ts`                 | `avgTile` and `shareTile`                                |
| `src/lib/stats/metrics.ts`                 | pure: pick a field's row out of the metric rows          |
| `scripts/new-event-core.ts`                | `MetricSpec`, validation, the tile and locale generation |
| `scripts/new-event.ts`                     | the metric loop and the flag                             |
| `scripts/templates/counts-card.svelte.tpl` | the tile block, rendered only when metrics were declared |
| `README.md`                                | the metric step in "Adding a stats card"                 |

## Tests

- `tests/metrics.test.ts` — picking a field's row (a missing row is null, not a
  zero); `avgTile` marks its estimate and dashes on null; `shareTile`'s three
  cases, including the "never once, so 100 %" one.
- `tests/new-event.test.ts` — the six validation rules; a counts card with two
  metrics generates both tiles, their locale strings, and exactly one metrics
  query; a card with none generates the same output it does today.

Verified end to end the way plan 8 was: generate a throwaway type with a
duration and a reveal, apply it with `npm run db-local`, log a few events
through the dialog, and read the two tiles off the card — against the production
snapshot, so the walk and meal cards can be checked for having not moved.

## What I recommend not building

- **A generator that writes view migrations.** The reason this plan is small is
  that it does not. `create or replace view` may only append columns, and a
  generated replacement of a five-times-replaced shared view is the least
  reversible thing this repo could do.
- **Arbitrary expressions as metrics** ("average duration on days she was
  sick"). A predicate language in a field declaration stops being data. Three
  kinds cover what the cards want; a fourth can be added when something wants
  it.
- **Metrics on trend cards.** The line already is the measurement. Not hard to
  add later; nothing wants it now.
- **Per-period metrics** (day/week/month toggles, like the accidents card). The
  30-day window matches every other tile on the screen, and a period picker is a
  card-level design decision, not a generated one.

## Note on sequencing

The Biltur type is generated but **uncommitted** on `master` — the migration,
the fields entry, the locale strings and `CarRideCard.svelte`. It is a complete
working feature on its own, so it wants its own PR first; this plan then adds
metrics to a card that already exists, rather than mixing "the new type" and
"the new capability" into one diff.
