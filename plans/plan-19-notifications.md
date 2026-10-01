# Plan 19 — Notifications

> Source: asked 2026-10-01 — "For the daily items in Status, I would like them to notify
> when we are 15 minutes away, I think that is the same time when the pill color would turn
> red. For the items that are tracked over a long period of time, I'm not sure exactly when
> these notifications should pop up."

> **Status: ✅ Built, awaiting merge** — branch `feature/notifications`. All seven questions
> answered (below). Verified on the phone against the local stack with real FCM: the switch
> and Android's prompt, "🚶 Promenad om 30 min" within a minute of amber and only once, the
> tray copy cleared by logging on the same phone, a tap opening Status from a killed app,
> and the switch off deleting the row. Recurring reminders verified with `?dry&now=` on the
> production snapshot. Findings while building:
>
> - **New tables still inherit every privilege**, and `service_role` had lost its grant on
>   `dog_care_status`; the migration revokes first and grants the view back.
> - **The server cannot tell the app from a browser**: the service worker fetches with
>   Android's default user agent, without `HundkollApp`. The settings card is decided in
>   the page instead of the load.
> - **The Capacitor plugin proxy cannot be returned bare from an `async` function**: it
>   answers `then` as a native method and throws. `$lib/native.ts` wraps it.
> - **Firebase is free with no billing account**; the setup took the console's three steps.

## The goal

The phone says when something on Status needs doing, so nobody has to open the app to
check:

- **Promenad, Matning:** "Promenad om 30 min" as the card turns amber.
- **Kloklippning, Bad, Pälsklippning:** "Kloklippning om en vecka", then "Kloklippning
  idag".
- Correct on **both phones**, whichever of them logged the last walk.
- Quiet when Status is quiet: nothing while she's with the sitter, nothing once the card
  says "väntar på ny dag", nothing in the late evening.

## Decided

| Question                     | Answer                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| When does a daily item fire? | **30 min before due**, the moment the pill turns amber (not 15: the pill is amber at 30, red at due).  |
| When does a recurring item?  | **09:00 a week before** (when it turns amber) **and 09:00 on the due day**. No repeats after that.     |
| Late evening?                | **Quiet 22:00–07:00** for daily items: a reminder that would fire then is skipped, not postponed.      |
| Which phones?                | **A switch per phone in Inställningar**, off until turned on. Turning it on asks Android's permission. |

## What is already there, and constrains the design

- **Status's truth is the `dog_care_status` view** (`due_at`, `due_from`, `last_at` per dog
  and type) plus two rules in TypeScript: `awaitingNewDay` in `$lib/status/schedule.ts`,
  and the pause while an absence is open (plan 16). Reminders must use exactly the same
  rules, or the phone and the screen disagree.
- **The amber windows live in `StatusCard.svelte`** (30 minutes daily, 7 days recurring).
  This plan names them in `schedule.ts`; the rules module repeats them, and the parity test
  keeps the two equal.
- **Something must run when no phone is open.** That rules out the app scheduling its own
  reminders: if your partner logs a walk, your phone's scheduled reminder would be stale.
  The check has to run where every log lands: in Supabase.
- **Vercel can't be the clock.** Cron on the Hobby plan runs once a day.
- **The Android app loads the site** (plan 18), so the page can call native plugins.
  Getting a push token and asking for permission are plugin calls from the page.
- **The repo is public.** No secret, key or Firebase config goes in git: they go in
  Supabase secrets and the Vault, and the Firebase file stays local like the signing key.
- **Grants are explicit** (plan 13): every new table spells out what `authenticated` may do.
- **The local stack disabled `edge_runtime`** in plan 9. It comes back on.
- **Found while building: new tables still inherit every privilege** on this project, and
  `service_role` lost its grant on `dog_care_status` when `20260916103106` recreated the
  view. The migration revokes before it grants and grants the view back.

## Design

### The pipeline

```
pg_cron, every minute
  └─ pg_net POST → Edge Function `remind` (shared secret in the header)
       ├─ reads dog_care_status + open absences          (service role)
       ├─ decides which reminders are due now            (pure rules, below)
       ├─ claims each one in reminders_sent              (insert … on conflict do nothing)
       └─ sends what it claimed to every enabled phone in that dog's household, via FCM
```

**Firebase Cloud Messaging** is the only way to wake an Android app from a server without
keeping a connection open yourself. It's free. It needs a Firebase project on your Google
account, a service-account key (a Supabase secret), and `google-services.json` in
`android/app/` (gitignored).

