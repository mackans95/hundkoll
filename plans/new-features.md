> **All four of these are built and shipped.** Kept as written — this is the
> record of what was asked for and why, in the words it was asked in, which
> each plan document cites as its source. The plans carry the "as built"
> notes; this file is deliberately not rewritten to match the outcome.
>
> | Request                   | Plan                                         | Shipped in  |
> | ------------------------- | -------------------------------------------- | ----------- |
> | Automate walk logging     | [Plan 1](plan-1-live-walk.md)                | PR #28      |
> | Re-design adding events   | [Plan 2](plan-2-event-type-extensibility.md) | PR #27      |
> | Make every event editable | [Plan 3](plan-3-editable-events.md)          | PR #29, #30 |
> | Dark mode                 | [Plan 4](plan-4-dark-mode.md)                | PR #22–#25  |
>
> Where the result differs from the plan — Avbryt not confirming, the count
> steppers losing their checkbox, history as a link rather than a fifth tab —
> the plan's status banner says so and why.

# Make the walk-logging more automated, or add another option for it.

## Problem

Right now, when you click the log walk button, the dialog that shows up works very well.
It automatically sets the current date and time as the start of the walk, and the options
for tracking amounts of pees and poops works well. However, it can feel a little annoying sometimes
to have to manually figure out how long the walk was when you are done, and then add that to
the input field.

## Solution

What i would like to have the option for, either as a standalone walk log or part of the
existing walk dialog, is that once you click the button, the current time is prefilled like now,
but then you only have the option to increment pees and poops and add notes. When you are
done with the walk, you should be able to hit the save button, and the app then automatically
calculates how long the walk was, so (time at the end) - (the time at the start). Alternatively,
it could start a timer from when you click the log button, and then just save that time when you
hit done, but it might not work on the phone since you will be opening and closing the phone and
possibly the app, which might interfere with the timer (i dont actually know).

Since we will need to be able to log past walks sometimes, we will need to keep both options
available, but i would like this timer-based one to be the new default, to increase the user
friendlieness of the app.

# Re-design how we add events, so new ones can be added very simply.

## Problem

If i want to add a new event type now, there is quite a few steps to go through. I would need a
db migration, add a new view-component, make sure the new button(s) can fit in the log display,
etc. I don't know exactly what amount of new event types would be added, but i want the possibility
of adding more to be simpler.

## Solution

Re-design how adding new events works app-wide. We can't get around the db migration, since everything
is stored there, but for the svelte part i feel we can make substantial changes. For example, i want
the log page to be able to just keep taking more buttons, and make sure that they fit the layout
no matter what, so if i add one new event, the button will take up a whole row, if i add 2 they will
be split 50/50, and similar layout to now if i add 3 etc. I would also like to have a generic enough
component for both this, and if i would like to add this new item to the stats page, so a generic
Card component that can take in various props and children, and render properly based on what i give it.

We might already have this with the Card and FoldableCard components, but i'd like to make sure
we have an easy, well-documented way of adding any amount of new events anyway.

# Make every logged event editable, either from the latest events log, or with a new view.

## Problem

Sometimes you might accidentally hit the save button prematurely, or log something you didn't mean to,
and in order to fix those mistakes today i would have to manually go to Supabase, find the item in the
database and delete it.

## Solution

Make it so that we can edit whatever item gets added to the events list, and since we already show
a certain amount of the latest ones in the latest events section on the log page, we should be able
to edit from here, but for editing older items that might have dissappeared from this list, we probably
need a new view for this. I'm thinking that this could be like a "calendar" view, where you by default
see the current month displayed. And if you click on one of the days, you then see the full list of
all events tracked on that day. Each event here should then be editable aswell, and this makes it
so you can find all events no matter how long ago it was, and "fix" them.

I'm thinking for the events in the recent list, how it could work is if you click/tap on one of them,
it opens up a view of that event and what was logged, and there we could show an edit button.

# Implement dark-mode (unsure)

## Problem

Bright lights hurts my eyes,
i'm just a little baby with ADHD and light-sensitivity (joking, but also i hate light mode)

## Solution

I do not do well with colous (also colourblind) so i do not know how to find complementary colours
for use in dark mode, and i would need help making the color choices and building out the easy switch
between light and dark mode.
