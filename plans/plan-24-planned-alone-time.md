# Plan 24 — A planned length for Ensamtid

> Source: plan 23's question 3, answered 2026-10-03: "that sounds good, so let's add that
> after". Picked up 2026-10-05: "start with building out the planned time part of the
> Ensamtid card, so we have everything we have talked about done before I move on."

> **Status: 🚧 In progress** — branch `feature/alone-planned-time`. The four questions were
> answered before writing (below); every recommendation was taken.

## The goal

Separation training decides the time _before_ leaving, just under where she got anxious
last time. So a live Ensamtid can carry a plan:

```
🏠 Ensamtid pågår · 12 av 20 min
Längsta lugna 40 min · orolig efter ~25 min
Planerad tid  [Förslag 20]  5  10  15  20  30  45  60
```

When the time is up, the phone buzzes, even locked and with the app killed: **"🏠 Dags att gå
hem · 20 min har gått"**.

## Decided

| Question              | Answer                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| When is it picked?    | **On the card, after starting**: the tile still starts with one tap. Changeable while it runs; tapping the chosen chip again clears it. |
| A suggestion?         | **Yes, one marked chip**: her Orolig efter average rounded down to 5 min, or Längsta lugna if she hasn't been anxious; at least 5.      |
| The alert?            | **One buzz at the planned minute.** The card and lock screen read "20 av 20 min" and keep counting past it.                             |
| Saved with the event? | **No**, it only exists while the session runs. The saved row is unchanged.                                                              |

## Design

- **The session gets `plannedMin`** (device-local, like everything else in it). The card's
  title becomes "N av P min", and Hemma and the dialog are unchanged.
- **The lock screen:** the header shows "plan P min" next to the ticking timer.
- **The alert is native:**
  - `AlarmManager.setExactAndAllowWhileIdle` at start + plan. A sideloaded app may hold
    `USE_EXACT_ALARM`, an install-time permission with no prompt; older Android uses
    `SCHEDULE_EXACT_ALARM`.
  - It posts on its own high-importance channel, **"Dags att gå hem"**, so its sound can be
    set apart from the silent running notification.
  - Changing the plan reschedules it; Hemma, Avbryt and saving cancel it. The receiver
    checks it's still the same running session before it buzzes.
- **In a browser** there's no alarm: the card shows the plan, and that's all.
- **The suggestion** is a pure function over the reference numbers Logga already loads
  (plan 23), and it's tested.

## Not in scope

- Re-arming an alarm after the phone restarts mid-session (Android drops alarms on reboot;
  the card still shows the plan).
- Saving the plan, or any stat about it.
