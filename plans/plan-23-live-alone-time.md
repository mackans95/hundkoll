# Plan 23 — Ensamtid, timed live

> Source: plan 22's "Wanted later: live timing" — "having a live-tracked version might be
> good for the beginning of the training especially" — picked up 2026-10-03: "I'm ready to
> get to work on the live-version for Ensamtid."

> **Status: ✅ Built, awaiting merge** — branch `feature/live-alone-time`. All five questions
> answered (below). Verified:
>
> - **In headless Chrome on the local stack:**
>   - a walk stored in the old shape coming back running with its counts, then counted
>     and saved as one row;
>   - Ensamtid's card with the reference line;
>   - Hemma opening the dialog prefilled (start time, Längd, the session's id);
>   - closing it keeping the session stopped, and Svara reopening it;
>   - Lugn → Spara storing one row and clearing the card.
> - **On the phone, locked:** the single Hemma button; the notification turning into
>   "hemma efter N min"; tapping it opening the answer with the length up to Hemma; Spara
>   storing it with the session's id.
>
> Departures from the design:
>
> - **The files kept their old storage key** (`hundkoll:active-walk:v1`), so a running walk
>   needs no migration step.
> - **A Hemma from the lock screen reaches the page as a callback** (`handleHome`) rather
>   than an `$effect` on a flag, since it is an event, not derived state.

## The goal

Leaving home is one tap, and coming back is one tap. The app knows how long she was alone,
to the minute, without any arithmetic, and asks how it went the moment you're back:

```
leaving   ── tap 🏠 Ensamtid ──▶  🏠 Ensamtid pågår · 12 min      [Hemma]
                                  (card on Logga, and on the lock screen)
home      ── tap Hemma ────────▶  the usual Ensamtid dialog, with Tidpunkt = when you
                                  left and Längd = minutes away already filled in:
                                  Lugn / Orolig / Vet ej → Spara
```

## What is already there, and constrains the design

- **The live walk** (plans 1, 14, 20) is one device-local session in localStorage:
  `{ id, typeId, startedAt, pee, poop, note }`. A walk tile starts it, a card shows it, and
  Avsluta saves it through the queue. Only one runs at a time (`LIVE_TYPE_IDS = {walk}`;
  tapping a live tile while one runs points at the card).
- **Everything about it is walk-shaped:** `ActiveWalk` has `pee` and `poop` fields,
  `buildWalkFields` writes the walk's form, the card renders two counters, and the
  lock-screen notification (`LiveWalk*.java`) has + Kiss / + Bajs / Spara.
- **Ensamtid's dialog already asks everything after the fact:** Längd, the outcome, its
  revealed fields and the note, through `DetailFields`, parsed by `parseDetails` and saved
  through the queue. It can be prefilled: `DetailFields` takes `values`, and the dialog
  takes the time.
- **Start time is a fact, length is arithmetic.** The walk already derives every duration
  from `startedAt` and the clock, so a killed app or a reboot can't skew it. The same holds
  here.

## Design

### Two kinds of live type

Generalising "the live walk" into "a live session" without making the walk worse:

| Kind     | Type  | While it runs                     | When it ends                                                     |
| -------- | ----- | --------------------------------- | ---------------------------------------------------------------- |
| counting | walk  | counters on the card (kiss, bajs) | Avsluta & spara saves at once, as today                          |
| timing   | alone | a timer, and a note               | **Hemma** stops the clock and opens the type's dialog, prefilled |

`LIVE_TYPE_IDS` becomes `LIVE_TYPES: Record<string, 'counting' | 'timing'>`. The session
becomes `{ id, typeId, startedAt, endedAt?, counts, note }`, with the walk's `pee` / `poop`
moving into `counts`. A walk persisted in the old shape before the update is read and
converted by `parseStoredWalk`, so nobody loses a running walk to this deploy.

**Still one session at a time.** You don't walk her while she's alone. Tapping Ensamtid
during a walk points at the walk card, as tapping Promenad does today.

### The Ensamtid card

```
┌──────────────────────────────────────────┐
│ 🏠 Ensamtid pågår · 12 min               │
│ ▸ Anteckning                             │
│ [ Avbryt ]                   [ Hemma ]   │
│ Justera starttid    Logga i efterhand    │
└──────────────────────────────────────────┘
```

**Hemma** freezes the end (`endedAt = now`) and opens the Ensamtid dialog with:

- Tidpunkt = `startedAt`;
- Längd = the minutes between them, rounded, at least 1 (the walk's `durationMinutes`);
- the note carried over;
- the outcome on Vet ej, as always.

**Spara** saves through the queue, with the session's id as the row id, so a double tap
or a replay stores it once, like the walk. **Closing the dialog without saving** keeps the
session, still stopped, so the card offers "Svara" to reopen it. A stopped session never
quietly becomes a running one again. The long-walk guard ("over 4 hours? check the
minutes") applies here too, through the dialog's own Längd field.

### On the lock screen (with the switch on)

The notification gets a timing variant: **"🏠 Ensamtid pågår"**, the ticking timer, and one
button, **Hemma**.

- **Hemma from the lock screen** stores `endedAt` natively, without an unlock, and turns
  the notification into "🏠 Ensamtid · hemma efter 23 min · Tryck för att svara". Tapping it
  opens the app (with an unlock), the page adopts `endedAt`, and the dialog opens,
  prefilled.
- **Nothing is saved from the lock screen** for Ensamtid, unlike the walk's Spara. The
  answer, Lugn / Orolig / Vet ej, needs the app anyway.
- The native store holds the type's words and its kind, so the same `LiveWalk*` classes
  draw either variant. The counting variant (the walk) is unchanged.

That's native work, so **one APK install**.

## Files

| File                                                               | Change                                                                                        |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `src/lib/events/fields.ts`                                         | `LIVE_TYPES` with each type's kind                                                            |
| `src/lib/offline/liveWalk.ts` → `liveSession.ts`                   | the session shape, the old-walk converter, `durationMinutes`, the walk's fields from `counts` |
| `src/lib/offline/activeWalk.svelte.ts` → `activeSession.svelte.ts` | `stopSession` (sets `endedAt`), the rest as today                                             |
| `src/lib/components/log/ActiveWalkCard.svelte`                     | counting or timing, by kind; the timing card's Hemma / Svara                                  |
| `src/routes/+page.svelte`                                          | Hemma opens `LogDialog` prefilled; a live tap starts either kind                              |
| `src/lib/components/log/LogDialog.svelte`                          | accepts prefilled values (Längd, note) and a fixed row id                                     |
| `src/lib/native.ts`, `LiveWalk*.java`                              | the timing variant: one Hemma button, `endedAt` in the store and the state                    |
| `src/lib/locale.ts`                                                | Hemma, Svara, the lock-screen words                                                           |
| `tests/live-walk.test.ts`                                          | the old walk shape converting, the timing session's minutes, `endedAt` reconciling            |
| `README.md`                                                        | the live section, for both kinds                                                              |

## Order of work

1. Generalise the session with the walk unchanged, and the old-shape converter, with tests.
   Check the walk on the phone: start, count, save, and a walk started before the deploy
   surviving it.
2. The timing card, Hemma → prefilled dialog, Svara. Probe in headless Chrome.
3. The lock-screen variant: native, then the page adopting `endedAt`. APK, phone test with
   the screen locked.
4. PR. After merge: no migration, no `db-push`; the APK is already installed from step 3.

## Questions, and the answers

1. **When does the clock stop?** _At Hemma._
2. **Ensamtid on the lock screen with Hemma?** _Yes, in this plan._
3. **A planned length with an alert?** _Yes, as its own small plan right after this one._
4. **Reference numbers on the card?** _Yes:_ Längsta lugna and Orolig efter under the
   timer.
5. **The switch's name?** _"Pågående på låsskärmen"_, one switch for both kinds.

## Not in scope

- A planned length and its alert (question 3), unless answered otherwise.
- Starting Ensamtid from the lock screen or a widget.
- Live timing for any other type: the kinds make it possible, and adding one is a line in
  `LIVE_TYPES` plus a decision about its card.
