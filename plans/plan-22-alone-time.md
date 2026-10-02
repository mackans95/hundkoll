# Plan 22 — Ensamtid: logging time alone

> Source: asked 2026-10-02 — "a new event type … for alone time, so 'Ensamtid' for the
> title. I want to be able to log how long she has/was alone for, and if the alone time was
> 'successful', meaning if she started howling or barking or anything else that might
> indicate she felt in distress being alone … The stats page option should be similar to
> the car rides event … No status tracking, this will be done whenever it's needed, not on a
> schedule."

> **Status: 📝 Outline** — branch `feature/alone-time`. The shape is clear; what "successful"
> should record is not, and the questions at the end decide it.

## The goal

One more tile, **🏠 Ensamtid**, that logs a stretch of time she was left alone, how long it
lasted, and whether it went well. On Statistik, a card like Biltur's, showing how often
she's left alone, for how long, and how often without distress. Over weeks, that last
number is the one that says whether alone-time training is working.

## What is already there, and makes this mostly a generated type

- **A new type with no schedule is one migration row.** With `interval` null it never
  appears on Status, so it gets no reminders (plan 19) and no Settings field to fill in.
- **Biltur is almost exactly this shape:** a required `duration_min`, plus a `reveal`
  ("Olycka?") that uncovers what happened. Its card is a counts chart with an "Snittlängd"
  tile and a "share without" tile. `npm run new-event` scaffolds all of that from flags:
  migration, detail fields, locale, card, query and page wiring.
- **A `reveal` stores nothing on a good day**, and `share-without` divides by every event
  of the type. So "share of alone times without distress" needs no SQL and treats an
  untouched reveal as success, the way "Utan olycka" works today.
- **The tooltip breakdown is automatic:** every checkbox under the reveal shows under its
  day's bar ("Ensamtid 2 · Oro? 1 · Ylade 1").

## The outline

### The type

```sql
insert into event_types (id, label, category, interval, interval_type, icon, sort_order)
values ('alone', 'Ensamtid', 'other', null, 'days', '🏠', 105);
```

`105` puts it between Biltur and Hundvakt in the grid: twelve tiles, four full rows.

### The fields (first draft; the questions refine it)

| Field          | Input      | Label       | Notes                                     |
| -------------- | ---------- | ----------- | ----------------------------------------- |
| `duration_min` | `number`   | Längd (min) | required, like Biltur                     |
| `distress`     | `reveal`   | Oro?        | ticked → the signs below must be answered |
| `howled`       | `checkbox` | Ylade       | revealed by `distress`                    |
| `barked`       | `checkbox` | Skällde     | revealed by `distress`                    |
| `whined`       | `checkbox` | Gnällde     | revealed by `distress`                    |
| …              |            |             | the rest of the list is question 2        |

The note field covers everything else ("kong i buren", "grannen hörde henne").

### Statistik

A counts card like `CarRideCard`: alone times per day over the period, with tiles:

- **Snittlängd** — `avg` on `duration_min`.
- **Utan oro** — `share-without` on `distress`.
- Possibly **Längsta lyckade** (question 4): the longest alone time without distress, the
  number training builds on. It isn't a metric kind today.

### Done with the generator

```sh
npm run new-event -- --label Ensamtid --id alone --icon 🏠 --category other \
  --interval none --sort-order 105 \
  --field "name=duration_min;label=Längd (min);input=number;unit=min;required" \
  --field "name=distress;label=Oro?;input=reveal" \
  --field "name=howled;label=Ylade;input=checkbox;revealed-by=distress" \
  --field "name=barked;label=Skällde;input=checkbox;revealed-by=distress" \
  --stats counts \
  --metric "kind=avg;field=duration_min;label=Snittlängd" \
  --metric "kind=share-without;field=distress;label=Utan oro"
```

Then: review the generated diff, `npm run db-local` to see the tile and the card against
the snapshot data, a probe of the dialog, and a PR. After merge, `npm run db-push`. No APK:
it's a web change.

## Questions

1. **How do you know how it went?** A camera or audio app at home, a neighbour, or only
   signs when you come back? This matters, because "nothing ticked" will mean success. If
   you often can't know, an untouched form shouldn't count as a success, and the field
   becomes a three-way answer instead: **Gick bra / Oro / Vet ej**. That isn't a reveal any
   more, and it needs a small new input kind (a choice of three). _Recommendation: tell me
   how you'd normally find out, then pick._
2. **Which signs belong in the list?** Ylade, Skällde and Gnällde are the start. Common
   others in separation training: **Förstörde något**, **Kissade/bajsade inne**,
   **Dreglade/flämtade**, **Rastlös** (pacing), and **Krafsade vid dörren**. Each is one
   checkbox and one count under the tooltip. _Recommendation: the ones you'd actually be
   able to tell; four or five, not ten._
3. **When did it start?** In training, _after how long_ the distress began is often the
   number that matters: it marks the edge to stay under next time. That would be one
   `number` field revealed by `distress`: **Oro efter (min)**. _Recommendation: include it
   if you'd normally know (camera)._
4. **The "Längsta lyckade" tile?** The longest alone time without distress in the period.
   It isn't an `avg` or a `share`, so it needs a new metric kind: a `max` over the type's
   own events filtered by the reveal, computed in TypeScript as `detailDays` already does.
   _Recommendation: yes. It's the tile that shows progress._
5. **Log it afterwards, or time it live?** The dialog asks for minutes, like Biltur. A live
   mode, like the walk (start when you leave, stop when you're back, and the dialog asks
   how it went), is possible, but today's live mode is built around the walk's pee and poop
   counts, so it would be a plan of its own. _Recommendation: the dialog now, live later if
   you find yourself doing the arithmetic._
6. **Category and icon:** `other` (the slate tile, like Biltur) and 🏠? Alternatives: `care`
   (sky blue) or an icon like 🔑 or 🛋️.

## Not in scope

- Status, intervals and reminders: it happens when it's needed.
- A live mode (question 5).
- Anything on the lock screen or the widget.
