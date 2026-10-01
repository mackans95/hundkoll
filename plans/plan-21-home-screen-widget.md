# Plan 21 — A Status widget on the home screen

> Source: kept from the native-app discussion (plan 18), where a home-screen widget was one
> of the two features the app was for. Deferred on 2026-10-01 in favour of the lock-screen
> walk (plan 20) — "keep it as a later plan" — and written down so it is ready when wanted.

> **Status: 📋 Parked** — a plan on its own branch, nothing built. The questions at the end
> are to be answered when it is picked up; the design below is what I would build today.

## The goal

The question the app exists to answer — _when was X last done, and is it overdue?_ — on the
home screen, without opening anything:

```
┌───────────────────────────────────┐
│ 🚶 Promenad        kl. 14:55   🟢 │
│ 🍽️ Matning         kl. 17:30   🟢 │
│ 💅 Kloklippning    8 okt       🟠 │
└───────────────────────────────────┘
```

- **Daily types** (Promenad, Matning) and the **next recurring one**, each with when it is
  due and the Status card's colour.
- **Right for both phones** within a minute of either logging something.
- **Tap** opens Status. Paused like the cards while she is with the sitter, and "väntar på
  ny dag" after midnight.

## What is already there, and constrains the design

- **A widget is native and cannot show the page.** It is a small layout the launcher draws
  (`RemoteViews`), refreshed when the app tells it to. Android limits scheduled refreshes to
  every 30 minutes, so the widget cannot re-read anything every minute itself.
- **The data is on the server**, and the widget must not log in: a second Supabase session
  in native code is what plans 18 and 20 deliberately avoided (rotating refresh tokens, the
  replay that revokes a session).
- **The reminders pipeline already runs every minute** (plan 19): pg_cron → the `remind`
  Edge Function, which reads `dog_care_status` and the open absences as `service_role`, and
  sends through FCM to the household's phones in `push_devices`.
- **Status's rules live in TypeScript** — the amber windows and `awaitingNewDay` in
  `$lib/status/schedule.ts`, mirrored in `supabase/functions/_shared/reminders.ts` with
  parity tests. Writing them a third time in Java would be a third copy to keep in step.
- **The Capacitor push plugin owns the phone's FCM entry point** (its `MessagingService`). It
  is public and not final, so the app can subclass it and handle its own message kinds.
- **Native code in this app is Java** (`MainActivity`, the `LiveWalk*` plugin).

## Design

### The data: a snapshot pushed when it changes

The every-minute run already has everything. It gains one more job: build each household's
**status snapshot**, and if it differs from the last one sent to a phone, send it as a
**silent data message** (no notification). The phone stores it and redraws the widget.

- **Freshness without polling:** a walk logged on either phone changes `due_at`, the next
  run sees a new snapshot, and both widgets redraw within a minute. Nothing changes → nothing
  is sent.
- **No login in native code:** the snapshot arrives through FCM, like the reminders.
- **A phone that just placed the widget** gets a snapshot on the next run, because its
  last-sent marker is empty (see the table change below).

### The rules stay in one place: the server sends phases, not facts

Instead of `due_at` and letting Java decide the colour, the snapshot carries each row's
**phases**: the instants at which its badge changes, computed by the same tested module as
the reminders.

```json
{
	"at": "2026-10-01T12:40:00Z",
	"away": false,
	"rows": [
		{
			"type": "walk",
			"label": "Promenad",
			"icon": "🚶",
			"text": "kl. 14:55",
			"phases": [
				{ "from": "2026-10-01T10:24:00Z", "state": "green" },
				{ "from": "2026-10-01T12:25:00Z", "state": "amber" },
				{ "from": "2026-10-01T12:55:00Z", "state": "red" },
				{ "from": "2026-10-01T22:00:00Z", "state": "waiting" }
			]
		}
	]
}
```

The widget shows the last phase whose `from` has passed, and asks Android to redraw it at
the next one (`AlarmManager`, inexact is fine). So the colours change on time with no push
and no rules in Java — a third copy of `awaitingNewDay` is never written. The text is an
**absolute time** ("kl. 14:55", "8 okt") rather than "om 25 min", which would go stale
between redraws.

