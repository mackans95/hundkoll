# Plan 1 — Live walk logging

> Source: `new-features.md` § "Make the walk-logging more automated"

> **Status: ✅ Built and shipped** — PR #28, as designed: the persisted
> wall-clock walk (`hundkoll:active-walk:v1`), the checkbox-less always-visible
> `CountStepper`, the `<details>`-folded `NoteField`, `LIVE_TYPE_IDS`, the
> shared `queueLog`, `stockholmForInput`, and no database change at all.
> The three open questions took their defaults: minutes only, a 4 h guard,
> and no "backdate with the counts kept".
>
> **Deviations from the plan as written**, all from testing it on a real
> phone and desktop:
>
> - **Avbryt discards immediately, with no confirm step.** The plan called
>   for confirming first; in the hand it read as friction, and every other
>   Avbryt in the app cancels outright — one live walk is not worth being
>   the exception.
> - _Justera starttid_ and _Logga i efterhand istället_ are **buttons, not
>   links** (they act on local state and navigate nowhere). Tailwind v4's
>   preflight leaves buttons on the arrow cursor, so nothing in the app
>   looked clickable on a desktop; `button:not(:disabled)` now gets
>   `cursor: pointer` once in `layout.css` rather than per button.
> - **Bug found and fixed in review:** `backdate()` called `discardWalk()`
>   before passing `type` on, and `type` is a live getter into the page's
>   derived lookup of the _running_ walk — so by the time the dialog opened,
>   its activity was already null and nothing appeared. It now reads the prop
>   into a local first. Worth remembering as a shape of bug: a prop that
>   looks like a value is a getter, and discarding the state behind it
>   empties it mid-function.
> - Also fixed while here: the note textarea was **white-on-white in dark
>   mode**. `@tailwindcss/forms` styles textareas with a bare `textarea`
>   selector, which ties our themed override and wins on source order — the
>   inputs were only safe because they go through `input[type]`. The rule is
>   now `html textarea` / `html select`, with the specificity contract
>   spelled out in the comment. It had survived the dark-mode PR because
>   those screenshot probes ran on `/login`, which has no textarea.

## Summary

Tapping the Promenad tile starts a **live walk**: the start time is recorded
immediately, the log page shows an active-walk card with pee/poop steppers, a
note field, and a ticking elapsed time. Tapping _Avsluta & spara_ computes
`duration_min = end − start` and submits through the existing offline queue.
Backdating stays available and unchanged. **No database changes at all** —
the walk row that comes out is identical in shape to one logged today.

## The core design decision: persisted wall-clock, not a running timer

Your instinct in the problem statement is right: a running timer would not
survive the phone. Mobile browsers freeze/kill background tabs and PWAs
within seconds of locking the screen — `setInterval` simply stops. So the
design never _runs_ anything:

- On start, persist `startedAt` (an ISO instant) to `localStorage`.
- Every stepper tap and note keystroke updates the same persisted object.
- "Elapsed" is always computed as `now − startedAt` whenever the page is
  actually open — the ticking display is cosmetic, not load-bearing.
- On finish, `duration_min = round((now − startedAt) / 60_000)`.

Kill the app, reboot the phone, come back two hours later: the walk is still
active and the duration is still exact, because it is derived from clocks,
not from anything that had to stay alive.

### Why localStorage and not…

| Option                               | Verdict                                                                                                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `localStorage`                       | **Chosen.** Synchronous, survives reload/kill/reboot, zero deps.                                                                                               |
| The existing IndexedDB queue         | Async ceremony for one small object; the queue's schema is about _finished_ logs. Not worth it.                                                                |
| A server-side "walk in progress" row | Survives switching phones mid-walk, but requires network at walk start — breaks the app's offline-first core promise — and needs a schema migration. Rejected. |
| SvelteKit page state / URL           | Dies with the tab. Rejected.                                                                                                                                   |

## UX flows

### Starting (the common case — zero extra taps)

1. Tap **Promenad** in the grid → walk starts instantly. No dialog.
2. The log page shows an **active-walk card** at the top (above the grid):
   - "🚶 Promenad pågår · 23 min" — elapsed ticks once per second while visible
   - steppers for 🟡 kiss and 💩 bajs (live counts, tappable mid-walk)
   - a note field
   - primary button **Avsluta & spara**
   - secondary: **Avbryt** (discard, confirm first) and **Justera starttid**
     (a `datetime-local` capped at now, for "I forgot to tap when we left")
3. While a walk is active, the Promenad tile renders in an "active" state
   ("Pågår…") and tapping it scrolls/focuses the card instead of starting a
   second walk.

### Finishing

_Avsluta & spara_ builds exactly the fields the `?/log` action already
parses and hands them to the existing queue:

