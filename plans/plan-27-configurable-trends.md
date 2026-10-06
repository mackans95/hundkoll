# Plan 27 — Trender you configure, not code

> Source, 2026-10-06: "Ensure that 'Trends' can cover everything for which you want to track
> trends — ideally via basic configuration in the settings rather than requiring a new
> deployment or code change each time."

> **Status: ✅ Built, awaiting merge** — branch `feature/configurable-trends`. Requires plans
> 25 and 26 (both merged). All four questions answered as recommended. Verified against a
> production snapshot (`npm run db-pull`) on the local stack:
>
> - **before any edit, Trender reads exactly as on master**: the same 18 rows (six per
>   period) with the same numbers, captured from both builds. The only change is the new
>   mark on Åt upp and Olyckor;
> - in headless Chrome: add 🚗 Biltur · Olycka, move it up, set it to "lägre", remove
>   Promenader, and the tab follows; ticking Promenad · antal on its type page appends it;
>   removing every row leaves "Inga trender valda"; no exceptions.
>
> **On the phone** (test APK against the local preview), Marcus's first round, all made:
>
> - **▲ ▼ ✕ and Lägg till edit the list on screen; only Spara sends it.** Without JS each
>   still posts its own edit, so the page works either way.
> - **A save toasts "Sparat!" for three seconds** and keeps the page where it was, instead
>   of reloading onto a banner. The type page does the same.
> - **The add picker drops the icon** ("Promenad · Kiss"), since the group heading has it.
>   So do the type page's switches, which show the metric alone ("antal", "Kiss").
> - **Trender drops the foldable card** for one card per trend, chosen from three mockups:
>   the name, this period's value large, the last period's under it, the badge on the right.
>
> Second round:
>
> - **"från …" sits beside the value**, after a separator, so each card is a line shorter.
> - **Time away is taken into account.** 5/10 compared 3 walks to 11 and said ↓ 73 %, but
>   she was with the sitter 07:16–18:13. A count now compares the rate per time at home, the
>   way Statistik's averages already divide by days at home: 3 in 13 hours against 11 in
>   24 is ↓ 50 %. The numbers shown stay what was logged; the card says "jämfört per tid
>   hemma", and a line under the caption names the absence and its length. Below 20 % of a
>   period at home, the count shows – instead. Gaps already skip the time away, and
>   averages and shares are per event, so only counts change. No new SQL: the absences are
>   read as events and clipped to each period in `trends.ts`.
> - **Only for daily types** (Dagligen on Status: walks, meals), whose events come at a
>   rate while she is home. An incident does not: adjusted, one accident on 5/10 against
>   one on 4/10 read ↑ 84 %, which was rightly called wrong. Olyckor, Biltur and the like
>   keep the plain count.
>
> After the merge: `db-push`.

## The goal

```
Inställningar → Trender                 Trender (the tab)
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│ 🚶 Promenader        ▲ ▼  ✕     │     │ v.40 jämfört med v.39           │
│ ⏳ Mellan promenader  ▲ ▼  ✕     │     │ 🚶 Promenader   27 → 25  ↓ 7 %  │
│ ⚠️ Olyckor   lägre är bättre ▲▼✕ │     │ ⚠️ Olyckor        3 → 1  ↓ 67 % ✓│
│ …                               │     │ …                               │
│ [+ Lägg till trend]             │     └─────────────────────────────────┘
└─────────────────────────────────┘
```

Any type, any metric the views already compute, in any order, with no deploy.

## What is already there, and constrains the design

- **The six rows are code**: `buildTrendRows` (`src/lib/stats/trends.ts`) over the fixed
  `TrendBucket` shape, filled by `rows.trendBuckets` from two reads in `loadTrends`.
- **The views are generic.** `stats_type_buckets`: `n`, `avg_gap_min` per type × period ×
  bucket. `stats_detail_buckets`: `answered`, `happened`, `total`, `avg_number`,
  `share_answered` per type × field × period × bucket. Every row below reads one of those,
  so **no new SQL**.
- **What a field supports follows from its input** in `DETAIL_FIELDS`, the same rule the
  generator's tiles use: a number field averages, the others give a share.
