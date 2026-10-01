# Plan 20 — The live walk on the lock screen

> Source: asked 2026-10-01 — "the nicest thing would be something that sits on the
> lock-screen when walking, so I don't have to open the phone to increment while on the
> walk." Refined in the questions: Spara on the lock screen "just saves the current walk and
> closes itself, while clicking … elsewhere on the widget would open to the log page"; a
> switch in Inställningar; the home-screen status widget stays a later plan.

> **Status: ✅ Built, awaiting merge** — branch `feature/lock-screen-walk`. Verified on the
> phone against the local stack: buttons from the locked phone with no unlock and with the
> app swiped away; counts both ways between the notification and the card; Spara storing
> exactly one row with the right counts and duration; Spara with the server unreachable
> going through the outbox and stored once on opening. Departures:
>
> - **A custom layout, not a Live Update.** The spike showed the buttons only when expanded,
>   and Android 16 did not promote the notification on this OnePlus anyway (no chip,
>   ordinary position). A custom view puts the buttons in the collapsed notification, with
>   the header's timer kept, so nothing that was visible was lost.
> - **Two bugs found on the phone and fixed:** an offline Spara left the running
>   notification up with dead buttons; and the page, alive in the background, took the
>   outbox at once and cleared the "skickas när du öppnar appen" notice. The outbox is now
>   taken only when the page is visible.

## The goal

A walk started in the app shows on the lock screen, and the phone never has to be unlocked
until the walk is saved:

```
🚶 Promenad pågår                       ⏱ 12:34
Kiss 1 · Bajs 0
[ + Kiss ]        [ + Bajs ]        [ Spara ]
```

- **+ Kiss / + Bajs** count, straight from the lock screen.
- **Spara** saves the walk, the same row the app's "Avsluta & spara" would store, and the
  notification goes away.
- **Tapping anywhere else** opens the app on Logga, where the live walk card shows the same
  counts.
- On Android 16 it's a **Live Update**: pinned at the top of the lock screen, with a
  ticking timer chip in the status bar, like navigation or a running timer.

## Why a notification, not a widget

Android phones' lock screens don't host app widgets. What they show is notifications, and
a notification can have up to three buttons. Android 16's Live Updates are made for exactly
this: an activity the user started, ongoing, with a clear start and end ("starting a
workout" is their example). That gets the walk the prominent spot, and the timer ticks by
itself (`setUsesChronometer`) without the app doing anything.

**Buttons that send a broadcast run without unlocking.** Only actions that open the app ask
for an unlock (Android 12+). So + Kiss, + Bajs and Spara work from the lock screen, while
opening the app needs an unlock, as it should. OnePlus layers its own lock-screen policy on
top, so this is the **first thing verified on the phone**.

## What is already there, and constrains the design

- **The live walk is device-local** (plan 1): `activeWalk.svelte.ts` keeps `{ id, typeId,
startedAt, pee, poop, note }` in localStorage. Every duration is computed from
  `startedAt`, so nothing has to tick, and a killed app loses nothing.
- **Finishing builds the dialog's own fields** (`buildWalkFields`): `type_id`, `detailed`,
  `event_id`, `occurred_at` (the start, as Stockholm `YYYY-MM-DDTHH:mm`), `duration_min`,
  `pee`, `poop`, `note`. It posts them to `?/log` through the queue. The row id is minted
  at start, so **any number of sends of the same walk store it once.**
- **The app loads the site** (plan 18). Its session is cookies in the WebView's cookie
  store. Native code can read them (`CookieManager`), and must write any renewed ones back:
  Supabase revokes the whole session if a rotated refresh token is replayed (plan 18's
  login fix).
- **The server can't tell the app from a browser**, and app-only UI is decided in the page
  (plan 19).
- **Notification permission** is already asked for by the reminders switch, and the same
  permission covers this.

## Design

### Who holds the walk

While the notification is up, **native holds the counts**, in `SharedPreferences`, which
survive the app being killed. The page keeps its localStorage copy for the browser and for
the card, and syncs:

| Event                              | What happens                                                               |
| ---------------------------------- | -------------------------------------------------------------------------- |
| Walk starts in the app (switch on) | page → `LiveWalk.show(walk, fields)`; the notification appears             |
| + / − or a note in the app's card  | page → `LiveWalk.update(...)`; the notification redraws                    |
| + Kiss / + Bajs on the lock screen | native counts, redraws, and tells the page (`walkChanged`) if it's running |
| App opens or resumes               | page → `LiveWalk.state()`; same walk id → adopt native's counts            |
| Avsluta / Släng in the app         | page → `LiveWalk.hide()`                                                   |
| Spara on the lock screen           | native saves (below); the page, when it next runs, sees the walk is done   |

### Spara without the app

Native saves the walk itself, so it lands within seconds even if the app was killed:

1. Builds the same eight fields. The page hands over the fixed ones (`type_id`, `event_id`,
   `occurred_at`, `note`) when the walk starts or the note changes. Native fills in
   `duration_min` (rounded, at least 1, as `durationMinutes`), `pee` and `poop` at the tap.
2. POSTs them to `https://hundkoll.vercel.app/?/log`, with the WebView's cookies and
   `accept: application/json` (as `sendOne` does), from the broadcast receiver via
   `goAsync()` and short timeouts.
3. **Every `Set-Cookie` in the answer goes back into the WebView's cookie store and is
   flushed.** That keeps a session refresh during the save from becoming a replay later.
4. **Stored** → the notification closes, native forgets the walk, and the page discards its
   copy on its next run (same walk id).
   **Not stored** (no signal, session lapsed, server error) → the finished fields go into a
   native outbox and the notification changes to "Promenad sparad · skickas när du öppnar
   appen". The page drains the outbox into the normal queue on its next run. Because of the
   row id, a send that did reach the server but lost its answer still stores one row.

**Why not a separate native login:** it would mean a second Supabase session, its own
refresh handling, and the password stored natively. Reusing the WebView's cookies (and
writing renewals back) is the same thing the app's own requests do. The one way this can
go wrong: the WebView and the receiver both refresh the session within the same second.
That's possible only if the app is open and saving at the same moment someone taps Spara on
the lock screen.