`phasesFor(row, away)` joins `reminderDue` in `_shared/reminders.ts`, tested alongside it,
with parity against the Status card's own badge logic for a spread of instants.

### Who receives it

`push_devices` today means "send me reminders". A phone with the widget and reminders off
still needs snapshots, so the table learns what each phone wants:

```sql
alter table push_devices
	add column reminders boolean not null default true,
	add column widget boolean not null default false,
	add column widget_hash text;   -- the snapshot last sent to this phone
```

- The reminders switch writes `reminders`; the widget's presence writes `widget`.
- **Placing or removing the widget** is seen natively (`onEnabled` / `onDisabled` on the
  provider). Native tells the page the next time it runs, and the page registers the token
  with `widget = true` (or clears it) through `/push`, which already has the user's session.
- Reminders go to `reminders = true`; snapshots to `widget = true` whose `widget_hash`
  differs from the current snapshot's hash.

### On the phone

| Piece (Java, `android/app/src/main/java/se/hundkoll/app/`)       | What                                                                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `StatusWidget.java` (`AppWidgetProvider`)                        | draws the rows from the stored snapshot; schedules the next phase redraw; tap → Status               |
| `StatusSnapshotStore.java`                                       | the last snapshot, in SharedPreferences                                                              |
| `HundkollMessagingService.java`                                  | extends the plugin's `MessagingService`: `kind = status` → store + redraw; everything else → `super` |
| `res/layout/widget_status.xml`, `res/xml/status_widget_info.xml` | the layout (day/night colours), sizes, preview                                                       |
| `AndroidManifest.xml`                                            | the provider; our messaging service replacing the plugin's (`tools:node="remove"`)                   |

The tap opens `MainActivity` with `/status` as the path to load; `MainActivity` hands it to
the WebView, the same way a notification tap already lands on Status.

**Stale data is shown as stale:** a small "uppdaterad 14:32" under the rows when the
snapshot is more than an hour old (no signal, or the server down), so an old green never
passes for a current one.

### Cost

Unchanged in kind: the function already runs every minute. Snapshots go out only when
something changed — a few dozen silent FCM messages a day, which cost nothing.

## Files

| File                                           | Change                                               |
| ---------------------------------------------- | ---------------------------------------------------- |
| `supabase/migrations/…_widget_devices.sql`     | the three `push_devices` columns                     |
| `supabase/functions/_shared/reminders.ts`      | `phasesFor`, the snapshot builder and its hash       |
| `supabase/functions/remind/index.ts`           | send snapshots; reminders only to `reminders = true` |
| `tests/reminders.test.ts`                      | phases for each kind of row, parity with the card    |
| `src/routes/push/+server.ts`, `$lib/native.ts` | register `reminders` / `widget` per phone            |
| `android/…` (above)                            | provider, store, messaging service, layout, manifest |
| `README.md`                                    | a Widget section under Notifications                 |

## Order of work

1. `phasesFor` and the snapshot builder, with tests (no phone needed).
2. Migration and the function, checked with `?dry` against the snapshot data.
3. The widget drawing a hard-coded snapshot on the phone: layout, sizes, dark mode.
4. The messaging service and the store; a real snapshot from the local function.
5. Placing/removing the widget registering the phone; the two-phone freshness check
   (log on one, watch the other — the partner's phone, if it has the app by then).
6. PR. After merge: `db-push`, `functions-deploy`, one APK install.

## Questions, to answer when it is picked up

1. **What it shows.** Daily types plus the next recurring one (above), or every scheduled
   type, or only Promenad?
2. **A "Starta promenad" button** on the widget, opening the app with a walk already
   running (`/?detail=walk` does this today)? Cheap to add.
3. **Size.** One fixed size (4×2), or resizable with the rows that fit?
4. **Java `RemoteViews` or Kotlin + Jetpack Glance?** Glance is the modern API and nicer to
   write, but brings Kotlin and Compose into a project whose native code is Java.
   _Recommendation: `RemoteViews`, in keeping with the rest._

## Not in scope

- A lock-screen widget (phones' lock screens do not host them; plan 20 covers the walk).
- Logging from the widget itself, beyond opening the app.
- iOS.