- **Shares mean two different things.** A checkbox or outcome that is asked every time
  (Matning's "åt upp") is a share of the events that answered: `share_answered`, so quick
  taps don't count as "no". A reveal, a count, or a field only asked after a reveal stores
  nothing when nothing happened, so its `share_answered` is always 100 %. Its share is
  `happened / n` over all of the type's events.
- **The badge is neutral today** ("whether more is better depends on the metric").
- **Plan 26's type page** has a Trender placeholder, and `type_settings` grows by nullable
  columns.
- **Marcus is red-green colour-blind**, so a good or bad badge can't rely on hue alone.

## The metric kinds

| Kind    | Reads                                       | For                              | Formatted       |
| ------- | ------------------------------------------- | -------------------------------- | --------------- |
| `count` | `n`                                         | every type                       | number          |
| `gap`   | `avg_gap_min`                               | every type                       | ~minutes        |
| `avg`   | `avg_number` of a field                     | number fields                    | ~minutes, kg, … |
| `share` | `share_answered`, or `happened / n` (above) | checkbox, outcome, reveal, count | percent         |

Today's six are `count walk`, `gap walk`, `avg walk.duration_min`, `gap meal`,
`share meal.finished`, `count accident`.

## Decided

Asked 2026-10-06, before any code. All four as recommended below.

| Question                  | Answer                                                               |
| ------------------------- | -------------------------------------------------------------------- |
| Where to configure        | **Both**: the ordered list in Settings → Trender, switches per type. |
| A new type                | **Nothing** until it is added.                                       |
| Which way is better       | **Per row**, default neither; Olyckor lower, Åt upp higher.          |
| Good or bad, colour-blind | **Tint plus ✓ / !**, with "bättre"/"sämre" for a screen reader.      |

## Questions, with my recommendation

### 1. Configure per type, as one ordered list, or both?

**Recommend both, over one stored list.** Settings → Trender is the ordered list: reorder
with ▲ ▼ (plan 28 will do the same for cards), remove with ✕, add from a picker of type →
metric. Each type's page lists that type's possible trends as switches, so you can add one
where you're thinking about the type, and it joins the end of the list. One store, two ways
in.

### 2. What does a newly added type get?

**Recommend nothing.** The list is what you chose, and a type nobody asked to trend
shouldn't appear in it. A new type shows up on its page, and in the add picker, as available
trends. Until the list is first edited, it is today's six.

### 3. Which direction is an improvement?

**Recommend a per-row setting with three values: higher is better, lower is better, or
neither. It defaults to neither**, since "more walks" or "longer gaps" isn't good or bad in
itself. The two defaults that have an obvious answer: Olyckor lower, Åt upp higher. A row
set to neither keeps today's neutral badge.

### 4. How does a good or bad badge show, for colour-blind eyes?

**Recommend a symbol as well as the tint**: ✓ for an improvement, ! for a worsening, on the
success and warning surfaces Status already uses. The arrow keeps saying which way it
moved.

## Design

### Storage

- **One row per household** in `trend_settings (household_id primary key, rows jsonb)`,
  with RLS, revoke-then-grant, and an update grant on `rows`.
- **No row means the defaults** (today's six). An empty list is a real choice, "no trends",
  which a table of one row per metric couldn't tell apart from "never edited".
- `rows` is an ordered array of `{ type, kind, field?, better: 'up' | 'down' | null, label? }`.
  It is validated in code on save and on read, so a row naming a type or field that has
  since gone away is skipped, not an error.
- **`label` is optional.** Without one, the row is named from the type and metric
  ("🛁 Bad · antal", "🚗 Biltur · Längd"). Only the six defaults carry one, to keep today's
  names; Settings does not edit labels.

### Reading

- `loadTrends` reads the config, then the two views for exactly the types and fields it
  names, at the period's two buckets. As before, there is no type filter on the count
  read, so a bucket exists if anything at all was logged.
- `trendValue(row, period)` is a pure lookup per kind. `buildTrendRows` maps the config,
  so `TrendBucket` and `rows.trendBuckets` are gone.
- **A failed read of the list fails the page**, like any other read: drawing the defaults
  instead would show rows someone had removed.

### The pages

- **Settings → Trender** replaces the stub: the list with ▲ ▼ ✕ and its "bättre om" choice,
  plus an add form (type, then the metrics that type supports). Plain forms posting
  actions, so it works without JS, like the rest of Settings.
- **The type page's Trender section** replaces its placeholder with that type's possible
  trends as switches.
- **The Trender tab** renders whatever the list holds, with the badge from question 4.

### `npm run new-event`

Nothing to generate: a new type's trends are available the moment its row and fields exist.

### Verification

- `npm run check`, `npm test` (each kind's lookup including both shares, validation of
  stale rows, defaults matching today's six exactly), `npm run lint`, svelte-autofixer.
- `npm run db-pull`, then the local stack: Trender shows the same numbers as production
  before any edit; add a car-ride trend, reorder, remove, set a direction, and see the tab
  follow; an empty list says so.
- Then the phone, against the local preview, and back to production.

## Not in scope

- New metric kinds that need SQL, such as a sum of a count field.
- Statistik's cards (plans 28 and 29).
