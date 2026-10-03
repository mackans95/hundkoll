# Plan 23 — Ensamtid, timed live

> Source: plan 22's "Wanted later: live timing" — "having a live-tracked version might be
> good for the beginning of the training especially" — picked up 2026-10-03: "I'm ready to
> get to work on the live-version for Ensamtid."

> **Status: 📝 Proposed** — branch `feature/live-alone-time`. The design below is a
> recommendation; the questions at the end decide the parts that are yours to decide.

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

## Questions

1. **When does the clock stop: at Hemma, or at Spara?** _Recommendation: Hemma._ You press
   it at the door; the dialog can wait for your shoes and the greeting without adding
   minutes.
2. **The lock screen: Ensamtid there too, with Hemma?** It's the moment the phone is in
   your hand at the door. _Recommendation: yes._ It's also the bigger half of the work, so
   it could be a follow-up if you'd rather have the card first.
3. **A planned length?** Separation training usually decides the time _before_ leaving,
   just under where she got anxious last time. Optionally pick one when starting (say, 20
   min); the card and notification show "12 av 20 min", and the phone buzzes once when it's
   time to head home. The buzz is a scheduled native notification, so more native work.
   _Recommendation: worth having, but as its own small plan after this one, once the basic
   loop has been used for a while._
4. **Your reference numbers on the card?** E.g. "Längsta lugna 55 min · Orolig efter ~24
   min" under the timer, so you know where her limit is while you're out. They're on
   Statistik already; Logga would need one small extra read. _Recommendation: yes, it's
   cheap and it's the number you'd want while away._
5. **The lock-screen switch's name.** "Promenad på låsskärmen" would now cover Ensamtid
   too. _Recommendation: rename it "Pågående på låsskärmen"_, one switch for both, rather
   than a switch per type.

## Not in scope

- A planned length and its alert (question 3), unless answered otherwise.
- Starting Ensamtid from the lock screen or a widget.
- Live timing for any other type: the kinds make it possible, and adding one is a line in
  `LIVE_TYPES` plus a decision about its card.
