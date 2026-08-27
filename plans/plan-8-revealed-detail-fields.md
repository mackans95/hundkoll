# Plan 8 — Detail fields that reveal other fields

> Source: reported 2026-08-27, from the first real run of `npm run new-event` —
> "for a car ride, besides logging the amount of time the car ride took … I
> would also like to track if she had any accidents while in the car, since she
> gets car sick often … first a checkbox for if there was an accident or not,
> this would default be not selected, and if you do check the box, you can then
> choose between either throw up or bowel movement, or both … the script
> doesn't support that level of customisation at the moment".
>
> Refined in review: a ticked reveal **must** have a cause chosen — "I should
> never be able to tick the accident box without choosing what type of accident
> occured" — and revealed fields take any input type, "might not need it right
> now, but if I do need it in the future it will already be built".

> **Status: 📋 Planned** — not built.

> **Scope:** the mechanism only. The Biltur type itself is **not** part of this
> plan — the generated car-ride files were discarded, and the type gets
> re-created with `npm run new-event` once this and plan 9 are both built. That
> is deliberate: generating it through the improved script is the end-to-end
> test of the script, the way plan 2 was verified. Every `car_ride` snippet
> below is therefore an illustration of the intended output, not a file to
> write; the reveal is verified against a throwaway fixture type.

## Summary

The dialog can render three inputs (`number`, `checkbox`, `count`) in a flat
list, and that is all. A car ride needs a fourth thing which is not an input so
much as a _relationship_: two checkboxes that only exist once a third one is
ticked, and which that third one is then not valid without.

A fourth input type, plus one optional property naming what gates a field:

```ts
{ name: 'accident', label: 'Olycka',  input: 'reveal' },
{ name: 'vomit',    label: 'Spydde',  input: 'checkbox', revealedBy: 'accident' },
{ name: 'poop',     label: 'Bajsade', input: 'checkbox', revealedBy: 'accident' }
```

`reveal` is a checkbox whose job is to gate, so both the renderer and the parser
can tell it from an ordinary checkbox where it stands, without scanning the list
for who points at it. The list itself stays **flat**, and that is what keeps the
rest cheap: the stored details stay flat too, so every stats view reading
`details->>'key'` is untouched, and `parseDetails`, the offline queue's
optimistic row and `detailSummary` all keep iterating one array.

Any input type can be revealed, not just a checkbox — a revealed `number` for
"how many minutes into the ride" costs nothing extra once the gate is a property
rather than a special shape.

## An uneventful ride stores nothing about accidents

A ride with the box untouched is stored as `{duration_min: 45}` — not
`{duration_min: 45, accident: false, vomit: false, poop: false}`. Inside a
reveal, **only what was actually answered is stored.**

That is a deliberate departure from the plain `checkbox` input, which does store
`false`: `meal.finished: false` is how "she did not finish" reads back as "åt
inte upp", and a missing key would be indistinguishable from an old row. A
reveal has no such reading — there is nothing to say about the causes of an
accident that did not happen.

| what happened          | stored details                                        | reads back                  |
| ---------------------- | ----------------------------------------------------- | --------------------------- |
| 45 min, nothing        | `{duration_min: 45}`                                  | `45 min`                    |
| 45 min, sick           | `{duration_min: 45, accident: true, vomit: true}`     | `45 min · spydde`           |
| 45 min, both           | `…, accident: true, vomit: true, poop: true`          | `45 min · spydde · bajsade` |
| ticked, nothing chosen | — rejected, see below                                 | —                           |

Because a ticked reveal always has a cause, the reveal itself contributes **no
summary word**: `olycka` can never be the only thing there is to say, so nothing
has to suppress it. `accident: true` is stored anyway, redundant with its
children on purpose — "how many rides had an accident" is then one
`details->>'accident'` away instead of a scan over the possible causes.

## Ticking a reveal requires a choice, and the check cannot live on the server

The rule: **a reveal that is on must have at least one revealed field
answered** — a ticked checkbox, a count above zero, or a number with a value.

The obvious place for that is the form action, and the obvious place is wrong.
Logging is offline-first: `createLogSubmit` cancels the native submission,
writes the row to IndexedDB and closes the dialog, and the send happens whenever
there is a network. A rule enforced only by the server would accept the ride,
close the dialog, and surface a failed row minutes later with the dialog long
gone — the one shape of error this app is built to avoid.

So the rule goes in **`parseDetails`**, which is already the shared module —
"shared rather than server-only: the queue uses it too" — and is therefore the
one place both paths already agree on. It reports the failure the way it already
reports a bad number, and both callers already have somewhere to put it:

- the dialog (JS): `queueLog` refuses to enqueue and the message appears in the
  dialog, which already renders `{#if message}`;
- the form action (no JS): `parseEventForm` already turns a `parseDetails`
  failure into `fail(400, { message })`, and the server-rendered dialog shows
  it.

`ParsedDetails` grows a reason so the caller keeps choosing the phrasing:

```ts
export type ParsedDetails =
	| { ok: true; details: EventDetails }
	| { ok: false; field: string; reason: 'value' | 'choice' };
```

