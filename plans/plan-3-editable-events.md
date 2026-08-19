# Plan 3 — Editable events + calendar history

> Source: `new-features.md` § "Make every logged event editable"

## Summary

Two phases sharing one edit mechanism:

- **Phase 1:** every stored event in _Senaste händelser_ becomes tappable →
  a bottom sheet shows everything that was logged, with **Ändra** (time,
  detail fields, note) and **Ta bort** (with confirm). Server gains
  `?/update` and `?/delete` form actions.
- **Phase 2:** a new `/history` route — a Monday-first month calendar,
  URL-driven (`?month=2026-08&day=2026-08-14`), day tap → that day's full
  event list → the same edit sheet. Reached via a _"Visa alla →"_ link on
  the recent-events card, **not** a fifth nav tab.

One migration is required, and it's not obvious: **the current RLS policy
blocks editing your partner's events.**

## The RLS finding (verified in `20260812000000_initial_schema.sql`)

The `events` table has a single `member_access for all` policy. Its
`using` clause (household membership) governs SELECT/UPDATE/DELETE row
visibility — so **deletes by either of you already pass**. But its
`with check` clause — which validates the _new_ row state on INSERT and
UPDATE — requires `created_by = auth.uid()`. Updating an event your partner
logged would fail that check, because `created_by` stays theirs.

Fix, following the exact pattern the codebase already uses for
`event_types.interval_days` (policy for the row, column grants for the
columns):

```sql
-- Migration: let household members edit each other's events, but only the
-- fields that are "what happened", never identity or authorship.
create policy member_update on events
  for update to authenticated
  using (public household-membership check, same as member_access)
  with check (same membership check);   -- no created_by clause

revoke update on events from authenticated, anon;
grant update (occurred_at, details, note) on events to authenticated;
```

