# Plan 17 — Logging several events at once

> Source: asked 2026-09-22 — "add several items in one dialog event, so a bulk add, for
> sometimes my partner has been having her but forgets to log them, but writes them down on
> a piece of paper, and then I want to be able to add all of them nice and fast without
> multiple dialog opens and confirms … I'm thinking this could be located in the calendar
> view."

> **Status: ✅ Built** — PR #48. No migration, no new dependencies. The seven questions at
> the end were answered before the first line of code and every recommendation was taken.
> One thing the browser found that the plan had not: a form's `?/bulk` action replaces the
> query string, so the redirect back had lost the month and day — and the existing edit
> sheet on Historik had the same fault. Both carry the view in their action now.

## The goal

A piece of paper says "07:30 promenad kiss bajs · 08:00 mat åt upp · 12:15 promenad 20 min ·
17:00 mat". Today that is four tile taps, four dialogs, four times typing a time on the
wrong day. It should be: open the day in Historik, one sheet, one row per line on the
paper, one Spara.

## What is already there, and constrains the design

- **Historik already knows the day.** Tapping a cell selects it in the URL (`?month&day`)
  and shows that day's rows in a card. The sheet belongs on that card, and the day it
  belongs to is settled before it opens — so a row needs a clock time, not a date.
- **One dialog form is already parsed by one function.** `parseEventForm(form, dogId)`
  reads `type_id`, `occurred_at`, the type's detail fields and the note out of a `FormData`,
  and the dialog renders those fields from `DETAIL_FIELDS` through `DetailFields`. Both are
  per type, and neither knows about more than one event. The cheap design is to keep it
  that way and give each row its own prefix, so a row's fields become an ordinary dialog
  form once the prefix is stripped.
- **Edits on Historik go straight to the server**, not through the offline queue:
  "logging happens on walks, correcting happens on the couch". Copying from paper is couch
  work, and a batch wants to land whole or not at all — which is one insert of many rows,
  not many queued sends.
- **Every sheet degrades to plain HTML**, opened server-side from a query parameter
  (`?detail=`, `?event=`). `?add` can do the same for this one, with a fixed number of rows
  rendered and JavaScript adding more.
- **`use:enhance` resets a form only on success**, so a failed batch keeps its rows on
  screen with the error above them — nothing to build for that.
- **The reveal inside `DetailFields` is CSS keyed on an `id`.** Two rows with an accident
  field would share an id; the prefix has to reach the id and the `for` as well.
- **The absence type has two times.** A bulk row has one clock field; Hundvakt is logged
  through its own dialog and is not offered here.

## Design

### Where it opens

The selected day's card on Historik gets an action link, **Logga flera**, opposite the day
heading — the same slot the recent-events card uses for "Visa alla →". It opens a sheet, and
`?add` on the URL opens the same sheet server-rendered before hydration or without
JavaScript. Closing it drops `?add` and keeps the month and day, as the event sheet does.

### The sheet

Heading "Logga flera · fre 14 aug." and a list of rows, three to start. One row is:

```
[ Promenad ▾ ]  [ 07:30 ]                              ×
  Längd (minuter) [    ]   Kiss  − 1 +   Bajs  − 0 +
  ▸ Anteckning
```

- A `<select>` over the loggable types in catalogue order, defaulting to Promenad.
  Changing it swaps the detail fields under the row, the same fields the dialog shows,
  rendered by `DetailFields` with a per-row prefix.
- A `<input type="time">`. **A row with no time is not a row** — the three starting slots
  are like the lines on the paper, and an unused one is simply skipped. Nothing else about
  an empty row is looked at.
- A folded note, as in the dialog.
- **+ En rad till** appends a row; × removes one. Rows are keyed by an id generated when
  the row is added, which also travels as the row's `event_id` so a double submit collides
  on the primary key instead of logging the day twice.
- One button: **Spara alla**.

### The server side

One pure function, `splitRows(form)`, groups the posted fields by their `r<i>_` prefix into
one `FormData` per row with the prefix stripped, adds `occurred_at` composed from the
hidden `day` and the row's time, and marks it `detailed` — after which each row is exactly
what a dialog would have posted, and `parseEventForm` reads it unchanged. So a walk's
duration, a count, a reveal with its causes, and a note all work in a bulk row without a
second parser, and a rule added to the dialog later applies here for free.

A row that fails to parse stops the batch with its number in the message — "Rad 2: Ogiltigt
värde för längd." — and the sheet stays open with every row as it was. A time later than
now on today's date is refused the same way; the single dialog stops that with `max` on the
input, which a clock field cannot express.

The rows that parse go in **one insert**, so they land together or not at all. A
primary-key collision means the same batch was posted twice and is reported as done. Then a
redirect back to the same `?month&day`, which closes the sheet and shows the rows in the
day's list — and the cell's icons in the calendar above it.

### What does not change

Nothing in SQL: the views read rows, however many arrived at once. The single dialog, the
live walk and the queue are untouched. `DetailFields`, `CountStepper` and `NoteField` learn
a `prefix` (or a `name`) and are otherwise as they were.

## Files

