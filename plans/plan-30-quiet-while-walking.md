# Plan 30 — No walk reminder while out walking

> Source: asked 2026-10-12 — "I find it annoying to get a notification that I need to take
> the dog on a walk within 30 minutes while I'm already out walking." A running live walk
> counts as "out walking", even though nothing is saved until Spara.

> **Status: 🔨 Built, to verify on the phone** — branch `feature/walk-reminder-quiet`.
> Verified on the local stack: `?dry` drops "🚶 Promenad om 30 min" while a marker stands and
> keeps "🍽️ Matning om 30 min"; a marker older than the last walk changes nothing. In
> headless Chrome, starting a walk writes the marker, and both Avbryt and Avsluta & spara
> remove it. RLS lets the household in and refuses anyone else. Findings while building:
>
> - **Starting a walk did not clear the walk reminder.** Only logging did (`queueLog`); a
>   reminder that disappeared on its own had been tapped, which dismisses it.
> - **An upsert needs update on every column it writes**, `dog_id` and `type_id` included,
>   so the table grants update in full; the policy is what keeps the row to the household.

## Decided

| Question                            | Answer                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------- |
| Which phones go quiet?              | **Both.** One dog: if one of us is walking her, nobody needs reminding.   |
| Which types?                        | **Only Promenad.** Matning still reminds during a walk.                   |
| A walk discarded inside the window  | **The reminder may still go out.** Nothing was claimed, so it just fires. |
| A walk reminder already in the tray | **Cleared when the walk starts**, on that phone.                          |
| A walk that never ends              | **Stops counting after 4 h**, the same scale as `LONG_SESSION_MINUTES`.   |
| "Promenad pågår" on the other phone | **No.** Not wanted.                                                       |

## Why it happens

The live walk is device-local (plan 1, plan 20): localStorage, and SharedPreferences while
the lock-screen notification is up. The server learns of it only when Spara inserts the
event. The `remind` Edge Function (plan 19) reads `dog_care_status` every minute, sees the
walk as not done, and sends "🚶 Promenad om 30 min".

A phone-side filter (data-only FCM and a native messaging service that drops the reminder
while `LiveWalkStore` holds a walk) was rejected: it quiets only the walking phone, data
messages to a killed app are unreliable on OnePlus, and it is native code nobody can test.

## Design

### A marker the server can see

```sql
create table live_sessions (
	dog_id      uuid not null references dogs on delete cascade,
	type_id     text not null references event_types on delete cascade,
	session_id  uuid not null,
	created_at  timestamptz not null default now(),
	primary key (dog_id, type_id)
);
-- RLS: household members of the dog may insert, delete and select. Explicit grants,
-- revoke first (plan 19's finding). service_role reads it for `remind`.
```

- **Start:** `startSession` for `walk` fires a POST to a new `/live` endpoint, which upserts
  the row for `currentDog`. Fire-and-forget: the walk never waits on it, and a failure
  only means the reminder may come (starting offline is rare; no retry queue).
- **Save or discard:** a DELETE by `session_id`, so a stale call can't remove a newer walk.
  The lock screen's native Spara doesn't need to call it: the saved event moves `last_at`,
  which already ends the marker's effect (below). The page deletes it when it reconciles.
- **`created_at` is the server's clock**, not `startedAt`: "Ändra start" can move the start
  earlier than the last walk, which must not switch the rule off.

### The rule

`reminderDue(row, away, walking, now)`: `walking` is true when the dog has a `live_sessions`
row for that type created after `last_at` and less than 4 h ago. For a daily row,
`walking` returns null just like `away`. Nothing is claimed in `reminders_sent`, so a walk
discarded inside the window lets the reminder out at the next minute.

Only `walk` gets markers (only counting sessions call `/live`), so Matning is untouched,
and so is Ensamtid.

### The tray

`startSession('walk')` calls the existing `clearReminder('walk')`, on the phone that started
the walk. The partner's tray isn't cleared: a reminder that reached them was sent before
the walk began.

## Steps

1. Migration `live_sessions` with RLS, grants and the service_role read.
2. `src/routes/live/+server.ts`: POST (upsert) and DELETE (by session id), like `/push`.
3. `activeSession.svelte.ts`: start posts the marker and clears the tray; discard and the
   page's save/reconcile delete it. Walk only.
4. `reminders.ts`: the `walking` input. `remind/index.ts`: read `live_sessions` alongside
   absences; `?dry` shows the effect.
5. Tests in `tests/reminders.test.ts`: walking quiets `soon`; a marker older than `last_at`
   or older than 4 h doesn't; recurring rows ignore it.
6. Verify: `?dry&now=` against the local stack with and without a marker; on the phone, a
   walk started inside the window sends nothing to either phone, and a delivered reminder
   disappears on start.

## After the merge

A migration, so `db push` after Marcus merges, and redeploy the `remind` function.
