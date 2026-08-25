# Plan 7 — Editing an event's time seems to change another event too

> Source: reported 2026-08-24 — "sometimes now when editing a value in the
> events list, it has seemed like the change (especially if changing time) has
> altered the previous events time aswell… I'm not sure about this".

> **Status: ✅ Built and shipped** — PR #34: the seconds fix and its tests as
> planned, plus a defect this plan missed. The row highlight was left out, as
> the plan said it could be.
>
> **Correction — the seconds bug is real but historical.** Writing the fix
> turned up what the plan should have checked before calling it confirmed:
> **every path that logs an event submits whole minutes.** The dialog's field
> is minute precision, and the live walk sends
> `stockholmForInput(startedAt)`. So a stored `occurred_at` is already on
> `:00`, and re-truncating it changes nothing. The exception is rows written
> before the dialog had a time field, which took the column's `now()` default
> with full precision — that field arrived in `4299f9c` on 2026-08-12, so it
> is the first few hours of the app's life. The fix is still worth having (it
> protects those rows and any future path that stores a real instant), but it
> **cannot** be what you saw when editing a recent event.
>
> **What can:** with every row sitting on an exact minute, two events sharing
> one are ordinary — and neither list query had a tie-break, so their order
> was unspecified. An `UPDATE` rewrites the row, which can move it in the
> heap and swap the pair. So editing one event really could reorder another,
> and it needed no time change at all. Both queries now break ties on
> `created_at`.
>
> **The queries below are wrong**, in the same way: they treat "sits on an
> exact minute" as the fingerprint of an edited row, when it is the shape of
> every row. What actually answers the question:
>
> ```sql
> -- Rows that still carry seconds: the only ones the old bug could touch.
> select count(*) from events where extract(second from occurred_at) <> 0;
>
> -- Events sharing a minute — the pairs whose order was unspecified.
> select date_trunc('minute', occurred_at) as minute, count(*), array_agg(type_id)
> from events group by 1 having count(*) > 1 order by 1 desc limit 20;
> ```

## Summary

You were right to flag it and right to be unsure. **An edit cannot write to
another row** — that is closed off by the primary key and by the column grants
from Plan 3, and this plan says exactly why. But the feeling is not imagined:
there is a real, provable bug in the edit path that silently changes the time
you were not editing, and a second effect that makes an unrelated row _appear_
to change. Both explain "the time changed weirdly".

## The confirmed bug: an edit throws away the seconds

Every edit rewrites `occurred_at` to whole minutes. The form renders the time
with `stockholmForInput`, which is minute precision, and `stockholmInputToUtc`
reads it back as `:00`:

```
stored   : 2026-08-20T10:00:37.000Z     (logged at 12:00:37 Stockholm)
input    : "2026-08-20T12:00"           (what the edit form shows)
saved    : 2026-08-20T10:00:00.000Z     (37 seconds gone)
```

Verified by running the app's own two functions against each other. So
**opening an event, changing only the note, and saving moves its timestamp by
up to 59 seconds.** Consequences:

- Two events logged in the same minute can **swap order** in the list, because
  the list sorts by `occurred_at desc` and one of them just lost its seconds.
  That looks precisely like "the previous event's time changed" — the row in
  that position now _is_ a different event.
- `stats_daily_counts`' gap and duration averages shift slightly, since they
  are computed from these instants.

**Fix:** keep the stored instant when the submitted minute matches it — the
edit form cannot express seconds, so it should not be allowed to destroy them.

```ts
// parseEventEdit
const submitted = time.stockholmInputToUtc(raw);
// The form has minute precision, so an unchanged minute means "leave it
// alone" — not "move it to :00".
const unchanged = submitted.getTime() === minuteOf(new Date(event.occurred_at));
const occurred = unchanged ? new Date(event.occurred_at) : submitted;
```

Deliberately preserving seconds only when the minute is untouched: if you
_do_ change the time, `:00` is the honest answer, because that is what you
asked for.

## The second effect: the list reorders under your eyes

Even with seconds fixed, moving an event's time **moves the row**, and the
recent list is the newest ten. Change a walk from 18:00 to 07:00 and it drops
down the list — or off it — and whatever row takes that position shows a
different time in the same place on screen. Nothing else changed; the row you
were looking at is no longer the row that is there.

This is inherent to a time-ordered list, not a bug, but it is worth making
legible rather than leaving it to be re-reported. Cheapest useful option:
after a successful edit, briefly highlight the row that was edited, wherever
it has moved to. (Ruled out: keeping the edited row pinned in place, which
would mean the list no longer being in time order.)

## Why a cross-row write is not possible

Worth stating precisely, so this can be ruled out rather than re-suspected:

- `updateEvent` is `.update(patch).eq('id', id)` — matched on the primary key,
  so it addresses one row or none. It also asks for `count: 'exact'` and
  reports `eventGone` when the count is 0, so a miss is loud rather than
  silent.
- The `id` is not client-chosen data being trusted: `applyEventEdit` reads the
  row with `getEvent` first and patches `event.id`, the id that came back from
  the database.
- Plan 3's column grants mean `authenticated` holds `UPDATE` on
  `occurred_at, details, note` and nothing else — `id`, `dog_id`, `type_id`
  and `created_by` cannot be written at all, so no edit can move a row's
  identity onto another row's.
- `details` merges over the stored details of **that** row only.

## Confirming it against your data

**Superseded — see the correction in the status banner.** Live-logged rows sit
on an exact minute too, so what follows does not distinguish anything. Kept as
written, since the reasoning is what the banner corrects:

```sql
-- Rows sitting exactly on the minute: every edited row, plus the rare
-- coincidence. If a second row changed when you edited one, both will be here.
select id, type_id, occurred_at, created_at
from events
where extract(second from occurred_at) = 0
order by occurred_at desc
limit 50;

-- And the pair that would have swapped: events sharing a minute.
select date_trunc('minute', occurred_at) as minute, count(*), array_agg(id)
from events
group by 1 having count(*) > 1
order by 1 desc;
```

If the second query returns rows, the swap explanation is confirmed. If you
ever see two rows change from one edit, that first query will show both — and
this plan is wrong about the cause, which is worth knowing before shipping the
fix.

## Changes, file by file

| File                                      | Change                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/server/events.ts`                | `parseEventEdit` keeps the stored instant when the submitted minute is unchanged. A comment saying why, since it reads like an oddity otherwise. |
| `src/lib/time.ts`                         | Small `minuteOf(date)` helper (truncate an instant to its minute), so the comparison is not inline date arithmetic.                              |
| `tests/event-edit.test.ts`                | Editing only the note keeps the seconds; changing the time snaps to `:00`; the DST cases already covered stay covered.                           |
| `src/lib/components/log/EventList.svelte` | Optional: brief highlight on the row that was just edited, keyed by its id.                                                                      |

## Pros

- Removes a silent data change nobody asked for — the strongest argument for
  doing this even if the reordering turns out to be what you saw.
- Makes the "it moved" case explainable instead of mysterious.
- The confirming queries turn a feeling into a fact, both ways.

## Cons / trade-offs

- Preserving seconds is a small asymmetry to explain: an unchanged minute
  keeps its seconds, a changed one lands on `:00`. The alternative — always
  `:00` — is what we have now, and it is what caused this.
- The highlight is polish, and the row can move off the ten-row list
  entirely, where no highlight helps. `/history` is the answer there.

## Effort

Small for the seconds fix and its tests — that is the part worth shipping.
The highlight is optional and can wait; run the two queries first, since they
decide whether anything else needs investigating at all.