`reason: 'choice'` maps to a new `locale.errors.chooseOne(label)` — _"Välj vad
som hände: olycka."_ — next to the existing `invalidValue`.

**This exposes a real defect to fix on the way.** `queueLog` today does:

```ts
details: parsed.ok ? parsed.details : {}
```

A detail field that fails to parse throws away **every** detail on the row and
queues it anyway — the walk is logged with no duration, no kiss, no bajs, and
nothing says so. Refusing to enqueue an invalid row fixes that for every type,
not just the new one.

Native constraint validation is no help here: `required` on a checkbox means
"this one must be ticked", and there is no HTML expression of "at least one of
these two". One rule, in the module both paths share, is the closest thing to a
single source of truth available.

## The rendering: no JavaScript, no state

A revealed block is a sibling of the checkbox that gates it, so `peer-checked:`
does the whole job — no `$state`, no `$effect`, and it works in the
server-rendered `?detail=` dialog with JavaScript switched off, which the rest
of this dialog is careful about.

The one requirement is that the input, its label and the revealed block are
_siblings_, so the checkbox stops being wrapped in its `<label>` and gets an
`id` instead:

```svelte
<div class="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-3">
	<input id={field.name} name={field.name} type="checkbox" class="peer rounded border-edge-strong" />
	<label for={field.name} class="text-sm font-medium text-ink-label">{field.label}</label>
	<div class="col-span-2 ml-6 hidden flex-col gap-3 peer-checked:flex">
		<!-- the fields whose revealedBy is this one, rendered by the same
		     {#each} branch as any other field -->
	</div>
</div>
```

`peer-checked:` matches only the immediately preceding sibling input, so a
ticked _child_ can never hold its own parent open — which a
`has-[:checked]`-style wrapper on the group would. And because the revealed
block renders through the same branch as everything else, a revealed `number` or
`count` needs no new rendering code at all.

No `<style>` block: no component in `src/` has one, and this does not need to be
the first.

## The parsing, in full

```ts
// A reveal and the fields under it store only what was answered: an unticked
// reveal says nothing about its causes, and a collapsed one still posts
// whatever its inputs were left at.
if (field.input === 'reveal') {
	if (form.get(field.name) === 'on') {
		details[field.name] = true;
	}
	continue;
}
if (field.revealedBy && form.get(field.revealedBy) !== 'on') {
	continue;
}
```

…then the existing per-input parsing runs unchanged, except that a revealed
field contributes nothing when it is empty, off, or zero. Afterwards, one pass
over the reveals: any that is `true` with no answered child fails with
`reason: 'choice'`.

Declaration order is load-bearing — a parent is read before its children — which
the generator validates rather than leaving to luck.

## The prompt

`reveal` joins the input choices, and choosing it opens a nested loop for the
fields it reveals, so nothing has to name a field typed several prompts ago.
The nested loop is the same prompt as the outer one minus `reveal` itself, which
means a revealed number asks its unit, step and required exactly as a top-level
one does:

```
Field name (english snake_case, empty when done): duration_min
  Swedish label: Längd (minuter)
  Input (number/checkbox/count/reveal) [checkbox]: number
  Unit for summaries (like 'min' or 'kg'): min
  Step (empty for whole numbers):
  Required? (y/N):

Field name (english snake_case, empty when done): accident
  Swedish label: Olycka
  Input (number/checkbox/count/reveal) [checkbox]: reveal
  Revealed field name (english snake_case, empty when done): vomit
    Swedish label: Spydde
    Input (number/checkbox/count) [checkbox]:
  Revealed field name (english snake_case, empty when done): poop
    Swedish label: Bajsade
    Input (number/checkbox/count) [checkbox]:
  Revealed field name (english snake_case, empty when done):

Field name (english snake_case, empty when done):
```

Flag form, for scripted runs and for the tests:

```
--field "name=accident;label=Olycka;input=reveal"
--field "name=vomit;label=Spydde;input=checkbox;revealed-by=accident"
```

The nested loop flattens into exactly the declaration at the top of this plan:
the prompt is shaped like the dialog, the data stays shaped like the list that
renders it.

## Generator changes

### 1. `reveal` in the spec and its validation

`FieldInput` gains `'reveal'`; `FieldSpec` gains `revealedBy?: string`. New
validation in `validateSpec`, all of it in the pure core and therefore testable:

- a `revealedBy` names a field that exists in this spec,
- …that is declared _before_ this one (parse order),
- …whose input is `reveal` — not an ordinary checkbox, which stores `false` and
  means something by it,
- a `reveal` is not itself revealed — one level only,
- a `reveal` reveals at least one field (an empty one is just a checkbox),
- a `reveal` has no `summarize`, so it needs no summary word generated,
- a field does not reveal itself.

### 2. Locale keys are reused, not re-declared

**A bug the car ride would have hit today.** `locale.ts` already has
`activities.fields.poop: 'Bajs'` and `activities.summary.poop: 'bajs'` from the
accident type. The generator inserts labels blindly, so a `poop` field on any
new type emits a duplicate key and `npm run check` fails with "An object literal
cannot have multiple properties with the same name" — after the files are
written, which is the worst possible moment.