- `occurred_at` = the **start** time (this matches today's semantics — the
  dialog's prefilled time is documented in your own problem statement as
  "the start of the walk", and the stats views compute walk gaps from it)
- `duration_min` = computed, minimum 1
- `pee`/`pee_count`, `poop`/`poop_count` = from the card's steppers
- `event_id` = a UUID generated **at walk start**, so a lost response and a
  resend collide on the primary key exactly like dialog submissions do

The card disappears, the row appears in _Senaste händelser_ instantly (via
the queue), and sending happens in the background — same as today.

### Backdating (kept, one layer down)

- **Without JavaScript / before hydration:** the tile's `href="?detail=walk"`
  is untouched — the server-rendered dialog still opens. Live mode is a
  JS-only enhancement by nature (localStorage), so this degradation is free.
- **With JavaScript:** the active-walk card gets a quiet text link
  _"Logga i efterhand istället"_ which discards the live walk and opens the
  existing LogDialog. So: forgot yesterday's walk → tap Promenad, tap the
  link — two taps to the old flow, zero taps to the new default.

### Edge cases

- **Forgot to finish** (walk "active" for 9 hours): the elapsed time is
  loudly visible on the card, and _Justera starttid_ exists — but add a
  guard: when elapsed > 4 h, _Avsluta_ first shows the computed duration in
  an editable minutes input instead of saving blind.
- **Clock changes mid-walk** (DST, manual adjustment): duration is
  wall-clock delta; DST is irrelevant for instants (ISO/UTC math). A user
  manually moving the clock backwards could produce a negative delta —
  clamp at 1 minute.
- **Both phones**: the active walk lives on the device that started it.
  Whoever holds the leash holds the state. The finished row syncs through
  the database like every other log. (Documented limitation, see Cons.)
- **Second walk started by mistake**: prevented — one active walk max.

## UI redesign of the logging controls (dialog _and_ live card)

Two control changes, applying everywhere counts and notes are logged — the
backdating dialog and the live-walk card get the same components:

### Counts: always a stepper, no checkbox, one full-width row each

`CountStepper` today is a checkbox that reveals a stepper when checked.
Redesign: the checkbox goes away entirely. Each count field is always
visible, defaults to **0**, and takes a full row of the form:

```
Kiss                [ −      2      + ]
Bajs                [ −      0      + ]
```

— label on the left, then minus / centered amount / plus spanning the
remaining width, pee and poop on two separate rows. Thumb targets grow
from 36 px circles to roughly half the sheet width each.

Mechanically, the centered amount **is** an `<input type="number" min="0">`
(styled, `inputmode="numeric"`), with the − / + buttons adjusting its
value. That keeps the no-JS story clean without a checkbox: pre-hydration
the input is simply an editable number field, and the form still posts.

**Submission format change:** a count field now posts `<name>=N` directly
instead of today's `<name>=on` + `<name>_count=N` pair. So:

- `parseDetails`'s `'count'` branch reads the number like the `'number'`
  branch, defaulting to 0 (absent/blank/invalid → 0, negative clamped).
- **Back-compat:** it keeps accepting the legacy `on`/`_count` shape —
  queued-but-unsent rows created before the deploy replay their stored
  fields verbatim, and must not be misread as 0. Cheap to keep forever.
- `tests/details.test.ts`'s count cases update to the new shape, plus one
  case pinning the legacy shape.

Because the checkbox is gone, the live-walk card **reuses this exact
component** instead of needing its own stepper — one counts UI everywhere.
(A count of 0 was already what an unchecked box stored, so nothing changes
in the data or the stats.)

### Note: folded away until wanted

The note textarea is the tallest thing on the form and is rarely used.
Instead of a checkbox, use the pattern the app already has for exactly
this (`FoldableCard`): a `<details>` element —

```svelte
<details>
	<summary>Anteckning</summary>
	<textarea
		name="note"
		...
	/>
</details>
```

Collapsed by default, one tap to open, works without JavaScript, and needs
no state code at all. Extracted as `NoteField.svelte`, used by the dialog
and the live card. (Chosen over an "Add note?" checkbox: a checkbox
implies it will be submitted as data; a disclosure just says "more here".)

## Changes, file by file

