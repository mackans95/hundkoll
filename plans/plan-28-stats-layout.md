# Plan 28 — Statistik as one whole, in your order

> Source, 2026-10-06: "Ensure the boxes align better so they appear as a cohesive element."
> "Allow users to rearrange the order of the cards." "Use Settings to select which boxes
> appear under Statistics; if a new type is added, users can choose via settings whether it
> should be included at all."

> **Status: ✅ Built, awaiting merge** — branch `feature/stats-layout`. Requires plans 25
> and 26 (both merged). Plan 29 adds per-type chart kinds and tiles; this plan doesn't
> change what a card draws. All four questions answered as recommended. Verified on the
> local stack with a production snapshot:
>
> - **after the visual pass**, every header is 49 px (Vikt was 53), every card's tiles share
>   one grid, tile labels lose their icons, and Ensamtid's empty chart says so;
> - in headless Chrome: ▼ and a switch in Tabeller change the screen without posting, Spara
>   posts once and toasts, and Statistik follows (Mat first, Vikt hidden). Unticking På
>   Statistik on Olycka's page hides its card; Bad has no switch; all hidden says so; ▲
>   posts its move without JS; Settings → Trender still passes its probe on the shared ▲ ▼;
>   no exceptions;
> - **the generator**, run for real with a throwaway type: its snippet, map entry and
>   `CHARTED_TYPES` line type-check, then reverted;
> - grants: `anon` gets permission denied, and another household's row is refused by RLS.
>
> **Not yet on the phone.** After the merge: `db-push`.

## What is already there, and constrains the design

- **Six cards, each one type's**: Promenader (walk), Mat (meal), Olyckor (accident), Vikt
  (weight), Ensamtid (alone), Biltur (car_ride). Plan 26's `CHARTED_TYPES` in `palette.ts`
  already lists exactly these, and `npm run new-event` appends to it. So a card's identity
  is its type id, and the generator already registers new cards there.
- **The page is a fixed sequence**, with generated cards inserted at
  `codegen:stats-cards`. `loadStats` reads everything in one `Promise.all`.
- **Measured before** (headless Chrome, 412 px wide, production snapshot):

  | Card       | Header | Chart | Tile grid                             | Legend |
  | ---------- | ------ | ----- | ------------------------------------- | ------ |
  | Promenader | 49 px  | 140   | 1 wide + 2                            | none   |
  | Mat        | 49     | 140   | 2                                     | yes    |
  | Olyckor    | 49     | 140   | 3 in a row, under its own period tabs | yes    |
  | Vikt       | **53** | 140   | none; the value sits in the header    | none   |
  | Ensamtid   | 49     | 140   | 2 × 2                                 | yes    |
  | Biltur     | 49     | 140   | 2                                     | none   |

  Charts already share a height. What breaks the rhythm is the **tile grids** (four
  layouts), **tile labels** (Promenader and Mat carry icons and lower case, the others
  don't), **Vikt's taller header**, and **Ensamtid's empty chart** with no "nothing logged"
  line, unlike Vikt's.

- **Plan 27's Settings → Trender** set the pattern for an ordered list: ▲ ▼ edit on screen,
  Spara saves, a toast confirms, and each button still posts without JS.
- **The type page** (plan 26) has a Visas section ("På Status") and a Statistik placeholder.

## Decided

Asked 2026-10-06, before any code. All four as recommended below.

| Question              | Answer                                  |
| --------------------- | --------------------------------------- |
| Where the order lives | **Household-wide**, stored like Trender |
| Reorder               | **▲ ▼**, as in Settings → Trender       |
| A hidden card's data  | **Still loads**                         |
| A new type's card     | **Shown, at the end**                   |

## Questions, with my recommendation

### 1. Order household-wide, or per phone?

**Recommend household-wide, stored**, like Trender: both phones show the same Statistik,
and a new phone doesn't start from scratch.

### 2. Reorder by ▲ ▼ or by dragging?

**Recommend ▲ ▼**, the same as Settings → Trender. Dragging on a touch screen fights the
page's scroll and needs JS, which every other setting works without.

### 3. Does a hidden card's data still load?

**Recommend it still loads.** It's about a dozen small reads in one round trip, so skipping
one saves no noticeable time. Keeping them unconditional keeps the generator's
`codegen:stats-queries` simple. Hiding is about clutter, not speed.

### 4. What does a new type's card get?

**Recommend shown, at the end.** Running the generator with a stats card is already the
choice to have one. If you'd rather not see it, it's one switch to hide.

## Design

### Storage

- **`stats_settings (household_id primary key, cards jsonb)`**, the same shape as
  `trend_settings`: RLS, revoke-then-grant, update on `cards`.
- `cards` is an ordered list of `{ type, shown }`. **No row means the default order**,
  `CHARTED_TYPES` as declared, all shown.
- **Read back against `CHARTED_TYPES`**: a stored type without a card is dropped, and a
  card missing from the list is appended, shown. That is how a generated card joins
  without a migration.

### The page

- Each card becomes a snippet in a map keyed by type id. The page renders
  `{#each order}` over the shown ones. The generator's `codegen:stats-cards` insert
  becomes one entry in that map.
- Hidden cards are simply not rendered. Their reads still run (question 3).
- With every card hidden, the page says so and points at Inställningar → Tabeller.

### The visual pass

- **One tile grid** (`TileGrid`): two columns, and with an odd count the first tile spans
  both, as the headline. That covers Promenader (3), Olyckor (3, today three across) and the
  rest.
- **Tile labels**: no icons (the card header has the type's), sentence case: "Per dag",
  "Mellan promenader", "Snittlängd".
- **Saving the two settings lists** shares one helper, `householdSettings.ts`, and the ▲ ▼
  pair is one component, `MoveButtons`, used by Trender and Tabeller alike.
- **One header height**: Vikt's value drops to the header's text size, so every header is
  the same height.
- **One order inside a card**: period tabs (Olyckor only), chart, legend, tiles.
- **An empty line for every chart**, like Vikt's: "Inget loggat de senaste 30 dagarna."
- Before/after screenshots in both themes; the plan records both.

### Settings

- **Settings → Tabeller** replaces its stub: the cards in order, each with ▲ ▼ and a
  "Visa" switch, Spara at the bottom, the same toast.
- **The type page's Visas section** gets "På Statistik" beside "På Status", for a type
  with a card. Both edit the same stored list.

### Verification

- `npm run check`, `npm test` (reading the list back: defaults, a dropped type, an
  appended new card; the form plan), `npm run lint`, svelte-autofixer.
- Headless Chrome: reorder and hide in Tabeller, and Statistik follows; hiding from a
  type page does the same; all hidden shows the empty line; no JS still works.
- Before/after screenshots. Then the phone against the local preview, and back.

## Not in scope

- What a card draws, chart kinds, which tiles: plan 29.
- Folding state (open or closed) per card: it stays a `<details>` that remembers nothing.