**Each minute's run is idempotent.** A reminder is identified by `(dog, type, kind,
due_at)`. The function inserts that key before sending and only sends if the insert went
in. So an overlapping run, a retry or a slow minute can't double-send. And because logging
a walk moves `due_at`, a logged walk turns the next reminder into a different key, so
"logged it already" needs no special handling.

### The rules (one pure module, tested)

`supabase/functions/_shared/reminders.ts`: plain TypeScript with no Deno APIs, so vitest
can test it. Given a status row, whether the dog is away, and `now`, it returns which
reminder (if any) is due:

| Kind   | Applies to                    | Fires when                                                                                                     |
| ------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `soon` | daily (`hours`, `average`)    | `now` ≥ `due_at` − 30 min and `now` < `due_at`; not away; not `awaitingNewDay`; Stockholm time not 22:00–07:00 |
| `week` | recurring (`days` + interval) | `now` ≥ 09:00 Stockholm on (due date − 7 days) and `now` < `due_at`; before 22:00                              |
| `due`  | recurring                     | `now` ≥ 09:00 Stockholm on the due date; before 22:00; once                                                    |

- **The window form ("from … until due", not "at exactly 09:00")** means a missed minute,
  or a function deploy at 09:00, still delivers later that day instead of never.
- **Skipped, not postponed:** a `soon` that falls in quiet hours is simply not sent. By
  07:00 the walk is either done or the day has turned.
- **`due` catches up once:** an item that's already overdue the first time the job sees it
  (e.g. on the first day, or after an interval change) gets one "idag" reminder at the next
  09:00–22:00 window, never more.
- **Never logged, or an average with too little data:** no `due_at`, no reminder. Same as
  the grey pill.
- **Away:** daily reminders pause; recurring ones don't, matching the cards.
- `awaitingNewDay` and the Stockholm day logic are re-implemented in the shared module
  (it can't import `$lib`). A **parity test** runs both versions over the same rows, so
  they can't drift.

### Tables (one migration)

```sql
create table push_devices (
	token       text primary key,
	user_id     uuid not null references auth.users on delete cascade,
	created_at  timestamptz not null default now(),
	seen_at     timestamptz not null default now()
);
-- RLS: a user sees, adds and removes only their own rows. Explicit grants.

