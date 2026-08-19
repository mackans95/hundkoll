# Plan 2 — Adding new event types simply

> Source: `new-features.md` § "Re-design how we add events"

## Summary

Good news first: **the app is already much closer to this than the problem
statement assumes.** A new event type with no detail fields is _purely a
database row today_ — the log grid, status screen, settings intervals, the
offline queue, and the recent-events list all render from `event_types`
rows with zero component changes. The redesign therefore isn't a rewrite;
it is three targeted fixes for the places that _don't_ scale, plus the
documentation that makes the easy path visible:

1. a grid layout that absorbs any number of tiles gracefully,
2. making the event-summary line data-driven instead of hardcoded per type,
3. a written, copy-pasteable "adding an event type" recipe in the README,
4. **a CLI — `npm run new-event` — that executes that recipe for you:**
   answer a few prompts and it generates the migration, the field
   declarations, the locale strings, and (optionally) a stats card
   scaffold. The recipe stays the source of truth; the CLI is its
   automation.

Deliberately **not** included: a generic config-driven stats card (see
"What I recommend not building").

## What already scales (verified against the code)

| Surface       | Why a new type is free                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| Log grid      | `LogGrid` maps `data.types` from the DB; colors come from `CATEGORY_COLORS[type.category]`.                     |
| Log dialog    | Renders `fieldsFor(type.id)` — empty for unknown types, giving the time + note dialog.                          |
| Form action   | `parseEventForm`/`parseDetails` follow the same `DETAIL_FIELDS`; a type without fields just stores a timestamp. |
| Status screen | Driven entirely by the `dog_care_status` view; interval vs. last-done split is data.                            |
| Settings      | Iterates `data.types`; a new row gets an interval input automatically.                                          |
| Offline queue | Carries `typeId`/`label`/`icon` from the tapped tile; type-agnostic.                                            |

## What doesn't scale, and the fixes

### 1. Grid layout: remainder rows should stretch

Today `LogGrid` is `grid grid-cols-3`: with 7 types the last row is one
lonely left-aligned tile with two empty slots. The wanted behavior — 1
extra → full row, 2 extra → 50/50, 3 → thirds — is exactly what wrapping
flexbox does natively, no JavaScript and no arithmetic:

```svelte
<div class="flex flex-wrap gap-2">
	<a class="min-w-[30%] flex-1 basis-[30%] ..."> ... </a>
</div>
```

`basis 30%` forces at most three per row; `flex-1` makes whatever lands on
the final row grow to fill it. 6 → 3+3, 7 → 3+3+1(full width), 8 →
3+3+2(halves). One class change in one file; the tap-target only ever gets
_bigger_.

Rejected alternative: keeping CSS grid and computing `col-span` for the
remainder in script — same result, but it's arithmetic that flexbox already
does, and it re-runs on every types change for nothing.

### 2. The summary line: the last hardcoded per-type branch

`src/lib/events/summary.ts` (`detailSummary`) is an `if (typeId === 'walk'
|| ...)` chain — the one place left where a new type with detail fields
needs code that _knows about the type_ rather than data that describes it.
Fix: make the summary declarative on the field definition, which is already
the single source for rendering and parsing:

```ts
export type DetailField = {
	name: string;
	label: string;
	input: 'number' | 'checkbox' | 'count';
	step?: string;
	required?: boolean;
	/** How the value reads in the events list; null hides it. */
	summarize?: (value: unknown) => string | null;
};
```

- `duration_min` → `(v) => typeof v === 'number' ? locale.units.minutes(...) : null`
- counts (`pee`, `poop`) → the existing `countText` helper, referenced from
  the field entry
- `finished` → the åt upp / åt inte upp pair
- `kg` → kilograms formatting

`detailSummary(typeId, details)` becomes: iterate `fieldsFor(typeId)`,
apply each `summarize`, join with the separator — no type branches at all.
The one legacy case (`portion_g`, stored by rows that predate the current
field list) moves to a small explicit `LEGACY_SUMMARIES` map beside the
field table, documented as append-only history.

After this, **declaring a field once in `DETAIL_FIELDS` gives you the form
input, the server parsing, the queue's optimistic row, and the summary
line** — the "declared once" promise the file's header comment already
makes, completed.

### 3. The recipe: document the path (README section)

A new top-level README section, roughly:

```markdown
## Adding an event type

1. Migration — one insert:
   insert into event_types (id, label, category, icon, interval_days, sort_order)
   values ('nailtrim', 'Klotrimning', 'care', '✂️', 21, 55);
   Everything below is optional.
2. Detail fields (only if the type collects data): one entry in
   src/lib/events/fields.ts, with labels in locale.ts. Form, parsing,
   queue and summary line all follow from it.
3. Stats (only if the type deserves a chart): see "Adding a stats card".
```

Plus the **"Adding a stats card" recipe** documenting the existing
composition chain — SQL view (or extending an existing one) → select +
narrowing mapper in `server/stats.ts` → bucket builder in `stats/buckets.ts`
→ a card component composing `FoldableCard` + `StackedColumns`/`TrendLine` +
`StatTile`s. Each step is ~20 lines by the existing examples; the recipe's
job is making the chain legible, with `WalkCard` named as the reference
implementation.

