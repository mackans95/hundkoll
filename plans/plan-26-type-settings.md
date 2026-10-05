# Plan 26 — A settings page per type

> Source, 2026-10-05: "Revamp the Settings to offer a much wider range of options, allowing
> you to access each type and choose how to handle it — such as configuring intervals and
> statistics, deciding whether to include it in Trends, selecting chart colors, etc."

> **Status: ✅ Built, awaiting merge** — branch `feature/type-settings`. Requires plan 25
> (merged in #57). This plan builds the model and the page; the statistics and Trender
> choices are plans 27–29, which add their own fields to the same model. All four questions
> answered as recommended. Verified on the local stack:
>
> - as `anon`, `type_settings` is `permission denied`; signed in, an insert works, moving a
>   row to another type is refused by the grant, a row for another household by RLS;
> - in headless Chrome: `/settings` and `/settings/intervals` land on Typer; every type
>   listed with its interval in words and a swatch; Promenad set to Rosa saves ("Sparat!")
>   and Statistik draws it pink in both themes; Ensamtid offers no Skiffer; Bad has no
>   picker, and its interval saved from its page shows in the list; an unknown id is a 404;
>   no exceptions.
>
> **Not yet on the phone.** `db-push` only after the merge.

## The goal

```
☰ → Inställningar → Typer              Typer → 🦮 Promenad
┌──────────────────────────────┐       ┌──────────────────────────────┐
│ DAGLIGA                      │       │ Inställningar                │
│ 🦮 Promenad   var 6 h   ●    │  →    │ 🦮 Promenad                  │
│ 🍖 Matning    snittet   ●    │       │ INTERVALL   [Fast ▾] [6] tim │
│ ÅTERKOMMANDE                 │       │ DIAGRAMFÄRG ● ● ● ● ● ●      │
│ ✂️ Kloklippning var 42 d     │       │ STATISTIK   kommer (27–29)   │
│ …                            │       │ TRENDER     kommer (27–29)   │
└──────────────────────────────┘       │ [Spara]                      │
                                       └──────────────────────────────┘
```

## What is already there, and constrains the design

- **The interval lives on `event_types`** (`interval`, `interval_type`), which the
  `dog_care_status` view and the `remind` Edge Function both read. Settings writes it
  through `planIntervalChanges` → `saveIntervals`, under a column grant
  (`update (interval, interval_type)`) and a `member_update using (true)` policy.
- **`event_types` is the catalogue**: migration-managed rows, readable by `anon`
  (`public_read using (true)`, the one anon grant plan 13 kept). Anything stored on it is
  global and public.
- **Chart colours are hard-coded** `--chart-*` pairs in `layout.css`, re-exported as
  `var()` strings by `palette.ts`. Six cards read them: Promenad, Matning, Olyckor, Vikt,
  Ensamtid, Biltur. Trender draws no colour.
- **Tile colour is per category** (`CATEGORY_COLORS` in `LogGrid.svelte`).
- **`npm run new-event`** inserts a `--chart-<id>` pair (slate) and a `<ID>_COLOR` const
  under `codegen:` markers, and the card templates take `COLOR_CONST`.
- **Marcus is red-green colour-blind**, and the charts are read on a phone in both themes.

## Decided

Asked 2026-10-05, before any code. All four as recommended below.

| Question                       | Answer                                                     |
| ------------------------------ | ---------------------------------------------------------- |
| Storage                        | **`type_settings`**, keyed `(household_id, type_id)`.      |
| Tile colour                    | **Stays per category.**                                    |
| The all-intervals form         | **Replaced by the Typer list.**                            |
| Ensamtid's Vet ej (blue today) | **The chosen colour's second shade**, like Olyckor's pair. |

## Questions, with my recommendation

### 1. Storage: columns on `event_types`, or a `type_settings` table?

**Recommend a new `type_settings` table, keyed `(household_id, type_id)`.**

- `event_types` is the catalogue: what an activity _is_. A chart colour, a Trender
  toggle, a statistics choice are how _this household_ wants to see it. Putting them on
  the catalogue makes them anon-readable and global, and every plan 27–29 field would
  widen the one table plan 13 deliberately left public.
- A table of its own gets plan 13's shape from the start: `revoke all` first, then
  `select, insert` and `update (<the columns>)` to `authenticated`, RLS on
  `is_household_member(household_id)`. Each later plan adds a column and its grant.
- **A missing row means "the defaults"**, so no seed per household and no row for
  `new-event` to write; the defaults live in code next to the palette.
- **The interval stays on `event_types`** for now. Moving it drags the status view and
  the reminders function along for no visible gain; the page edits both stores in one
  Spara.

### 2. Tile colour per type, or per category?

**Recommend per category, unchanged.** The tile colour is what groups the grid at a
glance (the rose last row: Biltur · Ensamtid · Hundvakt), and white text on a tile needs
its own contrast-checked set, not the chart palette. The chart colour is per type.

### 3. Does the all-intervals form stay?

**Recommend it goes, replaced by the list.** The Typer list _is_ the overview: each row
shows its interval in words ("var 6 h", "följer snittet", "var 42:e dag") and its chart
swatch. Editing happens on the type's page. `/settings/intervals` redirects to
`/settings/types` so an old link lands.

## Design

### Storage

```sql
create table type_settings (
	household_id uuid not null references households on delete cascade,
	type_id text not null references event_types on delete cascade,
	chart_color text, -- null: the default
	primary key (household_id, type_id)
);
-- RLS: is_household_member(household_id), for select/insert/update.
-- revoke all from anon, authenticated; grant select, insert, update (chart_color).
```

- **`chart_color` is a palette key** (`'blue'`, `'green'`, …), not a hex: the palette can
  be re-stepped without touching rows. No `check` constraint, so adding a colour later is
  a code change; an unknown key reads as the type's default.
- **Saving updates the row, or inserts it** the first time, with `household_id` from the
  dog the user keeps. Not an upsert: that also writes the key columns, which the update
  grant leaves out. A save that shows what is already in effect writes nothing, so saving
  an interval never freezes the default colour into a row.

### The palette

- **Six entries, each a light/dark pair plus a second shade** for a card's second series:
  Grön, Blå, Bärnsten, Lila, Rosa, and Skiffer (a deliberate neutral, offered only to
  single-series cards since it sits too close to the greys).

  | Key    | Light main / alt    | Dark main / alt     |
  | ------ | ------------------- | ------------------- |
  | green  | `#047857` `#022c22` | `#6ee7b7` `#10b981` |
  | blue   | `#3b82f6` `#1e40af` | `#60a5fa` `#bfdbfe` |
  | amber  | `#d97706` `#92400e` | `#f59e0b` `#fde68a` |
  | violet | `#5b21b6` `#8b5cf6` | `#7c3aed` `#ddd6fe` |
  | pink   | `#db2777` `#831843` | `#f472b6` `#fbcfe8` |
  | slate  | `#475569` `#1e293b` | `#94a3b8` `#e2e8f0` |

  The five hues with the card grey: worst all-pairs CVD ΔE 9.6 light, 10.9 dark (≥ 8 is the
  target); each main/alt/grey triple ≥ 11.

- Chosen with the dataviz validator, **all pairs** rather than adjacent ones, so any two
  stay apart for deuteranopes and protanopes. Candidates the validator threw out: rose
  next to emerald (ΔE 1.1 deutan), violet next to blue (1.3), amber next to orange.
- `layout.css` holds `--palette-<key>` and `--palette-<key>-alt` as `light-dark()`
  pairs; `palette.ts` lists the keys with their Swedish names and the per-type defaults.
- **Defaults keep today's hues** (the shades moved to pass the check): Promenad, Matning, Ensamtid → Grön; Vikt → Blå;
  Olyckor → Bärnsten; Biltur → Skiffer; anything else → Skiffer.

### How the colour drives the charts

- `loadStats` reads `type_settings` alongside its other reads and returns
  `chartColors: Record<typeId, ChartColor>` (`{ main, alt }`, both `var()` strings).
- **Single-series cards** (Promenad, Vikt, Biltur, generated ones) use `main`.
- **Olyckor**: kiss `main`, bajs `alt`, ospecificerat grey, as amber does today.
- **Matning**: åt upp `main`; the two greys stay.
- **Ensamtid**: lugn `main`, orolig grey, vet ej `alt`. Today vet ej is blue against
  emerald; the second shade separates by lightness the way Olyckor's pair already does.

### The pages

- **`/settings/types`**: every type, daily then recurring as on Status, each a link
  showing icon, label, interval in words and its swatch (for types with a chart).
- **`/settings/types/[id]`**: one form, one `?/save` action redirecting to `?saved`:
  - **Intervall**: the same fields as today's row, through `planIntervalChanges` given
    only this type.
  - **Diagramfärg**: radio buttons drawn as swatches (works without JS), shown only for
    types with a card; others say no chart shows the type yet.
  - **Statistik** and **Trender**: a line each saying what will come there.
- **The menu** entry "Intervaller" becomes "Typer".

### `npm run new-event`

- Stops writing a `--chart-<id>` pair and a `<ID>_COLOR` const; adds the id to
  `CHARTED_TYPES` under `codegen:charted-types`. A type with no default of its own draws in
  Skiffer, so the generator needs no default entry.
- Card templates take their colour from `data.chartColors.<id>`.
- The closing note points at Inställningar → Typer instead of `layout.css`.

### Verification

- `npm run check`, `npm test` (palette lookup and defaults, the single-type interval
  plan, generator output), `npm run lint`, svelte-autofixer on the changed components.
- `npm run db-local` / `dev:local`: as `anon`, `type_settings` is unreadable; signed in,
  pick a colour, see Statistik redraw in it in both themes; save an interval from the
  type's page and see Status follow; an old `/settings/intervals` link redirects.
- `db-push` only after the merge.

## Not in scope

- The statistics, Tabeller and Trender choices themselves (plans 27–29).
- Moving the interval off `event_types`.
- Per-type tile colours, or a free colour picker.