create table reminders_sent (
	dog_id   uuid not null references dogs on delete cascade,
	type_id  text not null references event_types,
	kind     text not null check (kind in ('soon', 'week', 'due')),
	due_at   timestamptz not null,
	sent_at  timestamptz not null default now(),
	primary key (dog_id, type_id, kind, due_at)
);
-- RLS on, no policies, no grants: only the function (service role) touches it.
```

Plus the cron job: `cron.schedule('remind', '* * * * *', …net.http_post…)`, reading the
function URL and shared secret from **Vault**, so the migration holds no secret. Old
`reminders_sent` rows are pruned by the same function (older than 90 days).

### Sending

- FCM HTTP v1, signed with the service account using WebCrypto (RS256 JWT → OAuth token,
  cached for its hour). **No npm/Deno dependencies.**
- One message per device. `android.notification.tag = type_id`, so a newer reminder for
  Promenad **replaces** the older one in the tray rather than stacking.
- Channel `reminders` ("Påminnelser"). Small icon: a white paw, a vector drawable from the
  icon's foreground layer.
- `data.url = '/status'`: a tap opens the app on Status.
- A token FCM answers `UNREGISTERED` for (app uninstalled, data cleared) is deleted.

Copy (Swedish, from `locale.ts`'s tone; open question 1):

| Kind   | Title                       | Body                          |
| ------ | --------------------------- | ----------------------------- |
| `soon` | 🚶 Promenad om 30 min       | Senast kl. 13:05              |
| `week` | 💅 Kloklippning om en vecka | Senast 20 aug.                |
| `due`  | 💅 Kloklippning idag        | Senast 20 aug. · var 42:e dag |

### In the app

- **`$lib/native.ts`** — `isNativeApp()` (the `HundkollApp` user-agent suffix from plan 18)
  and `push.enable()` / `push.disable()` / `push.refresh()`, which dynamic-import
  `@capacitor/push-notifications`. The browser never loads the plugin.
- **Inställningar gets an "Aviseringar" card, only inside the app:** one switch, "Påminnelser
  på den här telefonen". On → Android's permission prompt → FCM token → `?/pushOn` stores
  it for the logged-in user. Off → `?/pushOff` deletes it and unregisters. Denied
  permission → the switch explains how to allow it in Android's settings.
- **On every launch with the switch on**, the token is re-read and upserted (`seen_at`),
  because FCM rotates tokens.
- **A tap** on a notification → `goto(data.url)`.
- **Logging on this phone clears its own reminder** from the tray (by tag) when the queue
  sends a log of that type. The other phone's copy is replaced by the next reminder.
  (Open question 2.)

### Dependencies (README rule amendment)

`@capacitor/core` moves from dev to runtime dependencies, and
`@capacitor/push-notifications` joins it. Both load only inside the app through dynamic
import. The README's "no runtime dependencies beyond supabase" becomes "…plus the two
Capacitor packages the app shell needs, never loaded in a browser".

This is a native change, so **one APK install** (`android:build && android:install`).
After that, changes to timing or copy are server-side and need no install.

## Setup only you can do (walked through together, like the toolchain)

1. **Firebase:** create a project → add an Android app `se.hundkoll.app` → download
   `google-services.json` into `android/app/` (gitignored; back it up with the keystore).
2. **Service account:** Firebase → Project settings → Service accounts → generate a key.
   Then `supabase secrets set FCM_SERVICE_ACCOUNT="$(cat key.json)"` and delete the file.
3. **Shared secret and Vault:** I generate a random secret; it goes in as a function secret
   and into Vault, next to the function URL.
4. **After merge:** `npm run db-push` (as always), plus a new `npm run functions-deploy`.

## Files

| File                                                | Change                                                         |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `supabase/migrations/…_reminders.sql`               | `push_devices`, `reminders_sent`, RLS, grants, the cron job    |
| `supabase/functions/remind/index.ts`                | the function: read, decide, claim, send, prune                 |
| `supabase/functions/_shared/reminders.ts`           | the pure rules                                                 |
| `supabase/functions/_shared/fcm.ts`                 | JWT, token cache, send                                         |
| `supabase/config.toml`                              | `edge_runtime` back on; the function's `verify_jwt = false`    |
| `src/lib/status/schedule.ts`                        | the two amber windows as named constants, read by the card     |
| `src/lib/components/status/StatusCard.svelte`       | read those constants                                           |
| `src/lib/native.ts`                                 | new: `isNativeApp`, `push.*`                                   |
| `src/routes/settings/*`                             | the Aviseringar card, `?/pushOn`, `?/pushOff`                  |
| `src/routes/+layout.svelte`                         | refresh the token on launch, tap → `goto`                      |
| `src/lib/locale.ts`                                 | notification copy, the card's strings                          |
| `android/app/src/main/res/drawable/ic_stat_paw.xml` | the small icon                                                 |
| `android/app/src/main/AndroidManifest.xml`          | default icon and channel metadata                              |
| `.gitignore`                                        | `android/app/google-services.json`                             |
| `tests/reminders.test.ts`                           | every rule above, plus parity with `schedule.ts`               |
| `package.json`                                      | the two runtime deps, `functions-deploy`                       |
| `README.md`                                         | a Notifications section; the dependency rule; deployment steps |

## Order of work

1. Rules module + tests, with the shared amber constants (no setup needed).
2. Migration + function against the local stack, with a `dry` mode that returns what it
   would send. Verify with the snapshot data at chosen `now`s.
3. Firebase setup (together), then real sends from the local function to the phone.
4. The app side: plugin, Settings card, launch refresh, tap handling. APK install.
5. On the phone: switch on, a walk logged so it falls due within the hour, then wait.
6. PR. After merge: `db-push`, `functions-deploy`, Vault entries in production.

## Definition of done

- Switch on in Inställningar → permission prompt → a row in `push_devices`.
- A walk falling due delivers "Promenad om 30 min" within a minute of amber, once, and a
  tap opens Status.
- Logging the walk on the other phone means no stale reminder for the old due time.
- Nothing 22:00–07:00 for daily items; nothing while Hundvakt is open; nothing after the
  day turns.
- A recurring item delivers at 09:00 a week before and on the day (verified with `dry` at
  chosen times, since waiting a week isn't practical).
- Switch off → the row is gone and nothing arrives.
- `check`, `test`, `lint`, autofixer on the changed components.

## Questions, and the answers

1. **The copy?** _Approved as drafted._
2. **Clear the reminder when logging on the same phone?** _Yes._
3. **The partner's phone?** _Not part of this plan._ It gets the APK and the switch in a
   separate step later; nothing here depends on it.

## Cost

Everything stays on free tiers, with no payment method anywhere (checked 2026-10-01):

| Service  | Used for                    | Free tier                             | Our use                        |
| -------- | --------------------------- | ------------------------------------- | ------------------------------ |
| Firebase | FCM delivery                | a no-cost product, no billing account | a few messages a day           |
| Supabase | pg_cron → the Edge Function | 500,000 function invocations a month  | ~43,200 a month (one a minute) |
| Vercel   | nothing new                 | —                                     | unchanged                      |

Free Supabase projects pause after a week of inactivity, which daily use already prevents,
same as today.

## Not in scope

- "Your partner logged a walk" notifications (easy to add on the same pipeline later).
- The widget (plan 20), though its status push will reuse `fcm.ts`.
- iOS / browser web push.
- Per-type on/off switches; it's one switch per phone for now.