### 3b. A fourth category: Övrigt (`other`)

Adding a _category_ is the one step that can't be data-driven — it needs a
check-constraint migration, a type-union entry, and a tile color. So do it
**once, now**, with a catch-all: everything added from here on lands in
`other` unless it obviously belongs to routine/care/health. Three touches:

- **Migration:** recreate the `event_types` category check as
  `category in ('routine', 'care', 'health', 'other')`.
- **`domain.ts`:** `EventCategory` gains `'other'`.
- **`LogGrid`'s `CATEGORY_COLORS`:** `other` gets **slate**
  (`border-slate-800 bg-slate-600 hover:bg-slate-700 active:bg-slate-700`).
  Color reasoning: the tempting violet sits in the same blue family as the
  existing sky and collapses toward it under red-green color-blindness,
  where slate is separated from all three existing colors on the
  saturation/lightness axis — distinguishable for every color-vision type —
  and a muted neutral reads correctly as "miscellaneous". (Prefers-color
  swap to violet is one line if slate feels too quiet in practice.)

No locale strings needed: category names are never shown as text — the
tile color _is_ the category UI. Övrigt types cluster at the end of the
grid naturally, since new types get the highest `sort_order`. With this in
place, a genuinely new _named_ category should be a rare, deliberate event
— and it stays a documented manual step (the same three touches).

### 4. The CLI: `npm run new-event`

A generator script — `scripts/new-event.ts`, run as `npm run new-event` —
that walks through the recipe interactively and writes every artifact. Node
24 runs TypeScript directly and ships `node:readline/promises`, so this
needs **zero new dependencies**.

**Prompts** (each also available as a flag, so a full invocation can be one
line):

1. Swedish name — the log-button label (e.g. `Klotrimning`)
2. English name — the data id, validated `^[a-z][a-z0-9_]*$` and checked
   for collisions against `DETAIL_FIELDS` and the existing migrations
3. Icon (emoji) and category (`routine` / `care` / `health` / `other`,
   **defaulting to `other`** — see 3b; inventing a brand-new category stays
   outside the CLI, as a documented manual step)
4. Interval in days, or none
5. **Fields, in a loop:** field name (english), Swedish label, input type
   (`number` / `checkbox` / `count`), step, required — the exact
   `DetailField` shape. Empty name ends the loop; zero fields is fine.
6. **Stats:** `none` / `counts-per-day` (a `StackedColumns` card like
   walks) / `trend-line` (a `TrendLine` card like weight — asks which
   numeric field to plot).

**What it writes:**

