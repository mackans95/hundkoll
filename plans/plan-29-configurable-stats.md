# Plan 29 — Each type's Statistik card, chosen in Settings

> Source: users can choose via settings "which type of chart to display (bar chart
> (with/without day/week/month selection) / timeline (Weight))", and "which additional boxes
> to include and track (e.g. '🚶 per dag' for Walks)".

> **Status: ✅ 29a built, verified on the phone, awaiting merge; 29b next** — branch `feature/configurable-stats`.
> Requires plans 26 and 28 (both merged). **Two PRs**: 29a (config, loader, tiles), then 29b
> (chart kinds). 29a verified on the local stack with a production snapshot:
>
> - **Statistik reads exactly as on master** before any edit: every tile of all six cards,
>   in all three periods, captured from both builds and identical. (The snapshot has no
>   Ensamtid session in the last 30 days, so its tiles are dashes on both; unit tests cover
>   its share and longest stretch.)
> - In headless Chrome, on Promenad's page: add "Kiss", ▼ and ✕ change the screen without
>   posting; Enter in the interval field saves rather than pressing a tile button; Statistik
>   then shows Mellan promenader, Per dag, Kiss. Every tile removed leaves the chart alone.
>   Bad has no tile editor. Without JS, Lägg till posts and adds. No exceptions.
> - The generator, run for real: its card type-checks, gets "Per dag" plus the number
>   field's average, written in the unit it declared ("~1,3 mm"), then reverted.
>
> **What 29a changed beyond the plan:** `npm run new-event` no longer writes tiles, asks
> for them (`--metric` is gone), or reads detail windows, and `DETAIL_FIELDS` gains an
> optional `unit` the generator fills, so any average can be written in its unit. The six
> hand-written tile builders, `metrics.ts` and `answeredShare` are gone; Trender's number
> formatting now shares `numberWriter` with the tiles.
>
> **On the phone** (test APK against the local preview, then back to production): the tile
> editor and Statistik following it, as above. One change from it: the type page says
> "Osparade ändringar." under Spara while anything on it has changed, as Trender and
> Tabeller do, cleared once the save goes through.
>
> After the merge: `db-push`.

## Why the README's decision changes

README → "Adding a stats card" says there is deliberately no config-driven chart
component, because "a config object expressive enough to cover the real cards would be a
worse programming language than Svelte". That held while a card was something a developer
wrote once. Two things have changed:

- **The choice moved to the user.** Settings can't edit Svelte. A card that can only change
  by deploy is exactly what Marcus is asking to get rid of.
- **The real cards turned out to be few shapes.** Six cards, two chart kinds, three ways to
  split a bar, and a dozen tile kinds, all over views that are already generic per type and
  field. The config only has to describe those, not be a language.

The README gets a new paragraph saying so, and that a genuinely new shape is still code: a
new kind, not a new card.

## The card, as configuration

```
{ chart: 'bars',     period: 'day' | 'picker', split: null | <field> | <count fields>, tiles: [...] }
{ chart: 'timeline', field: <number field>,                                         tiles: [...] }
```

| Card       | Today, as config                                                             |
| ---------- | ---------------------------------------------------------------------------- |
| Promenader | bars · day · no split · Per dag, Mellan, Snittlängd                          |
| Mat        | bars · day · split by `finished` · Mellan, Åt upp                            |
| Olyckor    | bars · **picker** · split by `pee`, `poop` · Per dag, Per vecka, Per månad   |
| Vikt       | timeline of `kg` · no tiles (the latest value in the header)                 |
| Ensamtid   | bars · day · split by `calm` · Snittlängd, Lugn, Orolig efter, Längsta lugna |
| Biltur     | bars · day · no split · Snittlängd, Utan olycka                              |

**What a type may pick follows from `DETAIL_FIELDS`:**