| File                                            | Change                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/lib/events/bulk.ts` (new, pure)            | `splitRows(form)`, the row prefix in one place                                               |
| `src/lib/server/events.ts`                      | `parseBulkForm(form, dogId, now)` over `parseEventForm`; `insertEvents`                      |
| `src/routes/history/+page.server.ts`            | `?add` in the load with the starting row ids; the `bulk` action                              |
| `src/routes/history/+page.svelte`               | the Logga flera action and the sheet, on the `?event=` pattern                               |
| `src/lib/components/log/BulkSheet.svelte` (new) | the sheet: rows, add/remove, Spara alla                                                      |
| `src/lib/components/log/DetailFields.svelte`    | `prefix` prop, reaching names, ids and `for`                                                 |
| `src/lib/components/log/NoteField.svelte`       | `name` prop                                                                                  |
| `src/lib/locale.ts`                             | the Swedish                                                                                  |
| `README.md`                                     | the Historik paragraph, and the "one parser" note under the dialog section                   |
| tests                                           | new `bulk.test.ts`: splitting, skipping empty rows, the row-numbered error, the future check |

## Order of work

1. `splitRows` and its tests; `parseBulkForm` on top of it, with the tests that prove a row
   reads exactly as a dialog post does (same fixtures as `event-edit.test.ts`).
2. `DetailFields` and `NoteField` prefixes; the existing dialog and sheet still pass the
   autofixer and look the same.
3. The sheet and the action. Browser: three rows filled from a paper-like list, one empty,
   Spara alla, the day's list and the calendar cell.
4. The failure paths in the browser: a bad duration on row 2, a time after now on today,
   a double submit.
5. README, this document, full gate.

## Definition of done

- Four lines from paper become four stored rows with one Spara, with details and notes
  intact, on the day that was open.
- An empty slot is ignored; a broken row names itself and loses nothing typed in the others.
- Works before hydration from `?add` with the three rendered rows.
- Everything else — the dialog, the live walk, edits — exactly as before.
- `npm run check`, `npm test`, `npm run lint`, svelte-autofixer on the changed components,
  a browser pass over Historik.

## Questions, and the answers

Asked with a recommendation each, answered 2026-09-23. Every recommendation was taken.

1. **How much per row.** The type's full detail fields (duration, kiss, bajs, åt upp) and a
   folded note, as in the dialog — or only type and time, with details fixed afterwards
   through the sheet? _Recommend the full fields_: the paper says "kiss bajs", and a second
   pass through four sheets is the thing this is meant to remove.
2. **Which types.** Everything except Hundvakt, defaulting to Promenad — or only the
   routine three (walk, meal, accident)? _Recommend everything except Hundvakt_: a nail
   trim noted on the same paper should not need the other dialog.
3. **Where it opens.** Historik only, from the selected day's card — or also from the log
   page for today? _Recommend Historik only_: today is one tap in the calendar, and the log
   page's grid is for the moment itself.
4. **Starting rows.** Three empty slots, an unused one skipped — or one, growing as you go?
   _Recommend three._
5. **Straight to the server, all-or-nothing**, rather than through the offline queue?
   _Recommend yes_: couch work, and a half-landed paper is worse than a refused one.
6. **A time after now on today's date** refused? _Recommend yes._
7. **After Spara alla.** Back to the day with the rows listed, no message — or a line
   saying "4 händelser sparade"? _Recommend no message_: the list is the confirmation.

## Verified

- **The parser, in vitest.** A walk row posted through Logga flera comes out identical to
  the same fields posted from the dialog — the test compares the two `EventInsert`s. Empty
  rows skipped with the others' numbers kept, rows ordered by index whatever order the form
  posted them in, a bad duration named "Rad 2: Ogiltigt värde för längd (minuter).", a
  future time named by row, no rows and a malformed day refused.
- **On screen**, headless Chrome over CDP against the dev server on the local database, on
  2026-09-20 with 14 rows already there: the sheet from `?add` with three rows and ten types
  (no Hundvakt); switching row 2 to Matning swapped its fields to the checkbox; a fourth
  row added; walk 07:30 with 20 min, kiss, bajs and a note, meal 08:00 finished, row 3
  empty, accident 12:15 — Spara alla stored exactly those three, details and note intact,
  the day list read 17 and the calendar cell "17 händelser", and the URL kept
  `?month&day`. The same batch posted a second time returned no error and stored nothing.
  On today's date a row at 23:59 was refused as "Rad 2: Tidpunkten har inte inträffat
  ännu." with every time still in its field. A future day offered no link and no sheet.
  An edit saved from the sheet on Historik also kept the month and day. Console clean; the
  probe's rows deleted afterwards, the database back at its 538.
- 239 tests, `npm run check` clean over 501 files, `npm run lint` clean, svelte-autofixer
  clean on `BulkSheet`, `DetailFields`, `NoteField` and `EventSheet` (the relative `href`
  notes are the same by-design ones the other sheets carry).

## Not in scope

- Bulk editing or deleting stored rows.
- A bulk row for an absence; it keeps its own dialog with two times.
- Changing a row's type without JavaScript re-rendering its fields: the server-rendered rows
  show Promenad's fields, and a row switched to another type without JavaScript logs the
  type and time and ignores fields it does not have.