| Artifact                                                  | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/<timestamp>_add_<id>_event_type.sql` | The one insert, `sort_order` defaulted to max + 10 (overridable).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `DETAIL_FIELDS` entry in `fields.ts`                      | Inserted at a marker comment, with a default `summarize` per input type (number → its unit prompt, count → `countText`, checkbox → word pair) — possible precisely because item 2 made summaries declarative.                                                                                                                                                                                                                                                                                                                                                                 |
| Locale strings in `locale.ts`                             | Field labels under `activities.fields`; card heading/strings if stats chosen. Marker-inserted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Stats scaffold (if chosen)                                | A card component rendered from a template (composing `FoldableCard` + chart + `StatTile`s), a select + narrowing mapper in `server/stats.ts`, the card's slot in `stats/+page.svelte`, a palette constant — all at markers. For `counts-per-day` **no new SQL is generated**: `stats_daily_counts` is already grouped per `type_id`, which is exactly how the walk and meal cards read it. To keep generated code small, add one shared `simpleCountBuckets(days, today, label)` builder to `buckets.ts` that generated cards call instead of each getting a bespoke builder. |

**How it edits existing files:** marker comments
(`/* codegen:detail-fields */` and kin) at the insertion points, with the
CLI failing loudly — no partial writes — if a marker has gone missing. This
was chosen over AST rewriting (the honest alternative): the `typescript`
package could do surgical inserts, but the code for that dwarfs the
generator itself, and markers in five stable files are easy to protect
with the smoke test below.

**What it deliberately does not do:** touch the database. It _generates_
the migration and ends by printing the house checklist — review the diff,
`npm run check && npm test`, feature-branch PR, and `db push` only after
merge — because the repo rule is that migrations never ship from unmerged
branches. It also gets a `--dry-run` flag that prints every planned write
without performing any.

**Keeping the generator honest:** split it into a pure core
(`spec → { migrationSql, fieldsSnippet, localeSnippet, cardSource, … }`)
and a thin prompt/filesystem shell. The core gets vitest coverage on a
fixture spec (id validation, snippet shapes, collision detection), so the
generator can't silently rot; and since its output lands in files covered
by `npm run check` and the summary tests, a drifted template fails the
normal pipeline anyway.

## What I recommend _not_ building: the generic stats card

The temptation is a `<GenericStatsCard config={...}>` that renders any
metric from a config object. Recommendation: **don't.** The existing cards
differ in exactly the ways that matter — walks have a headline tile +
two-column tiles, meals have a conditional third legend entry, accidents
have a period picker and a readiness gate, weight is a line chart with an
aside. A config object expressive enough to cover that is a worse
programming language than Svelte. The building blocks (`FoldableCard`,
`StackedColumns`, `TrendLine`, `StatTile`, `ChartLegend`, `TabBar`) _are_
the generic layer, and they already exist; composition beats configuration
at this component size (a full card is 30–60 lines). The recipe doc is
what makes this repeatable — a template to copy, not a framework to feed —
and the CLI is exactly that template being copied _for_ you: generated
cards are ordinary checked-in components you can edit freely afterwards,
not config interpreted by a mega-component at runtime.

## Changes, file by file

| File                                                                                                                                                                | Change                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/components/log/LogGrid.svelte`                                                                                                                             | Grid → wrapping flex with stretching remainder rows; `other: slate` added to `CATEGORY_COLORS`.                                                                 |
| `supabase/migrations/…_other_category.sql` **(new)**                                                                                                                | Category check constraint recreated to include `'other'`.                                                                                                       |
| `src/lib/types/domain.ts`                                                                                                                                           | `EventCategory` union gains `'other'`.                                                                                                                          |
| `src/lib/events/fields.ts`                                                                                                                                          | `summarize` added per field; `LEGACY_SUMMARIES` map.                                                                                                            |
| `src/lib/events/summary.ts`                                                                                                                                         | `detailSummary` becomes a fold over `fieldsFor` + legacy map; type branches deleted.                                                                            |
| `README.md`                                                                                                                                                         | "Adding an event type" + "Adding a stats card" sections, plus a short "`npm run new-event`" section pointing at them.                                           |
| `scripts/new-event.ts` **(new)**                                                                                                                                    | The generator: pure spec→snippets core + prompt/filesystem shell, `--dry-run`, zero new dependencies.                                                           |
| `scripts/templates/` **(new)**                                                                                                                                      | The stats-card component template(s).                                                                                                                           |
| `package.json`                                                                                                                                                      | `"new-event": "node scripts/new-event.ts"`.                                                                                                                     |
| `src/lib/events/fields.ts`, `src/lib/locale.ts`, `src/lib/stats/buckets.ts`, `src/lib/server/stats.ts`, `src/routes/stats/+page.svelte`, `src/lib/stats/palette.ts` | `codegen:` marker comments at the insertion points; `buckets.ts` gains the shared `simpleCountBuckets` builder.                                                 |
| `tests/summary.test.ts` **(new)**                                                                                                                                   | Summary line via the declarative path: counts, duration, finished/not, kg comma, legacy `portion_g`, unknown type → ''. Locks the refactor to current behavior. |
| `tests/new-event.test.ts` **(new)**                                                                                                                                 | The generator core against a fixture spec: id validation, collision detection, snippet and migration shapes.                                                    |

One migration (the Övrigt category); the CLI _writes_ the per-type ones.
No visual change for the current six types (6 = 3+3 in both layouts, all in
existing categories) — verifiable by screenshot diff.

## Pros

- New basic type: **one SQL insert, nothing else.** New type with fields:
  insert + one `DETAIL_FIELDS` entry + locale strings. The promise becomes
  true _and written down_.
- With the CLI, all of the above collapses to **one command and a PR** —
  including a working stats card — while every generated artifact is
  ordinary reviewable code, safety-netted by the existing check/test
  pipeline.
- The grid handles 1–∞ tiles with pure CSS; tap targets grow, never shrink.
- Deletes the last type-switch (`detailSummary`) instead of adding
  abstraction — net code _removed_.
- Recipe docs turn tribal knowledge into a checklist.

## Cons / trade-offs

- `summarize` puts presentation lambdas into `fields.ts` — the file becomes
  "everything about a field" rather than "form schema". That's the point,
  but it's a judgment call; the alternative (a parallel `SUMMARY_FORMATS`
  map keyed by field name) keeps files thematic at the cost of two places
  to declare a field.
- Flex `basis-[30%]` is a magic number standing for "three per row" — needs
  the comment it will get.
- Marker comments are a contract: deleting one breaks the generator (loudly,
  but still). The generator's fixture test and the markers' own comments
  are the guard.
- Codegen is a second consumer of the codebase's shapes — when `DetailField`
  or the card composition changes, the templates must follow. The fixture
  test plus `npm run check` over generated output catch this, but it is
  real ongoing coupling; the CLI is only worth it if new types actually
  keep arriving.
- Stats scaffolds cover the two common shapes (counts-per-day, trend line).
  Anything fancier (an accidents-style period picker, stacked segments from
  details) starts from a generated card and gets hand-finished — the CLI
  does the recipe, not the imagination.

## Effort

The non-CLI part is small: the layout change is minutes; the summary
refactor plus its tests is the bulk; docs are an hour of writing. The CLI
is a medium-sized addition on top — the pure core and its fixture test are
the real work, the prompts are boilerplate. Sequence it after the summary
refactor (item 2) lands, since the generator's field snippets depend on
declarative `summarize`, and after Plan 1's count redesign, so templates
are written against the final `count` semantics once.