- **bars** — always.
  - **split** by one checkbox or outcome field (yes / no / unknown, like Mat and Ensamtid),
    or by its count fields (one segment each, like Olyckor's kiss and bajs).
  - **period** `day` (the last 30 days) or `picker` (day / week / month tabs, like Olyckor).
- **timeline** — only for a type with a number field.
- **tiles**, all from `stats_type_windows` and `stats_detail_windows`, no new SQL:

  | Tile                          | For                              | Reads                                            |
  | ----------------------------- | -------------------------------- | ------------------------------------------------ |
  | Per dag / vecka / månad       | every type                       | `per_day`, `per_week`, … (30/84/180-day windows) |
  | Mellan (average gap)          | every type                       | `avg_gap_min`                                    |
  | Snitt (average of a field)    | number fields                    | `avg_number`                                     |
  | Andel (how often)             | checkbox, outcome, reveal, count | `share_answered` or `share_true` (as in plan 27) |
  | Andel utan                    | checkbox, reveal, count          | `share_not_true`                                 |
  | Längsta när … (longest while) | a number field and an outcome    | the type's events (Ensamtid's "Längsta lugna")   |
  | Senaste (the latest value)    | number fields                    | the type's events (Vikt's header value)          |

## What the loader becomes

`loadStats` stops naming types. For every charted type it reads the same rows by config:
the bucket view at the card's period, the detail buckets for its split fields, the
window rows, and the type's own events when a split, a "Längsta" or a timeline needs them.
The `codegen:stats-*` markers in `stats.ts` and the page go away, because there is nothing
per type left to insert.

## `npm run new-event`

Stops generating a card component. A type with stats gets a config default (question 3) and
appears in Tabeller and on its type page like any other. The two card templates are deleted.

## Decided

Asked 2026-10-06, before any code.

| Question                       | Answer                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Walk's tooltip, Ensamtid's box | **Generic, with a per-type choice of text or emoji tooltips**, so Promenader keeps its emoji row (29b). |
| A new type's tiles             | **"Per dag" plus each number field's average**, at most four.                                           |
| The generator                  | **Picks a default**, doesn't ask.                                                                       |
| One PR or two                  | **Two**: 29a, then 29b.                                                                                 |

The emoji tooltips need a symbol per field: `DETAIL_FIELDS` gains an optional `symbol`
(💧 for kiss, 💩 for bajs, as `locale.stats.symbols` has them today), and a field without
one reads as text even in emoji mode.

## Questions, with my recommendation

### 1. Walk's tooltip and Ensamtid's nested Orolig box: special cases, or generic?

**Recommend generic.** The generic bars tooltip already lists each counted field that
happened and boxes a reveal's causes under it. It gains the day's average gap ("Tid
mellan"), and the outcome split boxes what its "no" reveals, which is Ensamtid's Orolig box.
Then every card is config, and a new type gets the same tooltip. The cost: Promenader's
tooltip reads in words ("Kiss 6") rather than its emoji row ("💧 6"), which only that card
has today.

### 2. Which tiles does a new type get?

**Recommend "Per dag", plus the average of each number field**, at most four. That's what a
generated card would ask for today, so nothing has to be chosen up front.

### 3. Should the generator ask for the card kind?

**Recommend it picks, and doesn't ask.** Bars by day, with a timeline only when the type's
one field is a number (as Vikt is). Everything else is changed on the type page afterwards,
where it can be seen.

### 4. One PR or two?

**Recommend two:**

- **29a — the config and the tiles.** Storage, the generic loader, every card's tiles from
  config, and the tile picker on the type page. The charts stay the hand-written ones, so
  every card still looks the same. Smaller, and it proves the loader.
- **29b — the chart kinds.** One `BarsCard` and one `TimelineCard` replace the six card
  components and the generator's templates, plus the chart choices on the type page and
  the README change.

## Design notes for both

- **Storage**: a `stats_card jsonb` column on `type_settings` (plan 26), nullable, null
  meaning the type's default config. 29a stores `{ tiles }`; 29b adds its keys beside it. Validated against `DETAIL_FIELDS` on read, like the
  Trender list, so a removed field drops out.
- **The type page's Statistik section** replaces its placeholder: the chart choices, then
  the tiles as a list with ▲ ▼ (MoveButtons) and add or remove, saved with the page's
  Spara.
- **Defaults reproduce today exactly**, checked by before/after screenshots and a test
  per card.

## Verification

- `npm run check`, `npm test` (defaults equal today's cards; validation; each tile kind),
  `npm run lint`, svelte-autofixer.
- Production snapshot: before/after screenshots of Statistik showing no visible change
  until edited; then change a tile, a split and a chart kind, and see Statistik follow.
- The generator, run for real with a throwaway type, then reverted.
- The phone against the local preview, and back.

## Not in scope

- Chart kinds beyond bars and timeline.
- Per-tile custom labels.