| File                                                     | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/offline/activeWalk.svelte.ts` **(new)**         | The persisted state module. `activeWalk = $state<{ current: ActiveWalk \| null }>`, with `start()`, `update(patch)`, `adjustStart(isoLocal)`, `discard()`, `finish()`. Every mutation writes through to `localStorage` (key `hundkoll:active-walk:v1`). `finish()` builds the fields object and calls the same `enqueue` + `sendPending` the dialog path uses. Storage access wrapped in try/catch like the queue (private mode ⇒ live mode still works, just doesn't survive reload — and `console.warn`s). |
| `src/lib/components/log/ActiveWalkCard.svelte` **(new)** | The card described above. Ticking display via a 1 s interval attached with `{@attach ...}` (auto-cleans on unmount); counts and note via the redesigned `CountStepper` and `NoteField`, shared with the dialog.                                                                                                                                                                                                                                                                                              |
| `src/lib/components/log/CountStepper.svelte`             | Rewritten: checkbox removed, always-visible full-width stepper around a real number input, default 0, `bind:`-able so the live card can persist each tap.                                                                                                                                                                                                                                                                                                                                                    |
| `src/lib/components/log/NoteField.svelte` **(new)**      | The `<details>`-folded note textarea; `LogDialog` and the live card both use it.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/lib/events/details.ts`                              | `'count'` parsing reads `<name>=N` directly (default 0), keeps accepting the legacy `on`/`_count` shape for pre-deploy queued rows.                                                                                                                                                                                                                                                                                                                                                                          |
| `src/lib/offline/submit.ts`                              | Extract the tail of `save()` into an exported `queueLog({ id, type, occurredAt, fields, details, note })` used by both the dialog path and `finish()` — the enqueue-then-sendPending sequence should exist once.                                                                                                                                                                                                                                                                                             |
| `src/lib/events/fields.ts`                               | `export const LIVE_TYPE_IDS = new Set(['walk'])` — declaring liveness next to the other per-type declarations, so a future timed type (playtime? training?) is one line.                                                                                                                                                                                                                                                                                                                                     |
| `src/lib/components/log/LogGrid.svelte`                  | In `tap()`: if the type is live and hydrated, call `onStartLive(type)` instead of `onOpen(...)`. Tile shows the active state when a walk is running.                                                                                                                                                                                                                                                                                                                                                         |
| `src/routes/+page.svelte`                                | Render `ActiveWalkCard` when `activeWalk.current` is set; load persisted state on mount; wire `onStartLive`.                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/lib/time.ts`                                        | Generalize `stockholmNowForInput()` to `stockholmForInput(date: Date)` (the existing name stays as a thin wrapper) — needed to render `startedAt` into the adjust-start input and into `occurred_at`.                                                                                                                                                                                                                                                                                                        |
| `src/lib/locale.ts`                                      | New strings under `log.liveWalk`: pågår, avsluta, avbryt (+ confirm), justera starttid, logga i efterhand istället, the >4 h duration prompt.                                                                                                                                                                                                                                                                                                                                                                |
| `tests/`                                                 | Unit tests for the pure parts: fields built by `finish()` (counts in the new `<name>=N` shape, min-1-minute clamp, negative-delta clamp), `stockholmForInput` round-trip with `stockholmInputToUtc`, storage round-trip with an injected fake `Storage`. `details.test.ts` count cases updated to the new format + one legacy-shape case.                                                                                                                                                                    |

## Pros of this approach

- **Zero schema/server changes** — the row is indistinguishable from a
  dialog-logged walk; every stat, view, and the queue work unmodified.
- Survives everything short of losing the phone: derived-from-clock, not a
  timer.
- The common case (start a walk) becomes literally one tap.
- Replay-safety is inherited unchanged (`event_id` at start).
- Backdating and the no-JS path are untouched, not just "kept".
- Extensible to other timed activities by adding an id to `LIVE_TYPE_IDS`.

## Cons / accepted trade-offs

- **Per-device state**: the partner's phone doesn't see the active walk.
  Fixing this needs a server-side in-progress row and conflicts with
  offline-first; explicitly out of scope.
- Instant-start means a fat-fingered tile tap starts a walk — cost is one
  _Avbryt_ tap. (The alternative — a dialog with a Starta button — adds a
  tap to every real walk forever; rejected.)
- Live mode is JS-only. Already true of the whole offline queue.
- A user-adjusted phone clock mid-walk skews the duration. Clamped, not
  solved; not worth solving.
- The count-submission format change means `parseDetails` carries a small
  legacy branch (for rows queued before the deploy) indefinitely. Two
  lines, documented in place.
- The note now costs one extra tap when you _do_ want it — the accepted
  price for reclaiming the space on every other log.

## Open questions (defaults chosen, cheap to change)

1. Elapsed display: minutes only, or mm:ss? **Default: minutes** — calmer,
   and per-second precision is meaningless for a walk.
2. Should the >4 h guard threshold be 4 h? **Default: yes**, constant in one
   place.
3. Should starting a live walk be undoable into "backdate with the counts
   kept"? **Default: no** — discard and reopen is simple enough.

## Effort

Small-to-medium: one new state module, one new component, small touches in
four existing files, tests. No migration, no PR-ordering constraints.
