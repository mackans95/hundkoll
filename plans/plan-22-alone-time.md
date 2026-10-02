# Plan 22 — Ensamtid: logging time alone

> Source: asked 2026-10-02 — "a new event type … for alone time, so 'Ensamtid' for the
> title. I want to be able to log how long she has/was alone for, and if the alone time was
> 'successful', meaning if she started howling or barking or anything else that might
> indicate she felt in distress being alone … The stats page option should be similar to
> the car rides event … No status tracking, this will be done whenever it's needed, not on a
> schedule."

> **Status: 📝 Planned** — branch `feature/alone-time`. The six outline questions are
> answered (below); four smaller ones remain at the end.

## The goal

One more tile, **🏠 Ensamtid**, that logs a stretch of time she was left alone, how long it
lasted, and whether it went well. On Statistik, a card like Biltur's, showing how often
she's left alone, for how long, and how often without distress. Over weeks, that last
number is the one that says whether alone-time training is working.

## What is already there, and makes this mostly a generated type

- **A new type with no schedule is one migration row.** With `interval` null it never
  appears on Status, so it gets no reminders (plan 19) and no Settings field to fill in.
- **Biltur is almost exactly this shape:** a required `duration_min`, plus a `reveal`
  ("Olycka?") that uncovers what happened. Its card is a counts chart with an "Snittlängd"
  tile and a "share without" tile. `npm run new-event` scaffolds all of that from flags:
  migration, detail fields, locale, card, query and page wiring.
- **A `reveal` stores nothing on a good day**, and `share-without` divides by every event
  of the type. So "share of alone times without distress" needs no SQL and treats an
  untouched reveal as success, the way "Utan olycka" works today.
- **The tooltip breakdown is automatic:** every checkbox under the reveal shows under its
  day's bar ("Ensamtid 2 · Oro? 1 · Ylade 1").

## Decided

| Question                  | Answer                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How is the outcome known? | Often it isn't (no camera yet, though one would be best), so the answer is **three-way**: _Lyckades / Misslyckades / Vet ej_. "Oro" is dropped as the word. |
| Which signs?              | **Ylade** (covers barking and whining too), **Förstörde något**, **Olycka** (peed or pooped inside), **Rastlös** (covers scratching at the door too).       |
| When did it go wrong?     | Yes: **"Misslyckades efter (min)"**, one of the key metrics, to see over time how long she manages.                                                         |
| "Längsta lyckade" tile?   | Yes, **next to** a normal Biltur-like card, not instead of it.                                                                                              |
| Live timing?              | **Wanted, later**: especially early in the training. Not in this plan; written down below.                                                                  |
| Colour and icon?          | 🏠, and **Biltur and Ensamtid take Hundvakt's rose**.                                                                                                       |

## The design

### The type

```sql
insert into event_types (id, label, category, interval, interval_type, icon, sort_order)
values ('alone', 'Ensamtid', 'other', null, 'days', '🏠', 105);
```

`105` puts it between Biltur and Hundvakt, so the fourth row is **Biltur · Ensamtid ·
Hundvakt**, all rose.

### The colour: `other` becomes rose

Tile colour comes from the category (`CATEGORY_COLORS` in `LogGrid.svelte`). Ensamtid can't
be `absence`, because that category pauses Status and the averages (plan 16). So `other`
takes `absence`'s rose classes, and Biltur and Ensamtid change with it. Today `other` is
only Biltur, and the next generated `other` type will be rose too. The comment there
explaining slate for colour-blindness gets updated: rose was judged on the phone and is
liked. No migration; it's one line of Tailwind classes.

### The fields

| Field              | Input               | Label                            | Stored                           |
| ------------------ | ------------------- | -------------------------------- | -------------------------------- |
| `duration_min`     | `number`, required  | Längd (min)                      | always                           |
| `succeeded`        | **`outcome`** (new) | Lyckades / Misslyckades / Vet ej | `true` / `false` / _nothing_     |
| `failed_after_min` | `number`            | Misslyckades efter (min)         | only when `succeeded` is `false` |
| `howled`           | `checkbox`          | Ylade                            | only when `succeeded` is `false` |
| `destroyed`        | `checkbox`          | Förstörde något                  | only when `succeeded` is `false` |
| `accident`         | `checkbox`          | Olycka                           | only when `succeeded` is `false` |
| `restless`         | `checkbox`          | Rastlös                          | only when `succeeded` is `false` |