Permissive policies OR together, so `member_update`'s check passing is
enough even though `member_access`'s stricter check fails. The column
grants make `id`, `dog_id`, `type_id`, `created_by` immutable at the
database level — an edit can never reassign a row or launder authorship,
whatever the app code does. (Changing an event's _type_ is deliberately not
supported: delete + relog is the honest operation, and it keeps
`details` always consistent with the type's field list.)

Per the branch workflow: migration lands via PR and `db push` only from
merged master.

## The edit mechanism (shared by both phases)

### Opening — the `?detail=` pattern, reused

Exactly like the log dialog's `?detail=<type_id>`, the edit sheet is
addressable: `?event=<id>` on whichever page hosts it. The load function
looks the event up (RLS scopes it); hydrated taps open it client-side with
`replaceState`-style URL tidying on close, pre-hydration taps get it
server-rendered. This is the house pattern and it keeps deep-linking ("this
row looks wrong" → send the link to the partner) for free.

### The sheet: `EventSheet.svelte` (new)

Reuses the `sheet` / `growFrom` transitions and the dialog's
tap-outside/Escape behavior (extract those ~30 lines from `LogDialog` into
a shared `ModalSheet.svelte` wrapper rather than copying them — LogDialog
becomes its first consumer). Contents:

- **View state:** icon + label, full timestamp, every detail value via the
  same summary formatters, the note. Buttons: **Ändra**, **Ta bort**, Stäng.
- **Edit state:** a form posting to `?/update`:
  - `datetime-local` prefilled via `stockholmForInput(occurred_at)`
    (helper shared with Plan 1), `max` = now
  - the type's fields via `DetailFields` — which today renders only empty
    defaults, so `DetailFields` and its inputs gain an optional `initial`
    (values object) prop. (With Plan 1's stepper redesign this is trivial:
    the count is just the number input's starting value.)
  - note textarea, prefilled
  - hidden `event_id`
- **Delete:** its own `?/delete` form; the button is two-step ("Ta bort" →
  "Säkert? Ta bort") rather than a browser `confirm()`, matching the app's
  no-native-chrome feel.

### Server side

`src/lib/server/events.ts` gains:

- `getEvent(db, id)` — for the `?event=` load
- `updateEvent(db, id, patch)` — patch built by reusing `parseDetails` +
  `stockholmInputToUtc` (a thin `parseEventEdit` beside `parseEventForm`;
  they share everything but insert-only concerns). Swedish errors from
  `locale.errors`.
- `deleteEvent(db, id)`

Actions `update`/`delete` are declared on `/` (Phase 1) and `/history`
(Phase 2), both delegating to these functions — same shape as `?/log`.
After success: `redirect(303, current page)` so the load refreshes and the
lists/stats recompute (all stats are plain SQL views — **edits propagate to
every chart automatically, nothing to invalidate by hand**).

### Deliberate scope decision: edits are online-only

Creation goes through the offline queue because logging happens _on walks_.
Fixing a mistake is a couch activity. Edit/delete are plain `use:enhance`
form actions — offline they fail with the normal failure message. Queueing
edits would mean reconciling edits-of-queued-rows, ordering edits against
creates, and conflict rules — a large complexity bill for a scenario that
barely exists. Consequence: **queued (not-yet-stored) rows in the recent
list are not editable** — they have no server row yet; failed ones already
have dismiss. Their rows simply don't get the tap affordance.

## Phase 2 — the `/history` calendar

### Route & data

`/history/+page.server.ts`:

- `month` from `?month=YYYY-MM` (default: current Stockholm month; same
  `Object.hasOwn`-style validation as `toPeriod`)
- events for that month queried with UTC bounds from new
  `time.monthBoundsUtc(month)` — Stockholm midnight of the 1st to Stockholm
  midnight of the next 1st, built on the existing offset machinery so DST
  boundaries land right
- grouped per Stockholm day server-side: `{ day, count, icons }` per day
  for the grid, full rows for the selected `?day=`

### UI

- `MonthCalendar.svelte`: 7-column grid, `mån–sön` headers, leading/
  trailing blanks from `time.calendarDays(month)` (new pure helper →
  vitest). Day cells: date number + up to three type icons + "+n"; today
  outlined; future days dimmed. Each day is a **link** (`?month=…&day=…`,
  `data-sveltekit-noscroll`) — selection lives in the URL like the stats
  period pickers, so back/reload behave.
- Month navigation: ‹ › links (`?month=` prev/next). No infinite scroll.
- Selected day → event list below the grid, same rows as _Senaste
  händelser_, same `?event=` sheet.

### Entry point: link, not a fifth tab

The nav's four tabs are daily-use screens; history is an occasional repair
and lookup tool. A _"Visa alla →"_ link in the recent-events card header
keeps the thumb bar uncrowded. Con: less discoverable — acceptable for a
two-user app where both users will read this plan. (Flipping to a fifth
tab later is a five-line change in `+layout.svelte`.)

## Changes, file by file

| File                                                                | Change                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `supabase/migrations/…_event_update_policy.sql` **(new)**           | The policy + column grants above.                                                                      |
| `src/lib/server/events.ts`                                          | `getEvent`, `updateEvent`, `deleteEvent`, `parseEventEdit`.                                            |
| `src/routes/+page.server.ts`                                        | `?event=` lookup in load; `update`/`delete` actions.                                                   |
| `src/lib/components/ModalSheet.svelte` **(new)**                    | Extracted sheet chrome (backdrop, tap-outside, Escape, transitions); LogDialog refactored onto it.     |
| `src/lib/components/log/EventSheet.svelte` **(new)**                | View/edit/delete states.                                                                               |
| `src/lib/components/log/EventList.svelte`                           | Stored rows become buttons/links opening `?event=`; queued rows unchanged.                             |
| `src/lib/components/log/DetailFields.svelte`, `CountStepper.svelte` | Optional `initial` values for prefilling (near-free after Plan 1's stepper redesign).                  |
| `src/routes/history/+page.server.ts`, `+page.svelte` **(new)**      | Phase 2 route.                                                                                         |
| `src/lib/components/history/MonthCalendar.svelte` **(new)**         | The grid.                                                                                              |
| `src/lib/time.ts`                                                   | `monthBoundsUtc`, `calendarDays`, `stockholmForInput`.                                                 |
| `src/lib/locale.ts`                                                 | history/edit/delete strings.                                                                           |
| `tests/`                                                            | `calendarDays` (Monday alignment, Feb/leap, year turn), `monthBoundsUtc` across DST, `parseEventEdit`. |

## Edge cases

- Editing `occurred_at` across a day/month boundary: the row simply moves —
  lists and calendar are query-driven, nothing caches stale placement.
- Event deleted on the other phone while your sheet is open: update/delete
  affects zero rows → action returns the generic Swedish failure; reload
  shows the truth. No locking needed at this scale.
- A legacy row whose `details` hold fields no longer in `DETAIL_FIELDS`
  (e.g. `portion_g`): the edit form shows the _current_ field list; saving
  writes only parsed fields. Decision needed (open question 2).
- The weight chart drops any row whose `kg` gets removed — already handled
  by `weightHistory`'s filter.

## Pros

- Mistakes become a ten-second fix in-app; Supabase dashboard retired for
  this.
- Every piece reuses an existing pattern: `?param`-addressed dialogs, form
  actions, `parseDetails`, locale errors, URL-held view state — the feature
  reads like the app already reads.
- DB-enforced immutability of identity/authorship columns; the app code
  cannot get this wrong.
- Stats correctness is automatic (views recompute).

## Cons / trade-offs

- Edits are online-only (deliberate; see above).
- Queued rows aren't editable until stored — visible as: tap does nothing
  on a just-saved row for a second or two.
- Type changes unsupported (delete + relog).
- The calendar month query reads a whole month of events; trivial at this
  data volume, noted for honesty.

## Open questions

1. Should **delete** also be column/policy-restricted to same-household
   only (it already is) or additionally to the creator? **Default: any
   household member can delete any event** — you fix each other's mistakes.
2. Legacy detail fields on edit: silently preserved, or dropped on save?
   **Default: preserved** — merge parsed fields over existing `details`
   instead of replacing, so an edit never destroys data it didn't show.
3. Calendar day cell content: icons vs. plain count? **Default: up to 3
   icons + "+n"** — scannable at a glance.

## Effort & sequencing

Phase 1 (sheet, actions, migration, EventList): medium — the ModalSheet
extraction and prefillable DetailFields are the fiddly parts. Phase 2
(calendar): medium, mostly new UI on pure helpers. Ship as two PRs in that
order; Phase 1 is independently valuable.