### The notification

- Channel `live-walk` ("Pågående promenad"), default importance, silent: it updates on
  every tap, and it must not buzz each time.
- `setOngoing(true)`, `setUsesChronometer(true)` with `setWhen(startedAt)`, visibility
  public (so the counts show on the lock screen), the paw small icon from plan 19.
- Android 16: `setRequestPromotedOngoing(true)` + `POST_PROMOTED_NOTIFICATIONS` in the
  manifest → a Live Update. On older Android it's an ordinary ongoing notification.
- Actions: **+ Kiss**, **+ Bajs**, **Spara** (broadcasts). The content tap opens
  `MainActivity` on `/`.
- **Swiping it away** (allowed on Android 14+) only hides it; the walk keeps running in the
  app, and the next resume re-posts it.

### The switch

Inställningar → Aviseringar gets a second switch: **"Promenad på låsskärmen"**, off by
default. On → Android's notification permission if not already granted; a running walk
appears straight away. Off → the notification goes, and the walk stays in the app. The
choice is device-local (localStorage), like the reminders switch.

### Native code

A local Capacitor plugin inside `android/`, no npm package:

| File (in `android/app/src/main/java/se/hundkoll/app/`) | What                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `LiveWalkPlugin.java`                                  | `show`, `update`, `hide`, `state`, `drainOutbox`; `walkChanged` event |
| `LiveWalkStore.java`                                   | the walk, counts and outbox in `SharedPreferences`                    |
| `LiveWalkNotification.java`                            | builds and posts the notification                                     |
| `LiveWalkReceiver.java`                                | + Kiss, + Bajs, Spara; the save request and cookie write-back         |
| `MainActivity.java`                                    | registers the plugin                                                  |

Web side: `$lib/native.ts` gets `liveWalk.*` (through `registerPlugin`, wrapped against the
`then` trap); `activeWalk.svelte.ts` calls it on start, update, adjust, finish and discard;
`catchUp` asks for the state and drains the outbox; a `LiveWalkSection` switch goes in
Inställningar.

## Files

| File                                                 | Change                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `android/app/src/main/java/se/hundkoll/app/*.java`   | the four classes above; `MainActivity` registers the plugin  |
| `android/app/src/main/AndroidManifest.xml`           | the receiver, `POST_PROMOTED_NOTIFICATIONS`                  |
| `src/lib/native.ts`                                  | `liveWalk.*`, `liveWalkWanted()`                             |
| `src/lib/offline/activeWalk.svelte.ts`               | mirror to native while the switch is on; adopt native counts |
| `src/lib/offline/catchUp.ts`                         | state + outbox on launch and resume                          |
| `src/lib/components/settings/LiveWalkSection.svelte` | the switch                                                   |
| `src/lib/locale.ts`                                  | notification text, button labels, the switch                 |
| `tests/live-walk.test.ts`                            | adopting native state: same id, other id, saved, outbox      |
| `README.md`, this plan                               | how it works, what was verified                              |

## Order of work

1. **Spike on the phone first:** a bare ongoing notification with one broadcast button.
   Does it work from the OnePlus lock screen without unlocking, and does Android 16 promote
   it? If OnePlus demands an unlock, we stop and rethink before building the rest.
2. Native store, notification and the +/− buttons; the page mirroring and adopting counts.
3. Spara: the save request, cookie write-back, the outbox and its drain.
4. The switch. An APK install.
5. On the phone: a walk with taps from the lock screen; Spara with signal; Spara in airplane
   mode, then opening the app; the app killed mid-walk; swiped away.
6. PR.

## Definition of done

- With the switch on, starting a walk shows the notification; the timer ticks in the
  status bar.
- - Kiss / + Bajs from the **locked** phone; the app's card shows the same counts when
    opened, and taps in the card show on the notification.
- Spara from the locked phone stores one walk with the right start, duration and counts;
  the notification closes; the app shows no leftover live walk.
- Spara offline → "skickas när du öppnar appen"; opening the app stores it, once.
- Killing the app mid-walk loses nothing; the buttons still work.
- `check`, `test`, `lint`, autofixer.

## Questions, and the answers

1. **Is "Spara" the right label?** _Yes._
2. **No note on the lock screen?** _Fine: "as long as I can increment pees and poops"._

## Not in scope

- The home-screen status widget (a later plan, on the reminders' FCM pipeline).
- Starting a walk from the lock screen (it needs the app, by design: one walk at a time,
  started deliberately).
- A minus button: Android allows three actions, and a mistap is fixed in the card or the
  edit sheet.