**`outcome` is the one new input kind:** three buttons in a row, like the theme picker in
Inställningar.

- **Vet ej stores nothing**, the way an untouched reveal does. That's what makes the stats
  honest: `share` divides only by the events that answered (`share_answered` in
  `stats_detail_windows`, the same thing that makes Matning's "åt upp" exclude unrecorded
  meals). So **"Lyckade" is lyckade ÷ (lyckade + misslyckade)**, and a Vet ej neither helps
  nor hurts.
- **Misslyckades reveals the rest**, like a ticked reveal does. Generalised as
  `revealedBy: 'succeeded'` plus `revealedWhen: false`, and with CSS (`peer-checked:` on
  that one radio button), so the server-rendered dialog still works without JavaScript, as
  plan 3's reveals do.
- **One cross-field rule** in `parseDetails`: `failed_after_min` can't exceed
  `duration_min`. It goes there, not in the action, for the same offline-first reason as the
  reveal rule.

### Statistik: a Biltur-like card, plus

A counts card generated like `CarRideCard`: alone times per day, with a tooltip breakdown
("Ensamtid 2 · Lyckades 1 · Ylade 1") and four tiles:

| Tile             | Kind                 | Reads                                                  |
| ---------------- | -------------------- | ------------------------------------------------------ |
| Snittlängd       | `avg`                | `duration_min`                                         |
| Lyckade          | `share`              | `succeeded`, over the answered ones                    |
| Misslyckas efter | `avg`                | `failed_after_min`, the edge to stay under             |
| Längsta lyckade  | **`max-when`** (new) | the longest `duration_min` where `succeeded` is `true` |

`max-when` is computed in TypeScript over the type's own events, as `detailDays` already
reads them, rather than as a new SQL view. That's the README's rule: choosing the field is
the catalogue's knowledge.

### Generator, then by hand

`npm run new-event` writes the migration, the plain fields, the card with its `avg` and
`share` tiles, the query and the page wiring. Then by hand:

- the `outcome` input (`fields.ts` type, `DetailFields`, `parseDetails`, the events-list
  summary "lyckades" / "misslyckades efter 20 min · ylade");
- `revealedWhen`, and the cross-field rule;
- the `max-when` tile;
- the colour change.

The generator doesn't learn `outcome` or `max-when` in this plan; it can once a second type
wants them.

## Wanted later: live timing

Start Ensamtid as you leave, and stop it when you're back, at which point the dialog opens
with the length filled in and asks how it went. It would help most early in the training,
when the times are short and minute-precise. It's its own plan, because today's live mode
(`activeWalk.svelte.ts`, plan 1) is built around the walk's pee and poop counts. Making it
generic is the work.

## Order of work

1. Generator run on the branch, reviewed.
2. `outcome` + `revealedWhen` + the cross-field rule, with tests (`details.test.ts`).
3. `max-when` and the four tiles; the colour.
4. `npm run db-local`, then a probe: the dialog's three outcomes and what each stores, the
   tile on the grid, the card against snapshot data with a few logged alone times.
5. PR. After merge, `npm run db-push`. No APK.

## Questions

1. **Words.** _Lyckades / Misslyckades / Vet ej_ is the working set. Alternatives, if you
   want them: _Gick bra / Gick dåligt / Vet ej_, or about her rather than the session, _Lugn
   / Orolig / Vet ej_. The tiles would follow ("Lyckade", "Längsta lyckade").
2. **Do signs have to be given when it failed?** A reveal today insists on at least one
   cause, but you might know it failed without knowing how (a neighbour heard something).
   _Recommendation: optional._
3. **Is "Misslyckades efter" optional too?** Without a camera you often won't know.
   _Recommendation: optional; the tile averages the ones that have it._
4. **The chart's bars:** one colour like Biltur, or **stacked by outcome** (lyckade,
   misslyckade, vet ej)? Stacked shows progress at a glance and uses `StackedColumns` as it
   was meant to. _Recommendation: stacked._

## Not in scope

- Status, intervals and reminders: it happens when it's needed.
- Live timing (above; wanted, a later plan).
- Anything on the lock screen or the widget.
- Teaching the generator `outcome` / `max-when`.