Fix: read the existing keys under each marker, skip the ones already there, and
say so in the notes:

```
note: reused the existing labels for poop — check that 'Bajs' reads right
      for Biltur too, and give the field a distinct name if it does not.
```

Reuse is the right default (same word for the same thing) and the note is there
because it is not always right.

### 3. The closing checklist says what is not done yet

The run that prompted this plan ended with a migration on disk and no tile on
screen, because the log grid renders `event_types` rows and nothing had applied
the migration. The checklist listed `db-push` as step 4 without ever saying
that. It should say it outright, and point at the local database from plan 9:

```
The tile is not live yet — the log grid renders from event_types rows, and
this migration has not been applied to any database.

  npm run db-local     apply it locally and see it now
  npm run db-push      production — only after the PR merges
```

### 4. The field prompts explain themselves

One line before the loop and an example per input, because "Unit for summaries"
never said where the unit appears, and nothing said what a field _is_:

```
Detail fields are the extra inputs inside the log dialog, beyond the time
and the note. Most types have none — press Enter to skip.

  number    a number input      weight: 'Vikt (kg)', step 0,1
  checkbox  yes / no            meal: 'Åt upp'
  count     a −/+ stepper       walk: 'Kiss', reads back as 'kiss ×3'
  reveal    a checkbox that     accident: 'Olycka', revealing 'Spydde'
            uncovers more,      and 'Bajsade' — one of which must
            and needs one       then be chosen
```

## Files

| File                                         | Change                                                          |
| -------------------------------------------- | --------------------------------------------------------------- |
| `src/lib/events/fields.ts`                   | `'reveal'` input and `revealedBy?` on `DetailField`              |
| `src/lib/events/details.ts`                  | gating, store-only-what-was-answered, the "choose one" failure   |
| `src/lib/offline/submit.ts`                  | refuse to enqueue an invalid row, surface the message            |
| `src/lib/components/log/LogDialog.svelte`    | show a local validation message, not only the server's           |
| `src/lib/components/log/DetailFields.svelte` | sibling checkbox + `peer-checked:` reveal block                  |
| `src/lib/locale.ts`                          | `chooseOne` — no type-specific strings, see Scope                |
| `scripts/new-event-core.ts`                  | `reveal` in the spec, validation, locale-key reuse               |
| `scripts/new-event.ts`                       | nested prompt loop, flag form, the two message fixes             |
| `README.md`                                  | the reveal in the "Detail fields" step                           |

Also stale and worth fixing while in there: the header comment in `fields.ts`
says `count` is "a checkbox that reveals a stepper", which `CountStepper`
stopped being — it is an always-visible stepper now. `parseDetails` still reads
the old checkbox pair for rows queued before that change, and the comment
belongs there instead.

## Tests

Pure modules only, per the project's vitest limit. `parseDetails(form, typeId)`
and `detailSummary(typeId, details)` both look their fields up in
`DETAIL_FIELDS`, and no shipped type has a reveal until Biltur is re-created —
so each gains a sibling export taking the field list directly
(`parseFields(form, fields)`, `summarize(fields, details)`), which the type-id
version calls. The existing tests keep using real type ids; the reveal tests
pass a list. That is better than declaring a fake type in production code, and
it is the smaller change of the two.

- `tests/details.test.ts` — an unticked reveal stores no keys at all, not
  `false` ones; a ticked child under an unticked reveal is dropped; a ticked
  reveal with nothing chosen fails with `reason: 'choice'`; a revealed number
  and a revealed count both count as a choice, at a value and above zero
  respectively; a plain `checkbox` still stores `false`; the legacy count pair
  still parses.
- `tests/summary.test.ts` — `accident + vomit` reads `spydde` with no `olycka`
  in front of it; an empty details object reads as the duration alone.
- `tests/new-event.test.ts` — the seven new validation rules; a nested spec
  flattens to `reveal` + `revealedBy` in declaration order; a revealed number
  keeps its unit and step; a field whose locale key exists produces no locale
  edit.

The dialog is verified by driving headless Chrome, including with JavaScript
disabled, since `peer-checked:` is the entire mechanism and no unit test can see
it — and the queue path is verified offline, since refusing to enqueue is the
half a server can never check. Both need a type with a reveal to exist, so the
verification generates a throwaway one through `npm run new-event`, applies it
to the local database from plan 9, drives it, and removes it again — which
tests the new prompt at the same time.

## What I recommend not building

- **Nesting deeper than one level.** Reveals inside reveals need recursive
  rendering and a real tree in the parse order, to express something no
  activity here wants. Revealed fields taking every _input_ type is the
  flexibility worth having; revealed _reveals_ are not.
- **Radio-style exclusive causes.** "Either, or both" is two independent
  checkboxes. An exclusive group is a different input type, for when something
  needs one.
- **Reveals gated on a number's value** ("if duration > 60"). A predicate in a
  field declaration stops being data and starts being code.
- **A car-sickness stats card.** Vomiting over time is a genuinely interesting
  chart, and it needs data first; the type has none yet.
